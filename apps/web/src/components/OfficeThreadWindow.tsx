import { ArrowUpRightIcon, Trash2Icon, XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ThreadId } from "@t3tools/contracts";

import ChatView from "~/components/ChatView";
import { Button } from "~/components/ui/button";
import { SidebarProvider } from "~/components/ui/sidebar";
import type { Project, Thread } from "~/types";

const WINDOW_MARGIN = 16;
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

export interface OfficeThreadWindowViewport {
  width: number;
  height: number;
}

interface OfficeThreadWindowProps {
  threadId: ThreadId;
  rect: OfficeThreadWindowRect;
  viewport: OfficeThreadWindowViewport;
  zIndex: number;
  isFocused: boolean;
  accentColor: string;
  projects: Project[];
  threads: Thread[];
  onClose: () => void;
  onDelete: (threadId: ThreadId) => Promise<void> | void;
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

export function clampOfficeThreadWindowRect(
  rect: OfficeThreadWindowRect,
  viewport: OfficeThreadWindowViewport,
): OfficeThreadWindowRect {
  const maxWidth = Math.max(280, viewport.width - WINDOW_MARGIN * 2);
  const maxHeight = Math.max(220, viewport.height - WINDOW_MARGIN * 2);
  const minWidth = Math.min(MIN_WINDOW_WIDTH, maxWidth);
  const minHeight = Math.min(MIN_WINDOW_HEIGHT, maxHeight);
  const width = clamp(
    rect.width,
    minWidth,
    maxWidth,
  );
  const height = clamp(
    rect.height,
    minHeight,
    maxHeight,
  );

  return {
    width,
    height,
    x: clamp(rect.x, WINDOW_MARGIN, Math.max(WINDOW_MARGIN, viewport.width - width - WINDOW_MARGIN)),
    y: clamp(rect.y, WINDOW_MARGIN, Math.max(WINDOW_MARGIN, viewport.height - height - WINDOW_MARGIN)),
  };
}

export function buildDefaultOfficeThreadWindowRect(
  viewport: OfficeThreadWindowViewport,
  stackIndex = 0,
): OfficeThreadWindowRect {
  const width = Math.min(DEFAULT_WINDOW_WIDTH, Math.max(280, viewport.width - WINDOW_MARGIN * 2));
  const height = Math.min(DEFAULT_WINDOW_HEIGHT, Math.max(220, viewport.height - WINDOW_MARGIN * 2));
  const cascadeStep = mod(stackIndex, 6) * WINDOW_CASCADE_OFFSET;

  return clampOfficeThreadWindowRect(
    {
      width,
      height,
      x: Math.max(WINDOW_MARGIN, Math.round((viewport.width - width) / 2) + cascadeStep),
      y: Math.max(WINDOW_MARGIN, Math.round((viewport.height - height) / 2) + cascadeStep),
    },
    viewport,
  );
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
  viewport,
  zIndex,
  isFocused,
  accentColor,
  projects,
  threads,
  onClose,
  onDelete,
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
  const thread = useMemo(() => threads.find((entry) => entry.id === threadId) ?? null, [threadId, threads]);
  const project = useMemo(
    () => (thread ? projects.find((entry) => entry.id === thread.projectId) ?? null : null),
    [projects, thread],
  );

  useEffect(() => {
    const clampedRect = clampOfficeThreadWindowRect(rect, viewport);
    if (!rectsEqual(clampedRect, rect)) {
      onRectChange(clampedRect);
    }
  }, [onRectChange, rect, viewport]);

  const handleDragPointerMove = useCallback(
    (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }
      event.preventDefault();
      onRectChange(
        clampOfficeThreadWindowRect(
          {
            ...dragState.startRect,
            x: dragState.startRect.x + (event.clientX - dragState.startX),
            y: dragState.startRect.y + (event.clientY - dragState.startY),
          },
          viewport,
        ),
      );
    },
    [onRectChange, viewport],
  );

  const handleResizePointerMove = useCallback(
    (event: PointerEvent) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState || resizeState.pointerId !== event.pointerId) {
        return;
      }
      event.preventDefault();
      const deltaX = event.clientX - resizeState.startX;
      const deltaY = event.clientY - resizeState.startY;
      const nextRect = { ...resizeState.startRect };
      if (resizeState.direction === "right" || resizeState.direction === "corner") {
        nextRect.width = resizeState.startRect.width + deltaX;
      }
      if (resizeState.direction === "bottom" || resizeState.direction === "corner") {
        nextRect.height = resizeState.startRect.height + deltaY;
      }
      onRectChange(clampOfficeThreadWindowRect(nextRect, viewport));
    },
    [onRectChange, viewport],
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
          if (event.button !== 0 || (event.target instanceof HTMLElement && event.target.closest("button"))) {
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
          <div className="truncate text-sm font-semibold text-foreground">
            {thread?.title ?? "New thread"}
          </div>
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
