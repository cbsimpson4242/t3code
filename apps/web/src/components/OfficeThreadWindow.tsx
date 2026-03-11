import { ArrowUpRightIcon, Trash2Icon, XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ThreadId } from "@t3tools/contracts";

import { useMediaQuery } from "~/hooks/useMediaQuery";
import type { Project, Thread } from "~/types";
import ChatView from "~/components/ChatView";
import { Button } from "~/components/ui/button";
import { SidebarProvider } from "~/components/ui/sidebar";

const MOBILE_MEDIA_QUERY = "(max-width: 920px)";
const WINDOW_MARGIN = 16;
const DEFAULT_WINDOW_WIDTH = 1100;
const DEFAULT_WINDOW_HEIGHT = 820;
const MIN_WINDOW_WIDTH = 720;
const MIN_WINDOW_HEIGHT = 420;

interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface OfficeThreadWindowProps {
  openThreadId: ThreadId | null;
  projects: Project[];
  threads: Thread[];
  onClose: () => void;
  onDelete: (threadId: ThreadId) => Promise<void> | void;
  onOpenInMainWindow?: ((threadId: ThreadId) => void) | undefined;
}

type ResizeDirection = "right" | "bottom" | "corner";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function buildDefaultRect(width: number, height: number): WindowRect {
  const nextWidth = Math.min(DEFAULT_WINDOW_WIDTH, Math.max(MIN_WINDOW_WIDTH, width - WINDOW_MARGIN * 2));
  const nextHeight = Math.min(
    DEFAULT_WINDOW_HEIGHT,
    Math.max(MIN_WINDOW_HEIGHT, height - WINDOW_MARGIN * 2),
  );
  return {
    width: nextWidth,
    height: nextHeight,
    x: Math.max(WINDOW_MARGIN, Math.round((width - nextWidth) / 2)),
    y: Math.max(WINDOW_MARGIN, Math.round((height - nextHeight) / 2)),
  };
}

function clampRect(rect: WindowRect, viewport: { width: number; height: number }): WindowRect {
  const width = clamp(rect.width, MIN_WINDOW_WIDTH, Math.max(MIN_WINDOW_WIDTH, viewport.width - WINDOW_MARGIN * 2));
  const height = clamp(
    rect.height,
    MIN_WINDOW_HEIGHT,
    Math.max(MIN_WINDOW_HEIGHT, viewport.height - WINDOW_MARGIN * 2),
  );
  return {
    width,
    height,
    x: clamp(rect.x, WINDOW_MARGIN, Math.max(WINDOW_MARGIN, viewport.width - width - WINDOW_MARGIN)),
    y: clamp(rect.y, WINDOW_MARGIN, Math.max(WINDOW_MARGIN, viewport.height - height - WINDOW_MARGIN)),
  };
}

export default function OfficeThreadWindow({
  openThreadId,
  projects,
  threads,
  onClose,
  onDelete,
  onOpenInMainWindow,
}: OfficeThreadWindowProps) {
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY);
  const dragStateRef = useRef<null | {
    pointerId: number;
    startX: number;
    startY: number;
    startRect: WindowRect;
  }>(null);
  const resizeStateRef = useRef<null | {
    pointerId: number;
    startX: number;
    startY: number;
    startRect: WindowRect;
    direction: ResizeDirection;
  }>(null);
  const [rect, setRect] = useState<WindowRect>(() =>
    buildDefaultRect(
      typeof window === "undefined" ? DEFAULT_WINDOW_WIDTH : window.innerWidth,
      typeof window === "undefined" ? DEFAULT_WINDOW_HEIGHT : window.innerHeight,
    ),
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const thread = useMemo(
    () => threads.find((entry) => entry.id === openThreadId) ?? null,
    [openThreadId, threads],
  );
  const project = useMemo(
    () => (thread ? projects.find((entry) => entry.id === thread.projectId) ?? null : null),
    [projects, thread],
  );

  useEffect(() => {
    const syncRect = () => {
      setRect((current) => clampRect(current, { width: window.innerWidth, height: window.innerHeight }));
    };
    syncRect();
    window.addEventListener("resize", syncRect);
    return () => window.removeEventListener("resize", syncRect);
  }, []);

  useEffect(() => {
    if (!openThreadId || isMobile) {
      return;
    }
    setRect(buildDefaultRect(window.innerWidth, window.innerHeight));
  }, [isMobile, openThreadId]);

  const handleDragPointerMove = useCallback((event: PointerEvent) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    const nextRect = clampRect(
      {
        ...dragState.startRect,
        x: dragState.startRect.x + (event.clientX - dragState.startX),
        y: dragState.startRect.y + (event.clientY - dragState.startY),
      },
      { width: window.innerWidth, height: window.innerHeight },
    );
    setRect(nextRect);
  }, []);

  const handleResizePointerMove = useCallback((event: PointerEvent) => {
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
    setRect(clampRect(nextRect, { width: window.innerWidth, height: window.innerHeight }));
  }, []);

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

  if (!openThreadId) {
    return null;
  }

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(openThreadId);
    } finally {
      setIsDeleting(false);
    }
  };

  const shell = (
    <div
      className="pointer-events-auto relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[28px] border border-border/70 bg-background/95 shadow-2xl backdrop-blur-xl"
      style={
        isMobile
          ? undefined
          : {
              width: rect.width,
              height: rect.height,
            }
      }
      data-office-thread-window={openThreadId}
    >
      <div
        className={`flex items-center gap-3 border-b border-border/70 bg-card/70 px-4 py-3 ${isMobile ? "" : "cursor-move"}`}
        onPointerDown={(event) => {
          if (
            isMobile ||
            event.button !== 0 ||
            (event.target instanceof HTMLElement && event.target.closest("button"))
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
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">
            {thread?.title ?? "New thread"}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {project?.name ?? "Draft agent"}
          </div>
        </div>
        {onOpenInMainWindow ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onOpenInMainWindow(openThreadId)}
          >
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
          <ChatView threadId={openThreadId} />
        </SidebarProvider>
      </div>
      {!isMobile ? (
        <>
          <div
            className="absolute inset-y-0 right-0 w-2 cursor-ew-resize"
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
        </>
      ) : null}
    </div>
  );

  return (
    <div className="pointer-events-none absolute inset-0 z-40">
      <div className="absolute inset-0 bg-black/28 backdrop-blur-[1px]" onClick={onClose} />
      {isMobile ? (
        <div className="absolute inset-x-0 bottom-0 top-16 p-0">{shell}</div>
      ) : (
        <div
          className="absolute"
          style={{
            left: rect.x,
            top: rect.y,
          }}
        >
          {shell}
        </div>
      )}
    </div>
  );
}
