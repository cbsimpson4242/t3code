import { useAtomSet, useAtomValue } from "@effect/atom-react";
import {
  filterThreadIconEmojis,
  pushRecentThreadEmoji,
} from "@t3tools/client-runtime/state/thread-icon";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import type { ThreadIcon } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { Atom, AsyncResult } from "effect/reactivity";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";

import { SymbolView } from "../../components/ui/AppSymbol";
import { AppText } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";
import * as Dialog from "../../components/ui/Dialog";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { pickThreadIconImage } from "../../lib/threadIconImage";
import { appAtomRegistry } from "../../state/atom-registry";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";

/** The thread whose edit sheet is open; menus request it and the host renders it once. */
const editThreadAtom = Atom.make<EnvironmentThreadShell | null>(null).pipe(Atom.keepAlive);

export function openEditThreadSheet(thread: EnvironmentThreadShell): void {
  appAtomRegistry.set(editThreadAtom, thread);
}

export function EditThreadSheetHost() {
  const thread = useAtomValue(editThreadAtom);
  return thread ? (
    <EditThreadSheet
      key={`${thread.environmentId}:${thread.id}`}
      thread={thread}
      onClose={() => appAtomRegistry.set(editThreadAtom, null)}
    />
  ) : null;
}

function IconPreview(props: { readonly icon: ThreadIcon | null }) {
  return (
    <View className="size-16 items-center justify-center overflow-hidden rounded-full bg-subtle">
      {props.icon?.kind === "emoji" ? (
        <AppText allowFontScaling={false} style={{ fontSize: 34, lineHeight: 42 }}>
          {props.icon.emoji}
        </AppText>
      ) : props.icon?.kind === "image" ? (
        <Image
          source={{ uri: props.icon.dataUrl }}
          cachePolicy="memory"
          accessibilityLabel="Thread icon"
          style={{ width: 64, height: 64 }}
          contentFit="cover"
        />
      ) : (
        <SymbolView name="text.bubble" size={28} tintColorClassName="accent-icon-subtle" />
      )}
    </View>
  );
}

function EditThreadSheet(props: {
  readonly thread: EnvironmentThreadShell;
  readonly onClose: () => void;
}) {
  const { thread } = props;
  const updateThreadMetadata = useAtomCommand(threadEnvironment.updateMetadata, {
    reportFailure: false,
  });
  const preferencesResult = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const recents = AsyncResult.isSuccess(preferencesResult)
    ? (preferencesResult.value.recentThreadEmojis ?? [])
    : [];
  const [name, setName] = useState(thread.title);
  const [icon, setIcon] = useState<ThreadIcon | null>(thread.icon ?? null);
  const [mode, setMode] = useState<ThreadIcon["kind"]>(thread.icon?.kind ?? "emoji");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const trimmedName = name.trim();
  const titleChanged = trimmedName !== thread.title;
  const iconChanged = JSON.stringify(icon) !== JSON.stringify(thread.icon ?? null);
  const emojis = filterThreadIconEmojis(query);
  const showRecents = query.trim() === "" && recents.length > 0;

  const chooseImage = async () => {
    setError(null);
    setBusy(true);
    const picked = await pickThreadIconImage();
    setBusy(false);
    if (picked.kind === "picked") setIcon({ kind: "image", dataUrl: picked.dataUrl });
    else if (picked.kind === "error") setError(picked.message);
  };

  const save = async () => {
    if (trimmedName === "") {
      setError("Thread name cannot be empty.");
      return;
    }
    if (!titleChanged && !iconChanged) {
      props.onClose();
      return;
    }
    setBusy(true);
    const result = await updateThreadMetadata({
      environmentId: thread.environmentId,
      input: {
        threadId: thread.id,
        ...(titleChanged ? { title: trimmedName } : {}),
        ...(iconChanged ? { icon } : {}),
      },
    });
    setBusy(false);
    if (result._tag === "Success") {
      if (icon?.kind === "emoji") {
        const emoji = icon.emoji;
        savePreferences({
          transform: (current) => ({
            recentThreadEmojis: pushRecentThreadEmoji(current.recentThreadEmojis ?? [], emoji),
          }),
        });
      }
      props.onClose();
      return;
    }
    const failure = Cause.squash(result.cause);
    Dialog.alert(
      "Could not edit thread",
      failure instanceof Error && failure.message.trim().length > 0
        ? failure.message
        : "The thread could not be edited.",
    );
  };

  const emojiCell = (emoji: string, label: string) => (
    <Pressable
      key={emoji}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: icon?.kind === "emoji" && icon.emoji === emoji }}
      className={
        icon?.kind === "emoji" && icon.emoji === emoji
          ? "size-11 items-center justify-center rounded-xl bg-subtle-strong"
          : "size-11 items-center justify-center rounded-xl active:bg-subtle"
      }
      onPress={() => setIcon({ kind: "emoji", emoji })}
    >
      <AppText allowFontScaling={false} style={{ fontSize: 26, lineHeight: 32 }}>
        {emoji}
      </AppText>
    </Pressable>
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={props.onClose}>
      <KeyboardAvoidingView
        className="flex-1 items-center justify-center bg-backdrop px-6"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          className="max-h-[85%] w-full max-w-md grow-0 rounded-3xl bg-screen"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 24, gap: 16 }}
        >
          <AppText accessibilityRole="header" className="text-xl font-t3-semibold">
            Edit thread
          </AppText>
          <View className="flex-row items-center gap-4">
            <IconPreview icon={icon} />
            <TextInput
              accessibilityLabel="Thread name"
              className="min-h-12 flex-1 rounded-xl bg-subtle px-3 text-base text-foreground"
              value={name}
              onChangeText={(value) => {
                setName(value);
                setError(null);
              }}
              autoCorrect={false}
              returnKeyType="done"
            />
          </View>
          <SegmentedControl
            options={
              [
                { value: "emoji", label: "Emoji" },
                { value: "image", label: "Image" },
              ] as const
            }
            selected={mode}
            onSelect={setMode}
            role="tab"
          />
          {mode === "emoji" ? (
            <View className="gap-3">
              <TextInput
                accessibilityLabel="Search emoji"
                placeholder="Search emoji"
                className="min-h-12 rounded-xl bg-subtle px-3 text-base text-foreground"
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
                autoCapitalize="none"
              />
              {showRecents ? (
                <View className="gap-1">
                  <AppText className="text-sm text-foreground-muted">Recent</AppText>
                  <View className="flex-row flex-wrap">
                    {recents.map((emoji) => emojiCell(emoji, `Recent emoji ${emoji}`))}
                  </View>
                </View>
              ) : null}
              <ScrollView style={{ maxHeight: 240 }} nestedScrollEnabled>
                <View className="flex-row flex-wrap">
                  {emojis.map((entry) => emojiCell(entry.emoji, entry.name))}
                </View>
                {emojis.length === 0 ? (
                  <AppText className="py-4 text-center text-foreground-muted">
                    No emoji found.
                  </AppText>
                ) : null}
              </ScrollView>
            </View>
          ) : (
            <View className="gap-2">
              <Button
                label="Choose image…"
                icon="photo"
                loading={busy}
                onPress={() => void chooseImage()}
              />
              <AppText className="text-sm text-foreground-muted">
                PNG, JPEG or WebP up to 5 MB. It is cropped to a square and shrunk.
              </AppText>
            </View>
          )}
          {error ? (
            <AppText accessibilityRole="alert" className="text-sm text-danger-foreground">
              {error}
            </AppText>
          ) : null}
          <View className="flex-row items-center justify-between gap-2">
            <Button
              label="Remove icon"
              tone="text"
              size="compact"
              disabled={icon === null}
              onPress={() => setIcon(null)}
            />
            <View className="flex-row gap-2">
              <Button label="Cancel" tone="text" size="compact" onPress={props.onClose} />
              <Button
                label="Save"
                tone="primary"
                size="compact"
                loading={busy}
                onPress={() => void save()}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
