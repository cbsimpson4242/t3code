import type { ComposerDraftWorkspaceSelection } from "../../state/use-composer-drafts";

export type NewTaskDraftRouteParams = {
  readonly requestId?: string;
  readonly environmentId?: string | string[];
  readonly projectId?: string | string[];
  readonly branch?: string | null;
  readonly worktreePath?: string | null;
  /** Start on the project's own checkout, whatever worktree the source thread ran in. */
  readonly checkout?: "main" | undefined;
  readonly title?: string | string[];
  readonly cloning?: string | string[];
  readonly draftId?: string | string[];
  readonly incomingShareId?: string | string[];
};

export function isDraftThreadRoute(
  route:
    | {
        readonly name: string;
        readonly params?: object;
      }
    | undefined,
) {
  return (
    route?.name === "Thread" && Boolean((route.params as { draft?: unknown } | undefined)?.draft)
  );
}

export function submittedThreadParams(environmentId: string, threadId: string) {
  return { draft: undefined, environmentId, threadId };
}

export function draftRouteIdentity(draft: NewTaskDraftRouteParams): string {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  return JSON.stringify([
    draft.requestId,
    first(draft.draftId),
    first(draft.environmentId),
    first(draft.projectId),
    draft.branch ?? null,
    draft.worktreePath ?? null,
    draft.checkout ?? null,
    first(draft.incomingShareId),
  ]);
}

/** Project checkout. An unnamed branch follows it; the source thread's worktree is not reused. */
export function newThreadOnMainDraft(
  thread: { readonly environmentId: string; readonly projectId: string },
  requestId: string,
): NewTaskDraftRouteParams {
  return {
    requestId,
    environmentId: String(thread.environmentId),
    projectId: String(thread.projectId),
    checkout: "main",
  };
}

/** The workspace a draft route pins, or null to leave it to the project's defaults. */
export function draftWorkspaceOverride(
  draft: Pick<NewTaskDraftRouteParams, "branch" | "worktreePath" | "checkout">,
): ComposerDraftWorkspaceSelection | null {
  if (draft.branch) {
    return {
      mode: "local",
      branch: draft.branch,
      worktreePath: draft.worktreePath ?? null,
      startFromOrigin: false,
    };
  }
  if (draft.checkout === "main") {
    return {
      mode: "local",
      branch: null,
      worktreePath: null,
      startFromOrigin: false,
      followsCurrentCheckout: true,
    };
  }
  return null;
}
