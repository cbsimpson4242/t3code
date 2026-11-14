import { createMemoryHistory } from "@tanstack/react-router";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import { expect, vi } from "vite-plus/test";
import { commands, page, userEvent } from "vite-plus/test/browser";

import { AppRoot } from "~/AppRoot";
import { SIDEBAR_THREAD_VIEW_KEY } from "~/components/sidebar/sidebarThreadView";
import { __setClientSettingsForTests } from "~/hooks/useSettings";
import { getRouter } from "~/router";
import {
  dispatchedCommands,
  ENVIRONMENT_ID,
  installFakeEnvironment,
  threadWithHistory,
} from "./fakeEnvironment";
import { render } from "./render";

const PIN_TAB_KEY = "t3code:sidebar:pin-tab";

const PIN_FIRST = { ...threadWithHistory("pin-first", 1), title: "First pin", pinOrderKey: "c" };
const PIN_SECOND = { ...threadWithHistory("pin-second", 1), title: "Second pin", pinOrderKey: "m" };
const OPEN = { ...threadWithHistory("open", 1), title: "Open thread" };
const OTHER = { ...threadWithHistory("other", 1), title: "Other thread" };
const ALL = [PIN_FIRST, PIN_SECOND, OPEN, OTHER];

const tab = (name: "Pinned" | "Threads") =>
  page.getByRole("tab", { name: new RegExp(`^${name}, `) }).element() as HTMLElement;
const center = (element: Element) => {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
};
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
const commandsFor = (type: string) =>
  dispatchedCommands()
    .filter((command) => command.type === type)
    .map((command) => command.threadId);

/** Presses on the row and moves past the drag distance, as a user starting a drag does. */
async function pressAndLift(row: Element) {
  const start = center(row);
  await commands.mouse("move", start.x, start.y);
  await commands.mouse("down");
  for (let step = 1; step <= 4; step += 1) {
    await commands.mouse("move", start.x, start.y - step * 3);
  }
  return { x: start.x, y: start.y - 12 };
}

/** Moves the held mouse onto the element in small steps, so every frame sees the pointer move. */
async function glideTo(from: { x: number; y: number }, element: Element) {
  const to = center(element);
  const steps = 10;
  for (let step = 1; step <= steps; step += 1) {
    await commands.mouse(
      "move",
      from.x + ((to.x - from.x) * step) / steps,
      from.y + ((to.y - from.y) * step) / steps,
    );
  }
  return to;
}

/**
 * Drags threads between the Pinned and Threads tabs with the real mouse in either thread view:
 * Threads → Pinned pins, Pinned → Threads unpins, and the open tab stays open either way.
 * The app's environment state lasts for the whole test file, so a file runs this once.
 */
export async function runPinTabDragScenario(view: "standard" | "simple") {
  using _environment = installFakeEnvironment(ALL);
  localStorage.setItem(PIN_TAB_KEY, JSON.stringify("threads"));
  if (view === "simple") localStorage.setItem(SIDEBAR_THREAD_VIEW_KEY, JSON.stringify("simple"));
  else localStorage.removeItem(SIDEBAR_THREAD_VIEW_KEY);
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
  });
  await page.viewport(1400, 900);
  // The open thread is one no drag moves, so no route reveal picks the tab.
  const router = getRouter(
    createMemoryHistory({ initialEntries: [`/${ENVIRONMENT_ID}/${OTHER.id}`] }),
  );
  await router.load();
  await using _app = await render(<AppRoot router={router} />, { router: false });
  const rowTestId = view === "simple" ? "sidebar-row-compact" : "sidebar-row-card";
  const titles = () =>
    page
      .getByTestId(rowTestId)
      .elements()
      .map((row) => ALL.find((thread) => row.textContent?.includes(thread.title))?.title);
  const row = (title: string) =>
    page
      .getByTestId(rowTestId)
      .elements()
      .find((candidate) => candidate.textContent?.includes(title))!;

  try {
    // Threads → Pinned.
    await expect
      .element(page.getByRole("tab", { name: "Threads, 2 threads" }))
      .toHaveAttribute("aria-selected", "true");
    await vi.waitFor(() => expect(titles().toSorted()).toEqual([OPEN.title, OTHER.title]));

    let lifted = await pressAndLift(row(OPEN.title));
    // The other tab shows it takes the drop; the tab the drag came from does not.
    await vi.waitFor(() => expect(tab("Pinned").hasAttribute("data-drop-zone")).toBe(true));
    expect(tab("Threads").hasAttribute("data-drop-zone")).toBe(false);
    expect(tab("Pinned").hasAttribute("data-drop-target")).toBe(false);
    let over = await glideTo(lifted, tab("Threads"));
    await nextFrame();
    expect(tab("Threads").hasAttribute("data-drop-target")).toBe(false);
    await glideTo(over, tab("Pinned"));
    await vi.waitFor(() => expect(tab("Pinned").hasAttribute("data-drop-target")).toBe(true));
    await commands.mouse("up");

    await vi.waitFor(() => expect(commandsFor("thread.pin")).toEqual([OPEN.id]));
    // The Threads tab stays open, the pinned thread leaves it, and both counts follow.
    await expect
      .element(page.getByRole("tab", { name: "Threads, 1 thread" }))
      .toHaveAttribute("aria-selected", "true");
    await expect.element(page.getByRole("tab", { name: "Pinned, 3 threads" })).toBeVisible();
    await vi.waitFor(() => expect(titles()).toEqual([OTHER.title]));
    expect(tab("Pinned").hasAttribute("data-drop-zone")).toBe(false);
    expect(tab("Pinned").hasAttribute("data-drop-target")).toBe(false);

    // It lands at the top of the pins.
    await userEvent.click(tab("Pinned"));
    await vi.waitFor(() =>
      expect(titles()).toEqual([OPEN.title, PIN_FIRST.title, PIN_SECOND.title]),
    );

    // Pinned → Threads.
    lifted = await pressAndLift(row(PIN_SECOND.title));
    await vi.waitFor(() => expect(tab("Threads").hasAttribute("data-drop-zone")).toBe(true));
    expect(tab("Pinned").hasAttribute("data-drop-zone")).toBe(false);
    over = await glideTo(lifted, tab("Pinned"));
    await nextFrame();
    expect(tab("Pinned").hasAttribute("data-drop-target")).toBe(false);
    await glideTo(over, tab("Threads"));
    await vi.waitFor(() => expect(tab("Threads").hasAttribute("data-drop-target")).toBe(true));
    await commands.mouse("up");

    await vi.waitFor(() => expect(commandsFor("thread.unpin")).toEqual([PIN_SECOND.id]));
    expect(commandsFor("thread.pin")).toEqual([OPEN.id]);
    await expect
      .element(page.getByRole("tab", { name: "Pinned, 2 threads" }))
      .toHaveAttribute("aria-selected", "true");
    await expect.element(page.getByRole("tab", { name: "Threads, 2 threads" })).toBeVisible();
    await vi.waitFor(() => expect(titles()).toEqual([OPEN.title, PIN_FIRST.title]));
    expect(tab("Threads").hasAttribute("data-drop-zone")).toBe(false);

    // Reordering within a tab still works in the list; the Simple grid has no slots to sort into.
    lifted = await pressAndLift(row(PIN_FIRST.title));
    await glideTo(lifted, row(OPEN.title));
    await nextFrame();
    expect(tab("Threads").hasAttribute("data-drop-target")).toBe(false);
    await commands.mouse("up");
    if (view === "standard") {
      await vi.waitFor(() => expect(commandsFor("thread.pin.reorder")).toContain(PIN_FIRST.id));
      await vi.waitFor(() => expect(titles()).toEqual([PIN_FIRST.title, OPEN.title]));
    } else {
      await nextFrame();
      await nextFrame();
      expect(commandsFor("thread.pin.reorder")).toEqual([]);
      expect(titles()).toEqual([OPEN.title, PIN_FIRST.title]);
    }
    expect(commandsFor("thread.unpin")).toEqual([PIN_SECOND.id]);
    await expect
      .element(page.getByRole("tab", { name: "Pinned, 2 threads" }))
      .toHaveAttribute("aria-selected", "true");

    // It is listed among the threads again.
    await userEvent.click(tab("Threads"));
    await vi.waitFor(() =>
      expect(titles().toSorted()).toEqual([OTHER.title, PIN_SECOND.title].toSorted()),
    );
  } finally {
    await commands.mouse("up");
    localStorage.removeItem(PIN_TAB_KEY);
    localStorage.removeItem(SIDEBAR_THREAD_VIEW_KEY);
  }
}
