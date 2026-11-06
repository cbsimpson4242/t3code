import * as Schema from "effect/Schema";

import type { SidebarThreadStatus } from "../Sidebar.logic";

/** Browser-local, like the sidebar shelves: the tray density is a per-device preference. */
export const SIDEBAR_THREAD_VIEW_KEY = "t3code:sidebar:thread-view";

export const SidebarThreadView = Schema.Literals(["standard", "simple"]);
export type SidebarThreadView = typeof SidebarThreadView.Type;
export const DEFAULT_SIDEBAR_THREAD_VIEW: SidebarThreadView = "standard";

/**
 * The simple view lays thread rows out as a multi-column grid. Rows span one
 * cell; every other list child (section headers, drag boundaries, shelves,
 * drafts) keeps the full width, so the sections still read top to bottom.
 */
export const SIDEBAR_SIMPLE_GRID_CLASS_NAME =
  "grid content-start grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] [&>*:not([data-thread-item])]:col-span-full";

/** Only a thread whose agent is actually running animates; waiting and idle threads stay still. */
export function isSidebarThreadStatusAnimated(status: SidebarThreadStatus): boolean {
  return status === "working";
}
