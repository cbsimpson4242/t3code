import * as Schema from "effect/Schema";

import type { SidebarThreadStatus } from "../Sidebar.logic";

/** Browser-local, like the sidebar shelves: the tray density is a per-device preference. */
export const SIDEBAR_THREAD_VIEW_KEY = "t3code:sidebar:thread-view";

export const SidebarThreadView = Schema.Literals(["standard", "simple"]);
export type SidebarThreadView = typeof SidebarThreadView.Type;
export const DEFAULT_SIDEBAR_THREAD_VIEW: SidebarThreadView = "standard";

/**
 * Simple view: square tiles whose columns auto-fit the sidebar width. Only thread
 * rows take a cell; every other list child spans the full width.
 */
export const SIDEBAR_SIMPLE_GRID_CLASS_NAME =
  "grid content-start gap-1 grid-cols-[repeat(auto-fill,minmax(4.75rem,1fr))] [&>*:not([data-thread-item])]:col-span-full";

/**
 * A thread whose agent is running animates. A parent parked on delegated agents, or whose
 * subagents outlive its turn, is still busy; waiting for the user alone and attention
 * states (approval, input, failure) stay still.
 */
export function isSidebarThreadStatusAnimated(
  status: SidebarThreadStatus,
  delegatedWorkRunning = false,
): boolean {
  return (
    status === "working" || (delegatedWorkRunning && (status === "waiting" || status === "ready"))
  );
}
