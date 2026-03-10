import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  GitBranchIcon,
  RefreshCwIcon,
  XIcon,
} from "lucide-react";
import { isElectron } from "../env";
import { useStore } from "../store";
import {
  gitStatusQueryOptions,
  gitRunStackedActionMutationOptions,
  gitPullMutationOptions,
  invalidateGitQueries,
} from "../lib/gitReactQuery";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

function FileRow({
  path,
  insertions,
  deletions,
}: {
  path: string;
  insertions: number;
  deletions: number;
}) {
  const filename = path.split(/[/\\]/).at(-1) ?? path;
  const dir = path.includes("/") || path.includes("\\") ? path.slice(0, path.length - filename.length) : null;

  return (
    <div className="flex items-center gap-2 rounded px-2 py-1 hover:bg-accent group min-w-0">
      <span
        className="shrink-0 w-4 text-center text-[11px] font-bold text-muted-foreground"
        title="Modified file"
      >
        M
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-foreground">
        {filename}
        {dir && (
          <span className="ml-1 text-muted-foreground/60">{dir.replace(/[/\\]$/, "")}</span>
        )}
      </span>
      {(insertions > 0 || deletions > 0) && (
        <span className="shrink-0 text-[10px] text-muted-foreground/60 tabular-nums">
          {insertions > 0 && <span className="text-green-500">+{insertions}</span>}
          {insertions > 0 && deletions > 0 && " "}
          {deletions > 0 && <span className="text-red-500">-{deletions}</span>}
        </span>
      )}
    </div>
  );
}

export default function SourceControlPanel() {
  const queryClient = useQueryClient();
  const projects = useStore((store) => store.projects);
  const setSourceControlOpen = useStore((store) => store.setSourceControlOpen);
  const cwd = projects[0]?.cwd ?? null;

  const [commitMessage, setCommitMessage] = useState("");

  const statusQuery = useQuery(gitStatusQueryOptions(cwd));
  const status = statusQuery.data ?? null;

  const commitMutation = useMutation(gitRunStackedActionMutationOptions({ cwd, queryClient }));
  const pullMutation = useMutation(gitPullMutationOptions({ cwd, queryClient }));

  const isBusy = commitMutation.isPending || pullMutation.isPending;

  const handleCommit = () => {
    if (!commitMessage.trim()) return;
    commitMutation.mutate(
      { action: "commit", commitMessage: commitMessage.trim() },
      { onSuccess: () => setCommitMessage("") },
    );
  };

  const handleCommitPush = () => {
    if (!commitMessage.trim()) return;
    commitMutation.mutate(
      { action: "commit_push", commitMessage: commitMessage.trim() },
      { onSuccess: () => setCommitMessage("") },
    );
  };

  const handlePull = () => {
    pullMutation.mutate();
  };

  const handleRefresh = () => {
    void invalidateGitQueries(queryClient);
  };

  const files = status?.workingTree.files ?? [];
  const branch = status?.branch ?? null;
  const aheadCount = status?.aheadCount ?? 0;
  const behindCount = status?.behindCount ?? 0;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground h-full">
      <div className={`${isElectron ? "drag-region" : ""} flex h-[52px] shrink-0 items-center border-b border-border px-4`}>
        <span className="flex-1 text-xs font-medium tracking-wide text-muted-foreground/70">
          Source Control
        </span>
        <button
          type="button"
          className="shrink-0 rounded p-1 text-muted-foreground/50 hover:bg-accent hover:text-foreground"
          onClick={() => setSourceControlOpen(false)}
          title="Close source control"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Branch bar */}
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5">
          <GitBranchIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {branch ?? (statusQuery.isLoading ? "Loading…" : "No repo")}
          </span>

          {branch && (
            <div className="flex shrink-0 items-center gap-1">
              {behindCount > 0 && (
                <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                  <ArrowDownIcon className="size-3" />
                  {behindCount}
                </span>
              )}
              {aheadCount > 0 && (
                <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                  <ArrowUpIcon className="size-3" />
                  {aheadCount}
                </span>
              )}
              <Button
                size="xs"
                variant="ghost"
                className="h-6 w-6 p-0 text-muted-foreground"
                onClick={handlePull}
                disabled={isBusy || behindCount === 0}
                title="Pull"
              >
                <ArrowDownIcon className="size-3.5" />
              </Button>
              <Button
                size="xs"
                variant="ghost"
                className="h-6 w-6 p-0 text-muted-foreground"
                onClick={handleRefresh}
                disabled={statusQuery.isFetching}
                title="Refresh"
              >
                <RefreshCwIcon className={`size-3.5 ${statusQuery.isFetching ? "animate-spin" : ""}`} />
              </Button>
            </div>
          )}
        </div>

        {/* Commit input */}
        <div className="shrink-0 border-b border-border p-3 space-y-2">
          <Textarea
            placeholder="Message (⌘Enter to commit)"
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleCommit();
              }
            }}
            className="min-h-[60px] resize-none text-xs"
            disabled={isBusy}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              onClick={handleCommit}
              disabled={isBusy || !commitMessage.trim() || files.length === 0}
            >
              {commitMutation.isPending ? "Committing…" : "Commit"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCommitPush}
              disabled={isBusy || !commitMessage.trim() || files.length === 0}
              title="Commit & Push"
            >
              {commitMutation.isPending ? "…" : "↑ Push"}
            </Button>
          </div>
          {commitMutation.isError && (
            <p className="text-xs text-destructive">
              {commitMutation.error instanceof Error
                ? commitMutation.error.message
                : "Commit failed."}
            </p>
          )}
        </div>

        {/* Changes list */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-between px-4 py-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
              Changes
            </span>
            {files.length > 0 && (
              <span className="text-[11px] text-muted-foreground/60">{files.length}</span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {statusQuery.isLoading ? (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">Loading…</p>
            ) : statusQuery.isError ? (
              <p className="px-2 py-4 text-center text-xs text-destructive">
                Unable to load git status.
              </p>
            ) : files.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                No changes in working tree.
              </p>
            ) : (
              files.map((file) => (
                <FileRow
                  key={file.path}
                  path={file.path}
                  insertions={file.insertions}
                  deletions={file.deletions}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
