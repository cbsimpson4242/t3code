import type { ProjectId } from "@t3tools/contracts";
import { useEffect, useId, useState } from "react";

import type { Project } from "~/types";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";

interface OfficeAgentCreateDialogProps {
  open: boolean;
  initialProjectId: ProjectId | null;
  projects: Project[];
  onOpenChange: (open: boolean) => void;
  onCreate: (input: { projectId: ProjectId; title: string | null }) => Promise<void> | void;
}

export default function OfficeAgentCreateDialog({
  open,
  initialProjectId,
  projects,
  onOpenChange,
  onCreate,
}: OfficeAgentCreateDialogProps) {
  const selectId = useId();
  const titleId = useId();
  const [projectId, setProjectId] = useState<ProjectId | "">("");
  const [title, setTitle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    const defaultProjectId = initialProjectId ?? projects[0]?.id ?? "";
    setProjectId(defaultProjectId);
    setTitle("");
    setIsSubmitting(false);
  }, [initialProjectId, open, projects]);

  const canSubmit = projectId !== "" && projects.length > 0 && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) {
      return;
    }
    setIsSubmitting(true);
    try {
      await onCreate({
        projectId,
        title: title.trim() || null,
      });
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isSubmitting) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <DialogPopup className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Agent</DialogTitle>
          <DialogDescription>
            Create a new office agent inside a project workspace.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          <label className="grid gap-1.5" htmlFor={selectId}>
            <span className="text-xs font-medium text-foreground">Project</span>
            <select
              id={selectId}
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground shadow-xs/5 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/24 disabled:opacity-64"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value as ProjectId | "")}
              disabled={projects.length === 0 || isSubmitting}
            >
              {projects.length === 0 ? (
                <option value="">No projects available</option>
              ) : (
                projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))
              )}
            </select>
          </label>
          <label className="grid gap-1.5" htmlFor={titleId}>
            <span className="text-xs font-medium text-foreground">Agent title</span>
            <Input
              id={titleId}
              nativeInput
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Optional agent name"
              disabled={isSubmitting}
            />
          </label>
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Add a project first before creating an office agent.
            </p>
          ) : null}
        </DialogPanel>
        <DialogFooter>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {isSubmitting ? "Creating..." : "Create Agent"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
