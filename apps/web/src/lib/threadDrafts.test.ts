import { ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import type { DraftThreadState } from "~/composerDraftStore";
import { DEFAULT_INTERACTION_MODE, DEFAULT_RUNTIME_MODE, type Project, type Thread } from "~/types";
import { buildLocalDraftThread, draftThreadTitle, mergeThreadsWithDrafts } from "~/lib/threadDrafts";

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

function makeServerThread(id: string, projectId: string, title: string): Thread {
  return {
    id: ThreadId.makeUnsafe(id),
    codexThreadId: null,
    projectId: ProjectId.makeUnsafe(projectId),
    title,
    model: "gpt-5-codex",
    runtimeMode: DEFAULT_RUNTIME_MODE,
    interactionMode: DEFAULT_INTERACTION_MODE,
    session: null,
    messages: [],
    proposedPlans: [],
    error: null,
    createdAt: "2026-03-10T00:00:00.000Z",
    latestTurn: null,
    lastVisitedAt: "2026-03-10T00:00:00.000Z",
    branch: null,
    worktreePath: null,
    turnDiffSummaries: [],
    activities: [],
  };
}

function makeDraft(projectId: string, title: string | null): DraftThreadState {
  return {
    projectId: ProjectId.makeUnsafe(projectId),
    createdAt: "2026-03-10T00:00:00.000Z",
    runtimeMode: DEFAULT_RUNTIME_MODE,
    interactionMode: DEFAULT_INTERACTION_MODE,
    title,
    branch: null,
    worktreePath: null,
    envMode: "local",
  };
}

describe("threadDrafts", () => {
  it("defaults empty draft titles to New thread", () => {
    expect(draftThreadTitle(makeDraft("project-1", null))).toBe("New thread");
    expect(draftThreadTitle(makeDraft("project-1", "  "))).toBe("New thread");
  });

  it("builds a local draft thread from draft state", () => {
    const thread = buildLocalDraftThread(
      ThreadId.makeUnsafe("draft-thread"),
      makeDraft("project-1", "Office agent"),
      "gpt-5-codex",
      null,
    );

    expect(thread.title).toBe("Office agent");
    expect(thread.projectId).toBe(ProjectId.makeUnsafe("project-1"));
    expect(thread.messages).toEqual([]);
  });

  it("merges draft threads into the office thread list without duplicating server threads", () => {
    const threads = mergeThreadsWithDrafts({
      projects: [makeProject("project-1", "alpha")],
      threads: [makeServerThread("thread-1", "project-1", "Server thread")],
      draftThreadsByThreadId: {
        [ThreadId.makeUnsafe("thread-1")]: makeDraft("project-1", "Ignored duplicate"),
        [ThreadId.makeUnsafe("draft-2")]: makeDraft("project-1", "Draft thread"),
      },
    });

    expect(threads).toHaveLength(2);
    expect(threads.find((thread) => thread.id === ThreadId.makeUnsafe("thread-1"))?.title).toBe(
      "Server thread",
    );
    expect(threads.find((thread) => thread.id === ThreadId.makeUnsafe("draft-2"))?.title).toBe(
      "Draft thread",
    );
  });
});
