import { useCallback, useEffect, useRef, type ReactNode } from "react";

import type { OfficePoint } from "~/office/officeTypes";

const DEFAULT_CHAT_WINDOW_WIDTH = 1060;
const DEFAULT_CHAT_WINDOW_HEIGHT = 760;
const DEFAULT_ADMIN_WINDOW_WIDTH = 920;
const DEFAULT_ADMIN_WINDOW_HEIGHT = 620;
const DEFAULT_BROWSER_WINDOW_WIDTH = 980;
const DEFAULT_BROWSER_WINDOW_HEIGHT = 720;
const MIN_WINDOW_WIDTH = 420;
const MIN_WINDOW_HEIGHT = 300;
const WINDOW_CASCADE_OFFSET = 28;

export interface OfficeWindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type ResizeDirection = "right" | "bottom" | "corner";

interface OfficeWindowFrameProps {
  rect: OfficeWindowRect;
  displayRect?: OfficeWindowRect | undefined;
  zoom: number;
  dragZoom?: number;
  resizeZoom?: number;
  zIndex: number;
  isFocused: boolean;
  accentColor: string;
  onClose: () => void;
  onFocus: () => void;
  onRectChange: (rect: OfficeWindowRect) => void;
  header: ReactNode;
  headerActions?: ReactNode;
  children: ReactNode;
  rootAttributes?: Record<string, string | undefined>;
  closeButtonLabel: string;
  dragExclusionSelector?: string;
  resizeHandleDataAttribute?: string;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function rectsEqual(a: OfficeWindowRect, b: OfficeWindowRect) {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function mod(value: number, divisor: number) {
  if (divisor === 0) {
    return 0;
  }
  return ((value % divisor) + divisor) % divisor;
}

export function normalizeOfficeWindowRect(rect: OfficeWindowRect): OfficeWindowRect {
  return {
    width: clamp(rect.width, MIN_WINDOW_WIDTH, Number.POSITIVE_INFINITY),
    height: clamp(rect.height, MIN_WINDOW_HEIGHT, Number.POSITIVE_INFINITY),
    x: rect.x,
    y: rect.y,
  };
}

function buildDefaultOfficeWindowRect(
  anchor: OfficePoint,
  size: { width: number; height: number },
  stackIndex = 0,
): OfficeWindowRect {
  const cascadeStep = mod(stackIndex, 6) * WINDOW_CASCADE_OFFSET;

  return normalizeOfficeWindowRect({
    width: size.width,
    height: size.height,
    x: anchor.x + 64 + cascadeStep,
    y: anchor.y - 72 + cascadeStep * 0.5,
  });
}

export function buildDefaultOfficeThreadWindowRect(anchor: OfficePoint, stackIndex = 0): OfficeWindowRect {
  return buildDefaultOfficeWindowRect(
    anchor,
    {
      width: DEFAULT_CHAT_WINDOW_WIDTH,
      height: DEFAULT_CHAT_WINDOW_HEIGHT,
    },
    stackIndex,
  );
}

export function buildDefaultOfficeAdminWindowRect(anchor: OfficePoint, stackIndex = 0): OfficeWindowRect {
  return buildDefaultOfficeWindowRect(
    anchor,
    {
      width: DEFAULT_ADMIN_WINDOW_WIDTH,
      height: DEFAULT_ADMIN_WINDOW_HEIGHT,
    },
    stackIndex,
  );
}

export function buildDefaultOfficeBrowserWindowRect(
  anchor: OfficePoint,
  stackIndex = 0,
): OfficeWindowRect {
  return buildDefaultOfficeWindowRect(
    anchor,
    {
      width: DEFAULT_BROWSER_WINDOW_WIDTH,
      height: DEFAULT_BROWSER_WINDOW_HEIGHT,
    },
    stackIndex,
  );
}

export function getOfficeThreadWindowDefaultSize() {
  return {
    width: DEFAULT_CHAT_WINDOW_WIDTH,
    height: DEFAULT_CHAT_WINDOW_HEIGHT,
  };
}

export function getOfficeAdminWindowDefaultSize() {
  return {
    width: DEFAULT_ADMIN_WINDOW_WIDTH,
    height: DEFAULT_ADMIN_WINDOW_HEIGHT,
  };
}

export function getOfficeBrowserWindowDefaultSize() {
  return {
    width: DEFAULT_BROWSER_WINDOW_WIDTH,
    height: DEFAULT_BROWSER_WINDOW_HEIGHT,
  };
}

export default function OfficeWindowFrame({
  rect,
  displayRect,
  zoom,
  dragZoom,
  resizeZoom,
  zIndex,
  isFocused,
  accentColor,
  onClose,
  onFocus,
  onRectChange,
  header,
  headerActions,
  children,
  rootAttributes,
  closeButtonLabel,
  dragExclusionSelector = "button, input, [data-office-window-header-interactive='true']",
  resizeHandleDataAttribute,
}: OfficeWindowFrameProps) {
  const renderedRect = displayRect ?? rect;
  const dragScale = Math.max(dragZoom ?? zoom, 0.0001);
  const resizeScale = Math.max(resizeZoom ?? zoom, 0.0001);

  const dragStateRef = useRef<null | {
    pointerId: number;
    startX: number;
    startY: number;
    startRect: OfficeWindowRect;
  }>(null);
  const resizeStateRef = useRef<null | {
    pointerId: number;
    startX: number;
    startY: number;
    startRect: OfficeWindowRect;
    direction: ResizeDirection;
  }>(null);

  useEffect(() => {
    const clampedRect = normalizeOfficeWindowRect(rect);
    if (!rectsEqual(clampedRect, rect)) {
      onRectChange(clampedRect);
    }
  }, [onRectChange, rect]);

  const handleDragPointerMove = useCallback(
    (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }
      event.preventDefault();
      onRectChange(
        normalizeOfficeWindowRect({
          ...dragState.startRect,
          x: dragState.startRect.x + (event.clientX - dragState.startX) / dragScale,
          y: dragState.startRect.y + (event.clientY - dragState.startY) / dragScale,
        }),
      );
    },
    [dragScale, onRectChange],
  );

  const handleResizePointerMove = useCallback(
    (event: PointerEvent) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState || resizeState.pointerId !== event.pointerId) {
        return;
      }
      event.preventDefault();
      const deltaX = (event.clientX - resizeState.startX) / resizeScale;
      const deltaY = (event.clientY - resizeState.startY) / resizeScale;
      const nextRect = { ...resizeState.startRect };
      if (resizeState.direction === "right" || resizeState.direction === "corner") {
        nextRect.width = resizeState.startRect.width + deltaX;
      }
      if (resizeState.direction === "bottom" || resizeState.direction === "corner") {
        nextRect.height = resizeState.startRect.height + deltaY;
      }
      onRectChange(normalizeOfficeWindowRect(nextRect));
    },
    [onRectChange, resizeScale],
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

  return (
      <div
        className="absolute"
        style={{
          left: renderedRect.x,
          top: renderedRect.y,
          zIndex,
        }}
      >
      <div
        {...rootAttributes}
        className="pointer-events-auto relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[24px] border bg-background/96 shadow-2xl backdrop-blur-xl"
        style={{
          borderColor: isFocused ? `${accentColor}aa` : `${accentColor}66`,
          boxShadow: isFocused
            ? `0 20px 60px -28px ${accentColor}90, 0 0 0 1px ${accentColor}40`
            : `0 16px 42px -28px ${accentColor}78, 0 0 0 1px ${accentColor}20`,
          width: renderedRect.width,
          height: renderedRect.height,
        }}
        onPointerDownCapture={() => onFocus()}
      >
        <div
          className="flex cursor-move items-center gap-3 border-b px-4 py-3"
          style={{
            borderColor: `${accentColor}50`,
            background: `linear-gradient(180deg, ${accentColor}1f, rgba(15, 23, 42, 0.02))`,
          }}
          onPointerDown={(event) => {
            if (
              event.button !== 0 ||
              (event.target instanceof HTMLElement && event.target.closest(dragExclusionSelector))
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
          <div className="min-w-0 flex-1">{header}</div>
          {headerActions}
          <button
            type="button"
            data-office-window-header-interactive="true"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={onClose}
            aria-label={closeButtonLabel}
          >
            <span aria-hidden="true">x</span>
          </button>
        </div>
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</div>
        <div
          className="absolute inset-y-0 right-0 w-2 cursor-ew-resize"
          {...(resizeHandleDataAttribute ? { [resizeHandleDataAttribute]: "right" } : {})}
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
          {...(resizeHandleDataAttribute ? { [resizeHandleDataAttribute]: "bottom" } : {})}
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
          {...(resizeHandleDataAttribute ? { [resizeHandleDataAttribute]: "corner" } : {})}
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
    </div>
  );
}
