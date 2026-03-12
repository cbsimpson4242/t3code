import { BriefcaseBusinessIcon, FolderOpenIcon, PlusIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectId } from "@t3tools/contracts";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  normalizeOfficeThreadWindowRect,
  type OfficeThreadWindowRect,
} from "~/components/OfficeThreadWindow";
import type { Project, Thread } from "~/types";

type ResizeDirection = "right" | "bottom" | "corner";

interface OfficeAdminWindowProps {
  rect: OfficeThreadWindowRect;
  zoom: number;
  zIndex: number;
  isFocused: boolean;
  accentColor: string;
  projects: Project[];
  threads: Thread[];
  onClose: () => void;
  onFocus: () => void;
  onRectChange: (rect: OfficeThreadWindowRect) => void;
  onAddProject: (cwd: string) => Promise<void>;
  onPickFolder: () => Promise<string | null>;
  onOpenLatestThread: (projectId: ProjectId) => void;
  onCreateAgent: (projectId: ProjectId) => Promise<void>;
}

function rectsEqual(a: OfficeThreadWindowRect, b: OfficeThreadWindowRect) {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export default function OfficeAdminWindow({
  rect,
  zoom,
  zIndex,
  isFocused,
  accentColor,
  projects,
  threads,
  onClose,
  onFocus,
  onRectChange,
  onAddProject,
  onPickFolder,
  onOpenLatestThread,
  onCreateAgent,
}: OfficeAdminWindowProps) {
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
  const [projectPath, setProjectPath] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const clampedRect = normalizeOfficeThreadWindowRect(rect);
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

  const projectsWithCounts = useMemo(
    () =>
      projects.map((project) => {
        const projectThreads = threads.filter((thread) => thread.projectId === project.id);
        return {
          ...project,
          agentCount: projectThreads.length,
          latestThreadId:
            projectThreads
              .toSorted((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
              ?.id ?? null,
        };
      }),
    [projects, threads],
  );

  const submitProjectPath = useCallback(
    async (cwd: string) => {
      setIsSubmitting(true);
      setError(null);
      try {
        await onAddProject(cwd);
        setProjectPath("");
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Unable to open project.");
      } finally {
        setIsSubmitting(false);
      }
    },
    [onAddProject],
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
        data-office-admin-window="office-admin"
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
              (event.target instanceof HTMLElement && event.target.closest("button, input"))
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
          <div className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: accentColor }} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-foreground">CEO Office</div>
            <div className="truncate text-xs text-muted-foreground">Projects and office administration</div>
          </div>
          <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label="Close office admin window">
            <XIcon className="size-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <section className="rounded-2xl border border-border/60 bg-card/60 p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <div className="rounded-full border border-border/60 bg-background/80 p-2">
                <FolderOpenIcon className="size-4 text-foreground/80" />
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">Open a project</div>
                <div className="text-xs text-muted-foreground">
                  Add a workspace folder and create its first office agent.
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                nativeInput
                value={projectPath}
                onChange={(event) => setProjectPath(event.target.value)}
                placeholder="F:\\repo\\my-project"
                disabled={isSubmitting}
              />
              <Button
                variant="outline"
                onClick={() => {
                  void (async () => {
                    const pickedPath = await onPickFolder();
                    if (pickedPath) {
                      await submitProjectPath(pickedPath);
                    }
                  })();
                }}
                disabled={isSubmitting}
              >
                <FolderOpenIcon className="size-4" />
                Open Folder
              </Button>
              <Button
                onClick={() => {
                  void submitProjectPath(projectPath);
                }}
                disabled={isSubmitting || projectPath.trim().length === 0}
              >
                <PlusIcon className="size-4" />
                Add Project
              </Button>
            </div>
            {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
          </section>

          <section className="mt-4 rounded-2xl border border-border/60 bg-card/60 p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <div className="rounded-full border border-border/60 bg-background/80 p-2">
                <BriefcaseBusinessIcon className="size-4 text-foreground/80" />
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">Active projects</div>
                <div className="text-xs text-muted-foreground">
                  {projects.length} project{projects.length === 1 ? "" : "s"} currently in the office.
                </div>
              </div>
            </div>
            {projectsWithCounts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 bg-background/40 px-4 py-6 text-sm text-muted-foreground">
                No projects yet.
              </div>
            ) : (
              <div className="space-y-3">
                {projectsWithCounts.map((project) => (
                  <div
                    key={project.id}
                    className="rounded-xl border border-border/60 bg-background/50 px-3 py-3"
                    data-office-admin-project={project.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-foreground">{project.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{project.cwd}</div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          {project.agentCount} active agent{project.agentCount === 1 ? "" : "s"}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-2">
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => onOpenLatestThread(project.id)}
                          disabled={project.latestThreadId === null}
                        >
                          Open Latest
                        </Button>
                        <Button size="xs" onClick={() => void onCreateAgent(project.id)}>
                          New Agent
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div
          className="absolute inset-y-0 right-0 w-2 cursor-ew-resize"
          data-office-admin-resize="right"
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
          data-office-admin-resize="bottom"
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
          data-office-admin-resize="corner"
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
