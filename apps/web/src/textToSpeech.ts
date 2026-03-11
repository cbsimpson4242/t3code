import type { ChatMessage } from "./types";

const FENCED_CODE_BLOCK_PATTERN = /(^|\n)```[\s\S]*?```(?=\n|$)/g;
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/g;
const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)]+)\)/g;
const INLINE_CODE_PATTERN = /`([^`]+)`/g;
const HEADING_PATTERN = /^\s{0,3}#{1,6}\s+/gm;
const BLOCKQUOTE_PATTERN = /^\s{0,3}>\s?/gm;
const UNORDERED_LIST_PATTERN = /^\s*[-+*]\s+/gm;
const ORDERED_LIST_PATTERN = /^\s*\d+\.\s+/gm;
const RULE_PATTERN = /^\s*([-*_]\s*){3,}$/gm;
const TABLE_SEPARATOR_PATTERN = /^\s*[:| -]{3,}\s*$/gm;
const CORTANA_PREFERRED_RATE = 0.92;
const CORTANA_PREFERRED_PITCH = 1.08;
const CORTANA_PREFERRED_VOLUME = 1;

type SpeechVoiceCandidate = Pick<
  SpeechSynthesisVoice,
  "default" | "lang" | "localService" | "name" | "voiceURI"
>;
type SpeechUtteranceConfigurable = Pick<
  SpeechSynthesisUtterance,
  "pitch" | "rate" | "voice" | "volume"
>;

function scoreSpeechVoice(voice: SpeechVoiceCandidate): number {
  const name = voice.name.toLowerCase();
  const lang = voice.lang.toLowerCase();
  let score = 0;

  if (name.includes("cortana")) score += 1_000;
  if (name.includes("aria")) score += 800;
  if (name.includes("jenny")) score += 720;
  if (name.includes("zira")) score += 680;
  if (name.includes("samantha")) score += 480;
  if (name.includes("microsoft")) score += 220;
  if (name.includes("natural")) score += 80;
  if (name.includes("female") || name.includes("woman")) score += 120;
  if (
    name.includes("david") ||
    name.includes("mark") ||
    name.includes("guy") ||
    name.includes("male") ||
    name.includes("man")
  ) {
    score -= 400;
  }

  if (lang === "en-us") score += 180;
  else if (lang.startsWith("en-")) score += 90;

  if (voice.localService) score += 20;
  if (voice.default) score += 10;

  return score;
}

function stripPairedMarker(text: string, markerPattern: RegExp): string {
  let next = text;
  let previous = "";

  while (previous !== next) {
    previous = next;
    next = next.replace(markerPattern, "$1");
  }

  return next;
}

function stripMarkdownEmphasis(text: string): string {
  let next = text;
  next = stripPairedMarker(next, /\*\*([^*]+)\*\*/g);
  next = stripPairedMarker(next, /__([^_]+)__/g);
  next = stripPairedMarker(next, /\*([^*\n]+)\*/g);
  next = stripPairedMarker(next, /_([^_\n]+)_/g);
  next = stripPairedMarker(next, /~~([^~]+)~~/g);
  return next;
}

function collapseWhitespace(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trim().replace(/\s+/g, " "))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}

export function isTextToSpeechSupported(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    typeof window.speechSynthesis !== "undefined" &&
    typeof window.SpeechSynthesisUtterance === "function"
  );
}

export function normalizeTextForSpeech(markdown: string): string {
  const normalizedInput = markdown.replace(/\r\n?/g, "\n");
  const withoutCodeBlocks = normalizedInput.replace(
    FENCED_CODE_BLOCK_PATTERN,
    (_match, leadingWhitespace: string) => `${leadingWhitespace}Code block omitted.`,
  );
  const withoutImages = withoutCodeBlocks.replace(MARKDOWN_IMAGE_PATTERN, (_match, altText) =>
    typeof altText === "string" && altText.trim().length > 0 ? altText.trim() : "",
  );
  const withoutLinks = withoutImages.replace(MARKDOWN_LINK_PATTERN, "$1");
  const withoutInlineCode = withoutLinks.replace(INLINE_CODE_PATTERN, "$1");
  const withoutRules = withoutInlineCode
    .replace(RULE_PATTERN, "\n")
    .replace(TABLE_SEPARATOR_PATTERN, "\n");
  const withoutStructuralMarkdown = withoutRules
    .replace(HEADING_PATTERN, "")
    .replace(BLOCKQUOTE_PATTERN, "")
    .replace(UNORDERED_LIST_PATTERN, "")
    .replace(ORDERED_LIST_PATTERN, "");
  const withoutEmphasis = stripMarkdownEmphasis(withoutStructuralMarkdown);
  const withoutEscapedMarkers = withoutEmphasis.replace(/[\\*_~#>-]/g, "");
  return collapseWhitespace(withoutEscapedMarkers);
}

export function canReadMessage(message: Pick<ChatMessage, "role" | "streaming" | "text">): boolean {
  if (message.role !== "assistant" || message.streaming) {
    return false;
  }

  return normalizeTextForSpeech(message.text).length > 0;
}

export function selectPreferredSpeechVoice<TVoice extends SpeechVoiceCandidate>(
  voices: readonly TVoice[],
): TVoice | null {
  let bestVoice: TVoice | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const voice of voices) {
    const score = scoreSpeechVoice(voice);
    if (score <= bestScore) {
      continue;
    }
    bestVoice = voice;
    bestScore = score;
  }

  return bestVoice;
}

export function applyCortanaLikeSpeechStyle(
  utterance: SpeechUtteranceConfigurable,
  voices: readonly SpeechSynthesisVoice[],
): void {
  utterance.rate = CORTANA_PREFERRED_RATE;
  utterance.pitch = CORTANA_PREFERRED_PITCH;
  utterance.volume = CORTANA_PREFERRED_VOLUME;
  utterance.voice = selectPreferredSpeechVoice(voices);
}
