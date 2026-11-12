import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useAudioPlayerStatus } from "expo-audio";
import { resolveSeekRatio, VOICE_PLAYBACK_SPEEDS } from "@t3tools/shared/voicePlayback";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";
import { AppText as Text } from "../../components/ui/AppText";
import { SymbolView } from "../../components/ui/AppSymbol";
import { useCSSVariable as useThemeColor } from "uniwind";
import { useAssetUrlState } from "../../state/assets";
import { createAudioPlaybackSession } from "../../lib/audioSession";
import { usePlaybackAudioPlayer } from "../voice-input/usePlaybackAudioPlayer";
import { useVoicePlaybackSpeed } from "./voicePlaybackSpeed";
function formatAudioTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export function VoiceMessagePlayer(props: {
  readonly id: string;
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly path: string;
  readonly onPlaybackStart?: () => void;
}) {
  const [revision, setRevision] = useState(0);
  const asset = useAssetUrlState(
    props.environmentId,
    { _tag: "media-file", threadId: props.threadId, path: props.path },
    String(revision),
  );
  const uri = asset._tag === "Success" ? asset.url : null;
  const player = usePlaybackAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const [requested, setRequested] = useState(false);
  const playback = useMemo(() => createAudioPlaybackSession(player, false, setRequested), [player]);
  const [failed, setFailed] = useState(false);
  const [speed, saveSpeed] = useVoicePlaybackSpeed();
  const [progressWidth, setProgressWidth] = useState(0);
  const [scrubRatio, setScrubRatio] = useState<number | null>(null);
  const iconColor = useThemeColor("--color-icon");
  const progressTrackColor = useThemeColor("--color-border");
  const progressFillColor = useThemeColor("--color-foreground");
  useEffect(() => {
    if (status.isLoaded) player.setPlaybackRate(speed, "medium");
  }, [player, speed, status.isLoaded]);
  useEffect(() => {
    if (status.didJustFinish || status.error) playback.pause();
    else playback.playingChanged(status.playing);
  }, [playback, status.didJustFinish, status.error, status.playing]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") playback.pause();
    });
    return () => {
      sub.remove();
      playback.pause();
    };
  }, [playback]);
  const onTogglePlayback = useCallback(() => {
    if (!status.isLoaded) return;
    if (status.playing || playback.requested) {
      playback.pause();
      return;
    }
    setFailed(false);
    props.onPlaybackStart?.();
    void playback
      .play(
        status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration)
          ? () => player.seekTo(0)
          : undefined,
      )
      .catch(() => setFailed(true));
  }, [
    status.isLoaded,
    status.playing,
    status.didJustFinish,
    status.duration,
    status.currentTime,
    playback,
    player,
    props.onPlaybackStart,
  ]);
  const onProgressLayout = useCallback((event: LayoutChangeEvent) => {
    setProgressWidth(event.nativeEvent.layout.width);
  }, []);

  const updateScrubPosition = useCallback(
    (event: GestureResponderEvent) => {
      setScrubRatio(resolveSeekRatio(event.nativeEvent.locationX, progressWidth));
    },
    [progressWidth],
  );

  const finishScrubbing = useCallback(
    (event: GestureResponderEvent) => {
      const ratio = resolveSeekRatio(event.nativeEvent.locationX, progressWidth);
      setScrubRatio(null);
      if (!status.isLoaded || status.duration <= 0) return;
      void player.seekTo(status.duration * ratio).catch(() => {
        setFailed(true);
        playback.pause();
      });
    },
    [player, progressWidth, status.duration, status.isLoaded],
  );

  const progress =
    scrubRatio ?? (status.duration > 0 ? Math.min(1, status.currentTime / status.duration) : 0);
  const displayedTime = scrubRatio === null ? status.currentTime : status.duration * scrubRatio;

  if (uri === null) {
    return (
      <View className="mt-2 min-h-20 items-center justify-center rounded-[18px] border border-neutral-200 bg-neutral-100 dark:border-white/10 dark:bg-white/[0.06]">
        {asset._tag === "Failure" ? <Text>Voice message unavailable</Text> : <ActivityIndicator />}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry voice message"
          onPress={() => {
            setFailed(false);
            setRevision((v) => v + 1);
          }}
        >
          <Text>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="mt-2 gap-1 rounded-xl border border-border bg-card p-2">
      <View className="flex-row items-center gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            status.playing || requested ? "Pause voice message" : "Play voice message"
          }
          disabled={!status.isLoaded || failed || Boolean(status.error)}
          onPress={onTogglePlayback}
          className="h-11 w-11 items-center justify-center rounded-full bg-white dark:bg-white/10"
        >
          {status.isBuffering && !status.playing ? (
            <ActivityIndicator size="small" />
          ) : (
            <SymbolView
              name={status.playing ? "pause" : "play"}
              size={18}
              tintColor={iconColor}
              type="monochrome"
            />
          )}
        </Pressable>

        <View className="min-w-0 flex-1 gap-1.5">
          <View
            accessibilityRole="adjustable"
            accessibilityLabel="Voice message playback position"
            accessibilityValue={{ min: 0, max: status.duration, now: status.currentTime }}
            accessibilityActions={[
              { name: "increment", label: "Forward five seconds" },
              { name: "decrement", label: "Back five seconds" },
            ]}
            onAccessibilityAction={(event) => {
              const delta = event.nativeEvent.actionName === "increment" ? 5 : -5;
              void player
                .seekTo(Math.max(0, Math.min(status.duration, status.currentTime + delta)))
                .catch(() => setFailed(true));
            }}
            onLayout={onProgressLayout}
            onStartShouldSetResponder={() => status.isLoaded && status.duration > 0}
            onMoveShouldSetResponder={() => status.isLoaded && status.duration > 0}
            onResponderGrant={updateScrubPosition}
            onResponderMove={updateScrubPosition}
            onResponderRelease={finishScrubbing}
            onResponderTerminate={() => setScrubRatio(null)}
            className="h-7 justify-center"
          >
            <View
              className="h-1.5 overflow-hidden rounded-full"
              style={{ backgroundColor: progressTrackColor }}
            >
              <View
                className="h-full rounded-full"
                style={{ backgroundColor: progressFillColor, width: `${progress * 100}%` }}
              />
            </View>
            <View
              pointerEvents="none"
              className="absolute h-3 w-3 rounded-full"
              style={{
                backgroundColor: progressFillColor,
                left: `${progress * 100}%`,
                marginLeft: -6,
              }}
            />
          </View>
          <View className="flex-row items-center justify-between">
            <Text className="font-t3-medium text-[11px] tabular-nums text-foreground-muted">
              {formatAudioTime(displayedTime)}
            </Text>
            <Text className="font-t3-medium text-[11px] tabular-nums text-foreground-muted">
              {status.error || failed ? "Unavailable" : formatAudioTime(status.duration)}
            </Text>
          </View>
        </View>
      </View>

      {failed || status.error ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry voice message"
          onPress={() => {
            setFailed(false);
            setRevision((v) => v + 1);
          }}
        >
          <Text>Try again</Text>
        </Pressable>
      ) : null}
      <View className="flex-row flex-wrap items-center gap-1.5">
        {VOICE_PLAYBACK_SPEEDS.map((option) => {
          const selected = option === speed;
          return (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityLabel={`Set voice playback speed to ${option} times`}
              accessibilityState={{ selected }}
              onPress={() => saveSpeed(option)}
              className={
                selected
                  ? "min-h-11 min-w-10 items-center justify-center rounded-full bg-foreground px-1.5"
                  : "min-h-11 min-w-10 items-center justify-center rounded-full px-1.5"
              }
            >
              <Text
                className={
                  selected
                    ? "font-t3-bold text-[11px] text-screen"
                    : "font-t3-bold text-[11px] text-foreground-muted"
                }
              >
                {option}×
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
