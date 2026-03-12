import { DEFAULT_MODEL_BY_PROVIDER, type ProjectId } from "@t3tools/contracts";

import { readNativeApi } from "~/nativeApi";
import { type Project, type Thread } from "~/types";
import { newCommandId, newProjectId } from "~/lib/utils";

export function deriveProjectTitleFromPath(cwd: string): string {
  const trimmed = cwd.trim();
  if (trimmed.length === 0) {
    return "";
  }
  const segments = trimmed.split(/[/\\]/).filter((segment) => segment.length > 0);
  return segments.at(-1) ?? trimmed;
}

export function findMostRecentThreadIdForProject(
  threads: Thread[],
  projectId: ProjectId,
): Thread["id"] | null {
  const latestThread = threads
    .filter((thread) => thread.projectId === projectId)
    .toSorted((a, b) => {
      const byDate = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (byDate !== 0) {
        return byDate;
      }
      return b.id.localeCompare(a.id);
    })[0];

  return latestThread?.id ?? null;
}

export async function ensureProjectExists(
  projects: Project[],
  rawCwd: string,
): Promise<{ projectId: ProjectId; status: "existing" | "created" }> {
  const cwd = rawCwd.trim();
  if (cwd.length === 0) {
    throw new Error("Project path cannot be empty.");
  }

  const existing = projects.find((project) => project.cwd === cwd);
  if (existing) {
    return {
      projectId: existing.id,
      status: "existing",
    };
  }

  const api = readNativeApi();
  if (!api) {
    throw new Error("Project creation is unavailable.");
  }

  const projectId = newProjectId();
  await api.orchestration.dispatchCommand({
    type: "project.create",
    commandId: newCommandId(),
    projectId,
    title: deriveProjectTitleFromPath(cwd),
    workspaceRoot: cwd,
    defaultModel: DEFAULT_MODEL_BY_PROVIDER.codex,
    createdAt: new Date().toISOString(),
  });

  return {
    projectId,
    status: "created",
  };
}
