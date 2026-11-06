export interface ParsedVoiceMessageContent {
  readonly text: string;
  readonly audioPaths: ReadonlyArray<string>;
}
const AUDIO_PATH = /^(?:\/|[A-Za-z]:[\\/])[^\r\n]+\.(?:aac|flac|webm|mp3|m4a|ogg|opus|wav)$/i;
/** Recognize only standalone agent delivery directives, never fenced examples. */
export function parseVoiceMessageContent(text: string): ParsedVoiceMessageContent {
  const lines = text.split(/\r?\n/);
  const visible: string[] = [];
  const paths: string[] = [];
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const boundary = line.match(/^\s*(`{3,}|~{3,})/);
    if (boundary) {
      const marker = boundary[1]!;
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      visible.push(line);
      continue;
    }
    if (fence === null) {
      const same = line.match(/^\s*\[\[audio_as_voice\]\]\s*MEDIA:(.+?)\s*$/);
      const next = /^\s*\[\[audio_as_voice\]\]\s*$/.test(line)
        ? lines[i + 1]?.match(/^\s*MEDIA:(.+?)\s*$/)
        : null;
      const path = (same?.[1] ?? next?.[1])?.trim();
      if (path && AUDIO_PATH.test(path) && !path.includes("\0")) {
        paths.push(path);
        if (next) i++;
        continue;
      }
    }
    visible.push(line);
  }
  return { text: paths.length ? visible.join("\n").trim() : text, audioPaths: [...new Set(paths)] };
}
