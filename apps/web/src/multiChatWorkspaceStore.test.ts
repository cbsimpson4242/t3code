import { describe, expect, it } from "vitest";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";

import { MAX_WORKSPACE_CHAT_PANES, openWorkspacePane } from "./multiChatWorkspaceStore";

const workspaceKey = "workspace-1";

const ref = (threadId: string) => ({
  environmentId: EnvironmentId.make("env-1"),
  threadId: ThreadId.make(threadId),
});

describe("multiChatWorkspaceStore", () => {
  it("moves an existing pane to the end instead of duplicating it", () => {
    const panes = openWorkspacePane(
      [ref("thread-1"), ref("thread-2")].map((threadRef) => ({ workspaceKey, threadRef })),
      workspaceKey,
      ref("thread-1"),
    );

    expect(panes.map((pane) => pane.threadRef.threadId)).toEqual(["thread-2", "thread-1"]);
  });

  it("keeps the workspace within the pane limit", () => {
    const panes = ["thread-1", "thread-2", "thread-3", "thread-4"].reduce(
      (current, threadId) => openWorkspacePane(current, workspaceKey, ref(threadId)),
      [] as ReturnType<typeof openWorkspacePane>,
    );

    expect(panes).toHaveLength(MAX_WORKSPACE_CHAT_PANES - 1);
    expect(panes.map((pane) => pane.threadRef.threadId)).toEqual([
      "thread-2",
      "thread-3",
      "thread-4",
    ]);
  });

  it("keeps pane limits isolated between project workspaces", () => {
    const panes = ["thread-1", "thread-2", "thread-3", "thread-4"].reduce(
      (current, threadId) => openWorkspacePane(current, workspaceKey, ref(threadId)),
      [
        {
          workspaceKey: "workspace-2",
          threadRef: ref("other-thread"),
        },
      ],
    );

    expect(panes.map((pane) => pane.workspaceKey)).toEqual([
      "workspace-2",
      "workspace-1",
      "workspace-1",
      "workspace-1",
    ]);
    expect(panes.map((pane) => pane.threadRef.threadId)).toEqual([
      "other-thread",
      "thread-2",
      "thread-3",
      "thread-4",
    ]);
  });
});
