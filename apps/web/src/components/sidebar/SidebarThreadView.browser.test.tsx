import { createMemoryHistory } from "@tanstack/react-router";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import type * as Context from "effect/Context";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "~/index.css";

import { AppRoot } from "~/AppRoot";
// The route loads ChatView lazily, and its first transform takes seconds; keep that out of the test timeout.
import "~/components/ChatView";
import { __setClientSettingsForTests } from "~/hooks/useSettings";
import { getRouter } from "~/router";
import {
  ENVIRONMENT_ID,
  installFakeEnvironment,
  threadWithHistory,
  updateFakeThread,
  type FakeDriver,
} from "../../../test/fakeEnvironment";
import { render } from "../../../test/render";
import { SIDEBAR_THREAD_VIEW_KEY } from "./sidebarThreadView";

const WORKING_SHELF_EXPANDED_KEY = "t3code:sidebar:working-expanded";

// The socket is the only fake layer; see test/appScenarios.renders.tsx.
vi.mock(
  "../../../../../packages/client-runtime/src/connection/driver.ts",
  async (importOriginal) => {
    const [actual, { fakeDriver }, Layer] = await Promise.all([
      importOriginal<{ readonly ConnectionDriver: Context.Key<unknown, FakeDriver> }>(),
      import("../../../test/fakeEnvironment"),
      import("effect/Layer"),
    ]);
    return { ...actual, layer: Layer.succeed(actual.ConnectionDriver, fakeDriver) };
  },
);

vi.mock(import("~/rpc/requestLatencyState"), async (original) => ({
  ...(await original()),
  trackRpcRequestSent: () => {},
}));

const IDLE = {
  ...threadWithHistory("idle", 1),
  title: "Idle thread with a long title that must truncate",
};
const FINISHED = { ...threadWithHistory("working", 1), title: "Working thread" };
const WORKING = { ...FINISHED, status: "running" } as const;
const OTHER = { ...threadWithHistory("other", 1), title: "Other thread" };
const LAST = { ...threadWithHistory("last", 1), title: "Last thread" };

const rows = () => page.getByTestId("sidebar-row-compact").elements();
const rings = () => page.getByTestId("sidebar-row-working-ring").elements();
const timers = () => page.getByTestId("sidebar-row-run-timer").elements();

it("the simple view is a persisted compact grid that animates only working threads", async () => {
  using _environment = installFakeEnvironment([IDLE, WORKING, OTHER, LAST]);
  localStorage.removeItem(SIDEBAR_THREAD_VIEW_KEY);
  // Working threads sit in a shelf that starts collapsed.
  localStorage.setItem(WORKING_SHELF_EXPANDED_KEY, "true");
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
  });
  await page.viewport(1400, 900);
  const router = getRouter(
    createMemoryHistory({ initialEntries: [`/${ENVIRONMENT_ID}/${OTHER.id}`] }),
  );
  await router.load();
  await using _app = await render(<AppRoot router={router} />, { router: false });

  const toggle = page.getByRole("button", { name: "Simple thread view" });
  await expect.element(toggle).toHaveAttribute("aria-pressed", "false");
  await expect.element(page.getByTestId("sidebar-row-card").first()).toBeVisible();
  expect(rows()).toHaveLength(0);

  await userEvent.click(toggle);
  await expect.element(toggle).toHaveAttribute("aria-pressed", "true");
  await vi.waitFor(() => expect(rows()).toHaveLength(4));
  expect(JSON.parse(localStorage.getItem(SIDEBAR_THREAD_VIEW_KEY)!)).toBe("simple");

  // More than one thread per line, and nothing but a logo and the title in each cell.
  const tops = rows().map((row) => Math.round(row.getBoundingClientRect().top));
  expect(new Set(tops).size).toBeLessThan(tops.length);
  for (const row of rows()) {
    // The title (once visible, once for screen readers) and the project logo's monogram, nothing else.
    const title = [IDLE, WORKING, OTHER, LAST].find((thread) =>
      row.textContent?.includes(thread.title),
    )!.title;
    // The running thread's clock is the one number a cell may carry.
    const text = row.textContent!.replace(
      row.querySelector("[data-testid=sidebar-row-run-timer]")?.textContent ?? "",
      "",
    );
    expect(text.replaceAll(title, "")).not.toMatch(/\d|Settle|Done|Waiting|ago/);
  }

  // Only the running thread has a ring, and it is animating.
  await vi.waitFor(() => expect(rings()).toHaveLength(1));
  const ring = rings()[0]!;
  expect(
    ring.closest("[data-testid=sidebar-row-compact]")?.getAttribute("data-thread-status"),
  ).toBe("working");
  expect(ring.getAnimations().some((animation) => animation.playState === "running")).toBe(true);

  // Each completed run keeps its result; only the running thread has a live clock.
  await vi.waitFor(() => expect(timers()).toHaveLength(4));
  const liveTimers = timers().filter((timer) => timer.getAttribute("data-run-phase") === "running");
  expect(liveTimers).toHaveLength(1);
  expect(liveTimers[0]!.closest("[data-testid=sidebar-row-compact]")?.textContent).toContain(
    WORKING.title,
  );
  expect(liveTimers[0]!.textContent).toMatch(/^\d+s$|^\d+m$|^\d+h \d+m$/);

  // A truncated title is still readable from its tooltip, and cells are keyboard-navigable.
  const idleRow = rows().find((row) => row.textContent?.includes("Idle thread"))!;
  await userEvent.hover(idleRow);
  await vi.waitFor(() =>
    expect(document.querySelector("[data-slot=tooltip-popup]")?.textContent).toBe(IDLE.title),
  );
  idleRow.focus();
  await userEvent.keyboard("{ArrowRight}");
  expect(document.activeElement).toBe(rows()[rows().indexOf(idleRow) + 1]);

  // The animation ends with the run.
  await updateFakeThread(FINISHED);
  await vi.waitFor(() => expect(rings()).toHaveLength(0));
  // A finished run's clock is no longer a running one.
  expect(
    timers().filter((timer) => timer.getAttribute("data-run-phase") === "running"),
  ).toHaveLength(0);
  expect(rows()).toHaveLength(4);
  expect(timers().every((timer) => timer.getAttribute("data-run-phase") === "done")).toBe(true);

  // Back to the standard layout.
  await userEvent.click(toggle);
  await expect.element(toggle).toHaveAttribute("aria-pressed", "false");
  await vi.waitFor(() => expect(rows()).toHaveLength(0));
  localStorage.removeItem(SIDEBAR_THREAD_VIEW_KEY);
  localStorage.removeItem(WORKING_SHELF_EXPANDED_KEY);
});
