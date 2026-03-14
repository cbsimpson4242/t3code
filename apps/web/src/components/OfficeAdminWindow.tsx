import { BriefcaseBusinessIcon, FolderOpenIcon, PlusIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import type { ProjectId } from "@t3tools/contracts";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import type { OfficeThreadWindowRect } from "~/components/OfficeThreadWindow";
import type { Project, Thread } from "~/types";

import OfficeWindowFrame from "./OfficeWindowFrame";

interface OfficeAdminWindowProps {
  rect: OfficeThreadWindowRect;
  displayRect?: OfficeThreadWindowRect | undefined;
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

export default function OfficeAdminWindow({
  rect,
  displayRect,
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
  const [projectPath, setProjectPath] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <OfficeWindowFrame
      rect={rect}
      {...(displayRect ? { displayRect } : {})}
      zoom={zoom}
      dragZoom={zoom}
      resizeZoom={1}
      zIndex={zIndex}
      isFocused={isFocused}
      accentColor={accentColor}
      onClose={onClose}
      onFocus={onFocus}
      onRectChange={onRectChange}
      closeButtonLabel="Close office admin window"
      resizeHandleDataAttribute="data-office-admin-resize"
      rootAttributes={{
        "data-office-admin-window": "office-admin",
      }}
      header={
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">CEO Office</div>
          <div className="truncate text-xs text-muted-foreground">Projects and office administration</div>
        </div>
      }
    >
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
    </OfficeWindowFrame>
  );
}
