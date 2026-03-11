import { DEFAULT_MODEL_BY_PROVIDER, type ThreadId } from "@t3tools/contracts";

import type { DraftThreadState } from "~/composerDraftStore";
import type { Project, Thread } from "~/types";

export function draftThreadTitle(draftThread: Pick<DraftThreadState, "title">): string {
  return draftThread.title?.trim() || "New thread";
}

export function buildLocalDraftThread(
  threadId: ThreadId,
  draftThread: DraftThreadState,
  fallbackModel: string,
  error: string | null,
): Thread {
  return {
    id: threadId,
    codexThreadId: null,
    projectId: draftThread.projectId,
    title: draftThreadTitle(draftThread),
    model: fallbackModel,
    runtimeMode: draftThread.runtimeMode,
    interactionMode: draftThread.interactionMode,
    session: null,
    messages: [],
    error,
    createdAt: draftThread.createdAt,
    latestTurn: null,
    lastVisitedAt: draftThread.createdAt,
    branch: draftThread.branch,
    worktreePath: draftThread.worktreePath,
    turnDiffSummaries: [],
    activities: [],
    proposedPlans: [],
  };
}

export function mergeThreadsWithDrafts(input: {
  threads: Thread[];
  draftThreadsByThreadId: Record<ThreadId, DraftThreadState>;
  projects: Project[];
  errorsByThreadId?: Partial<Record<ThreadId, string | null>>;
}): Thread[] {
  const threadIds = new Set(input.threads.map((thread) => thread.id));
  const projectModelById = new Map(input.projects.map((project) => [project.id, project.model] as const));
  const draftThreads = Object.entries(input.draftThreadsByThreadId)
    .filter(([threadId]) => !threadIds.has(threadId as ThreadId))
    .map(([threadId, draftThread]) =>
      buildLocalDraftThread(
        threadId as ThreadId,
        draftThread,
        projectModelById.get(draftThread.projectId) ?? DEFAULT_MODEL_BY_PROVIDER.codex,
        input.errorsByThreadId?.[threadId as ThreadId] ?? null,
      ),
    );

  return [...input.threads, ...draftThreads];
}
