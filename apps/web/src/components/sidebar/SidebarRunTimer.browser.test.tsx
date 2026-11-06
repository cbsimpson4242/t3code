import { createMemoryHistory } from "@tanstack/react-router";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import type * as Context from "effect/Context";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

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

const FINISHED = { ...threadWithHistory("job", 1), title: "Job thread" };
const RUNNING = { ...FINISHED, status: "running" } as const;
const OTHER = { ...threadWithHistory("other", 1), title: "Other thread" };

const card = (title: string) =>
  page
    .getByTestId("sidebar-row-card")
    .elements()
    .find((row) => row.textContent?.includes(title));

it("a standard card counts a running thread, then shows Done for the open thread once it finishes", async () => {
  using _environment = installFakeEnvironment([RUNNING, OTHER]);
  localStorage.removeItem(SIDEBAR_THREAD_VIEW_KEY);
  localStorage.setItem(WORKING_SHELF_EXPANDED_KEY, "true");
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
  });
  await page.viewport(1400, 900);
  const router = getRouter(
    createMemoryHistory({ initialEntries: [`/${ENVIRONMENT_ID}/${RUNNING.id}`] }),
  );
  await router.load();
  await using _app = await render(<AppRoot router={router} />, { router: false });

  await expect.element(page.getByTestId("sidebar-row-card").first()).toBeVisible();
  // Running: the status line carries a clock.
  await vi.waitFor(() => expect(card("Job thread")?.textContent).toMatch(/Working\s*\d+[smh]/), {
    timeout: 10_000,
  });
  expect(card("Other thread")?.textContent).toMatch(/Done/);
  expect(card("Other thread")?.textContent).not.toMatch(/Working/);

  // The run ends while the thread is open: the spinner state gives way to Done, not to nothing.
  await updateFakeThread(FINISHED);
  await vi.waitFor(() => expect(card("Job thread")?.textContent).toMatch(/Done/), {
    timeout: 10_000,
  });
  expect(card("Job thread")?.textContent).not.toMatch(/Working/);
  localStorage.removeItem(WORKING_SHELF_EXPANDED_KEY);
});
