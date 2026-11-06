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

/** Only a thread whose agent is actually running animates; waiting and idle threads stay still. */
export function isSidebarThreadStatusAnimated(status: SidebarThreadStatus): boolean {
  return status === "working";
}
