import { ArrowUpRightIcon, Trash2Icon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ThreadId } from "@t3tools/contracts";

import ChatView from "~/components/ChatView";
import { Button } from "~/components/ui/button";
import { SidebarProvider } from "~/components/ui/sidebar";
import type { Project, Thread } from "~/types";
import OfficeWindowFrame, {
  buildDefaultOfficeAdminWindowRect,
  buildDefaultOfficeBrowserWindowRect,
  buildDefaultOfficeThreadWindowRect,
  getOfficeAdminWindowDefaultSize,
  getOfficeBrowserWindowDefaultSize,
  getOfficeThreadWindowDefaultSize,
  normalizeOfficeWindowRect,
  type OfficeWindowRect,
} from "./OfficeWindowFrame";

export type OfficeThreadWindowRect = OfficeWindowRect;
export const normalizeOfficeThreadWindowRect = normalizeOfficeWindowRect;
export {
  buildDefaultOfficeAdminWindowRect,
  buildDefaultOfficeBrowserWindowRect,
  buildDefaultOfficeThreadWindowRect,
  getOfficeAdminWindowDefaultSize,
  getOfficeBrowserWindowDefaultSize,
  getOfficeThreadWindowDefaultSize,
};

interface OfficeThreadWindowProps {
  threadId: ThreadId;
  rect: OfficeThreadWindowRect;
  zoom: number;
  zIndex: number;
  isFocused: boolean;
  accentColor: string;
  projects: Project[];
  threads: Thread[];
  onClose: () => void;
  onDelete: (threadId: ThreadId) => Promise<void> | void;
  onRename: (threadId: ThreadId, title: string) => Promise<void> | void;
  onFocus: () => void;
  onRectChange: (rect: OfficeThreadWindowRect) => void;
  onOpenInMainWindow?: ((threadId: ThreadId) => void) | undefined;
}

function summarizeLastUserMessage(thread: Thread | null): string {
  if (!thread) {
    return "No user message yet";
  }

  for (let index = thread.messages.length - 1; index >= 0; index -= 1) {
    const message = thread.messages[index];
    if (!message || message.role !== "user") {
      continue;
    }

    const normalizedText = message.text.replace(/\s+/g, " ").trim();
    if (normalizedText.length > 0) {
      return normalizedText.length > 140 ? `${normalizedText.slice(0, 137)}...` : normalizedText;
    }

    const attachmentCount = message.attachments?.length ?? 0;
    if (attachmentCount > 0) {
      return attachmentCount === 1 ? "Sent 1 attachment" : `Sent ${attachmentCount} attachments`;
    }
  }

  return "No user message yet";
}

export default function OfficeThreadWindow({
  threadId,
  rect,
  zoom,
  zIndex,
  isFocused,
  accentColor,
  projects,
  threads,
  onClose,
  onDelete,
  onRename,
  onFocus,
  onRectChange,
  onOpenInMainWindow,
}: OfficeThreadWindowProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renamingTitle, setRenamingTitle] = useState("");
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const thread = useMemo(() => threads.find((entry) => entry.id === threadId) ?? null, [threadId, threads]);
  const project = useMemo(
    () => (thread ? projects.find((entry) => entry.id === thread.projectId) ?? null : null),
    [projects, thread],
  );
  const lastUserMessageSummary = useMemo(() => summarizeLastUserMessage(thread), [thread]);

  useEffect(() => {
    if (!isRenaming) {
      setRenamingTitle(thread?.title ?? "");
      return;
    }
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [isRenaming, thread?.title]);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(threadId);
    } finally {
      setIsDeleting(false);
    }
  };

  const cancelRename = useCallback(() => {
    setIsRenaming(false);
    setRenamingTitle(thread?.title ?? "");
  }, [thread?.title]);

  const commitRename = useCallback(async () => {
    await onRename(threadId, renamingTitle);
    setIsRenaming(false);
  }, [onRename, renamingTitle, threadId]);

  return (
    <OfficeWindowFrame
      rect={rect}
      zoom={zoom}
      zIndex={zIndex}
      isFocused={isFocused}
      accentColor={accentColor}
      onClose={onClose}
      onFocus={onFocus}
      onRectChange={onRectChange}
      closeButtonLabel="Close office thread window"
      resizeHandleDataAttribute="data-office-thread-resize"
      rootAttributes={{
        "data-office-thread-window": threadId,
        "data-office-thread-focused": isFocused ? "true" : undefined,
      }}
      dragExclusionSelector="button, input, [data-office-thread-title-interactive='true']"
      header={
        <div className="min-w-0">
          {isRenaming ? (
            <input
              ref={renameInputRef}
              data-office-thread-title-input={threadId}
              data-office-thread-title-interactive="true"
              className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={renamingTitle}
              onChange={(event) => setRenamingTitle(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") {
                  event.preventDefault();
                  void commitRename();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  cancelRename();
                }
              }}
              onBlur={() => {
                void commitRename();
              }}
              aria-label={`Rename title for ${thread?.title ?? "thread"}`}
            />
          ) : (
            <button
              type="button"
              data-office-thread-title-button={threadId}
              data-office-thread-title-interactive="true"
              className="block w-full truncate text-left text-sm font-semibold text-foreground outline-none transition-colors hover:text-primary focus-visible:text-primary"
              onClick={(event) => {
                event.stopPropagation();
                setRenamingTitle(thread?.title ?? "");
                setIsRenaming(true);
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              {thread?.title ?? "New thread"}
            </button>
          )}
          <div className="truncate text-xs text-muted-foreground">{project?.name ?? "Draft agent"}</div>
          <div
            className="mt-2 max-w-[34rem] rounded-2xl border px-3 py-2 text-[11px] leading-4 shadow-sm backdrop-blur-sm"
            style={{
              borderColor: `${accentColor}42`,
              backgroundColor: `${accentColor}12`,
              boxShadow: `0 12px 30px -24px ${accentColor}cc`,
            }}
            data-office-thread-last-user-message={threadId}
            title={lastUserMessageSummary}
          >
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/75">
              Last user message
            </div>
            <div className="line-clamp-2 text-foreground/90">{lastUserMessageSummary}</div>
          </div>
        </div>
      }
      headerActions={
        <>
          {onOpenInMainWindow ? (
            <Button
              size="sm"
              variant="outline"
              data-office-window-header-interactive="true"
              onClick={() => onOpenInMainWindow(threadId)}
            >
              <ArrowUpRightIcon className="size-4" />
              Open in main window
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            data-office-window-header-interactive="true"
            onClick={() => void handleDelete()}
            disabled={isDeleting}
          >
            <Trash2Icon className="size-4 text-destructive" />
            {isDeleting ? "Deleting..." : "Delete Agent"}
          </Button>
        </>
      }
    >
      <SidebarProvider defaultOpen={false} className="h-full min-h-0">
        <ChatView threadId={threadId} />
      </SidebarProvider>
    </OfficeWindowFrame>
  );
}
