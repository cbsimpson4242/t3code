import * as React from "react";

import { cn } from "~/lib/utils";

type ResizableVerticalStackProps = {
  top: React.ReactNode;
  bottom: React.ReactNode;
  className?: string;
  topClassName?: string;
  bottomClassName?: string;
  dividerClassName?: string;
  defaultTopPercentage?: number;
  minTopHeight?: number;
  minBottomHeight?: number;
  storageKey?: string;
};

type ResizeState = {
  pointerId: number;
  startTopHeight: number;
  startY: number;
};

function clampTopHeight(
  height: number,
  containerHeight: number,
  minTopHeight: number,
  minBottomHeight: number,
): number {
  const maxTopHeight = Math.max(minTopHeight, containerHeight - minBottomHeight);
  return Math.min(Math.max(Math.round(height), minTopHeight), maxTopHeight);
}

export function ResizableVerticalStack({
  top,
  bottom,
  className,
  topClassName,
  bottomClassName,
  dividerClassName,
  defaultTopPercentage = 0.5,
  minTopHeight = 220,
  minBottomHeight = 480,
  storageKey,
}: ResizableVerticalStackProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const resizeStateRef = React.useRef<ResizeState | null>(null);
  const topHeightRef = React.useRef<number | null>(null);
  const [topHeight, setTopHeight] = React.useState<number | null>(null);

  React.useEffect(() => {
    topHeightRef.current = topHeight;
  }, [topHeight]);

  React.useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const syncHeight = () => {
      const containerHeight = container.clientHeight;
      if (containerHeight <= 0) {
        return;
      }

      const storedHeight = storageKey ? Number(window.localStorage.getItem(storageKey)) : NaN;
      const currentTopHeight = topHeightRef.current;
      const nextHeight = clampTopHeight(
        typeof currentTopHeight === "number"
          ? currentTopHeight
          : Number.isFinite(storedHeight)
            ? storedHeight
            : containerHeight * defaultTopPercentage,
        containerHeight,
        minTopHeight,
        minBottomHeight,
      );
      if (topHeightRef.current === nextHeight) {
        return;
      }
      topHeightRef.current = nextHeight;
      setTopHeight(nextHeight);
    };

    syncHeight();
    const observer = new ResizeObserver(syncHeight);
    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, [defaultTopPercentage, minBottomHeight, minTopHeight, storageKey]);

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      const container = containerRef.current;
      if (!container) {
        return;
      }
      const currentTopHeight = topHeightRef.current;
      if (typeof currentTopHeight !== "number") {
        return;
      }

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      resizeStateRef.current = {
        pointerId: event.pointerId,
        startTopHeight: currentTopHeight,
        startY: event.clientY,
      };
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
    },
    [],
  );

  const handlePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const resizeState = resizeStateRef.current;
      const container = containerRef.current;
      if (!resizeState || resizeState.pointerId !== event.pointerId || !container) {
        return;
      }

      event.preventDefault();
      const nextTopHeight = clampTopHeight(
        resizeState.startTopHeight + (event.clientY - resizeState.startY),
        container.clientHeight,
        minTopHeight,
        minBottomHeight,
      );
      if (topHeightRef.current === nextTopHeight) {
        return;
      }
      topHeightRef.current = nextTopHeight;
      setTopHeight(nextTopHeight);
    },
    [minBottomHeight, minTopHeight],
  );

  const handlePointerEnd = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState || resizeState.pointerId !== event.pointerId) {
        return;
      }

      resizeStateRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");

      if (storageKey && Number.isFinite(topHeightRef.current)) {
        window.localStorage.setItem(storageKey, String(topHeightRef.current));
      }
    },
    [storageKey],
  );

  React.useEffect(() => {
    return () => {
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };
  }, []);

  return (
    <div ref={containerRef} className={cn("flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden", className)}>
      <div
        className={cn("min-h-0 min-w-0 shrink-0 overflow-hidden", topClassName)}
        style={topHeight != null ? { height: `${topHeight}px` } : { height: `${defaultTopPercentage * 100}%` }}
      >
        {top}
      </div>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize office and chat panels"
        className={cn(
          "group relative z-10 h-2 shrink-0 cursor-row-resize bg-transparent",
          dividerClassName,
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border transition-colors group-hover:bg-foreground/30" />
      </div>
      <div className={cn("min-h-0 min-w-0 flex-1 overflow-hidden", bottomClassName)}>{bottom}</div>
    </div>
  );
}

export default ResizableVerticalStack;
