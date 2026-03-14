import "../index.css";

import { EventId, MessageId, ProjectId, ThreadId, TurnId } from "@t3tools/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { useComposerDraftStore } from "../composerDraftStore";
import { OFFICE_LAYOUT_STORAGE_KEY, createDefaultOfficePersistedState } from "../office/officeDefaults";
import { useStore } from "../store";
import { DEFAULT_INTERACTION_MODE, DEFAULT_RUNTIME_MODE, type Project, type Thread } from "../types";
import {
  getOfficeAdminWindowDefaultSize,
  getOfficeThreadWindowDefaultSize,
} from "./OfficeThreadWindow";
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
  worktreePath?: string | null;
  messages?: Thread["messages"];
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
    messages: input.messages ?? [],
    proposedPlans: [],
    error: null,
    createdAt: "2026-03-10T00:00:00.000Z",
    latestTurn: null,
    branch: null,
    worktreePath: input.worktreePath ?? null,
    turnDiffSummaries: [],
    activities: [],
  };
}

function makeUserMessage(id: string, text: string): Thread["messages"][number] {
  return {
    id: MessageId.makeUnsafe(id),
    role: "user",
    text,
    createdAt: "2026-03-10T00:00:00.000Z",
    streaming: false,
  };
}

function seedOfficeStore() {
  useStore.setState({
    projects: [makeProject("project-1", "alpha"), makeProject("project-2", "beta")],
    threads: [
      makeThread({
        id: "thread-a",
        projectId: "project-1",
        title: "Desk A",
        worktreePath: "group-a",
        messages: [
          makeUserMessage(
            "msg-thread-a-1",
            "Please update the deploy script to use the new staging environment and confirm the rollback path.",
          ),
        ],
      }),
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

const nativeApiPickFolder = vi.fn<() => Promise<string | null>>(async () => null);
const nativeApiConfirm = vi.fn<(message: string) => Promise<boolean>>(async () => false);
const nativeApiDispatchCommand = vi.fn<
  (command: { type: string; projectId?: string; title?: string; workspaceRoot?: string }) => Promise<{
    sequence: number;
  }>
>(async () => ({ sequence: 1 }));
const nativeApiOpenInEditor = vi.fn<(cwd: string, editor: string) => Promise<void>>(async () => undefined);
const nativeApiStub = {
  dialogs: {
    pickFolder: nativeApiPickFolder,
    confirm: nativeApiConfirm,
  },
  orchestration: {
    dispatchCommand: nativeApiDispatchCommand,
  },
  shell: {
    openInEditor: nativeApiOpenInEditor,
  },
} as never;

function waitForOfficeLayout() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function seedExpandedOfficeLayout() {
  const state = createDefaultOfficePersistedState();
  state.expandedGroupKeys = ["group-a", "group-b", "group-c"];
  localStorage.setItem(OFFICE_LAYOUT_STORAGE_KEY, JSON.stringify(state));
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

async function clickSelector(selector: string) {
  const element = getRequiredElement<HTMLElement>(selector);
  const rect = element.getBoundingClientRect();
  dispatchPointerSequence(element, {
    pointerId: 7,
    button: 0,
    buttons: 1,
    startX: rect.left + rect.width / 2,
    startY: rect.top + rect.height / 2,
    endX: rect.left + rect.width / 2,
    endY: rect.top + rect.height / 2,
  });
  element.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    }),
  );
  await waitForOfficeLayout();
}

async function rightClickSelector(
  selector: string,
  offset?: {
    x: number;
    y: number;
  },
) {
  const element = getRequiredElement<HTMLElement>(selector);
  const rect = element.getBoundingClientRect();
  const clientX = rect.left + (offset?.x ?? rect.width / 2);
  const clientY = rect.top + (offset?.y ?? rect.height / 2);
  element.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      buttons: 2,
      clientX,
      clientY,
    }),
  );
  await waitForOfficeLayout();
  return { x: clientX, y: clientY };
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

async function dragViewportSelectionBox(input: {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}) {
  const viewport = getRequiredElement<HTMLElement>("[data-testid='virtual-office-viewport']");
  dispatchPointerSequence(viewport, {
    pointerId: 21,
    button: 0,
    buttons: 1,
    startX: input.startX,
    startY: input.startY,
    endX: input.endX,
    endY: input.endY,
  });
  await waitForOfficeLayout();
}

async function clickDomSelector(selector: string) {
  getRequiredElement<HTMLElement>(selector).click();
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

async function clickButtonByText(text: string) {
  const button = getButtonByText(text);
  const rect = button.getBoundingClientRect();
  dispatchPointerSequence(button, {
    pointerId: 8,
    button: 0,
    buttons: 1,
    startX: rect.left + rect.width / 2,
    startY: rect.top + rect.height / 2,
    endX: rect.left + rect.width / 2,
    endY: rect.top + rect.height / 2,
  });
  button.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    }),
  );
  await waitForOfficeLayout();
}

function getButtonsByText(text: string): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].filter(
    (entry) => entry.textContent?.trim() === text,
  );
}

function getMenuItemByText(text: string): HTMLElement {
  const item = [...document.querySelectorAll<HTMLElement>("[data-slot='menu-item']")].find(
    (entry) => entry.textContent?.trim() === text,
  );
  if (!item) {
    throw new Error(`Missing menu item: ${text}`);
  }
  return item;
}

function getWindow(threadId: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-office-thread-window='${threadId}']`);
  if (!element) {
    throw new Error(`Missing office thread window: ${threadId}`);
  }
  return element;
}

function getScaledWorldLayer(): HTMLElement {
  const element = document.querySelector<HTMLElement>(".will-change-transform");
  if (!element) {
    throw new Error("Missing scaled world layer");
  }
  return element;
}

function getAdminWindow(): HTMLElement {
  const element = document.querySelector<HTMLElement>("[data-office-admin-window='office-admin']");
  if (!element) {
    throw new Error("Missing office admin window");
  }
  return element;
}

function getOfficeNotification(threadId: string, kind: "attention" | "success"): HTMLElement {
  const element = document.querySelector<HTMLElement>(
    `[data-office-notification-thread='${threadId}'][data-office-notification-kind='${kind}']`,
  );
  if (!element) {
    throw new Error(`Missing office notification for ${threadId} (${kind})`);
  }
  return element;
}

function expectWindowToUseSize(element: HTMLElement, size: { width: number; height: number }) {
  expect(element.style.width).toBe(`${size.width}px`);
  expect(element.style.height).toBe(`${size.height}px`);
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
    seedExpandedOfficeLayout();
    nativeApiPickFolder.mockReset();
    nativeApiPickFolder.mockResolvedValue(null);
    nativeApiConfirm.mockReset();
    nativeApiConfirm.mockResolvedValue(false);
    nativeApiDispatchCommand.mockReset();
    nativeApiDispatchCommand.mockResolvedValue({ sequence: 1 });
    nativeApiOpenInEditor.mockReset();
    nativeApiOpenInEditor.mockResolvedValue(undefined);
    window.nativeApi = nativeApiStub;
    Reflect.deleteProperty(window, "desktopBridge");
  });

  afterEach(() => {
    document.body.innerHTML = "";
    Reflect.deleteProperty(window, "nativeApi");
    Reflect.deleteProperty(window, "desktopBridge");
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

  it("shows usable office menus when zoomed out", async () => {
    const mounted = await mountOffice();
    try {
      const viewport = getRequiredElement<HTMLElement>("[data-testid='virtual-office-viewport']");
      const rect = viewport.getBoundingClientRect();

      for (let index = 0; index < 3; index += 1) {
        viewport.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
            deltaY: 320,
          }),
        );
        await waitForOfficeLayout();
      }

      expect(getRequiredElement<HTMLElement>("[data-office-far-menu='group-a']").textContent).toContain("group-a");
      expect(getRequiredElement<HTMLElement>("[data-office-far-menu='group-b']").textContent).toContain("group-b");

      getRequiredElement<HTMLButtonElement>(
        "[data-office-far-menu='group-a'] [data-office-group-collapse='group-a']",
      ).click();
      await waitForOfficeLayout();

      expect(getRequiredElement<HTMLElement>("[data-office-group='group-a']").dataset.officeGroupCollapsed).toBe(
        "true",
      );
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

  it("opens the CEO office window at a stable size even when the camera is zoomed in", async () => {
    const mounted = await mountOffice();
    try {
      const viewport = getRequiredElement<HTMLElement>("[data-testid='virtual-office-viewport']");
      const viewportRect = viewport.getBoundingClientRect();

      for (let index = 0; index < 4; index += 1) {
        viewport.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            clientX: viewportRect.left + viewportRect.width / 2,
            clientY: viewportRect.top + viewportRect.height / 2,
            deltaY: -220,
          }),
        );
        await waitForOfficeLayout();
      }

      const clickPoint = await rightClickSelector("[data-testid='virtual-office-viewport']", {
        x: 360,
        y: 280,
      });

      const adminWindow = getAdminWindow();
      const rect = adminWindow.getBoundingClientRect();
      const defaultSize = getOfficeAdminWindowDefaultSize();

      expect(rect.width).toBeCloseTo(defaultSize.width, 0);
      expect(rect.height).toBeCloseTo(defaultSize.height, 0);
      expect(Math.abs(rect.left - clickPoint.x)).toBeLessThan(24);
      expect(Math.abs(rect.top - clickPoint.y)).toBeLessThan(24);
    } finally {
      await mounted.cleanup();
    }
  });

  it("keeps the CEO office window visible when the office auto-minimizes other windows", async () => {
    const mounted = await mountOffice();
    try {
      await rightClickSelector("[data-testid='virtual-office-viewport']", {
        x: 360,
        y: 280,
      });

      expect(getAdminWindow().textContent).toContain("CEO Office");

      const viewport = getRequiredElement<HTMLElement>("[data-testid='virtual-office-viewport']");
      const rect = viewport.getBoundingClientRect();

      for (let index = 0; index < 5; index += 1) {
        viewport.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
            deltaY: 320,
          }),
        );
        await waitForOfficeLayout();
      }

      expect(readCameraAttr("data-camera-zoom")).toBeLessThan(0.8);
      expect(
        getRequiredElement<HTMLElement>("[data-testid='virtual-office-viewport']").dataset.officeWindowsMinimized,
      ).toBe("true");
      expect(getAdminWindow().textContent).toContain("CEO Office");
    } finally {
      await mounted.cleanup();
    }
  });

  it("renders office thread windows outside the scaled world layer", async () => {
    const mounted = await mountOffice();
    try {
      getRequiredElement<HTMLElement>("[data-office-desk='thread-a']").click();
      await waitForOfficeLayout();

      const threadWindow = getWindow("thread-a");
      expect(getScaledWorldLayer().contains(threadWindow)).toBe(false);
    } finally {
      await mounted.cleanup();
    }
  });

  it("auto-minimizes office windows when zoomed far out and restores them when zooming back in", async () => {
    const mounted = await mountOffice();
    try {
      getRequiredElement<HTMLElement>("[data-office-desk='thread-a']").click();
      await waitForOfficeLayout();

      expect(document.querySelector("[data-office-thread-window='thread-a']")).toBeTruthy();

      const viewport = getRequiredElement<HTMLElement>("[data-testid='virtual-office-viewport']");
      const rect = viewport.getBoundingClientRect();

      for (let index = 0; index < 5; index += 1) {
        viewport.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
            deltaY: 320,
          }),
        );
        await waitForOfficeLayout();
      }

      expect(readCameraAttr("data-camera-zoom")).toBeLessThan(0.8);
      expect(
        getRequiredElement<HTMLElement>("[data-testid='virtual-office-viewport']").dataset.officeWindowsMinimized,
      ).toBe("true");
      expect(document.querySelector("[data-office-thread-window-preview='thread-a']")).toBeTruthy();
      expect(document.querySelector("[data-office-thread-last-user-message-preview='thread-a']")?.textContent).toContain(
        "Last user message",
      );

      for (let index = 0; index < 6; index += 1) {
        viewport.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
            deltaY: -260,
          }),
        );
        await waitForOfficeLayout();
      }

      expect(readCameraAttr("data-camera-zoom")).toBeGreaterThan(0.88);
      expect(
        getRequiredElement<HTMLElement>("[data-testid='virtual-office-viewport']").dataset.officeWindowsMinimized,
      ).toBe("false");
      expect(document.querySelector("[data-office-thread-window-preview='thread-a']")).toBeNull();
      expect(document.querySelector("[data-office-thread-window='thread-a']")).toBeTruthy();
    } finally {
      await mounted.cleanup();
    }
  });

  it("shows the last user message summary in the popup header", async () => {
    const mounted = await mountOffice();
    try {
      getRequiredElement<HTMLElement>("[data-office-desk='thread-a']").click();
      await waitForOfficeLayout();

      const summary = getRequiredElement<HTMLElement>("[data-office-thread-last-user-message='thread-a']");
      expect(summary.textContent).toContain("Last user message");
      expect(summary.textContent).toContain("Please update the deploy script");
    } finally {
      await mounted.cleanup();
    }
  });

  it("opens new chat windows at the larger default size", async () => {
    const mounted = await mountOffice();
    try {
      getRequiredElement<HTMLElement>("[data-office-desk='thread-a']").click();
      await waitForOfficeLayout();

      expectWindowToUseSize(getWindow("thread-a"), getOfficeThreadWindowDefaultSize());
    } finally {
      await mounted.cleanup();
    }
  });

  it("persists dragged furniture positions across remounts", async () => {
    let movedRect: DOMRect | null = null;
    const mounted = await mountOffice();
    try {
      const selector = "[data-office-element='group:group-a:water-cooler']";
      const before = getRequiredElement<HTMLElement>(selector).getBoundingClientRect();
      await dragSelector(selector, { x: 120, y: 48 });
      const after = getRequiredElement<HTMLElement>(selector).getBoundingClientRect();
      expect(after.x).toBeGreaterThan(before.x + 80);
      movedRect = after;
    } finally {
      await mounted.cleanup();
    }

    const remounted = await mountOffice();
    try {
      const remountedRect = getRequiredElement<HTMLElement>(
        "[data-office-element='group:group-a:water-cooler']",
      ).getBoundingClientRect();
      expect(Math.abs(remountedRect.x - (movedRect?.x ?? remountedRect.x))).toBeLessThan(8);
      expect(Math.abs(remountedRect.y - (movedRect?.y ?? remountedRect.y))).toBeLessThan(8);
    } finally {
      await remounted.cleanup();
    }
  });

  it("lets you change a group accent color and keeps it after remount", async () => {
    const mounted = await mountOffice();
    try {
      await clickDomSelector("[data-office-group-color-trigger='group-a']");
      await vi.waitFor(() => {
        expect(
          document.querySelector("[data-office-group-color-option='group-a:#06b6d4']"),
        ).toBeTruthy();
      });
      await clickDomSelector("[data-office-group-color-option='group-a:#06b6d4']");

      expect(getRequiredElement<HTMLElement>("[data-office-group='group-a']").dataset.officeGroupAccent).toBe(
        "#06b6d4",
      );
    } finally {
      await mounted.cleanup();
    }

    const remounted = await mountOffice();
    try {
      expect(getRequiredElement<HTMLElement>("[data-office-group='group-a']").dataset.officeGroupAccent).toBe(
        "#06b6d4",
      );
    } finally {
      await remounted.cleanup();
    }
  });

  it("moves linked chairs when the boardroom table is dragged", async () => {
    const mounted = await mountOffice();
    try {
      getButtonByText("Add Furniture").click();
      await waitForOfficeLayout();
      getMenuItemByText("Boardroom set").click();
      await waitForOfficeLayout();

      const tableSelector = "[data-office-element='conference-table']";
      const chairSelector = "[data-office-element='conference-table-chair-1']";
      const tableBefore = getRequiredElement<HTMLElement>(tableSelector).getBoundingClientRect();
      const chairBefore = getRequiredElement<HTMLElement>(chairSelector).getBoundingClientRect();

      await dragSelector(tableSelector, { x: 96, y: 32 });

      const tableAfter = getRequiredElement<HTMLElement>(tableSelector).getBoundingClientRect();
      const chairAfter = getRequiredElement<HTMLElement>(chairSelector).getBoundingClientRect();

      expect(tableAfter.x).toBeGreaterThan(tableBefore.x + 60);
      expect(chairAfter.x).toBeGreaterThan(chairBefore.x + 60);
      expect(chairAfter.y).toBeGreaterThan(chairBefore.y + 16);
    } finally {
      await mounted.cleanup();
    }
  });

  it("adds and removes furniture from the office toolbar", async () => {
    const mounted = await mountOffice();
    try {
      const beforeCount = document.querySelectorAll("[data-office-element]").length;

      getButtonByText("Add Furniture").click();
      await waitForOfficeLayout();
      getMenuItemByText("Plant").click();
      await waitForOfficeLayout();

      expect(document.querySelectorAll("[data-office-element]").length).toBe(beforeCount + 1);
      expect(document.querySelector("[data-office-element-selected='true']")).toBeTruthy();

      await clickButtonByText("Remove Selected");

      expect(document.querySelectorAll("[data-office-element]").length).toBe(beforeCount);

      await clickSelector("[data-office-element='group:group-a:water-cooler']");
      await clickButtonByText("Remove Selected");

      expect(document.querySelector("[data-office-element='group:group-a:water-cooler']")).toBeNull();
    } finally {
      await mounted.cleanup();
    }
  });

  it("deletes selected furniture with the Delete key", async () => {
    const mounted = await mountOffice();
    try {
      await clickSelector("[data-office-element='group:group-a:plant-left']");
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          key: "Delete",
        }),
      );
      await waitForOfficeLayout();

      expect(document.querySelector("[data-office-element='group:group-a:plant-left']")).toBeNull();
    } finally {
      await mounted.cleanup();
    }
  });

  it("keeps multiple desk windows open, draws tether indicators, and leaves the office interactive", async () => {
    const mounted = await mountOffice();
    try {
      getRequiredElement<HTMLElement>("[data-office-desk='thread-a']").click();
      await waitForOfficeLayout();
      expect(getWindow("thread-a")).toBeTruthy();
      const threadALink = document.querySelector<SVGGElement>("[data-office-thread-link='thread-a']");
      expect(threadALink).toBeTruthy();
      expect(threadALink?.getBoundingClientRect().width ?? 0).toBeGreaterThan(20);

      getRequiredElement<HTMLElement>("[data-office-desk='thread-b']").click();
      await waitForOfficeLayout();
      expect(getWindow("thread-a")).toBeTruthy();
      expect(getWindow("thread-b")).toBeTruthy();
      const threadBLink = document.querySelector<SVGGElement>("[data-office-thread-link='thread-b']");
      expect(threadBLink).toBeTruthy();
      expect(threadBLink?.getBoundingClientRect().width ?? 0).toBeGreaterThan(20);
      expect(document.querySelector("[data-office-window-backdrop]")).toBeNull();

      getWindowButtonByText("thread-a", "Open in main window").click();
      expect(mounted.activations).toEqual(["thread-a"]);

      mounted.activations.length = 0;
      getWindowButtonByAriaLabel("thread-b", "Close office thread window").click();
      await waitForOfficeLayout();
      expect(document.querySelector("[data-office-thread-window='thread-b']")).toBeNull();
      expect(document.querySelector("[data-office-thread-window-preview='thread-b']")).toBeTruthy();
      expect(getWindow("thread-a")).toBeTruthy();

      getWindowButtonByAriaLabel("thread-a", "Close office thread window").click();
      await waitForOfficeLayout();
      await dragSelector("[data-office-desk='thread-a']", { x: 70, y: 20 });
      expect(document.querySelector("[data-office-thread-window='thread-a']")).toBeNull();
      expect(document.querySelector("[data-office-thread-window-preview='thread-a']")).toBeTruthy();
      expect(mounted.activations).toEqual([]);
    } finally {
      await mounted.cleanup();
    }
  });

  it("restores a minimized chat window to the same rect when reopening", async () => {
    const mounted = await mountOffice();
    try {
      getRequiredElement<HTMLElement>("[data-office-desk='thread-a']").click();
      await waitForOfficeLayout();

      const window = getWindow("thread-a");
      const resizeHandle = window.querySelector<HTMLElement>("[data-office-thread-resize='corner']");
      if (!resizeHandle) {
        throw new Error("Missing corner resize handle");
      }

      dispatchPointerSequence(resizeHandle, {
        pointerId: 10,
        button: 0,
        buttons: 1,
        startX: window.getBoundingClientRect().right - 4,
        startY: window.getBoundingClientRect().bottom - 4,
        endX: window.getBoundingClientRect().right - 220,
        endY: window.getBoundingClientRect().bottom - 160,
      });
      await waitForOfficeLayout();

      const resizedWindow = getWindow("thread-a");
      const resizedStyle = {
        width: resizedWindow.style.width,
        height: resizedWindow.style.height,
      };
      const resizedRect = resizedWindow.getBoundingClientRect();
      expect(resizedStyle.width).not.toBe(`${getOfficeThreadWindowDefaultSize().width}px`);
      expect(document.querySelectorAll("[data-office-thread-window='thread-a']")).toHaveLength(1);

      getWindowButtonByAriaLabel("thread-a", "Close office thread window").click();
      await waitForOfficeLayout();
      expect(document.querySelector("[data-office-thread-window='thread-a']")).toBeNull();
      expect(document.querySelector("[data-office-thread-window-preview='thread-a']")).toBeTruthy();

      getRequiredElement<HTMLElement>("[data-office-desk='thread-a']").click();
      await waitForOfficeLayout();

      expect(document.querySelectorAll("[data-office-thread-window='thread-a']")).toHaveLength(1);
      expect(getWindow("thread-a").style.width).toBe(resizedStyle.width);
      expect(getWindow("thread-a").style.height).toBe(resizedStyle.height);
      const restoredRect = getWindow("thread-a").getBoundingClientRect();
      expect(restoredRect.x).toBeCloseTo(resizedRect.x, 0);
      expect(restoredRect.y).toBeCloseTo(resizedRect.y, 0);
    } finally {
      await mounted.cleanup();
    }
  });

  it("selects multiple offices with a left-drag box and moves them together", async () => {
    const mounted = await mountOffice();
    try {
      const groupA = getRequiredElement<HTMLElement>("[data-office-group='group-a']");
      const groupB = getRequiredElement<HTMLElement>("[data-office-group='group-b']");
      const groupABefore = groupA.getBoundingClientRect();
      const groupBBefore = groupB.getBoundingClientRect();

      await dragViewportSelectionBox({
        startX: groupABefore.left - 16,
        startY: groupABefore.top - 16,
        endX: groupBBefore.right + 16,
        endY: Math.max(groupABefore.bottom, groupBBefore.bottom) + 16,
      });

      expect(groupA.dataset.officeGroupSelected).toBe("true");
      expect(groupB.dataset.officeGroupSelected).toBe("true");
      expect(document.querySelector("[data-office-group-selection-box]")).toBeNull();

      await dragSelector("[data-office-group='group-a']", { x: 96, y: 42 });

      const groupAAfter = getRequiredElement<HTMLElement>(
        "[data-office-group='group-a']",
      ).getBoundingClientRect();
      const groupBAfter = getRequiredElement<HTMLElement>(
        "[data-office-group='group-b']",
      ).getBoundingClientRect();

      expect(groupAAfter.x).toBeGreaterThan(groupABefore.x + 60);
      expect(groupAAfter.y).toBeGreaterThan(groupABefore.y + 20);
      expect(groupBAfter.x).toBeGreaterThan(groupBBefore.x + 60);
      expect(groupBAfter.y).toBeGreaterThan(groupBBefore.y + 20);
    } finally {
      await mounted.cleanup();
    }
  });

  it("shows a live thought summary bubble above a running agent", async () => {
    useStore.setState((state) => ({
      ...state,
      threads: state.threads.map((thread) =>
        thread.id !== ThreadId.makeUnsafe("thread-a")
          ? thread
          : {
              ...thread,
              latestTurn: {
                turnId: TurnId.makeUnsafe("turn-office-active"),
                state: "running",
                requestedAt: "2026-03-10T00:00:01.000Z",
                startedAt: "2026-03-10T00:00:02.000Z",
                completedAt: null,
                assistantMessageId: null,
              },
              session: {
                provider: "codex",
                status: "running",
                createdAt: "2026-03-10T00:00:00.000Z",
                updatedAt: "2026-03-10T00:00:03.000Z",
                orchestrationStatus: "running",
                activeTurnId: TurnId.makeUnsafe("turn-office-active"),
              },
              activities: [
                {
                  id: EventId.makeUnsafe("activity-office-thinking"),
                  kind: "provider.item.completed",
                  tone: "tool",
                  summary: "Inspecting repository state",
                  payload: {
                    detail: "Inspecting repository state and comparing changed files before the next edit.",
                  },
                  turnId: TurnId.makeUnsafe("turn-office-active"),
                  createdAt: "2026-03-10T00:00:04.000Z",
                },
              ],
            },
      ),
    }));

    const mounted = await mountOffice();
    try {
      await waitForOfficeLayout();
      const thoughtBubble = document.querySelector<HTMLElement>("[data-office-bot-thought='thread-a']");
      expect(thoughtBubble?.textContent).toContain("Inspecting repository state");
    } finally {
      await mounted.cleanup();
    }
  });

  it("shows an office notification when an agent starts waiting for user input", async () => {
    const mounted = await mountOffice();
    try {
      useStore.setState((state) => ({
        ...state,
        threads: state.threads.map((thread) =>
          thread.id !== ThreadId.makeUnsafe("thread-a")
            ? thread
            : {
                ...thread,
                activities: [
                  ...thread.activities,
                  {
                    id: EventId.makeUnsafe("activity-office-user-input"),
                    kind: "user-input.requested",
                    tone: "info",
                    summary: "User input requested",
                    payload: {
                      requestId: "req-office-user-input",
                      questions: [
                        {
                          id: "reply",
                          header: "Reply",
                          question: "Should I continue with the deploy step?",
                          options: [{ label: "Yes", description: "Continue execution" }],
                        },
                      ],
                    },
                    turnId: TurnId.makeUnsafe("turn-office-user-input"),
                    createdAt: "2026-03-10T00:00:05.000Z",
                  },
                ],
              },
        ),
      }));

      await vi.waitFor(() => {
        expect(getOfficeNotification("thread-a", "attention").textContent).toContain(
          "needs your attention",
        );
      });

      const notification = getOfficeNotification("thread-a", "attention");
      expect(notification.textContent).toContain("waiting for your reply");

      const openButton = [...notification.querySelectorAll<HTMLButtonElement>("button")].find(
        (entry) => entry.textContent?.trim() === "Open",
      );
      if (!openButton) {
        throw new Error("Missing office notification open button");
      }
      openButton.click();
      await waitForOfficeLayout();

      expect(getWindow("thread-a")).toBeTruthy();
      expect(
        document.querySelector(
          "[data-office-notification-thread='thread-a'][data-office-notification-kind='attention']",
        ),
      ).toBeNull();
    } finally {
      await mounted.cleanup();
    }
  });

  it("shows an office notification when an agent finishes work", async () => {
    const mounted = await mountOffice();
    try {
      useStore.setState((state) => ({
        ...state,
        threads: state.threads.map((thread) =>
          thread.id !== ThreadId.makeUnsafe("thread-b")
            ? thread
            : {
                ...thread,
                latestTurn: {
                  turnId: TurnId.makeUnsafe("turn-office-complete"),
                  state: "completed",
                  requestedAt: "2026-03-10T00:00:01.000Z",
                  startedAt: "2026-03-10T00:00:02.000Z",
                  completedAt: "2026-03-10T00:00:08.000Z",
                  assistantMessageId: null,
                },
                session: {
                  provider: "codex",
                  status: "ready",
                  createdAt: "2026-03-10T00:00:00.000Z",
                  updatedAt: "2026-03-10T00:00:08.000Z",
                  orchestrationStatus: "ready",
                  activeTurnId: undefined,
                },
              },
        ),
      }));

      await vi.waitFor(() => {
        expect(getOfficeNotification("thread-b", "success").textContent).toContain(
          "finished work",
        );
      });

      expect(getOfficeNotification("thread-b", "success").textContent).toContain(
        "ready for review",
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it("moves sibling desks and linked chat windows with a dragged group, and leaves siblings in place for a single desk drag", async () => {
    const mounted = await mountOffice();
    try {
      const deskASelector = "[data-office-desk='thread-a']";
      const deskBSelector = "[data-office-desk='thread-b']";

      getRequiredElement<HTMLElement>(deskASelector).click();
      getRequiredElement<HTMLElement>("[data-office-desk='thread-c']").click();
      await waitForOfficeLayout();

      const deskABeforeGroup = getRequiredElement<HTMLElement>(deskASelector).getBoundingClientRect();
      const deskBBeforeGroup = getRequiredElement<HTMLElement>(deskBSelector).getBoundingClientRect();
      const windowABeforeGroup = getWindow("thread-a").getBoundingClientRect();
      const windowCBeforeGroup = getWindow("thread-c").getBoundingClientRect();

      await dragSelector("[data-office-group='group-a']", { x: 90, y: 36 });

      const deskAAfterGroup = getRequiredElement<HTMLElement>(deskASelector).getBoundingClientRect();
      const deskBAfterGroup = getRequiredElement<HTMLElement>(deskBSelector).getBoundingClientRect();
      const windowAAfterGroup = getWindow("thread-a").getBoundingClientRect();
      const windowCAfterGroup = getWindow("thread-c").getBoundingClientRect();
      expect(deskAAfterGroup.x).toBeGreaterThan(deskABeforeGroup.x + 50);
      expect(deskBAfterGroup.x).toBeGreaterThan(deskBBeforeGroup.x + 50);
      expect(windowAAfterGroup.x).toBeGreaterThan(windowABeforeGroup.x + 50);
      expect(windowAAfterGroup.y).toBeGreaterThan(windowABeforeGroup.y + 20);
      expect(Math.abs(windowCAfterGroup.x - windowCBeforeGroup.x)).toBeLessThan(8);
      expect(Math.abs(windowCAfterGroup.y - windowCBeforeGroup.y)).toBeLessThan(8);

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

  it("resizes a project group from the corner and rescales desk spacing inside it", async () => {
    const mounted = await mountOffice();
    try {
      const groupBefore = getRequiredElement<HTMLElement>("[data-office-group='group-a']").getBoundingClientRect();
      const deskABefore = getRequiredElement<HTMLElement>("[data-office-desk='thread-a']").getBoundingClientRect();
      const deskBBefore = getRequiredElement<HTMLElement>("[data-office-desk='thread-b']").getBoundingClientRect();
      const gapBefore = Math.abs(deskBBefore.x - deskABefore.x);

      await dragSelector("[data-office-group-resize='group-a']", { x: 160, y: 110 });

      const groupAfter = getRequiredElement<HTMLElement>("[data-office-group='group-a']").getBoundingClientRect();
      const deskAAfter = getRequiredElement<HTMLElement>("[data-office-desk='thread-a']").getBoundingClientRect();
      const deskBAfter = getRequiredElement<HTMLElement>("[data-office-desk='thread-b']").getBoundingClientRect();
      const gapAfter = Math.abs(deskBAfter.x - deskAAfter.x);

      expect(groupAfter.width).toBeGreaterThan(groupBefore.width + 120);
      expect(groupAfter.height).toBeGreaterThan(groupBefore.height + 80);
      expect(gapAfter).toBeGreaterThan(gapBefore + 40);
    } finally {
      await mounted.cleanup();
    }
  });

  it("renders a minimap with office markers and open window indicators", async () => {
    const mounted = await mountOffice();
    try {
      const minimap = getRequiredElement<HTMLElement>("[data-office-minimap]");
      expect(minimap).toBeTruthy();
      expect(minimap.style.width).toBe("320px");
      expect(minimap.style.height).toBe("220px");
      expect(getRequiredElement<HTMLElement>("[data-office-shortcut='group-a']").textContent).toContain("group-a");
      expect(getRequiredElement<HTMLElement>("[data-office-shortcut='group-b']").textContent).toContain("group-b");
      expect(document.querySelector("[data-office-minimap-group='group-a']")).toBeTruthy();
      expect(document.querySelector("[data-office-minimap-group='group-b']")).toBeTruthy();
      expect(document.querySelector("[data-office-minimap-desk='thread-a']")).toBeTruthy();
      expect(document.querySelector("[data-office-minimap-viewport]")).toBeTruthy();

      getRequiredElement<HTMLElement>("[data-office-desk='thread-a']").click();
      await waitForOfficeLayout();

      expect(document.querySelector("[data-office-minimap-window='thread:thread-a']")).toBeTruthy();
    } finally {
      await mounted.cleanup();
    }
  });

  it("centers the camera on an office from the shortcut list", async () => {
    const mounted = await mountOffice();
    try {
      await panViewport({ x: -220, y: -40 });

      const viewport = getRequiredElement<HTMLElement>("[data-testid='virtual-office-viewport']");
      const viewportRect = viewport.getBoundingClientRect();
      const viewportCenterX = viewportRect.left + viewportRect.width / 2;
      const viewportCenterY = viewportRect.top + viewportRect.height / 2;

      const groupBefore = getRequiredElement<HTMLElement>("[data-office-group='group-b']").getBoundingClientRect();
      const beforeCenterX = groupBefore.left + groupBefore.width / 2;
      const beforeCenterY = groupBefore.top + groupBefore.height / 2;
      expect(Math.abs(beforeCenterX - viewportCenterX)).toBeGreaterThan(120);
      expect(Math.abs(beforeCenterY - viewportCenterY)).toBeLessThan(200);

      await clickSelector("[data-office-shortcut='group-b']");

      const groupAfter = getRequiredElement<HTMLElement>("[data-office-group='group-b']").getBoundingClientRect();
      const afterCenterX = groupAfter.left + groupAfter.width / 2;
      const afterCenterY = groupAfter.top + groupAfter.height / 2;
      expect(Math.abs(afterCenterX - viewportCenterX)).toBeLessThan(24);
      expect(Math.abs(afterCenterY - viewportCenterY)).toBeLessThan(24);
      expect(getRequiredElement<HTMLElement>("[data-office-shortcut='group-b']").textContent).toContain("Centered");
    } finally {
      await mounted.cleanup();
    }
  });

  it("starts with offices collapsed when no office layout is saved", async () => {
    localStorage.clear();

    const mounted = await mountOffice();
    try {
      expect(getRequiredElement<HTMLElement>("[data-office-group='group-a']").dataset.officeGroupCollapsed).toBe("true");
      expect(document.querySelector("[data-office-desk='thread-a']")).toBeNull();

      await clickSelector("[data-office-group-collapse='group-a']");

      expect(getRequiredElement<HTMLElement>("[data-office-group='group-a']").dataset.officeGroupCollapsed).toBe(
        undefined,
      );
      expect(document.querySelector("[data-office-desk='thread-a']")).toBeTruthy();
    } finally {
      await mounted.cleanup();
    }
  });

  it("collapses and expands an office from its top bar", async () => {
    const mounted = await mountOffice();
    try {
      const group = getRequiredElement<HTMLElement>("[data-office-group='group-a']");
      const groupBefore = group.getBoundingClientRect();
      expect(document.querySelector("[data-office-desk='thread-a']")).toBeTruthy();
      expect(getComputedStyle(group).overflow).toBe("visible");

      await clickSelector("[data-office-group-collapse='group-a']");

      const groupCollapsed = getRequiredElement<HTMLElement>("[data-office-group='group-a']").getBoundingClientRect();
      expect(groupCollapsed.height).toBeLessThan(groupBefore.height / 2);
      expect(getRequiredElement<HTMLElement>("[data-office-group='group-a']").dataset.officeGroupCollapsed).toBe("true");
      expect(getComputedStyle(getRequiredElement<HTMLElement>("[data-office-group='group-a']")).overflow).toBe("hidden");
      expect(document.querySelector("[data-office-desk='thread-a']")).toBeNull();

      await clickSelector("[data-office-group-collapse='group-a']");

      expect(getRequiredElement<HTMLElement>("[data-office-group='group-a']").dataset.officeGroupCollapsed).toBe(undefined);
      expect(getComputedStyle(getRequiredElement<HTMLElement>("[data-office-group='group-a']")).overflow).toBe(
        "visible",
      );
      expect(document.querySelector("[data-office-desk='thread-a']")).toBeTruthy();
    } finally {
      await mounted.cleanup();
    }
  });

  it("warns before deleting an office and removes it from the layout when confirmed", async () => {
    nativeApiConfirm.mockResolvedValue(true);

    const mounted = await mountOffice();
    try {
      await clickDomSelector("[data-office-group-delete='group-a']");

      expect(nativeApiConfirm).toHaveBeenCalledWith(expect.stringContaining("Remove group-a from the office view?"));
      expect(document.querySelector("[data-office-group='group-a']")).toBeNull();
      expect(document.querySelector("[data-office-shortcut='group-a']")).toBeNull();
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
      const draftWindow = document.querySelector<HTMLElement>(
        `[data-office-thread-window='${draftThread?.threadId ?? ""}']`,
      );
      expect(draftWindow).toBeTruthy();
      if (!draftWindow) {
        throw new Error("Missing created draft thread window");
      }
      expectWindowToUseSize(draftWindow, getOfficeThreadWindowDefaultSize());
    } finally {
      await mounted.cleanup();
    }
  });

  it("creates a second draft agent for the same project without replacing the first", async () => {
    const mounted = await mountOffice();
    try {
      getButtonByText("Create Agent").click();
      await waitForOfficeLayout();
      setInputValue(
        getRequiredElement<HTMLInputElement>("input[placeholder='Optional agent name']"),
        "Office draft one",
      );
      getDialogButtonByText("Create Agent").click();
      await waitForOfficeLayout();

      const firstDraft = useComposerDraftStore
        .getState()
        .getDraftThreadByProjectId(ProjectId.makeUnsafe("project-1"));
      if (!firstDraft) {
        throw new Error("Missing first created draft thread");
      }

      getButtonByText("Create Agent").click();
      await waitForOfficeLayout();
      setInputValue(
        getRequiredElement<HTMLInputElement>("input[placeholder='Optional agent name']"),
        "Office draft two",
      );
      getDialogButtonByText("Create Agent").click();
      await waitForOfficeLayout();

      const secondDraft = useComposerDraftStore
        .getState()
        .getDraftThreadByProjectId(ProjectId.makeUnsafe("project-1"));
      if (!secondDraft) {
        throw new Error("Missing second created draft thread");
      }

      expect(secondDraft.threadId).not.toBe(firstDraft.threadId);
      expect(useComposerDraftStore.getState().getDraftThread(firstDraft.threadId)?.title).toBe(
        "Office draft one",
      );
      expect(useComposerDraftStore.getState().getDraftThread(secondDraft.threadId)?.title).toBe(
        "Office draft two",
      );
      expect(document.querySelector(`[data-office-desk='${firstDraft.threadId}']`)).toBeTruthy();
      expect(document.querySelector(`[data-office-desk='${secondDraft.threadId}']`)).toBeTruthy();
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

  it("opens the CEO office window and lists active projects, including a newly added folder project", async () => {
    nativeApiPickFolder.mockResolvedValue("/repo/gamma");
    nativeApiDispatchCommand.mockImplementation(async (command) => {
      if (command.type === "project.create") {
        useStore.setState((state) => ({
          ...state,
          projects: [
            ...state.projects,
            {
              id: ProjectId.makeUnsafe(command.projectId ?? "project-gamma"),
              name: command.title ?? "gamma",
              cwd: command.workspaceRoot ?? "/repo/gamma",
              model: "gpt-5-codex",
              expanded: true,
              scripts: [],
            },
          ],
        }));
      }
      return { sequence: 1 };
    });

    const mounted = await mountOffice();
    try {
      await rightClickSelector("[data-office-group='group-a']", { x: 36, y: 160 });

      const adminWindow = getAdminWindow();
      expectWindowToUseSize(adminWindow, getOfficeAdminWindowDefaultSize());
      expect(adminWindow.textContent).toContain("CEO Office");
      expect(adminWindow.textContent).toContain("alpha");
      expect(adminWindow.textContent).toContain("beta");

      getButtonByText("Open Folder").click();
      await waitForOfficeLayout();
      await waitForOfficeLayout();

      expect(nativeApiPickFolder).toHaveBeenCalledOnce();
      expect(nativeApiDispatchCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "project.create",
          workspaceRoot: "/repo/gamma",
        }),
      );
      expect(getAdminWindow().textContent).toContain("gamma");
    } finally {
      await mounted.cleanup();
    }
  });

  it("opens the CEO office window when right-clicking empty office space", async () => {
    const mounted = await mountOffice();
    try {
      expect(document.querySelector("[data-office-admin-window='office-admin']")).toBeNull();

      const clickPoint = await rightClickSelector("[data-testid='virtual-office-viewport']", {
        x: 320,
        y: 260,
      });

      const adminWindow = getAdminWindow();
      const rect = adminWindow.getBoundingClientRect();
      expect(adminWindow.textContent).toContain("CEO Office");
      expect(Math.abs(rect.left - clickPoint.x)).toBeLessThan(24);
      expect(Math.abs(rect.top - clickPoint.y)).toBeLessThan(24);
    } finally {
      await mounted.cleanup();
    }
  });

  it("opens the CEO office window when right-clicking empty group space", async () => {
    const mounted = await mountOffice();
    try {
      expect(document.querySelector("[data-office-admin-window='office-admin']")).toBeNull();

      await rightClickSelector("[data-office-group='group-a']", { x: 40, y: 160 });

      expect(getAdminWindow().textContent).toContain("CEO Office");
    } finally {
      await mounted.cleanup();
    }
  });

  it("does not open the CEO office window when right-clicking a desk", async () => {
    const mounted = await mountOffice();
    try {
      expect(document.querySelector("[data-office-admin-window='office-admin']")).toBeNull();

      await rightClickSelector("[data-office-desk='thread-a']");

      expect(document.querySelector("[data-office-admin-window='office-admin']")).toBeNull();
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
