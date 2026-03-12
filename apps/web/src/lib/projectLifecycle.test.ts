import { ProjectId, ThreadId } from "@t3tools/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  deriveProjectTitleFromPath,
  ensureProjectExists,
  findMostRecentThreadIdForProject,
} from "~/lib/projectLifecycle";
import { DEFAULT_INTERACTION_MODE, DEFAULT_RUNTIME_MODE, type Project, type Thread } from "~/types";

const { readNativeApiMock } = vi.hoisted(() => ({
  readNativeApiMock: vi.fn(),
}));

vi.mock("~/nativeApi", () => ({
  readNativeApi: readNativeApiMock,
}));

function makeProject(id: string, name: string, cwd: string): Project {
  return {
    id: ProjectId.makeUnsafe(id),
    name,
    cwd,
    model: "gpt-5-codex",
    expanded: true,
    scripts: [],
  };
}

function makeThread(id: string, projectId: string, createdAt: string): Thread {
  return {
    id: ThreadId.makeUnsafe(id),
    codexThreadId: null,
    projectId: ProjectId.makeUnsafe(projectId),
    title: id,
    model: "gpt-5-codex",
    runtimeMode: DEFAULT_RUNTIME_MODE,
    interactionMode: DEFAULT_INTERACTION_MODE,
    session: null,
    messages: [],
    proposedPlans: [],
    error: null,
    createdAt,
    latestTurn: null,
    branch: null,
    worktreePath: null,
    turnDiffSummaries: [],
    activities: [],
  };
}

afterEach(() => {
  readNativeApiMock.mockReset();
});

describe("projectLifecycle", () => {
  it("derives a project title from the path leaf", () => {
    expect(deriveProjectTitleFromPath("/repo/alpha")).toBe("alpha");
    expect(deriveProjectTitleFromPath("C:\\repo\\beta")).toBe("beta");
  });

  it("returns an existing project when the cwd is already open", async () => {
    const result = await ensureProjectExists(
      [makeProject("project-1", "alpha", "/repo/alpha")],
      "/repo/alpha",
    );

    expect(result).toEqual({
      projectId: ProjectId.makeUnsafe("project-1"),
      status: "existing",
    });
    expect(readNativeApiMock).not.toHaveBeenCalled();
  });

  it("creates a new project when the cwd is not open yet", async () => {
    const dispatchCommand = vi.fn().mockResolvedValue(undefined);
    readNativeApiMock.mockReturnValue({
      orchestration: { dispatchCommand },
    });

    const result = await ensureProjectExists([], "/repo/gamma");

    expect(result.status).toBe("created");
    expect(dispatchCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "project.create",
        workspaceRoot: "/repo/gamma",
        title: "gamma",
      }),
    );
  });

  it("finds the most recent thread for a project", () => {
    const threadId = findMostRecentThreadIdForProject(
      [
        makeThread("thread-old", "project-1", "2026-03-10T00:00:00.000Z"),
        makeThread("thread-new", "project-1", "2026-03-11T00:00:00.000Z"),
        makeThread("thread-other", "project-2", "2026-03-12T00:00:00.000Z"),
      ],
      ProjectId.makeUnsafe("project-1"),
    );

    expect(threadId).toBe(ThreadId.makeUnsafe("thread-new"));
  });
});
