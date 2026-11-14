import { useDroppable } from "@dnd-kit/core";
import { type KeyboardEvent, useRef } from "react";
import { cn } from "~/lib/utils";
import { SIDEBAR_PIN_TAB_DROP_ID, type SidebarPinTab } from "../Sidebar.logic";

const TABS: ReadonlyArray<{ readonly tab: SidebarPinTab; readonly label: string }> = [
  { tab: "pinned", label: "Pinned" },
  { tab: "threads", label: "Threads" },
];

export const sidebarPinTabId = (idPrefix: string, tab: SidebarPinTab) => `${idPrefix}-${tab}`;
export const sidebarPinTabPanelId = (idPrefix: string) => `${idPrefix}-panel`;

/**
 * Switches the thread list between the pinned threads and everything else. While a thread is
 * dragged on the Threads tab, the Pinned tab is where it can be dropped to pin it.
 */
export function SidebarPinTabs(props: {
  idPrefix: string;
  tab: SidebarPinTab;
  pinnedCount: number;
  threadsCount: number;
  /** A thread is being dragged that the Pinned tab can take. */
  dragging: boolean;
  /** The dragged thread is over the Pinned tab. */
  dropTargeted: boolean;
  onSelect: (tab: SidebarPinTab) => void;
}) {
  const { setNodeRef: setPinnedDropRef } = useDroppable({
    id: SIDEBAR_PIN_TAB_DROP_ID,
    // Pins are dropped from the Threads tab; the Pinned tab already lists them.
    disabled: props.tab !== "threads",
  });
  const tabRefs = useRef(new Map<SidebarPinTab, HTMLButtonElement>());
  const moveTo = (event: KeyboardEvent, tab: SidebarPinTab) => {
    event.preventDefault();
    props.onSelect(tab);
    tabRefs.current.get(tab)?.focus();
  };
  const handleKeyDown = (event: KeyboardEvent) => {
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowRight":
        return moveTo(event, props.tab === "pinned" ? "threads" : "pinned");
      case "Home":
        return moveTo(event, "pinned");
      case "End":
        return moveTo(event, "threads");
    }
  };
  return (
    <div
      role="tablist"
      aria-label="Thread list"
      data-testid="sidebar-pin-tabs"
      className="sticky top-0 z-[3] flex gap-0.5 bg-sidebar pb-1.5"
      onKeyDown={handleKeyDown}
    >
      {TABS.map(({ tab, label }) => {
        const count = tab === "pinned" ? props.pinnedCount : props.threadsCount;
        const selected = props.tab === tab;
        const isDropZone = tab === "pinned" && props.dragging;
        return (
          <button
            key={tab}
            ref={(node) => {
              if (node === null) tabRefs.current.delete(tab);
              else tabRefs.current.set(tab, node);
              if (tab === "pinned") setPinnedDropRef(node);
            }}
            type="button"
            role="tab"
            id={sidebarPinTabId(props.idPrefix, tab)}
            aria-selected={selected}
            aria-controls={sidebarPinTabPanelId(props.idPrefix)}
            aria-label={`${label}, ${count} ${count === 1 ? "thread" : "threads"}`}
            tabIndex={selected ? 0 : -1}
            data-testid={`sidebar-pin-tab-${tab}`}
            data-drop-target={isDropZone && props.dropTargeted ? "" : undefined}
            onClick={() => props.onSelect(tab)}
            className={cn(
              "flex h-7 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-transparent px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
              selected
                ? "bg-sidebar-row-active text-sidebar-foreground light:ring-1 light:ring-inset light:ring-sidebar-border/70"
                : "text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground",
              isDropZone && "border-dashed border-sidebar-foreground/25",
              isDropZone && props.dropTargeted && "border-primary/40 bg-primary/5 text-primary",
            )}
          >
            <span className="truncate">{label}</span>
            <span aria-hidden className="font-normal tabular-nums opacity-70">
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
