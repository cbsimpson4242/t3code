import "../index.css";

import { ProjectId, ThreadId } from "@t3tools/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { useStore } from "../store";
import { DEFAULT_INTERACTION_MODE, DEFAULT_RUNTIME_MODE, type Project, type Thread } from "../types";
import VirtualOffice from "./VirtualOffice";

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
    <div className="h-full w-full">
      <VirtualOffice onThreadActivate={(threadId) => activations.push(threadId)} />
    </div>,
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

  it("opens a desk on click but suppresses click after dragging the desk", async () => {
    const mounted = await mountOffice();
    try {
      getRequiredElement<HTMLElement>("[data-office-desk='thread-a']").click();
      await waitForOfficeLayout();
      expect(mounted.activations).toEqual(["thread-a"]);

      mounted.activations.length = 0;
      await dragSelector("[data-office-desk='thread-a']", { x: 70, y: 20 });
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
});
