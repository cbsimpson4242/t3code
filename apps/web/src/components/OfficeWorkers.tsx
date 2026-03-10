import { BotIcon, UserIcon } from "lucide-react";
import { useStore } from "../store";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

export default function OfficeWorkers() {
  const projects = useStore((store) => store.projects);
  const threads = useStore((store) => store.threads);

  if (projects.length === 0) return null;

  return (
    <div className="px-2 py-2 flex flex-col gap-4">
      <div className="flex items-center justify-between px-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
          Offices
        </span>
      </div>
      <div className="flex flex-col gap-3 px-1">
        {projects.map((project) => {
          const projectThreads = threads.filter((t) => t.projectId === project.id);
          
          return (
            <div key={project.id} className="flex flex-col gap-2 rounded-lg border border-border bg-secondary/30 p-2">
              <div className="text-xs font-semibold text-foreground/80 truncate px-1">
                {project.name}
              </div>
              
              <div className="flex flex-wrap gap-2 px-1 pb-1">
                {projectThreads.length === 0 ? (
                  <span className="text-xs text-muted-foreground italic">No workers</span>
                ) : (
                  projectThreads.map((thread) => {
                    const isActive =
                      thread.session?.status === "running" ||
                      thread.session?.orchestrationStatus === "running" ||
                      thread.latestTurn?.state === "running";
                      
                    const isError = thread.session?.status === "error" || thread.latestTurn?.state === "error";

                    return (
                      <Tooltip key={thread.id}>
                        <TooltipTrigger
                          render={
                            <div
                              className={`flex items-center justify-center size-8 rounded bg-background border shadow-sm transition-all duration-300 ${
                                isActive ? "border-primary shadow-primary/20 ring-1 ring-primary/50" : isError ? "border-destructive ring-1 ring-destructive/50" : "border-border/60 opacity-80"
                              }`}
                            >
                              <div className={`relative ${isActive ? "animate-bounce" : ""}`}>
                                <BotIcon 
                                  className={`size-4 ${
                                    isActive ? "text-primary" : isError ? "text-destructive" : "text-muted-foreground"
                                  }`} 
                                />
                                {isActive && (
                                  <span className="absolute -top-1 -right-1 flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                                  </span>
                                )}
                              </div>
                            </div>
                          }
                        />
                        <TooltipPopup side="bottom">
                          {thread.title} {isActive ? "(Working)" : isError ? "(Error)" : "(Idle)"}
                        </TooltipPopup>
                      </Tooltip>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
