import { ProjectId, ThreadId } from "@t3tools/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DraftThreadState } from "~/composerDraftStore";
import {
  createOrReuseProjectDraftThread,
  deleteThreadWithCleanup,
  renameThread,
} from "~/lib/threadLifecycle";
import { DEFAULT_INTERACTION_MODE, DEFAULT_RUNTIME_MODE, type Project, type Thread } from "~/types";

const { readNativeApiMock } = vi.hoisted(() => ({
  readNativeApiMock: vi.fn(),
}));
const { toastAddMock } = vi.hoisted(() => ({
  toastAddMock: vi.fn(),
}));

vi.mock("~/nativeApi", () => ({
  readNativeApi: readNativeApiMock,
}));

vi.mock("~/components/ui/toast", () => ({
  toastManager: {
    add: toastAddMock,
  },
}));

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

function makeThread(id: string, projectId: string, worktreePath: string | null): Thread {
  return {
    id: ThreadId.makeUnsafe(id),
    codexThreadId: null,
    projectId: ProjectId.makeUnsafe(projectId),
    title: "Server thread",
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
    worktreePath,
    turnDiffSummaries: [],
    activities: [],
  };
}

afterEach(() => {
  readNativeApiMock.mockReset();
  toastAddMock.mockReset();
});

describe("threadLifecycle", () => {
  it("creates the first draft for a project", async () => {
    const setProjectDraftThreadId = vi.fn();
    const result = await createOrReuseProjectDraftThread(
      {
        getDraftThreadByProjectId: () => null,
        getDraftThread: () => null,
        setDraftThreadContext: vi.fn(),
        setProjectDraftThreadId,
      },
      {
        projectId: ProjectId.makeUnsafe("project-1"),
        title: "Office agent",
      },
    );

    expect(result.reused).toBe(false);
    expect(setProjectDraftThreadId).toHaveBeenCalledOnce();
    expect(setProjectDraftThreadId.mock.calls[0]?.[2]).toMatchObject({
      title: "Office agent",
      envMode: "local",
      runtimeMode: DEFAULT_RUNTIME_MODE,
    });
  });

  it("reuses an existing draft thread and updates its title", async () => {
    const existingDraft = {
      threadId: ThreadId.makeUnsafe("draft-1"),
      ...makeDraft("project-1", "Old title"),
    };
    const setDraftThreadContext = vi.fn();
    const setProjectDraftThreadId = vi.fn();

    const result = await createOrReuseProjectDraftThread(
      {
        getDraftThreadByProjectId: () => existingDraft,
        getDraftThread: () => existingDraft,
        setDraftThreadContext,
        setProjectDraftThreadId,
      },
      {
        projectId: ProjectId.makeUnsafe("project-1"),
        title: "Updated title",
      },
    );

    expect(result).toEqual({ threadId: ThreadId.makeUnsafe("draft-1"), reused: true });
    expect(setDraftThreadContext).toHaveBeenCalledWith(ThreadId.makeUnsafe("draft-1"), {
      title: "Updated title",
    });
    expect(setProjectDraftThreadId).toHaveBeenCalledWith(
      ProjectId.makeUnsafe("project-1"),
      ThreadId.makeUnsafe("draft-1"),
    );
  });

  it("creates a fresh draft when reuseExisting is false", async () => {
    const existingDraft = {
      threadId: ThreadId.makeUnsafe("draft-1"),
      ...makeDraft("project-1", "Old title"),
    };
    const setDraftThreadContext = vi.fn();
    const setProjectDraftThreadId = vi.fn();

    const result = await createOrReuseProjectDraftThread(
      {
        getDraftThreadByProjectId: () => existingDraft,
        getDraftThread: () => existingDraft,
        setDraftThreadContext,
        setProjectDraftThreadId,
      },
      {
        projectId: ProjectId.makeUnsafe("project-1"),
        title: "Fresh draft",
        reuseExisting: false,
      },
    );

    expect(result.reused).toBe(false);
    expect(result.threadId).not.toBe(ThreadId.makeUnsafe("draft-1"));
    expect(setDraftThreadContext).not.toHaveBeenCalled();
    expect(setProjectDraftThreadId).toHaveBeenCalledOnce();
    expect(setProjectDraftThreadId.mock.calls[0]?.[2]).toMatchObject({
      title: "Fresh draft",
    });
  });

  it("deletes a draft-only thread without touching the native api", async () => {
    const clearComposerDraftForThread = vi.fn();
    const clearProjectDraftThreadById = vi.fn();
    const clearTerminalState = vi.fn();

    const result = await deleteThreadWithCleanup(
      {
        threads: [],
        projects: [makeProject("project-1", "alpha")],
        confirmThreadDelete: true,
        getDraftThread: () => makeDraft("project-1", "Draft agent"),
        clearComposerDraftForThread,
        clearProjectDraftThreadById,
        clearTerminalState,
        removeWorktree: vi.fn(),
      },
      ThreadId.makeUnsafe("draft-only"),
    );

    expect(result.deletedDraftOnly).toBe(true);
    expect(readNativeApiMock).not.toHaveBeenCalled();
    expect(clearComposerDraftForThread).toHaveBeenCalledWith(ThreadId.makeUnsafe("draft-only"));
    expect(clearProjectDraftThreadById).toHaveBeenCalledWith(
      ProjectId.makeUnsafe("project-1"),
      ThreadId.makeUnsafe("draft-only"),
    );
    expect(clearTerminalState).toHaveBeenCalledWith(ThreadId.makeUnsafe("draft-only"));
  });

  it("renames a draft-only thread locally", async () => {
    const setDraftThreadContext = vi.fn();

    const result = await renameThread(
      {
        threads: [],
        getDraftThread: () => makeDraft("project-1", "Draft agent"),
        setDraftThreadContext,
      },
      {
        threadId: ThreadId.makeUnsafe("draft-1"),
        title: "  Renamed draft  ",
      },
    );

    expect(result).toEqual({ renamed: true });
    expect(setDraftThreadContext).toHaveBeenCalledWith(ThreadId.makeUnsafe("draft-1"), {
      title: "Renamed draft",
    });
  });

  it("renames a persisted thread through orchestration", async () => {
    const dispatchCommand = vi.fn().mockResolvedValue(undefined);
    readNativeApiMock.mockReturnValue({
      orchestration: { dispatchCommand },
    });

    const result = await renameThread(
      {
        threads: [makeThread("thread-1", "project-1", null)],
        getDraftThread: () => null,
        setDraftThreadContext: vi.fn(),
      },
      {
        threadId: ThreadId.makeUnsafe("thread-1"),
        title: "Updated server title",
      },
    );

    expect(result).toEqual({ renamed: true });
    expect(dispatchCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "thread.meta.update",
        threadId: ThreadId.makeUnsafe("thread-1"),
        title: "Updated server title",
      }),
    );
  });

  it("rejects empty titles when renaming", async () => {
    const result = await renameThread(
      {
        threads: [makeThread("thread-1", "project-1", null)],
        getDraftThread: () => null,
        setDraftThreadContext: vi.fn(),
      },
      {
        threadId: ThreadId.makeUnsafe("thread-1"),
        title: "   ",
      },
    );

    expect(result).toEqual({ renamed: false });
    expect(toastAddMock).toHaveBeenCalledWith({
      type: "warning",
      title: "Thread title cannot be empty",
    });
  });

  it("does nothing when the title is unchanged", async () => {
    const dispatchCommand = vi.fn().mockResolvedValue(undefined);
    readNativeApiMock.mockReturnValue({
      orchestration: { dispatchCommand },
    });

    const result = await renameThread(
      {
        threads: [makeThread("thread-1", "project-1", null)],
        getDraftThread: () => null,
        setDraftThreadContext: vi.fn(),
      },
      {
        threadId: ThreadId.makeUnsafe("thread-1"),
        title: "Server thread",
      },
    );

    expect(result).toEqual({ renamed: false });
    expect(dispatchCommand).not.toHaveBeenCalled();
  });

  it("deletes a persisted thread and removes an orphaned worktree when confirmed", async () => {
    const confirm = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(true);
    const dispatchCommand = vi.fn().mockResolvedValue(undefined);
    const terminalClose = vi.fn().mockResolvedValue(undefined);
    const removeWorktree = vi.fn().mockResolvedValue(undefined);

    readNativeApiMock.mockReturnValue({
      dialogs: { confirm },
      orchestration: { dispatchCommand },
      terminal: { close: terminalClose },
    });

    await deleteThreadWithCleanup(
      {
        threads: [makeThread("thread-1", "project-1", "/repo/worktrees/agent")],
        projects: [makeProject("project-1", "alpha")],
        confirmThreadDelete: true,
        getDraftThread: () => null,
        clearComposerDraftForThread: vi.fn(),
        clearProjectDraftThreadById: vi.fn(),
        clearTerminalState: vi.fn(),
        removeWorktree,
      },
      ThreadId.makeUnsafe("thread-1"),
    );

    expect(confirm).toHaveBeenCalledTimes(2);
    expect(terminalClose).toHaveBeenCalledWith({
      threadId: ThreadId.makeUnsafe("thread-1"),
      deleteHistory: true,
    });
    expect(dispatchCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "thread.delete",
        threadId: ThreadId.makeUnsafe("thread-1"),
      }),
    );
    expect(removeWorktree).toHaveBeenCalledWith({
      cwd: "/repo/alpha",
      path: "/repo/worktrees/agent",
      force: true,
    });
  });
});
