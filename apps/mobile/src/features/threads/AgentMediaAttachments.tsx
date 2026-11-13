import { formatAttachmentSize } from "@t3tools/client-runtime/state/attachments";
import type { AssetResource, EnvironmentId, ThreadId } from "@t3tools/contracts";
import { audioMimeTypeFromExtension } from "@t3tools/shared/mediaPreview";
import { videoMimeType } from "@t3tools/shared/video";
import {
  agentMediaFileName,
  agentMediaSizeFromRevision,
  type AgentMediaItem,
} from "@t3tools/shared/voiceMessage";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, View } from "react-native";

import { PierreEntryIcon } from "../../components/PierreEntryIcon";
import type { FilePreviewSource } from "../../components/FilePreviewModal";
import { AppActivityIndicator } from "../../components/ui/AppActivityIndicator";
import { SymbolView } from "../../components/ui/AppSymbol";
import { AppText as Text } from "../../components/ui/AppText";
import * as Dialog from "../../components/ui/Dialog";
import { agentMediaMimeType } from "../../lib/agentMediaMimeType";
import {
  downloadAndShareAttachment,
  nativeViewerErrorMessage,
  openAttachmentInViewer,
  saveAttachmentToDownloads,
} from "../../lib/attachmentDownload";
import { useRefreshAssetUrl, useAssetUrlState } from "../../state/assets";
import { ThreadInlineFilePreview } from "./ThreadInlineFilePreview";
import { ThreadMarkdownImage } from "./ThreadMarkdownImage";
import { ThreadMarkdownVideo } from "./ThreadMarkdownVideo";
import { VoiceMessagePlayer } from "./VoiceMessagePlayer";

type MediaFileResource = Extract<AssetResource, { readonly _tag: "media-file" }>;
type FileAction = "open" | "save" | "share";

function AgentFileCard(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly item: AgentMediaItem;
}) {
  const { environmentId, item } = props;
  const name = agentMediaFileName(item.path);
  const mimeType = agentMediaMimeType(item.path);
  // Only a download may name any file type; the inline route serves just previewable ones.
  const resource = useMemo<MediaFileResource>(
    () => ({
      _tag: "media-file",
      threadId: props.threadId,
      path: item.path,
      disposition: "attachment",
    }),
    [props.threadId, item.path],
  );
  const [revision, setRevision] = useState(0);
  const asset = useAssetUrlState(environmentId, resource, String(revision));
  const refresh = useRefreshAssetUrl(environmentId, resource);
  const controller = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState<FileAction | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- aborts an in-flight download when the card unmounts
  useEffect(() => () => controller.current?.abort(), []);

  const size = asset._tag === "Success" ? agentMediaSizeFromRevision(asset.fileRevision) : null;
  const unavailable = asset._tag === "Failure";
  const detail = unavailable
    ? asset.reason === "disconnected"
      ? "Reconnect to load this file"
      : "File not found or unavailable"
    : asset._tag === "Loading"
      ? "Preparing…"
      : size === null
        ? "Ready"
        : formatAttachmentSize(size);

  const run = (action: FileAction) => {
    if (controller.current) return;
    const request = new AbortController();
    controller.current = request;
    setBusy(action);
    void (async () => {
      // A file may have been replaced on disk since the card first signed its URL.
      const url = await refresh();
      if (url === null) throw new Error("The file could not be loaded. Reconnect and try again.");
      const input = { url, attachment: { name, mimeType }, signal: request.signal };
      if (action === "share") await downloadAndShareAttachment(input);
      else if (action === "open") await openAttachmentInViewer({ ...input, uri: url });
      else {
        const saved = await saveAttachmentToDownloads(input);
        if (saved !== "cancelled" && !request.signal.aborted) {
          Dialog.alert(
            "Saved",
            saved === "downloads" ? `${name} is in your Downloads folder.` : `${name} was saved.`,
          );
        }
      }
    })()
      .catch((cause: unknown) => {
        if (request.signal.aborted) return;
        Dialog.alert(
          action === "open" ? "Could not open file" : "Could not save file",
          action === "open"
            ? nativeViewerErrorMessage(cause)
            : cause instanceof Error
              ? cause.message
              : "Try again.",
        );
      })
      .finally(() => {
        if (controller.current === request) {
          controller.current = null;
          if (!request.signal.aborted) setBusy(null);
        }
      });
  };

  const disabled = asset._tag !== "Success" || busy !== null;
  return (
    <View
      testID="agent-file-attachment"
      className="mt-2 min-w-0 overflow-hidden rounded-xl border border-border bg-card"
      style={{ width: 300, maxWidth: "100%" }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${name}`}
        accessibilityValue={{ text: detail }}
        accessibilityState={{ disabled, busy: busy === "open" }}
        disabled={disabled}
        className="min-w-0 flex-row items-center gap-3 p-3 active:bg-subtle"
        onPress={() => run("open")}
      >
        <View className="h-12 w-10 shrink-0 items-center justify-center rounded-lg bg-subtle">
          {busy === "open" ? (
            <AppActivityIndicator size="small" />
          ) : (
            <PierreEntryIcon path={name} kind="file" size={26} />
          )}
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <Text className="font-t3-medium text-sm text-foreground" numberOfLines={2}>
            {name}
          </Text>
          <Text
            accessibilityRole={unavailable ? "alert" : undefined}
            className="text-xs text-foreground-muted"
            numberOfLines={1}
          >
            {detail}
          </Text>
        </View>
      </Pressable>
      <View className="flex-row border-t border-border">
        {unavailable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Retry ${name}`}
            className="min-h-11 flex-1 flex-row items-center justify-center gap-1.5 active:bg-subtle"
            onPress={() => setRevision((value) => value + 1)}
          >
            <SymbolView name="arrow.clockwise" size={14} tintColorClassName="accent-foreground" />
            <Text className="font-t3-medium text-sm text-foreground">Retry</Text>
          </Pressable>
        ) : (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save attachment to Downloads"
              accessibilityState={{ disabled, busy: busy === "save" }}
              disabled={disabled}
              className="min-h-11 flex-1 flex-row items-center justify-center gap-1.5 active:bg-subtle disabled:opacity-40"
              onPress={() => run("save")}
            >
              {busy === "save" ? (
                <AppActivityIndicator size="small" />
              ) : (
                <SymbolView name="arrow.down" size={14} tintColorClassName="accent-foreground" />
              )}
              <Text className="font-t3-medium text-sm text-foreground">Save</Text>
            </Pressable>
            <View className="w-px bg-border" />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Share attachment"
              accessibilityState={{ disabled, busy: busy === "share" }}
              disabled={disabled}
              className="min-h-11 flex-1 flex-row items-center justify-center gap-1.5 active:bg-subtle disabled:opacity-40"
              onPress={() => run("share")}
            >
              {busy === "share" ? (
                <AppActivityIndicator size="small" />
              ) : (
                <SymbolView
                  name="square.and.arrow.up"
                  size={14}
                  tintColorClassName="accent-foreground"
                />
              )}
              <Text className="font-t3-medium text-sm text-foreground">Share</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

/** What an agent's `MEDIA:` tags deliver: voice and audio players, inline images and video, file cards. */
export function AgentMediaAttachments(props: {
  readonly messageId: string;
  readonly items: ReadonlyArray<AgentMediaItem>;
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly onPressPreview: (source: FilePreviewSource) => void;
  readonly onPlaybackStart: () => void;
}) {
  const { environmentId, threadId } = props;
  return props.items.map((item, index) => {
    const name = agentMediaFileName(item.path);
    const resource: MediaFileResource = { _tag: "media-file", threadId, path: item.path };
    switch (item.kind) {
      case "voice":
        return (
          <VoiceMessagePlayer
            key={item.path}
            id={`${environmentId}:${props.messageId}:${index}`}
            environmentId={environmentId}
            threadId={threadId}
            path={item.path}
            onPlaybackStart={props.onPlaybackStart}
          />
        );
      case "image":
        return (
          <View key={item.path} className="mt-2">
            <ThreadMarkdownImage
              environmentId={environmentId}
              resource={resource}
              alt={name}
              onPressPreview={props.onPressPreview}
            />
          </View>
        );
      case "video":
        return (
          <View key={item.path} className="mt-2" style={{ width: 320, maxWidth: "100%" }}>
            <ThreadMarkdownVideo
              source={{
                type: "media",
                name,
                mimeType: videoMimeType({ name, mimeType: "" }) ?? "video/mp4",
                environmentId,
                resource,
              }}
              onPlaybackStart={props.onPlaybackStart}
            />
          </View>
        );
      case "audio": {
        const source: FilePreviewSource = {
          kind: "document",
          name,
          mimeType: audioMimeTypeFromExtension(name.slice(name.lastIndexOf("."))) ?? "audio/mpeg",
          environmentId,
          resource,
        };
        return (
          <ThreadInlineFilePreview
            key={item.path}
            source={source}
            onOpen={() => props.onPressPreview(source)}
            onPlaybackStart={props.onPlaybackStart}
          />
        );
      }
      case "file":
        return (
          <AgentFileCard
            key={item.path}
            environmentId={environmentId}
            threadId={threadId}
            item={item}
          />
        );
    }
  });
}
