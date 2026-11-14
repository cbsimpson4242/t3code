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
  type FakeDriver,
} from "../../../test/fakeEnvironment";
import { render } from "../../../test/render";

const PIN_TAB_KEY = "t3code:sidebar:pin-tab";
const LEGACY_PINNED_SHELF_KEY = "t3code:sidebar:pinned-expanded";

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

const PIN_FIRST = { ...threadWithHistory("pin-first", 1), title: "First pin", pinOrderKey: "a" };
const PIN_SECOND = { ...threadWithHistory("pin-second", 1), title: "Second pin", pinOrderKey: "m" };
const OPEN = { ...threadWithHistory("open", 1), title: "Open thread" };
const OTHER = { ...threadWithHistory("other", 1), title: "Other thread" };

const listedTitles = () =>
  page
    .getByTestId("sidebar-row-card")
    .elements()
    .map(
      (row) =>
        [PIN_FIRST, PIN_SECOND, OPEN, OTHER].find((thread) =>
          row.textContent?.includes(thread.title),
        )?.title,
    );

it("splits the thread list into Pinned and Threads tabs that a route reveal can open", async () => {
  using _environment = installFakeEnvironment([PIN_FIRST, PIN_SECOND, OPEN, OTHER]);
  localStorage.removeItem(PIN_TAB_KEY);
  localStorage.setItem(LEGACY_PINNED_SHELF_KEY, "false");
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
  });
  await page.viewport(1400, 900);
  const router = getRouter(
    createMemoryHistory({ initialEntries: [`/${ENVIRONMENT_ID}/${OPEN.id}`] }),
  );
  await router.load();
  await using _app = await render(<AppRoot router={router} />, { router: false });

  // Threads is the default tab, and each tab counts its threads.
  const pinnedTab = page.getByRole("tab", { name: "Pinned, 2 threads" });
  const threadsTab = page.getByRole("tab", { name: "Threads, 2 threads" });
  await expect.element(threadsTab).toHaveAttribute("aria-selected", "true");
  await expect.element(pinnedTab).toHaveAttribute("aria-selected", "false");
  await vi.waitFor(() => expect(listedTitles().toSorted()).toEqual([OPEN.title, OTHER.title]));
  // The replaced Pinned shelf leaves no stored state behind.
  expect(localStorage.getItem(LEGACY_PINNED_SHELF_KEY)).toBeNull();

  // The Pinned tab lists only the pins, in pin order, and is remembered.
  await userEvent.click(pinnedTab);
  await expect.element(pinnedTab).toHaveAttribute("aria-selected", "true");
  await vi.waitFor(() => expect(listedTitles()).toEqual([PIN_FIRST.title, PIN_SECOND.title]));
  expect(JSON.parse(localStorage.getItem(PIN_TAB_KEY)!)).toBe("pinned");

  // Opening a thread the Threads tab lists from outside the sidebar opens that tab.
  await router.navigate({ href: `/${ENVIRONMENT_ID}/${OTHER.id}` });
  await expect.element(threadsTab).toHaveAttribute("aria-selected", "true");
  await vi.waitFor(() => expect(listedTitles()).toContain(OTHER.title));
  expect(JSON.parse(localStorage.getItem(PIN_TAB_KEY)!)).toBe("threads");

  // The reveal opens the tab once; the user can still switch away from the open thread.
  await userEvent.click(pinnedTab);
  await expect.element(pinnedTab).toHaveAttribute("aria-selected", "true");
  await vi.waitFor(() => expect(listedTitles()).toEqual([PIN_FIRST.title, PIN_SECOND.title]));

  // Search hides the tabs and lists every match together.
  await userEvent.fill(page.getByRole("combobox", { name: "Search threads" }), "thread");
  await vi.waitFor(() => expect(page.getByRole("tablist").elements()).toHaveLength(0));
  const results = page.getByRole("listbox", { name: "Thread search results" });
  await expect.element(results.getByText(OPEN.title)).toBeInTheDocument();
  await expect.element(results.getByText(OTHER.title)).toBeInTheDocument();
  await userEvent.fill(page.getByRole("combobox", { name: "Search threads" }), "pin");
  await expect.element(results.getByText(PIN_FIRST.title)).toBeInTheDocument();
  await userEvent.fill(page.getByRole("combobox", { name: "Search threads" }), "");
  await expect.element(pinnedTab).toHaveAttribute("aria-selected", "true");

  localStorage.removeItem(PIN_TAB_KEY);
});
