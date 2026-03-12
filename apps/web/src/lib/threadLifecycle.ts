import { DEFAULT_RUNTIME_MODE, type ProjectId, type ThreadId } from "@t3tools/contracts";

import type { DraftThreadEnvMode, DraftThreadState } from "~/composerDraftStore";
import { readNativeApi } from "~/nativeApi";
import { type Project, type Thread } from "~/types";
import { formatWorktreePathForDisplay, getOrphanedWorktreePathForThread } from "~/worktreeCleanup";
import { toastManager } from "~/components/ui/toast";
import { newCommandId, newThreadId } from "~/lib/utils";
import { draftThreadTitle } from "~/lib/threadDrafts";

export interface CreateOrReuseProjectDraftThreadDependencies {
  getDraftThreadByProjectId: (projectId: ProjectId) => (DraftThreadState & { threadId: ThreadId }) | null;
  getDraftThread: (threadId: ThreadId) => DraftThreadState | null;
  setDraftThreadContext: (
    threadId: ThreadId,
    options: {
      branch?: string | null;
      worktreePath?: string | null;
      projectId?: ProjectId;
      createdAt?: string;
      envMode?: DraftThreadEnvMode;
      runtimeMode?: DraftThreadState["runtimeMode"];
      interactionMode?: DraftThreadState["interactionMode"];
      title?: string | null;
    },
  ) => void;
  setProjectDraftThreadId: (
    projectId: ProjectId,
    threadId: ThreadId,
    options?: {
      branch?: string | null;
      worktreePath?: string | null;
      createdAt?: string;
      envMode?: DraftThreadEnvMode;
      runtimeMode?: DraftThreadState["runtimeMode"];
      interactionMode?: DraftThreadState["interactionMode"];
      title?: string | null;
    },
  ) => void;
}

export async function createOrReuseProjectDraftThread(
  dependencies: CreateOrReuseProjectDraftThreadDependencies,
  input: {
    projectId: ProjectId;
    routeThreadId?: ThreadId | null;
    title?: string | null;
    branch?: string | null;
    worktreePath?: string | null;
    envMode?: DraftThreadEnvMode;
  },
): Promise<{ threadId: ThreadId; reused: boolean }> {
  const hasBranchOption = input.branch !== undefined;
  const hasWorktreePathOption = input.worktreePath !== undefined;
  const hasEnvModeOption = input.envMode !== undefined;
  const hasTitleOption = input.title !== undefined;
  const storedDraftThread = dependencies.getDraftThreadByProjectId(input.projectId);

  if (storedDraftThread) {
    if (hasBranchOption || hasWorktreePathOption || hasEnvModeOption || hasTitleOption) {
      dependencies.setDraftThreadContext(storedDraftThread.threadId, {
        ...(hasBranchOption ? { branch: input.branch ?? null } : {}),
        ...(hasWorktreePathOption ? { worktreePath: input.worktreePath ?? null } : {}),
        ...(hasEnvModeOption ? { envMode: input.envMode } : {}),
        ...(hasTitleOption ? { title: input.title ?? null } : {}),
      });
    }
    dependencies.setProjectDraftThreadId(input.projectId, storedDraftThread.threadId);
    return { threadId: storedDraftThread.threadId, reused: true };
  }

  if (input.routeThreadId) {
    const routeDraftThread = dependencies.getDraftThread(input.routeThreadId);
    if (routeDraftThread && routeDraftThread.projectId === input.projectId) {
      dependencies.setDraftThreadContext(input.routeThreadId, {
        ...(hasBranchOption ? { branch: input.branch ?? null } : {}),
        ...(hasWorktreePathOption ? { worktreePath: input.worktreePath ?? null } : {}),
        ...(hasEnvModeOption ? { envMode: input.envMode } : {}),
        ...(hasTitleOption ? { title: input.title ?? null } : {}),
      });
      dependencies.setProjectDraftThreadId(input.projectId, input.routeThreadId);
      return { threadId: input.routeThreadId, reused: true };
    }
  }

  const threadId = newThreadId();
  dependencies.setProjectDraftThreadId(input.projectId, threadId, {
    createdAt: new Date().toISOString(),
    branch: input.branch ?? null,
    worktreePath: input.worktreePath ?? null,
    envMode: input.envMode ?? "local",
    runtimeMode: DEFAULT_RUNTIME_MODE,
    title: input.title ?? null,
  });
  return { threadId, reused: false };
}

export interface DeleteThreadWithCleanupDependencies {
  threads: Thread[];
  projects: Project[];
  confirmThreadDelete: boolean;
  getDraftThread: (threadId: ThreadId) => DraftThreadState | null;
  clearComposerDraftForThread: (threadId: ThreadId) => void;
  clearProjectDraftThreadById: (projectId: ProjectId, threadId: ThreadId) => void;
  clearTerminalState: (threadId: ThreadId) => void;
  removeWorktree: (input: { cwd: string; path: string; force: boolean }) => Promise<void>;
  navigateAfterDelete?: (input: { deletedThreadId: ThreadId; fallbackThreadId: ThreadId | null }) => void;
}

export interface RenameThreadDependencies {
  threads: Thread[];
  getDraftThread: (threadId: ThreadId) => DraftThreadState | null;
  setDraftThreadContext: (
    threadId: ThreadId,
    options: {
      branch?: string | null;
      worktreePath?: string | null;
      projectId?: ProjectId;
      createdAt?: string;
      envMode?: DraftThreadEnvMode;
      runtimeMode?: DraftThreadState["runtimeMode"];
      interactionMode?: DraftThreadState["interactionMode"];
      title?: string | null;
    },
  ) => void;
}

export async function renameThread(
  dependencies: RenameThreadDependencies,
  input: {
    threadId: ThreadId;
    title: string;
  },
): Promise<{ renamed: boolean }> {
  const trimmed = input.title.trim();
  if (trimmed.length === 0) {
    toastManager.add({ type: "warning", title: "Thread title cannot be empty" });
    return { renamed: false };
  }

  const thread = dependencies.threads.find((entry) => entry.id === input.threadId);
  const draftThread = dependencies.getDraftThread(input.threadId);
  const currentTitle = thread ? thread.title : draftThread ? draftThreadTitle(draftThread) : null;

  if (currentTitle === null || trimmed === currentTitle) {
    return { renamed: false };
  }

  if (!thread) {
    dependencies.setDraftThreadContext(input.threadId, { title: trimmed });
    return { renamed: true };
  }

  const api = readNativeApi();
  if (!api) {
    return { renamed: false };
  }

  try {
    await api.orchestration.dispatchCommand({
      type: "thread.meta.update",
      commandId: newCommandId(),
      threadId: input.threadId,
      title: trimmed,
    });
    return { renamed: true };
  } catch (error) {
    toastManager.add({
      type: "error",
      title: "Failed to rename thread",
      description: error instanceof Error ? error.message : "An error occurred.",
    });
    return { renamed: false };
  }
}

export async function deleteThreadWithCleanup(
  dependencies: DeleteThreadWithCleanupDependencies,
  threadId: ThreadId,
): Promise<{ deletedDraftOnly: boolean }> {
  const thread = dependencies.threads.find((entry) => entry.id === threadId);
  if (!thread) {
    const draftThread = dependencies.getDraftThread(threadId);
    if (!draftThread) {
      return { deletedDraftOnly: false };
    }
    dependencies.clearComposerDraftForThread(threadId);
    dependencies.clearProjectDraftThreadById(draftThread.projectId, threadId);
    dependencies.clearTerminalState(threadId);
    return { deletedDraftOnly: true };
  }

  const api = readNativeApi();
  if (!api) {
    return { deletedDraftOnly: false };
  }

  if (dependencies.confirmThreadDelete) {
    const confirmed = await api.dialogs.confirm(
      [
        `Delete thread "${thread.title}"?`,
        "This permanently clears conversation history for this thread.",
      ].join("\n"),
    );
    if (!confirmed) {
      return { deletedDraftOnly: false };
    }
  }

  const threadProject = dependencies.projects.find((project) => project.id === thread.projectId);
  const orphanedWorktreePath = getOrphanedWorktreePathForThread(dependencies.threads, threadId);
  const displayWorktreePath = orphanedWorktreePath
    ? formatWorktreePathForDisplay(orphanedWorktreePath)
    : null;
  const canDeleteWorktree = orphanedWorktreePath !== null && threadProject !== undefined;
  const shouldDeleteWorktree =
    canDeleteWorktree &&
    (await api.dialogs.confirm(
      [
        "This thread is the only one linked to this worktree:",
        displayWorktreePath ?? orphanedWorktreePath,
        "",
        "Delete the worktree too?",
      ].join("\n"),
    ));

  if (thread.session && thread.session.status !== "closed") {
    await api.orchestration
      .dispatchCommand({
        type: "thread.session.stop",
        commandId: newCommandId(),
        threadId,
        createdAt: new Date().toISOString(),
      })
      .catch(() => undefined);
  }

  try {
    await api.terminal.close({
      threadId,
      deleteHistory: true,
    });
  } catch {
    // Terminal may already be closed.
  }

  await api.orchestration.dispatchCommand({
    type: "thread.delete",
    commandId: newCommandId(),
    threadId,
  });

  dependencies.clearComposerDraftForThread(threadId);
  dependencies.clearProjectDraftThreadById(thread.projectId, thread.id);
  dependencies.clearTerminalState(threadId);

  const fallbackThreadId = dependencies.threads.find((entry) => entry.id !== threadId)?.id ?? null;
  dependencies.navigateAfterDelete?.({ deletedThreadId: threadId, fallbackThreadId });

  if (!shouldDeleteWorktree || !orphanedWorktreePath || !threadProject) {
    return { deletedDraftOnly: false };
  }

  try {
    await dependencies.removeWorktree({
      cwd: threadProject.cwd,
      path: orphanedWorktreePath,
      force: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error removing worktree.";
    console.error("Failed to remove orphaned worktree after thread deletion", {
      threadId,
      projectCwd: threadProject.cwd,
      worktreePath: orphanedWorktreePath,
      error,
    });
    toastManager.add({
      type: "error",
      title: "Thread deleted, but worktree removal failed",
      description: `Could not remove ${displayWorktreePath ?? orphanedWorktreePath}. ${message}`,
    });
  }

  return { deletedDraftOnly: false };
}
