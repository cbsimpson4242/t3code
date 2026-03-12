import { ArrowUpRightIcon, Trash2Icon, XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ThreadId } from "@t3tools/contracts";

import ChatView from "~/components/ChatView";
import { Button } from "~/components/ui/button";
import { SidebarProvider } from "~/components/ui/sidebar";
import type { OfficePoint } from "~/office/officeTypes";
import type { Project, Thread } from "~/types";

const DEFAULT_WINDOW_WIDTH = 920;
const DEFAULT_WINDOW_HEIGHT = 620;
const MIN_WINDOW_WIDTH = 420;
const MIN_WINDOW_HEIGHT = 300;
const WINDOW_CASCADE_OFFSET = 28;

export interface OfficeThreadWindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface OfficeThreadWindowProps {
  threadId: ThreadId;
  rect: OfficeThreadWindowRect;
  zoom: number;
  zIndex: number;
  isFocused: boolean;
  accentColor: string;
  projects: Project[];
  threads: Thread[];
  onClose: () => void;
  onDelete: (threadId: ThreadId) => Promise<void> | void;
  onRename: (threadId: ThreadId, title: string) => Promise<void> | void;
  onFocus: () => void;
  onRectChange: (rect: OfficeThreadWindowRect) => void;
  onOpenInMainWindow?: ((threadId: ThreadId) => void) | undefined;
}

type ResizeDirection = "right" | "bottom" | "corner";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function rectsEqual(a: OfficeThreadWindowRect, b: OfficeThreadWindowRect) {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export function normalizeOfficeThreadWindowRect(rect: OfficeThreadWindowRect): OfficeThreadWindowRect {
  const minWidth = MIN_WINDOW_WIDTH;
  const minHeight = MIN_WINDOW_HEIGHT;
  const width = clamp(
    rect.width,
    minWidth,
    Number.POSITIVE_INFINITY,
  );
  const height = clamp(
    rect.height,
    minHeight,
    Number.POSITIVE_INFINITY,
  );

  return {
    width,
    height,
    x: rect.x,
    y: rect.y,
  };
}

export function buildDefaultOfficeThreadWindowRect(
  anchor: OfficePoint,
  stackIndex = 0,
): OfficeThreadWindowRect {
  const width = DEFAULT_WINDOW_WIDTH;
  const height = DEFAULT_WINDOW_HEIGHT;
  const cascadeStep = mod(stackIndex, 6) * WINDOW_CASCADE_OFFSET;

  return normalizeOfficeThreadWindowRect({
    width,
    height,
    x: anchor.x + 64 + cascadeStep,
    y: anchor.y - 72 + cascadeStep * 0.5,
  });
}

function mod(value: number, divisor: number) {
  if (divisor === 0) {
    return 0;
  }
  return ((value % divisor) + divisor) % divisor;
}

export default function OfficeThreadWindow({
  threadId,
  rect,
  zoom,
  zIndex,
  isFocused,
  accentColor,
  projects,
  threads,
  onClose,
  onDelete,
  onRename,
  onFocus,
  onRectChange,
  onOpenInMainWindow,
}: OfficeThreadWindowProps) {
  const dragStateRef = useRef<null | {
    pointerId: number;
    startX: number;
    startY: number;
    startRect: OfficeThreadWindowRect;
  }>(null);
  const resizeStateRef = useRef<null | {
    pointerId: number;
    startX: number;
    startY: number;
    startRect: OfficeThreadWindowRect;
    direction: ResizeDirection;
  }>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renamingTitle, setRenamingTitle] = useState("");
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const thread = useMemo(() => threads.find((entry) => entry.id === threadId) ?? null, [threadId, threads]);
  const project = useMemo(
    () => (thread ? projects.find((entry) => entry.id === thread.projectId) ?? null : null),
    [projects, thread],
  );

  useEffect(() => {
    const clampedRect = normalizeOfficeThreadWindowRect(rect);
    if (!rectsEqual(clampedRect, rect)) {
      onRectChange(clampedRect);
    }
  }, [onRectChange, rect]);

  useEffect(() => {
    if (!isRenaming) {
      setRenamingTitle(thread?.title ?? "");
      return;
    }
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [isRenaming, thread?.title]);

  const handleDragPointerMove = useCallback(
    (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }
      event.preventDefault();
      const zoomScale = Math.max(zoom, 0.0001);
      onRectChange(
        normalizeOfficeThreadWindowRect({
          ...dragState.startRect,
          x: dragState.startRect.x + (event.clientX - dragState.startX) / zoomScale,
          y: dragState.startRect.y + (event.clientY - dragState.startY) / zoomScale,
        }),
      );
    },
    [onRectChange, zoom],
  );

  const handleResizePointerMove = useCallback(
    (event: PointerEvent) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState || resizeState.pointerId !== event.pointerId) {
        return;
      }
      event.preventDefault();
      const zoomScale = Math.max(zoom, 0.0001);
      const deltaX = (event.clientX - resizeState.startX) / zoomScale;
      const deltaY = (event.clientY - resizeState.startY) / zoomScale;
      const nextRect = { ...resizeState.startRect };
      if (resizeState.direction === "right" || resizeState.direction === "corner") {
        nextRect.width = resizeState.startRect.width + deltaX;
      }
      if (resizeState.direction === "bottom" || resizeState.direction === "corner") {
        nextRect.height = resizeState.startRect.height + deltaY;
      }
      onRectChange(normalizeOfficeThreadWindowRect(nextRect));
    },
    [onRectChange, zoom],
  );

  useEffect(() => {
    const handlePointerUp = (event: PointerEvent) => {
      if (dragStateRef.current?.pointerId === event.pointerId) {
        dragStateRef.current = null;
      }
      if (resizeStateRef.current?.pointerId === event.pointerId) {
        resizeStateRef.current = null;
      }
      if (!dragStateRef.current && !resizeStateRef.current) {
        document.body.style.removeProperty("user-select");
      }
    };

    window.addEventListener("pointermove", handleDragPointerMove);
    window.addEventListener("pointermove", handleResizePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handleDragPointerMove);
      window.removeEventListener("pointermove", handleResizePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      document.body.style.removeProperty("user-select");
    };
  }, [handleDragPointerMove, handleResizePointerMove]);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(threadId);
    } finally {
      setIsDeleting(false);
    }
  };

  const cancelRename = useCallback(() => {
    setIsRenaming(false);
    setRenamingTitle(thread?.title ?? "");
  }, [thread?.title]);

  const commitRename = useCallback(async () => {
    await onRename(threadId, renamingTitle);
    setIsRenaming(false);
  }, [onRename, renamingTitle, threadId]);

  const shell = (
    <div
      className="pointer-events-auto relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[24px] border bg-background/96 shadow-2xl backdrop-blur-xl"
      style={{
        borderColor: isFocused ? `${accentColor}aa` : `${accentColor}66`,
        boxShadow: isFocused
          ? `0 20px 60px -28px ${accentColor}90, 0 0 0 1px ${accentColor}40`
          : `0 16px 42px -28px ${accentColor}78, 0 0 0 1px ${accentColor}20`,
        width: rect.width,
        height: rect.height,
      }}
      data-office-thread-window={threadId}
      data-office-thread-focused={isFocused}
      onPointerDownCapture={() => onFocus()}
    >
      <div
        className="flex cursor-move items-center gap-3 border-b px-4 py-3"
        style={{
          borderColor: `${accentColor}50`,
          background: `linear-gradient(180deg, ${accentColor}1f, rgba(15, 23, 42, 0.02))`,
        }}
        data-office-thread-drag-handle={threadId}
        onPointerDown={(event) => {
          if (
            event.button !== 0 ||
            (event.target instanceof HTMLElement &&
              event.target.closest("button, input, [data-office-thread-title-interactive='true']"))
          ) {
            return;
          }
          dragStateRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startRect: rect,
          };
          document.body.style.userSelect = "none";
        }}
      >
        <div
          className="h-8 w-1 shrink-0 rounded-full"
          style={{ backgroundColor: accentColor }}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          {isRenaming ? (
            <input
              ref={renameInputRef}
              data-office-thread-title-input={threadId}
              data-office-thread-title-interactive="true"
              className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={renamingTitle}
              onChange={(event) => setRenamingTitle(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") {
                  event.preventDefault();
                  void commitRename();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  cancelRename();
                }
              }}
              onBlur={() => {
                void commitRename();
              }}
              aria-label={`Rename title for ${thread?.title ?? "thread"}`}
            />
          ) : (
            <button
              type="button"
              data-office-thread-title-button={threadId}
              data-office-thread-title-interactive="true"
              className="block w-full truncate text-left text-sm font-semibold text-foreground outline-none transition-colors hover:text-primary focus-visible:text-primary"
              onClick={(event) => {
                event.stopPropagation();
                setRenamingTitle(thread?.title ?? "");
                setIsRenaming(true);
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              {thread?.title ?? "New thread"}
            </button>
          )}
          <div className="truncate text-xs text-muted-foreground">
            {project?.name ?? "Draft agent"}
          </div>
        </div>
        {onOpenInMainWindow ? (
          <Button size="sm" variant="outline" onClick={() => onOpenInMainWindow(threadId)}>
            <ArrowUpRightIcon className="size-4" />
            Open in main window
          </Button>
        ) : null}
        <Button size="sm" variant="outline" onClick={() => void handleDelete()} disabled={isDeleting}>
          <Trash2Icon className="size-4 text-destructive" />
          {isDeleting ? "Deleting..." : "Delete Agent"}
        </Button>
        <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label="Close office thread window">
          <XIcon className="size-4" />
        </Button>
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <SidebarProvider defaultOpen={false} className="h-full min-h-0">
          <ChatView threadId={threadId} />
        </SidebarProvider>
      </div>
      <div
        className="absolute inset-y-0 right-0 w-2 cursor-ew-resize"
        data-office-thread-resize="right"
        onPointerDown={(event) => {
          if (event.button !== 0) {
            return;
          }
          resizeStateRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startRect: rect,
            direction: "right",
          };
          document.body.style.userSelect = "none";
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
        data-office-thread-resize="bottom"
        onPointerDown={(event) => {
          if (event.button !== 0) {
            return;
          }
          resizeStateRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startRect: rect,
            direction: "bottom",
          };
          document.body.style.userSelect = "none";
        }}
      />
      <div
        className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
        data-office-thread-resize="corner"
        onPointerDown={(event) => {
          if (event.button !== 0) {
            return;
          }
          resizeStateRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startRect: rect,
            direction: "corner",
          };
          document.body.style.userSelect = "none";
        }}
      />
    </div>
  );

  return (
    <div
      className="absolute"
      style={{
        left: rect.x,
        top: rect.y,
        zIndex,
      }}
    >
      {shell}
    </div>
  );
}
