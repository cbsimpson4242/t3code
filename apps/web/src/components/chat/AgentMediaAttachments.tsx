import { MISSING_FILE_ACCESS_MESSAGE } from "@t3tools/client-runtime/state/assets";
import { formatAttachmentSize } from "@t3tools/client-runtime/state/attachments";
import type { AssetResource, EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { filePreviewKind } from "@t3tools/shared/filePreview";
import {
  agentMediaFileName,
  agentMediaSizeFromRevision,
  type AgentMediaItem,
} from "@t3tools/shared/voiceMessage";
import { DownloadIcon, EyeIcon, RotateCwIcon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";

import { useAssetUrlRefresh, useAssetUrlState } from "~/assets/assetUrls";
import { useRightPanelStore } from "~/rightPanelStore";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import { ChatMarkdownAssetImage } from "./ChatMarkdownMedia";
import type { ExpandedImagePreview } from "./ExpandedImagePreview";
import { PierreEntryIcon } from "./PierreEntryIcon";
import { VoiceMessagePlayer } from "./VoiceMessagePlayer";

type MediaFileResource = Extract<AssetResource, { readonly _tag: "media-file" }>;

const CARD_CLASS_NAME = "mt-2 max-w-md rounded-xl border border-border/70 bg-muted/35 p-3";

function mediaResource(
  threadId: ScopedThreadRef["threadId"],
  path: string,
  disposition?: "attachment",
): MediaFileResource {
  return disposition
    ? { _tag: "media-file", threadId, path, disposition }
    : { _tag: "media-file", threadId, path };
}

function unavailableMessage(asset: { readonly reason?: "missing-file-access" }): string {
  return asset.reason === "missing-file-access"
    ? MISSING_FILE_ACCESS_MESSAGE
    : "File not found or unavailable";
}

/** Blob downloads keep the desktop app's custom scheme from navigating to an external browser. */
async function saveFromUrl(url: string, name: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("The file could not be loaded. Try again.");
  const downloadUrl = URL.createObjectURL(await response.blob());
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 30_000);
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = name;
  anchor.click();
}

function AgentAudioAttachment(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ScopedThreadRef["threadId"];
  readonly item: AgentMediaItem;
  readonly theme: "light" | "dark";
}) {
  const name = agentMediaFileName(props.item.path);
  const resource = mediaResource(props.threadId, props.item.path);
  const asset = useAssetUrlState(props.environmentId, resource);
  const [failed, setFailed] = useState(false);
  const unavailable = failed || asset._tag === "Failure";
  return (
    <div data-testid="agent-audio-attachment" className={CARD_CLASS_NAME}>
      <div className="flex items-center gap-2 text-sm font-medium">
        <PierreEntryIcon pathValue={name} kind="file" theme={props.theme} />
        <span className="min-w-0 truncate">{name}</span>
      </div>
      {unavailable ? (
        <p role="alert" className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <TriangleAlertIcon aria-hidden className="size-3.5 shrink-0" />
          {asset._tag === "Failure" ? unavailableMessage(asset) : "Audio unavailable"}
        </p>
      ) : asset._tag === "Success" ? (
        <audio
          controls
          preload="metadata"
          src={asset.url}
          aria-label={name}
          className="mt-2 w-full"
          onError={() => setFailed(true)}
        />
      ) : (
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          Loading…
        </p>
      )}
    </div>
  );
}

function AgentFileCard(props: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef;
  readonly item: AgentMediaItem;
  readonly theme: "light" | "dark";
}) {
  const { environmentId, threadRef, item } = props;
  const name = agentMediaFileName(item.path);
  // Only a download may name any file type; the inline route serves just previewable ones.
  const resource = mediaResource(threadRef.threadId, item.path, "attachment");
  const [revision, setRevision] = useState(0);
  const asset = useAssetUrlState(environmentId, resource, String(revision));
  const refresh = useAssetUrlRefresh(environmentId, resource);
  const [saving, setSaving] = useState(false);
  const size = asset._tag === "Success" ? agentMediaSizeFromRevision(asset.fileRevision) : null;
  const canPreview = filePreviewKind({ name }) !== "unsupported";

  const download = () => {
    setSaving(true);
    void (async () => {
      const url = await refresh();
      if (!url) throw new Error("Reconnect to the environment and try again.");
      await saveFromUrl(url, name);
    })()
      .catch((cause: unknown) => {
        toastManager.add({
          type: "error",
          title: "Could not download file",
          description: cause instanceof Error ? cause.message : "Please try again.",
        });
      })
      .finally(() => setSaving(false));
  };

  return (
    <div data-testid="agent-file-attachment" className={CARD_CLASS_NAME}>
      <div className="flex items-center gap-3">
        <PierreEntryIcon
          pathValue={name}
          kind="file"
          theme={props.theme}
          className="size-6 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{name}</p>
          <p
            role={asset._tag === "Failure" ? "alert" : "status"}
            className="truncate text-xs text-muted-foreground"
          >
            {asset._tag === "Failure"
              ? unavailableMessage(asset)
              : asset._tag === "Loading"
                ? "Preparing…"
                : size === null
                  ? "Ready to download"
                  : formatAttachmentSize(size)}
          </p>
        </div>
        {asset._tag === "Failure" ? (
          <Button
            variant="outline"
            size="xs"
            aria-label={`Retry ${name}`}
            onClick={() => setRevision((value) => value + 1)}
          >
            <RotateCwIcon />
            Retry
          </Button>
        ) : (
          <div className="flex shrink-0 items-center gap-1.5">
            {canPreview ? (
              <Button
                variant="outline"
                size="xs"
                aria-label={`Preview ${name}`}
                onClick={() =>
                  useRightPanelStore
                    .getState()
                    .openFile(
                      threadRef,
                      /^[A-Za-z]:\\/.test(item.path) ? item.path.replaceAll("\\", "/") : item.path,
                    )
                }
              >
                <EyeIcon />
                Preview
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="xs"
              aria-label={`Download ${name}`}
              disabled={asset._tag !== "Success" || saving}
              onClick={download}
            >
              <DownloadIcon />
              {saving ? "Preparing…" : "Download"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** What an agent's `MEDIA:` tags deliver: voice and audio players, inline images and video, file cards. */
export function AgentMediaAttachments(props: {
  readonly messageId: string;
  readonly items: ReadonlyArray<AgentMediaItem>;
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef;
  readonly theme: "light" | "dark";
  readonly onImageExpand?: ((preview: ExpandedImagePreview) => void) | undefined;
}) {
  return props.items.map((item, index) => {
    switch (item.kind) {
      case "voice":
        return (
          <VoiceMessagePlayer
            key={item.path}
            id={`${props.environmentId}:${props.messageId}:${index}`}
            environmentId={props.environmentId}
            threadId={props.threadRef.threadId}
            path={item.path}
          />
        );
      case "image":
      case "video":
        return (
          <div key={item.path} className="mt-2">
            <ChatMarkdownAssetImage
              environmentId={props.environmentId}
              resource={mediaResource(props.threadRef.threadId, item.path)}
              kind={item.kind}
              alt={agentMediaFileName(item.path)}
              onImageExpand={props.onImageExpand}
            />
          </div>
        );
      case "audio":
        return (
          <AgentAudioAttachment
            key={item.path}
            environmentId={props.environmentId}
            threadId={props.threadRef.threadId}
            item={item}
            theme={props.theme}
          />
        );
      case "file":
        return (
          <AgentFileCard
            key={item.path}
            environmentId={props.environmentId}
            threadRef={props.threadRef}
            item={item}
            theme={props.theme}
          />
        );
    }
  });
}
