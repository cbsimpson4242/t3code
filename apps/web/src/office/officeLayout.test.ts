import { EventId, ProjectId, ThreadId, type OrchestrationThreadActivity } from "@t3tools/contracts";
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

  it("assigns stable accent colors by group key", () => {
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

    const firstGroupA = firstInputs.desks.find((desk) => desk.groupKey === "group-a");
    const secondGroupA = secondInputs.desks.find((desk) => desk.groupKey === "group-a");
    const firstGroupB = firstInputs.desks.find((desk) => desk.groupKey === "group-b");

    expect(firstGroupA?.accentColor).toBe(secondGroupA?.accentColor);
    expect(firstGroupA?.accentColor).not.toBe(firstGroupB?.accentColor);
  });
});
