import { describe, expect, it } from "vitest";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";

import { MAX_WORKSPACE_CHAT_PANES, openWorkspacePane } from "./multiChatWorkspaceStore";

const ref = (threadId: string) => ({
  environmentId: EnvironmentId.make("env-1"),
  threadId: ThreadId.make(threadId),
});

describe("multiChatWorkspaceStore", () => {
  it("moves an existing pane to the end instead of duplicating it", () => {
    const panes = openWorkspacePane(
      [ref("thread-1"), ref("thread-2")].map((threadRef) => ({ threadRef })),
      ref("thread-1"),
    );

    expect(panes.map((pane) => pane.threadRef.threadId)).toEqual(["thread-2", "thread-1"]);
  });

  it("keeps the workspace within the pane limit", () => {
    const panes = ["thread-1", "thread-2", "thread-3", "thread-4"].reduce(
      (current, threadId) => openWorkspacePane(current, ref(threadId)),
      [] as ReturnType<typeof openWorkspacePane>,
    );

    expect(panes).toHaveLength(MAX_WORKSPACE_CHAT_PANES - 1);
    expect(panes.map((pane) => pane.threadRef.threadId)).toEqual([
      "thread-2",
      "thread-3",
      "thread-4",
    ]);
  });
});
