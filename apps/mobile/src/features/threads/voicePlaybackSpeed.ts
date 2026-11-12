import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useSyncExternalStore } from "react";
import { resolveVoicePlaybackSpeed, type VoicePlaybackSpeed } from "@t3tools/shared/voicePlayback";
const KEY = "t3code.voicePlaybackSpeed";
let speed: VoicePlaybackSpeed = 1;
let hydration: Promise<void> | null = null;
let revision = 0;
let saving = Promise.resolve();
const listeners = new Set<() => void>();
function emit() {
  for (const listener of listeners) listener();
}
function hydrate() {
  if (!hydration) {
    const started = revision;
    hydration = AsyncStorage.getItem(KEY)
      .then((value) => {
        if (revision === started) {
          speed = resolveVoicePlaybackSpeed(value === null ? 1 : Number(value));
          emit();
        }
      })
      .catch(() => {});
  }
  return hydration;
}
function save(value: VoicePlaybackSpeed) {
  revision++;
  speed = resolveVoicePlaybackSpeed(value);
  emit();
  saving = saving.then(() => AsyncStorage.setItem(KEY, String(value))).catch(() => {});
}
export function useVoicePlaybackSpeed(): readonly [
  VoicePlaybackSpeed,
  (speed: VoicePlaybackSpeed) => void,
] {
  useEffect(() => {
    void hydrate();
  }, []);
  const value = useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
    () => speed,
    () => 1 as VoicePlaybackSpeed,
  );
  return [value, save] as const;
}
