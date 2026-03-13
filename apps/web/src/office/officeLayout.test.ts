import {
  EventId,
  MessageId,
  ProjectId,
  ThreadId,
  TurnId,
  type OrchestrationThreadActivity,
} from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import { DEFAULT_INTERACTION_MODE, DEFAULT_RUNTIME_MODE, type Project, type Thread } from "../types";
import { createDefaultOfficePersistedState } from "./officeDefaults";
import { buildOfficeScene, deriveOfficeInputs } from "./officeLayout";

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
    worktreePath: input.worktreePath ?? null,
    turnDiffSummaries: [],
    activities: [],
  };
}

function makeActivity(overrides: {
  id?: string;
  createdAt?: string;
  kind?: string;
  summary?: string;
  tone?: OrchestrationThreadActivity["tone"];
  payload?: Record<string, unknown>;
}): OrchestrationThreadActivity {
  return {
    id: EventId.makeUnsafe(overrides.id ?? crypto.randomUUID()),
    createdAt: overrides.createdAt ?? "2026-03-10T00:00:00.000Z",
    kind: overrides.kind ?? "user-input.requested",
    summary: overrides.summary ?? "User input requested",
    tone: overrides.tone ?? "info",
    payload: overrides.payload ?? {},
    turnId: null,
  };
}

describe("officeLayout", () => {
  it("preserves existing group anchors and appends new groups without reflow", () => {
    const projects = [makeProject("project-1", "project-a"), makeProject("project-2", "project-b")];
    const threads = [
      makeThread({ id: "thread-1", projectId: "project-1", title: "Thread 1", worktreePath: "group-a" }),
      makeThread({ id: "thread-2", projectId: "project-2", title: "Thread 2", worktreePath: "group-b" }),
    ];
    const inputs = deriveOfficeInputs(projects, threads);
    const firstBuild = buildOfficeScene({
      ...inputs,
      persistedState: createDefaultOfficePersistedState(),
    });

    const persistedState = {
      ...firstBuild.persistedState,
      projectGroupAnchors: {
        ...firstBuild.persistedState.projectGroupAnchors,
        "group-a": { x: 900, y: 180 },
      },
    };
    const nextInputs = deriveOfficeInputs(
      [...projects, makeProject("project-3", "project-c")],
      [...threads, makeThread({ id: "thread-3", projectId: "project-3", title: "Thread 3", worktreePath: "group-c" })],
    );
    const nextBuild = buildOfficeScene({
      ...nextInputs,
      persistedState,
    });

    expect(nextBuild.persistedState.projectGroupAnchors["group-a"]).toEqual({ x: 900, y: 180 });
    expect(nextBuild.persistedState.projectGroupAnchors["group-b"]).toEqual(
      firstBuild.persistedState.projectGroupAnchors["group-b"],
    );
    expect(nextBuild.persistedState.projectGroupAnchors["group-c"]!.x).toBeGreaterThan(
      Math.max(
        nextBuild.persistedState.projectGroupAnchors["group-a"]!.x,
        nextBuild.persistedState.projectGroupAnchors["group-b"]!.x,
      ),
    );
  });

  it("moves desks with their group anchor while preserving relative offsets", () => {
    const projects = [makeProject("project-1", "project-a")];
    const threads = [
      makeThread({ id: "thread-1", projectId: "project-1", title: "Thread 1", worktreePath: "group-a" }),
      makeThread({ id: "thread-2", projectId: "project-1", title: "Thread 2", worktreePath: "group-a" }),
    ];
    const inputs = deriveOfficeInputs(projects, threads);
    const firstBuild = buildOfficeScene({
      ...inputs,
      persistedState: createDefaultOfficePersistedState(),
    });
    const beforeDeskPositions = new Map(
      firstBuild.scene.desks.map((desk) => [desk.threadId, { x: desk.element.x, y: desk.element.y }] as const),
    );

    const movedBuild = buildOfficeScene({
      ...inputs,
      persistedState: {
        ...firstBuild.persistedState,
        projectGroupAnchors: {
          ...firstBuild.persistedState.projectGroupAnchors,
          "group-a": {
            x: firstBuild.persistedState.projectGroupAnchors["group-a"]!.x + 120,
            y: firstBuild.persistedState.projectGroupAnchors["group-a"]!.y + 48,
          },
        },
      },
    });

    for (const desk of movedBuild.scene.desks) {
      const before = beforeDeskPositions.get(desk.threadId)!;
      expect(desk.element.x - before.x).toBe(120);
      expect(desk.element.y - before.y).toBe(48);
    }
  });

  it("updates only the dragged desk offset inside a group", () => {
    const projects = [makeProject("project-1", "project-a")];
    const threads = [
      makeThread({ id: "thread-1", projectId: "project-1", title: "Thread 1", worktreePath: "group-a" }),
      makeThread({ id: "thread-2", projectId: "project-1", title: "Thread 2", worktreePath: "group-a" }),
    ];
    const inputs = deriveOfficeInputs(projects, threads);
    const firstBuild = buildOfficeScene({
      ...inputs,
      persistedState: createDefaultOfficePersistedState(),
    });
    const beforeDeskPositions = new Map(
      firstBuild.scene.desks.map((desk) => [desk.threadId, { x: desk.element.x, y: desk.element.y }] as const),
    );

    const movedDeskOffset = firstBuild.persistedState.deskOffsetsByThreadId["thread-1"]!;
    const nextBuild = buildOfficeScene({
      ...inputs,
      persistedState: {
        ...firstBuild.persistedState,
        deskOffsetsByThreadId: {
          ...firstBuild.persistedState.deskOffsetsByThreadId,
          "thread-1": {
            x: movedDeskOffset.x + 40,
            y: movedDeskOffset.y + 12,
          },
        },
      },
    });

    const movedDesk = nextBuild.scene.desks.find((desk) => desk.threadId === "thread-1")!;
    const untouchedDesk = nextBuild.scene.desks.find((desk) => desk.threadId === "thread-2")!;

    expect(movedDesk.element.x - beforeDeskPositions.get("thread-1")!.x).toBe(40);
    expect(movedDesk.element.y - beforeDeskPositions.get("thread-1")!.y).toBe(12);
    expect(untouchedDesk.element).toMatchObject(beforeDeskPositions.get("thread-2")!);
  });

  it("seeds one default furniture kit per group and exposes congregation targets", () => {
    const projects = [makeProject("project-1", "project-a"), makeProject("project-2", "project-b")];
    const threads = [
      makeThread({ id: "thread-1", projectId: "project-1", title: "Thread 1", worktreePath: "group-a" }),
      makeThread({ id: "thread-2", projectId: "project-2", title: "Thread 2", worktreePath: "group-b" }),
    ];

    const build = buildOfficeScene({
      ...deriveOfficeInputs(projects, threads),
      persistedState: createDefaultOfficePersistedState(),
    });

    expect(build.persistedState.defaultFurnitureSeededGroupKeys.toSorted()).toEqual([
      "group-a",
      "group-b",
      "tv:group-a",
      "tv:group-b",
    ]);
    expect(build.persistedState.furniture.filter((element) => element.placement.kind === "groupLinked")).toHaveLength(12);
    expect(build.scene.groups.every((group) => group.congregationTargets.length > 0)).toBe(true);
  });

  it("backfills newly added default office furniture for already-seeded groups", () => {
    const projects = [makeProject("project-1", "project-a")];
    const threads = [makeThread({ id: "thread-1", projectId: "project-1", title: "Thread 1", worktreePath: "group-a" })];

    const firstBuild = buildOfficeScene({
      ...deriveOfficeInputs(projects, threads),
      persistedState: createDefaultOfficePersistedState(),
    });

    const nextBuild = buildOfficeScene({
      ...deriveOfficeInputs(projects, threads),
      persistedState: {
        ...firstBuild.persistedState,
        furniture: firstBuild.persistedState.furniture.filter((element) => element.id !== "group:group-a:tv"),
        defaultFurnitureSeededGroupKeys: ["group-a"],
      },
    });

    expect(nextBuild.persistedState.furniture.some((element) => element.id === "group:group-a:tv")).toBe(
      true,
    );
    expect(nextBuild.scene.furniture.some((element) => element.id === "group:group-a:tv")).toBe(true);
  });

  it("moves linked furniture automatically when the group anchor changes", () => {
    const projects = [makeProject("project-1", "project-a")];
    const threads = [makeThread({ id: "thread-1", projectId: "project-1", title: "Thread 1", worktreePath: "group-a" })];
    const inputs = deriveOfficeInputs(projects, threads);
    const firstBuild = buildOfficeScene({
      ...inputs,
      persistedState: createDefaultOfficePersistedState(),
    });
    const tableBefore = firstBuild.scene.furniture.find((element) => element.id === "group:group-a:conference-table");
    if (!tableBefore) {
      throw new Error("Missing linked table");
    }

    const movedBuild = buildOfficeScene({
      ...inputs,
      persistedState: {
        ...firstBuild.persistedState,
        projectGroupAnchors: {
          ...firstBuild.persistedState.projectGroupAnchors,
          "group-a": {
            x: firstBuild.persistedState.projectGroupAnchors["group-a"]!.x + 180,
            y: firstBuild.persistedState.projectGroupAnchors["group-a"]!.y + 75,
          },
        },
      },
    });
    const tableAfter = movedBuild.scene.furniture.find((element) => element.id === "group:group-a:conference-table");

    expect(tableAfter?.x).toBe(tableBefore.x + 180);
    expect(tableAfter?.y).toBe(tableBefore.y + 75);
  });

  it("places the first three desks across the top row of an individual office", () => {
    const projects = [makeProject("project-1", "project-a")];
    const threads = [
      makeThread({ id: "thread-1", projectId: "project-1", title: "Thread 1", worktreePath: "group-a" }),
      makeThread({ id: "thread-2", projectId: "project-1", title: "Thread 2", worktreePath: "group-a" }),
      makeThread({ id: "thread-3", projectId: "project-1", title: "Thread 3", worktreePath: "group-a" }),
    ];

    const build = buildOfficeScene({
      ...deriveOfficeInputs(projects, threads),
      persistedState: createDefaultOfficePersistedState(),
    });

    expect(build.persistedState.deskOffsetsByThreadId).toMatchObject({
      "thread-1": { x: 18, y: 32 },
      "thread-2": { x: 186, y: 32 },
      "thread-3": { x: 354, y: 32 },
    });
  });

  it("expands group bounds to include linked furniture", () => {
    const projects = [makeProject("project-1", "project-a")];
    const threads = [makeThread({ id: "thread-1", projectId: "project-1", title: "Thread 1", worktreePath: "group-a" })];

    const build = buildOfficeScene({
      ...deriveOfficeInputs(projects, threads),
      persistedState: createDefaultOfficePersistedState(),
    });
    const group = build.scene.groups[0]!;
    const groupFurniture = build.scene.furniture.filter((element) => element.id.startsWith("group:group-a:"));

    for (const furniture of groupFurniture) {
      expect(furniture.x).toBeGreaterThanOrEqual(group.element.x);
      expect(furniture.y).toBeGreaterThanOrEqual(group.element.y);
      expect(furniture.x + furniture.width).toBeLessThanOrEqual(group.element.x + group.element.width);
      expect(furniture.y + furniture.height).toBeLessThanOrEqual(group.element.y + group.element.height);
    }
  });

  it("spaces default offices far enough apart to avoid overlap", () => {
    const projects = [makeProject("project-1", "project-a"), makeProject("project-2", "project-b")];
    const threads = [
      makeThread({ id: "thread-1", projectId: "project-1", title: "Thread 1", worktreePath: "group-a" }),
      makeThread({ id: "thread-2", projectId: "project-2", title: "Thread 2", worktreePath: "group-b" }),
    ];

    const build = buildOfficeScene({
      ...deriveOfficeInputs(projects, threads),
      persistedState: createDefaultOfficePersistedState(),
    });
    const groupA = build.scene.groups.find((group) => group.key === "group-a");
    const groupB = build.scene.groups.find((group) => group.key === "group-b");
    if (!groupA || !groupB) {
      throw new Error("Missing default office groups");
    }

    expect(groupB.element.x).toBeGreaterThanOrEqual(groupA.element.x + groupA.element.width + 32);
  });

  it("does not let one group's furniture or congregation targets appear in another office", () => {
    const projects = [makeProject("project-1", "project-a"), makeProject("project-2", "project-b")];
    const threads = [
      makeThread({ id: "thread-1", projectId: "project-1", title: "Thread 1", worktreePath: "group-a" }),
      makeThread({ id: "thread-2", projectId: "project-2", title: "Thread 2", worktreePath: "group-b" }),
    ];

    const build = buildOfficeScene({
      ...deriveOfficeInputs(projects, threads),
      persistedState: createDefaultOfficePersistedState(),
    });
    const groupA = build.scene.groups.find((group) => group.key === "group-a")!;
    const groupB = build.scene.groups.find((group) => group.key === "group-b")!;

    expect(groupA.congregationTargets.every((target) => target.furnitureId.startsWith("group:group-a:"))).toBe(true);
    expect(groupB.congregationTargets.every((target) => target.furnitureId.startsWith("group:group-b:"))).toBe(true);
  });

  it("does not restore removed default office furniture after seeding", () => {
    const projects = [makeProject("project-1", "project-a")];
    const threads = [makeThread({ id: "thread-1", projectId: "project-1", title: "Thread 1", worktreePath: "group-a" })];
    const firstBuild = buildOfficeScene({
      ...deriveOfficeInputs(projects, threads),
      persistedState: createDefaultOfficePersistedState(),
    });

    const nextBuild = buildOfficeScene({
      ...deriveOfficeInputs(projects, threads),
      persistedState: {
        ...firstBuild.persistedState,
        furniture: firstBuild.persistedState.furniture.filter((element) => element.id !== "group:group-a:water-cooler"),
      },
    });

    expect(nextBuild.scene.furniture.some((element) => element.id === "group:group-a:water-cooler")).toBe(false);
  });

  it("marks desks that have pending user attention", () => {
    const projects = [makeProject("project-1", "project-a")];
    const thread = makeThread({
      id: "thread-1",
      projectId: "project-1",
      title: "Thread 1",
      worktreePath: "group-a",
    });
    thread.activities = [
      makeActivity({
        payload: {
          requestId: "req-1",
          questions: [
            {
              id: "approval",
              header: "Approval",
              question: "Continue?",
              options: [{ label: "yes", description: "Continue execution" }],
            },
          ],
        },
      }),
    ];

    const inputs = deriveOfficeInputs(projects, [thread]);

    expect(inputs.desks[0]).toMatchObject({
      hasPendingUserInput: true,
      hasPendingApproval: false,
      needsAttention: true,
    });
  });

  it("marks desks active while a thread is still visibly in progress", () => {
    const projects = [makeProject("project-1", "project-a")];
    const startingThread = makeThread({
      id: "thread-starting",
      projectId: "project-1",
      title: "Starting thread",
      worktreePath: "group-a",
    });
    startingThread.session = {
      provider: "codex",
      status: "connecting",
      createdAt: "2026-03-10T00:00:00.000Z",
      updatedAt: "2026-03-10T00:00:01.000Z",
      orchestrationStatus: "starting",
      activeTurnId: undefined,
    };

    const activeTurnThread = makeThread({
      id: "thread-active-turn",
      projectId: "project-1",
      title: "Active turn thread",
      worktreePath: "group-a",
    });
    activeTurnThread.session = {
      provider: "codex",
      status: "running",
      createdAt: "2026-03-10T00:00:00.000Z",
      updatedAt: "2026-03-10T00:00:02.000Z",
      orchestrationStatus: "running",
      activeTurnId: TurnId.makeUnsafe("turn-active"),
    };

    const streamingThread = makeThread({
      id: "thread-streaming",
      projectId: "project-1",
      title: "Streaming thread",
      worktreePath: "group-a",
    });
    streamingThread.messages = [
      {
        id: MessageId.makeUnsafe("assistant-streaming"),
        role: "assistant",
        text: "Still working",
        createdAt: "2026-03-10T00:00:03.000Z",
        streaming: true,
      },
    ];

    const staleStoppedThread = makeThread({
      id: "thread-stale-stopped",
      projectId: "project-1",
      title: "Stale stopped thread",
      worktreePath: "group-a",
    });
    staleStoppedThread.session = {
      provider: "codex",
      status: "closed",
      createdAt: "2026-03-10T00:00:00.000Z",
      updatedAt: "2026-03-10T00:00:04.000Z",
      orchestrationStatus: "stopped",
      activeTurnId: TurnId.makeUnsafe("turn-stale"),
    };
    staleStoppedThread.latestTurn = {
      turnId: TurnId.makeUnsafe("turn-stale"),
      state: "running",
      requestedAt: "2026-03-10T00:00:00.000Z",
      startedAt: "2026-03-10T00:00:01.000Z",
      completedAt: null,
      assistantMessageId: null,
    };

    const inputs = deriveOfficeInputs(projects, [
      startingThread,
      activeTurnThread,
      streamingThread,
      staleStoppedThread,
    ]);

    expect(inputs.desks.find((desk) => desk.threadId === "thread-starting")?.isActive).toBe(true);
    expect(inputs.desks.find((desk) => desk.threadId === "thread-active-turn")?.isActive).toBe(
      true,
    );
    expect(inputs.desks.find((desk) => desk.threadId === "thread-streaming")?.isActive).toBe(
      true,
    );
    expect(inputs.desks.find((desk) => desk.threadId === "thread-stale-stopped")?.isActive).toBe(
      false,
    );
  });

  it("assigns stable accent colors by group key and honors persisted overrides", () => {
    const projects = [makeProject("project-1", "project-a"), makeProject("project-2", "project-b")];
    const threads = [
      makeThread({ id: "thread-1", projectId: "project-1", title: "Thread 1", worktreePath: "group-a" }),
      makeThread({ id: "thread-2", projectId: "project-2", title: "Thread 2", worktreePath: "group-b" }),
    ];

    const firstInputs = deriveOfficeInputs(projects, threads);
    const secondInputs = deriveOfficeInputs(
      [...projects, makeProject("project-3", "project-c")],
      [...threads, makeThread({ id: "thread-3", projectId: "project-3", title: "Thread 3", worktreePath: "group-c" })],
    );
    const overriddenInputs = deriveOfficeInputs(projects, threads, {
      "group-a": "#06b6d4",
    });
    const overriddenBuild = buildOfficeScene({
      groups: overriddenInputs.groups,
      desks: overriddenInputs.desks,
      persistedState: {
        ...createDefaultOfficePersistedState(),
        groupAccentColorsByKey: {
          "group-a": "#06b6d4",
        },
      },
    });

    const firstGroupA = firstInputs.desks.find((desk) => desk.groupKey === "group-a");
    const secondGroupA = secondInputs.desks.find((desk) => desk.groupKey === "group-a");
    const firstGroupB = firstInputs.desks.find((desk) => desk.groupKey === "group-b");
    const overriddenGroupA = overriddenInputs.desks.find((desk) => desk.groupKey === "group-a");

    expect(firstGroupA?.accentColor).toBe(secondGroupA?.accentColor);
    expect(firstGroupA?.accentColor).not.toBe(firstGroupB?.accentColor);
    expect(overriddenGroupA?.accentColor).toBe("#06b6d4");
    expect(overriddenBuild.scene.groups.find((group) => group.key === "group-a")?.accentColor).toBe("#06b6d4");
  });
});
