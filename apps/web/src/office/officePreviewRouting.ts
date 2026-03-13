import type { DetectedPreview } from "@t3tools/contracts";

import type { Project, Thread } from "~/types";

function officeGroupKeyForThread(thread: Thread, projectsById: ReadonlyMap<string, Project>): string {
  const project = projectsById.get(thread.projectId);
  const cwd = thread.worktreePath ?? project?.cwd ?? null;
  return cwd ?? `project:${thread.projectId}`;
}

function preferPreview(left: DetectedPreview, right: DetectedPreview): DetectedPreview {
  if (left.status !== right.status) {
    return left.status === "live" ? left : right;
  }
  return left.updatedAt >= right.updatedAt ? left : right;
}

export function groupPreviewsByOffice(input: {
  threads: ReadonlyArray<Thread>;
  projects: ReadonlyArray<Project>;
  previews: ReadonlyArray<DetectedPreview>;
}): Record<string, DetectedPreview[]> {
  const projectsById = new Map(input.projects.map((project) => [project.id, project] as const));
  const groupKeyByThreadId = new Map(
    input.threads.map((thread) => [thread.id, officeGroupKeyForThread(thread, projectsById)] as const),
  );
  const dedupedByGroupKey = new Map<string, Map<string, DetectedPreview>>();

  for (const preview of input.previews) {
    const groupKey = groupKeyByThreadId.get(preview.threadId) ?? preview.cwd;
    const existing = dedupedByGroupKey.get(groupKey) ?? new Map<string, DetectedPreview>();
    const previous = existing.get(preview.normalizedUrl);
    existing.set(preview.normalizedUrl, previous ? preferPreview(previous, preview) : preview);
    dedupedByGroupKey.set(groupKey, existing);
  }

  return Object.fromEntries(
    [...dedupedByGroupKey.entries()].map(([groupKey, previewsByUrl]) => [
      groupKey,
      [...previewsByUrl.values()].toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    ]),
  );
}
