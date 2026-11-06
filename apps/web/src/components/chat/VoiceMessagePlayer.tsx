import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import {
  ExclusiveVoicePlaybackCoordinator,
  resolveSeekRatio,
  resolveVoicePlaybackSpeed,
  VOICE_PLAYBACK_SPEEDS,
  type VoicePlaybackSpeed,
} from "@t3tools/shared/voicePlayback";
import { PauseIcon, PlayIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import { useAssetUrlState } from "~/assets/assetUrls";
import { cn } from "~/lib/utils";

const voicePlaybackCoordinator = new ExclusiveVoicePlaybackCoordinator();

function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const wholeSeconds = Math.floor(seconds);
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}

export function VoiceMessagePlayer(props: {
  readonly id: string;
  readonly environmentId: EnvironmentId;
  readonly path: string;
  readonly threadId: ThreadId;
}) {
  const assetUrl = useAssetUrlState(props.environmentId, {
    _tag: "media-file",
    threadId: props.threadId,
    path: props.path,
  });
  const [speed, setSpeed] = useState<VoicePlaybackSpeed>(() => {
    try {
      return resolveVoicePlaybackSpeed(Number(localStorage.getItem("t3.voicePlaybackSpeed")));
    } catch {
      return 1;
    }
  });
  const updateClientSettings = ({
    voicePlaybackSpeed,
  }: {
    voicePlaybackSpeed: VoicePlaybackSpeed;
  }) => {
    setSpeed(voicePlaybackSpeed);
    try {
      localStorage.setItem("t3.voicePlaybackSpeed", String(voicePlaybackSpeed));
    } catch {
      /* Playback still works without storage. */
    }
  };
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [failed, setFailed] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const audioUrl = assetUrl._tag === "Success" ? assetUrl.url : undefined;

  const syncMediaState = useCallback((audio: HTMLAudioElement) => {
    setDuration(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0);
    setCurrentTime(Number.isFinite(audio.currentTime) ? Math.max(0, audio.currentTime) : 0);
  }, []);

  useEffect(
    () =>
      (() => {
        const unregister = voicePlaybackCoordinator.register(props.id, () =>
          audioRef.current?.pause(),
        );
        return () => {
          audioRef.current?.pause();
          unregister();
        };
      })(),
    [props.id],
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = speed;
  }, [speed, audioUrl]);

  const seekToRatio = useCallback((ratio: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    const nextTime = audio.duration * ratio;
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }, []);

  const seekFromPointer = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      seekToRatio(resolveSeekRatio(event.clientX - bounds.left, bounds.width));
    },
    [seekToRatio],
  );

  const onTogglePlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || failed) return;
    if (!audio.paused) {
      voicePlaybackCoordinator.deactivate(props.id);
      audio.pause();
      return;
    }
    if (audio.ended || (audio.duration > 0 && audio.currentTime >= audio.duration)) {
      audio.currentTime = 0;
    }
    const claim = voicePlaybackCoordinator.activate(props.id);
    setBuffering(true);
    void audio.play().catch(() => {
      if (voicePlaybackCoordinator.isCurrent(claim)) {
        voicePlaybackCoordinator.deactivate(props.id);
        setBuffering(false);
        setFailed(true);
      }
    });
  }, [failed, props.id]);

  const onProgressKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 5 : -5;
    const nextTime = Math.max(0, Math.min(audio.duration, audio.currentTime + delta));
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }, []);

  const progress = duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0;
  const unavailable = failed || assetUrl._tag === "Failure";
  const canSeek = !unavailable && duration > 0;

  return (
    <div
      data-testid="voice-message-player"
      className="mt-2 rounded-xl border border-border/70 bg-muted/35 p-3"
    >
      {assetUrl._tag === "Success" ? (
        <audio
          ref={audioRef}
          preload="auto"
          src={assetUrl.url}
          onLoadedMetadata={(event) => {
            event.currentTarget.playbackRate = speed;
            syncMediaState(event.currentTarget);
          }}
          onDurationChange={(event) => syncMediaState(event.currentTarget)}
          onTimeUpdate={(event) => syncMediaState(event.currentTarget)}
          onProgress={(event) => syncMediaState(event.currentTarget)}
          onSeeked={(event) => syncMediaState(event.currentTarget)}
          onPlay={() => setPlaying(true)}
          onPlaying={() => setBuffering(false)}
          onWaiting={() => setBuffering(true)}
          onPause={() => {
            voicePlaybackCoordinator.deactivate(props.id);
            setPlaying(false);
            setBuffering(false);
          }}
          onEnded={() => {
            voicePlaybackCoordinator.deactivate(props.id);
            setPlaying(false);
            setBuffering(false);
          }}
          onError={() => {
            voicePlaybackCoordinator.deactivate(props.id);
            setBuffering(false);
            setFailed(true);
          }}
          className="hidden"
        />
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={playing ? "Pause voice message" : "Play voice message"}
          disabled={assetUrl._tag !== "Success" || unavailable}
          onClick={onTogglePlayback}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
        >
          {playing ? (
            <PauseIcon className="size-4 fill-current" />
          ) : (
            <PlayIcon className="size-4 fill-current" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div
            role="slider"
            tabIndex={canSeek ? 0 : -1}
            aria-label="Voice message playback position"
            aria-disabled={!canSeek}
            aria-valuemin={0}
            aria-valuemax={Math.max(0, duration)}
            aria-valuenow={Math.max(0, currentTime)}
            onKeyDown={onProgressKeyDown}
            onPointerDown={(event) => {
              if (!canSeek) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              seekFromPointer(event);
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) seekFromPointer(event);
            }}
            onPointerUp={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
              seekFromPointer(event);
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
            className="relative flex h-7 cursor-pointer touch-none items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-foreground"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <span
              aria-hidden="true"
              className="absolute size-3 -translate-x-1/2 rounded-full bg-foreground"
              style={{ left: `${progress * 100}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs tabular-nums text-muted-foreground">
            <span>{formatAudioTime(currentTime)}</span>
            <span>
              {unavailable
                ? "Unavailable"
                : buffering
                  ? "Buffering…"
                  : assetUrl._tag === "Loading" || duration === 0
                    ? "Loading…"
                    : formatAudioTime(duration)}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Playback speed">
        {VOICE_PLAYBACK_SPEEDS.map((option) => {
          const selected = option === speed;
          return (
            <button
              key={option}
              type="button"
              aria-label={`Set voice playback speed to ${option} times`}
              aria-pressed={selected}
              onClick={() =>
                updateClientSettings({ voicePlaybackSpeed: option as VoicePlaybackSpeed })
              }
              className={cn(
                "min-h-7 min-w-11 rounded-full px-2 text-xs font-semibold",
                selected
                  ? "bg-foreground text-background"
                  : "bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              {option}×
            </button>
          );
        })}
      </div>
    </div>
  );
}
