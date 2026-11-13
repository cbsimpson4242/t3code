import {
  filterThreadIconEmojis,
  pushRecentThreadEmoji,
  sanitizeRecentThreadEmojis,
} from "@t3tools/client-runtime/state/thread-icon";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { ScopedThreadRef, ThreadIcon } from "@t3tools/contracts";
import { ImageIcon, MessageSquareDashedIcon } from "lucide-react";
import { useId, useRef, useState } from "react";
import { create } from "zustand";

import { cn } from "~/lib/utils";
import { threadIconImageFromFile } from "../lib/threadIconImage";
import { readThreadShell } from "../state/entities";
import { threadEnvironment } from "../state/threads";
import { useOrchestrationCommand } from "../state/use-orchestration-command";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { toastManager } from "./ui/toast";
import { Toggle, ToggleGroup } from "./ui/toggle-group";

const RECENT_EMOJI_STORAGE_KEY = "t3code:thread-icon-recent-emojis:v1";

function readRecentEmojis(): string[] {
  try {
    return sanitizeRecentThreadEmojis(
      JSON.parse(window.localStorage.getItem(RECENT_EMOJI_STORAGE_KEY) ?? "[]"),
    );
  } catch {
    return [];
  }
}

function rememberEmoji(emoji: string) {
  try {
    window.localStorage.setItem(
      RECENT_EMOJI_STORAGE_KEY,
      JSON.stringify(pushRecentThreadEmoji(readRecentEmojis(), emoji)),
    );
  } catch {}
}

/** Which thread has the edit dialog open; menus and the thread header both close as they request it. */
const useEditThreadRequest = create<{ threadRef: ScopedThreadRef | null }>(() => ({
  threadRef: null,
}));

export function openEditThreadDialog(threadRef: ScopedThreadRef): void {
  useEditThreadRequest.setState({ threadRef });
}

export function EditThreadDialogHost() {
  const threadRef = useEditThreadRequest((state) => state.threadRef);
  const close = () => useEditThreadRequest.setState({ threadRef: null });
  const thread = threadRef ? readThreadShell(threadRef) : null;
  return (
    <Dialog open={threadRef !== null && thread !== null} onOpenChange={(open) => !open && close()}>
      <DialogPopup className="w-full sm:w-[28rem]">
        {/* The popup mounts per open, so the draft starts from the thread's saved title and icon. */}
        {threadRef && thread ? (
          <EditThreadBody
            key={`${threadRef.environmentId}:${threadRef.threadId}`}
            threadRef={threadRef}
            title={thread.title}
            icon={thread.icon ?? null}
            onClose={close}
          />
        ) : null}
      </DialogPopup>
    </Dialog>
  );
}

function ThreadIconPreview(props: { icon: ThreadIcon | null; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-3xl leading-none",
        props.className,
      )}
    >
      {props.icon?.kind === "emoji" ? (
        <span aria-hidden="true">{props.icon.emoji}</span>
      ) : props.icon?.kind === "image" ? (
        <img src={props.icon.dataUrl} alt="" className="size-full object-cover" />
      ) : (
        <MessageSquareDashedIcon className="size-6 text-muted-foreground" aria-hidden="true" />
      )}
    </span>
  );
}

function EditThreadBody(props: {
  readonly threadRef: ScopedThreadRef;
  readonly title: string;
  readonly icon: ThreadIcon | null;
  readonly onClose: () => void;
}) {
  const nameId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const updateThreadMetadata = useOrchestrationCommand(threadEnvironment.updateMetadata, {
    reportFailure: false,
  });
  const [name, setName] = useState(props.title);
  const [icon, setIcon] = useState<ThreadIcon | null>(props.icon);
  const [mode, setMode] = useState<ThreadIcon["kind"]>(props.icon?.kind ?? "emoji");
  const [query, setQuery] = useState("");
  const [recents] = useState(readRecentEmojis);
  const [imageError, setImageError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const trimmedName = name.trim();
  const titleChanged = trimmedName !== props.title;
  const iconChanged = JSON.stringify(icon) !== JSON.stringify(props.icon);
  const emojis = filterThreadIconEmojis(query);
  const showRecents = query.trim() === "" && recents.length > 0;

  const chooseImage = async (file: File | undefined) => {
    if (!file) return;
    setImageError(null);
    try {
      setIcon({ kind: "image", dataUrl: await threadIconImageFromFile(file) });
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "That image could not be used.");
    }
  };

  const save = async () => {
    if (trimmedName === "" || (!titleChanged && !iconChanged) || saving) return;
    setSaving(true);
    const result = await updateThreadMetadata({
      environmentId: props.threadRef.environmentId,
      input: {
        threadId: props.threadRef.threadId,
        ...(titleChanged ? { title: trimmedName } : {}),
        ...(iconChanged ? { icon } : {}),
      },
    });
    setSaving(false);
    if (result._tag === "Success") {
      if (icon?.kind === "emoji") rememberEmoji(icon.emoji);
      props.onClose();
    } else if (!isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      toastManager.add({
        type: "error",
        title: "Failed to edit thread",
        description: error instanceof Error ? error.message : "An error occurred.",
      });
    }
  };

  const emojiButton = (emoji: string, label: string) => (
    <button
      key={emoji}
      type="button"
      aria-label={label}
      aria-pressed={icon?.kind === "emoji" && icon.emoji === emoji}
      className={cn(
        "flex aspect-square items-center justify-center rounded-md border border-transparent text-xl outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        icon?.kind === "emoji" && icon.emoji === emoji && "border-border bg-accent",
      )}
      onClick={() => setIcon({ kind: "emoji", emoji })}
    >
      {emoji}
    </button>
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit thread</DialogTitle>
        <DialogDescription>Name this thread and choose an emoji or image for it.</DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex min-h-0 flex-col">
        <div className="flex min-h-0 flex-col gap-4">
          <div className="flex items-center gap-4">
            <ThreadIconPreview icon={icon} />
            <div className="min-w-0 flex-1 space-y-1.5">
              <label htmlFor={nameId} className="text-sm font-medium">
                Thread name
              </label>
              <Input
                id={nameId}
                value={name}
                autoComplete="off"
                aria-invalid={trimmedName === ""}
                onChange={(event) => setName(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                  if (event.key === "Enter") void save();
                }}
              />
            </div>
          </div>

          <ToggleGroup
            aria-label="Icon type"
            variant="segmented"
            value={[mode]}
            onValueChange={(next) => {
              const value = next[0];
              if (value === "emoji" || value === "image") setMode(value);
            }}
          >
            <Toggle value="emoji">Emoji</Toggle>
            <Toggle value="image">Image</Toggle>
          </ToggleGroup>

          {mode === "emoji" ? (
            <>
              <Input
                type="search"
                value={query}
                aria-label="Search emoji"
                placeholder="Search emoji"
                onChange={(event) => setQuery(event.currentTarget.value)}
              />
              <ScrollArea scrollFade className="max-h-64">
                <div className="space-y-2 p-0.5">
                  {showRecents ? (
                    <div>
                      <div className="mb-1 text-xs font-medium text-muted-foreground">Recent</div>
                      <div className="grid grid-cols-8 gap-1">
                        {recents.map((emoji) => emojiButton(emoji, `Recent emoji ${emoji}`))}
                      </div>
                    </div>
                  ) : null}
                  <div>
                    {showRecents ? (
                      <div className="mb-1 text-xs font-medium text-muted-foreground">
                        All emoji
                      </div>
                    ) : null}
                    <div className="grid grid-cols-8 gap-1">
                      {emojis.map((entry) => emojiButton(entry.emoji, entry.name))}
                    </div>
                  </div>
                </div>
              </ScrollArea>
              {emojis.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No emoji found.</p>
              ) : null}
            </>
          ) : (
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                aria-label="Icon image file"
                tabIndex={-1}
                onChange={(event) => {
                  void chooseImage(event.currentTarget.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <ImageIcon />
                Choose image…
              </Button>
              <p className="text-xs text-muted-foreground">
                PNG, JPEG or WebP up to 5 MB. It is cropped to a square and shrunk.
              </p>
              {imageError ? (
                <p role="alert" className="text-xs text-destructive-foreground">
                  {imageError}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </DialogPanel>
      <DialogFooter>
        <Button
          variant="ghost"
          className="mr-auto"
          disabled={icon === null}
          onClick={() => setIcon(null)}
        >
          Remove icon
        </Button>
        <Button variant="outline" onClick={props.onClose}>
          Cancel
        </Button>
        <Button
          disabled={trimmedName === "" || (!titleChanged && !iconChanged) || saving}
          onClick={() => void save()}
        >
          Save
        </Button>
      </DialogFooter>
    </>
  );
}
