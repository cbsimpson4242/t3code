import "../index.css";

import { ProjectId, ThreadId } from "@t3tools/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { useComposerDraftStore } from "../composerDraftStore";
import { useStore } from "../store";
import { DEFAULT_INTERACTION_MODE, DEFAULT_RUNTIME_MODE, type Project, type Thread } from "../types";
import VirtualOffice from "./VirtualOffice";

vi.mock("~/components/ChatView", async () => {
  const { SidebarTrigger } = await import("~/components/ui/sidebar");
  return {
    default: (props: { threadId: string }) => (
      <div data-chat-view={props.threadId}>
        <SidebarTrigger aria-label={`Mock sidebar trigger ${props.threadId}`} />
        Mock chat
      </div>
    ),
  };
});

function makeProject(id: string, name: string): Project {
  return {
    id: ProjectId.makeUnsafe(id),
    name,
    cwd: `/repo/${name}`,
    model: "gpt-5-codex",
    expanded: true,
    scripts: [],
  };
}

function makeThread(input: {
  id: string;
  projectId: string;
  title: string;
  worktreePath: string;
}): Thread {
  return {
    id: ThreadId.makeUnsafe(input.id),
    codexThreadId: null,
    projectId: ProjectId.makeUnsafe(input.projectId),
    title: input.title,
    model: "gpt-5-codex",
    runtimeMode: DEFAULT_RUNTIME_MODE,
    interactionMode: DEFAULT_INTERACTION_MODE,
    session: null,
    messages: [],
    proposedPlans: [],
    error: null,
    createdAt: "2026-03-10T00:00:00.000Z",
    latestTurn: null,
    branch: null,
    worktreePath: input.worktreePath,
    turnDiffSummaries: [],
    activities: [],
  };
}

function seedOfficeStore() {
  useStore.setState({
    projects: [makeProject("project-1", "alpha"), makeProject("project-2", "beta")],
    threads: [
      makeThread({ id: "thread-a", projectId: "project-1", title: "Desk A", worktreePath: "group-a" }),
      makeThread({ id: "thread-b", projectId: "project-1", title: "Desk B", worktreePath: "group-a" }),
      makeThread({ id: "thread-c", projectId: "project-2", title: "Desk C", worktreePath: "group-b" }),
    ],
    threadsHydrated: true,
    sourceControlOpen: false,
  });
  useComposerDraftStore.setState({
    draftsByThreadId: {},
    draftThreadsByThreadId: {},
    projectDraftThreadIdByProjectId: {},
  });
}

function waitForOfficeLayout() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function getRequiredElement<T extends Element = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing element for selector: ${selector}`);
  }
  return element;
}

function setInputValue(element: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  if (!setter) {
    throw new Error("Missing HTMLInputElement value setter");
  }
  setter.call(element, value);
  element.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      data: value,
      inputType: "insertText",
    }),
  );
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

async function mountOffice() {
  const activations: string[] = [];
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.width = "1100px";
  host.style.height = "720px";
  host.style.overflow = "hidden";
  document.body.append(host);

  const screen = await render(
    <QueryClientProvider client={new QueryClient()}>
      <div className="h-full w-full">
        <VirtualOffice onOpenThreadInMainWindow={(threadId) => activations.push(threadId)} />
      </div>
    </QueryClientProvider>,
    {
      container: host,
    },
  );
  await waitForOfficeLayout();

  return {
    activations,
    cleanup: async () => {
      await screen.unmount();
      host.remove();
    },
  };
}

function dispatchPointerSequence(
  element: HTMLElement,
  input: {
    pointerId: number;
    button: number;
    buttons: number;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  },
) {
  element.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      pointerId: input.pointerId,
      button: input.button,
      buttons: input.buttons,
      clientX: input.startX,
      clientY: input.startY,
    }),
  );
  element.dispatchEvent(
    new PointerEvent("pointermove", {
      bubbles: true,
      pointerId: input.pointerId,
      buttons: input.buttons,
      clientX: input.endX,
      clientY: input.endY,
    }),
  );
  element.dispatchEvent(
    new PointerEvent("pointerup", {
      bubbles: true,
      pointerId: input.pointerId,
      button: input.button,
      buttons: 0,
      clientX: input.endX,
      clientY: input.endY,
    }),
  );
}

async function dragSelector(selector: string, delta: { x: number; y: number }) {
  const element = getRequiredElement<HTMLElement>(selector);
  const rect = element.getBoundingClientRect();
  dispatchPointerSequence(element, {
    pointerId: 1,
    button: 0,
    buttons: 1,
    startX: rect.left + rect.width / 2,
    startY: rect.top + rect.height / 2,
    endX: rect.left + rect.width / 2 + delta.x,
    endY: rect.top + rect.height / 2 + delta.y,
  });
  await waitForOfficeLayout();
}

async function panViewport(delta: { x: number; y: number }) {
  const viewport = getRequiredElement<HTMLElement>("[data-testid='virtual-office-viewport']");
  const rect = viewport.getBoundingClientRect();
  dispatchPointerSequence(viewport, {
    pointerId: 2,
    button: 1,
    buttons: 4,
    startX: rect.left + rect.width / 2,
    startY: rect.top + rect.height / 2,
    endX: rect.left + rect.width / 2 + delta.x,
    endY: rect.top + rect.height / 2 + delta.y,
  });
  await waitForOfficeLayout();
}

function readCameraAttr(attribute: "data-camera-x" | "data-camera-y" | "data-camera-zoom") {
  const viewport = getRequiredElement<HTMLElement>("[data-testid='virtual-office-viewport']");
  return Number(viewport.getAttribute(attribute) ?? "0");
}

function getButtonByText(text: string): HTMLButtonElement {
  const button = getButtonsByText(text)[0];
  if (!button) {
    throw new Error(`Missing button: ${text}`);
  }
  return button;
}

function getButtonsByText(text: string): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].filter(
    (entry) => entry.textContent?.trim() === text,
  );
}

function getWindow(threadId: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-office-thread-window='${threadId}']`);
  if (!element) {
    throw new Error(`Missing office thread window: ${threadId}`);
  }
  return element;
}

function getWindowButtonByText(threadId: string, text: string): HTMLButtonElement {
  const button = [...getWindow(threadId).querySelectorAll<HTMLButtonElement>("button")].find(
    (entry) => entry.textContent?.trim() === text,
  );
  if (!button) {
    throw new Error(`Missing window button "${text}" for ${threadId}`);
  }
  return button;
}

function getWindowButtonByAriaLabel(threadId: string, label: string): HTMLButtonElement {
  const button = getWindow(threadId).querySelector<HTMLButtonElement>(`button[aria-label='${label}']`);
  if (!button) {
    throw new Error(`Missing window button aria-label "${label}" for ${threadId}`);
  }
  return button;
}

function getDialogButtonByText(text: string): HTMLButtonElement {
  const dialog = document.querySelector<HTMLElement>("[data-slot='dialog-popup']");
  if (!dialog) {
    throw new Error("Missing dialog popup");
  }
  const button = [...dialog.querySelectorAll<HTMLButtonElement>("button")].find(
    (entry) => entry.textContent?.trim() === text,
  );
  if (!button) {
    throw new Error(`Missing dialog button: ${text}`);
  }
  return button;
}

describe("VirtualOffice interactions", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
    seedOfficeStore();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("zooms with the wheel and pans with middle mouse drag", async () => {
    const mounted = await mountOffice();
    try {
      const viewport = getRequiredElement<HTMLElement>("[data-testid='virtual-office-viewport']");
      const rect = viewport.getBoundingClientRect();
      const zoomBefore = readCameraAttr("data-camera-zoom");
      const xBefore = readCameraAttr("data-camera-x");
      const yBefore = readCameraAttr("data-camera-y");

      viewport.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
          deltaY: -220,
        }),
      );
      await waitForOfficeLayout();

      expect(readCameraAttr("data-camera-zoom")).toBeGreaterThan(zoomBefore);

      await panViewport({ x: 120, y: 64 });
      expect(readCameraAttr("data-camera-x")).not.toBe(xBefore);
      expect(readCameraAttr("data-camera-y")).not.toBe(yBefore);
    } finally {
      await mounted.cleanup();
    }
  });

  it("does not zoom the office when the wheel event comes from a thread window", async () => {
    const mounted = await mountOffice();
    try {
      getRequiredElement<HTMLElement>("[data-office-desk='thread-a']").click();
      await waitForOfficeLayout();

      const threadWindow = getWindow("thread-a");
      const rect = threadWindow.getBoundingClientRect();
      const zoomBefore = readCameraAttr("data-camera-zoom");

      threadWindow.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
          deltaY: -220,
        }),
      );
      await waitForOfficeLayout();

      expect(readCameraAttr("data-camera-zoom")).toBe(zoomBefore);
    } finally {
      await mounted.cleanup();
    }
  });

  it("keeps office thread windows in the world so they move and scale with the camera", async () => {
    const mounted = await mountOffice();
    try {
      getRequiredElement<HTMLElement>("[data-office-desk='thread-a']").click();
      await waitForOfficeLayout();

      const viewport = getRequiredElement<HTMLElement>("[data-testid='virtual-office-viewport']");
      const viewportRect = viewport.getBoundingClientRect();
      const windowBefore = getWindow("thread-a").getBoundingClientRect();

      await panViewport({ x: 120, y: 64 });

      const windowAfterPan = getWindow("thread-a").getBoundingClientRect();
      expect(windowAfterPan.x).toBeGreaterThan(windowBefore.x + 80);
      expect(windowAfterPan.y).toBeGreaterThan(windowBefore.y + 40);

      viewport.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          clientX: viewportRect.left + viewportRect.width / 2,
          clientY: viewportRect.top + viewportRect.height / 2,
          deltaY: -220,
        }),
      );
      await waitForOfficeLayout();

      const windowAfterZoom = getWindow("thread-a").getBoundingClientRect();
      expect(windowAfterZoom.width).toBeGreaterThan(windowAfterPan.width + 60);
      expect(windowAfterZoom.height).toBeGreaterThan(windowAfterPan.height + 40);
    } finally {
      await mounted.cleanup();
    }
  });

  it("persists dragged furniture positions across remounts", async () => {
    const mounted = await mountOffice();
    try {
      const selector = "[data-office-element='water-cooler']";
      const before = getRequiredElement<HTMLElement>(selector).getBoundingClientRect();
      await dragSelector(selector, { x: 120, y: 48 });
      const after = getRequiredElement<HTMLElement>(selector).getBoundingClientRect();
      expect(after.x).toBeGreaterThan(before.x + 80);
    } finally {
      await mounted.cleanup();
    }

    const remounted = await mountOffice();
    try {
      const remountedRect = getRequiredElement<HTMLElement>(
        "[data-office-element='water-cooler']",
      ).getBoundingClientRect();
      expect(remountedRect.x).toBeGreaterThan(200);
    } finally {
      await remounted.cleanup();
    }
  });

  it("keeps multiple desk windows open, draws tether indicators, and leaves the office interactive", async () => {
    const mounted = await mountOffice();
    try {
      getRequiredElement<HTMLElement>("[data-office-desk='thread-a']").click();
      await waitForOfficeLayout();
      expect(getWindow("thread-a")).toBeTruthy();
      expect(document.querySelector("[data-office-thread-link='thread-a']")).toBeTruthy();

      getRequiredElement<HTMLElement>("[data-office-desk='thread-b']").click();
      await waitForOfficeLayout();
      expect(getWindow("thread-a")).toBeTruthy();
      expect(getWindow("thread-b")).toBeTruthy();
      expect(document.querySelector("[data-office-thread-link='thread-b']")).toBeTruthy();
      expect(document.querySelector("[data-office-window-backdrop]")).toBeNull();

      getWindowButtonByText("thread-a", "Open in main window").click();
      expect(mounted.activations).toEqual(["thread-a"]);

      mounted.activations.length = 0;
      getWindowButtonByAriaLabel("thread-b", "Close office thread window").click();
      await waitForOfficeLayout();
      expect(document.querySelector("[data-office-thread-window='thread-b']")).toBeNull();
      expect(getWindow("thread-a")).toBeTruthy();

      getWindowButtonByAriaLabel("thread-a", "Close office thread window").click();
      await waitForOfficeLayout();
      await dragSelector("[data-office-desk='thread-a']", { x: 70, y: 20 });
      expect(document.querySelector("[data-office-thread-window='thread-a']")).toBeNull();
      expect(mounted.activations).toEqual([]);
    } finally {
      await mounted.cleanup();
    }
  });

  it("moves sibling desks with a dragged group and leaves siblings in place for a single desk drag", async () => {
    const mounted = await mountOffice();
    try {
      const deskASelector = "[data-office-desk='thread-a']";
      const deskBSelector = "[data-office-desk='thread-b']";

      const deskABeforeGroup = getRequiredElement<HTMLElement>(deskASelector).getBoundingClientRect();
      const deskBBeforeGroup = getRequiredElement<HTMLElement>(deskBSelector).getBoundingClientRect();

      await dragSelector("[data-office-group='group-a']", { x: 90, y: 36 });

      const deskAAfterGroup = getRequiredElement<HTMLElement>(deskASelector).getBoundingClientRect();
      const deskBAfterGroup = getRequiredElement<HTMLElement>(deskBSelector).getBoundingClientRect();
      expect(deskAAfterGroup.x).toBeGreaterThan(deskABeforeGroup.x + 50);
      expect(deskBAfterGroup.x).toBeGreaterThan(deskBBeforeGroup.x + 50);

      const deskBBeforeSingleDrag = getRequiredElement<HTMLElement>(deskBSelector).getBoundingClientRect();
      await dragSelector(deskASelector, { x: 54, y: 18 });
      const deskAAfterSingleDrag = getRequiredElement<HTMLElement>(deskASelector).getBoundingClientRect();
      const deskBAfterSingleDrag = getRequiredElement<HTMLElement>(deskBSelector).getBoundingClientRect();

      expect(deskAAfterSingleDrag.x).toBeGreaterThan(deskAAfterGroup.x + 30);
      expect(Math.abs(deskBAfterSingleDrag.x - deskBBeforeSingleDrag.x)).toBeLessThan(8);
    } finally {
      await mounted.cleanup();
    }
  });

  it("creates a draft agent from the office toolbar", async () => {
    const mounted = await mountOffice();
    try {
      getButtonByText("Create Agent").click();
      await waitForOfficeLayout();

      const titleInput = getRequiredElement<HTMLInputElement>("input[placeholder='Optional agent name']");
      setInputValue(titleInput, "Office draft");
      getDialogButtonByText("Create Agent").click();
      await waitForOfficeLayout();

      const draftThread = useComposerDraftStore
        .getState()
        .getDraftThreadByProjectId(ProjectId.makeUnsafe("project-1"));
      expect(draftThread?.threadId).toBeTruthy();
      expect(
        document.querySelector(`[data-office-desk='${draftThread?.threadId ?? ""}']`),
      ).toBeTruthy();
      expect(
        document.querySelector(`[data-office-thread-window='${draftThread?.threadId ?? ""}']`),
      ).toBeTruthy();
    } finally {
      await mounted.cleanup();
    }
  });

  it("deletes a draft agent from the popup without leaving the office", async () => {
    const mounted = await mountOffice();
    try {
      getButtonByText("Create Agent").click();
      await waitForOfficeLayout();
      getDialogButtonByText("Create Agent").click();
      await waitForOfficeLayout();

      const draftThread = useComposerDraftStore
        .getState()
        .getDraftThreadByProjectId(ProjectId.makeUnsafe("project-1"));
      if (!draftThread) {
        throw new Error("Missing created draft thread");
      }

      getButtonByText("Delete Agent").click();
      await waitForOfficeLayout();

      expect(
        useComposerDraftStore.getState().getDraftThreadByProjectId(ProjectId.makeUnsafe("project-1")),
      ).toBeNull();
      expect(document.querySelector(`[data-office-thread-window='${draftThread.threadId}']`)).toBeNull();
      expect(document.querySelector(`[data-office-desk='${draftThread.threadId}']`)).toBeNull();
    } finally {
      await mounted.cleanup();
    }
  });

  it("renames a draft agent from the office chat window title", async () => {
    const mounted = await mountOffice();
    try {
      getButtonByText("Create Agent").click();
      await waitForOfficeLayout();

      const titleInput = getRequiredElement<HTMLInputElement>("input[placeholder='Optional agent name']");
      setInputValue(titleInput, "Office draft");
      getDialogButtonByText("Create Agent").click();
      await waitForOfficeLayout();

      const draftThread = useComposerDraftStore
        .getState()
        .getDraftThreadByProjectId(ProjectId.makeUnsafe("project-1"));
      if (!draftThread) {
        throw new Error("Missing created draft thread");
      }

      getRequiredElement<HTMLButtonElement>(`[data-office-thread-title-button='${draftThread.threadId}']`).click();
      await waitForOfficeLayout();

      const renameInput = getRequiredElement<HTMLInputElement>(
        `[data-office-thread-title-input='${draftThread.threadId}']`,
      );
      setInputValue(renameInput, "Renamed agent");
      renameInput.blur();
      await waitForOfficeLayout();

      expect(useComposerDraftStore.getState().getDraftThread(draftThread.threadId)?.title).toBe(
        "Renamed agent",
      );
      expect(
        getRequiredElement<HTMLElement>(`[data-office-thread-title-button='${draftThread.threadId}']`).textContent,
      ).toContain("Renamed agent");
      expect(
        getRequiredElement<HTMLElement>(`[data-office-desk='${draftThread.threadId}']`).textContent,
      ).toContain("Renamed agent");
    } finally {
      await mounted.cleanup();
    }
  });

  it("resizes a chat window smaller so multiple chats can share the screen", async () => {
    const mounted = await mountOffice();
    try {
      getRequiredElement<HTMLElement>("[data-office-desk='thread-a']").click();
      await waitForOfficeLayout();

      const window = getWindow("thread-a");
      const before = window.getBoundingClientRect();
      const resizeHandle = window.querySelector<HTMLElement>("[data-office-thread-resize='corner']");
      if (!resizeHandle) {
        throw new Error("Missing corner resize handle");
      }

      dispatchPointerSequence(resizeHandle, {
        pointerId: 9,
        button: 0,
        buttons: 1,
        startX: before.right - 4,
        startY: before.bottom - 4,
        endX: before.right - 180,
        endY: before.bottom - 140,
      });
      await waitForOfficeLayout();

      const after = getWindow("thread-a").getBoundingClientRect();
      expect(after.width).toBeLessThan(before.width - 120);
      expect(after.height).toBeLessThan(before.height - 90);
    } finally {
      await mounted.cleanup();
    }
  });
});
