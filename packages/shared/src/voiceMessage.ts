import remarkParse from "remark-parse";
import { unified } from "unified";

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

/** `MEDIA:/path` delivery tags, as Hermes' gateway reads them (`MEDIA_TAG_CLEANUP_RE`). */
export type AgentMediaKind = "voice" | "audio" | "image" | "video" | "file";

export interface AgentMediaItem {
  readonly path: string;
  readonly kind: AgentMediaKind;
}

export interface ParsedAgentMessageContent {
  readonly text: string;
  readonly media: ReadonlyArray<AgentMediaItem>;
}

/** The asset contract rejects longer paths, so a longer tag is not a deliverable file. */
const MEDIA_PATH_MAX_LENGTH = 1024;

/** Hermes `MEDIA_DELIVERY_EXTS` plus `aac`, which the voice directive already accepted. */
const MEDIA_EXTENSIONS = [
  "png jpg jpeg gif webp bmp tiff svg",
  "mp4 mov avi mkv webm 3gp",
  "mp3 m2a wav ogg opus m4a flac aac",
  "pdf docx doc odt rtf txt md epub",
  "xlsx xls ods csv tsv json xml yaml yml",
  "kmz kml geojson gpx",
  "pptx ppt odp key",
  "zip tar gz tgz bz2 xz 7z rar apk ipa",
  "html htm",
]
  .flatMap((group) => group.split(" "))
  // Longest first so a short extension never matches as a prefix of a longer one.
  .sort((a, b) => b.length - a.length)
  .join("|");

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "avi", "mkv", "webm"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "ogg", "opus", "m4a", "flac", "aac"]);
const VOICE_EXTENSIONS = new Set(["aac", "flac", "webm", "mp3", "m4a", "ogg", "opus", "wav"]);

// Full-width punctuation ends a path, as in `MEDIA:D:\报告.pdf（782 KB）`.
const CJK_TERMINATORS = "（）〈〉《》：，。；！？、\u201c\u201d\u2018\u2019【】";
const PATH_ANCHOR = String.raw`(?:~/|/|[A-Za-z]:[/\\])`;
const MEDIA_TAG = new RegExp(
  String.raw`[\`"'*_]{0,3}MEDIA:\s*` +
    String.raw`(\`[^\`\n]+?\`|"[^"\n]+?"|'[^'\n]+?'|` +
    String.raw`${PATH_ANCHOR}\S+?(?:[^\S\n]+\S+?)*?\.(?:${MEDIA_EXTENSIONS}))` +
    String.raw`(?=[\s\`"'*_,;:)\]}\[${CJK_TERMINATORS}]|MEDIA:|\.(?:\s|$)|$)[\`"'*_]{0,3}\.?`,
  "gi",
);
// A tag alone on its line may name any file type, as Hermes delivers `MEDIA:/x/report.eml` too. A
// tag inside prose needs a known extension, so a sentence mentioning `MEDIA:` is never swallowed.
const STANDALONE_MEDIA_TAG = new RegExp(
  String.raw`^[ \t]*(?:[-*+]|\d{1,9}[.)])?[ \t]*[\`"'*_]{0,3}MEDIA:[ \t]*(${PATH_ANCHOR}[^\n]*?)[ \t]*$`,
  "i",
);
const VOICE_DIRECTIVE = "[[audio_as_voice]]";

interface Span {
  readonly start: number;
  readonly end: number;
}

interface MdastNode {
  readonly type: string;
  readonly children?: ReadonlyArray<MdastNode>;
  readonly position?: { readonly start: { offset?: number }; readonly end: { offset?: number } };
}

const markdownParser = unified().use(remarkParse);

/** Offsets of Markdown source a `MEDIA:` tag must not be read from: code, inline code, quotes. */
function protectedSpans(text: string): Span[] {
  const spans: Span[] = [];
  const visit = (node: MdastNode) => {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start !== undefined && end !== undefined) {
      if (node.type === "code" || node.type === "blockquote") {
        spans.push({ start, end });
        return;
      }
      // `MEDIA:` followed by a backquoted path is a tag, not an inline code example.
      if (node.type === "inlineCode") {
        if (!/MEDIA:\s*$/i.test(text.slice(Math.max(0, start - 20), start))) {
          spans.push({ start, end });
        }
        return;
      }
    }
    node.children?.forEach(visit);
  };
  visit(markdownParser.parse(text) as MdastNode);
  return spans;
}

/** Same length as `text`, so match offsets stay valid; protected characters become spaces. */
function maskSpans(text: string, spans: ReadonlyArray<Span>): string {
  if (spans.length === 0) return text;
  // Index by UTF-16 unit: mdast offsets are units, not code points.
  const units = text.split("");
  for (const { start, end } of spans) {
    for (let i = start; i < end; i++) if (units[i] !== "\n" && units[i] !== "\r") units[i] = " ";
  }
  return units.join("");
}

function normalizeMediaPath(raw: string): string | null {
  let path = raw.trim();
  const first = path[0];
  if (
    path.length >= 2 &&
    (first === "`" || first === '"' || first === "'") &&
    path.endsWith(first)
  ) {
    path = path.slice(1, -1).trim();
  }
  path = path.replace(/^[`"']+/, "").replace(/[`"',.;:)}\]]+$/, "");
  if (!new RegExp(`^${PATH_ANCHOR}`).test(path)) return null;
  if (path.length > MEDIA_PATH_MAX_LENGTH || /[\0\r\n]/.test(path)) return null;
  return path;
}

export function agentMediaFileName(path: string): string {
  const segments = path.split(/[\\/]/).filter((segment) => segment.length > 0);
  return segments[segments.length - 1] ?? path;
}

function pathExtension(path: string): string {
  const name = agentMediaFileName(path);
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

/** How a client should show a delivered file. Voice needs the `[[audio_as_voice]]` directive. */
export function agentMediaKindForPath(path: string): Exclude<AgentMediaKind, "voice"> {
  const extension = pathExtension(path);
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  if (AUDIO_EXTENSIONS.has(extension)) return "audio";
  return "file";
}

interface FoundTag extends Span {
  readonly path: string;
  readonly voice: boolean;
  /** Where a recognized voice directive starts, when the tag consumes it. */
  readonly directiveStart?: number;
}

function lineStart(text: string, index: number): number {
  return text.lastIndexOf("\n", index - 1) + 1;
}

function lineEnd(text: string, index: number): number {
  const end = text.indexOf("\n", index);
  return end < 0 ? text.length : end;
}

/** A voice tag is `[[audio_as_voice]]` then the tag, on one line or the line above, with nothing after. */
function voiceDirectiveStart(text: string, tag: Span, extension: string): number | null {
  if (!VOICE_EXTENSIONS.has(extension) || text.slice(tag.end, lineEnd(text, tag.end)).trim()) {
    return null;
  }
  const start = lineStart(text, tag.start);
  const before = text.slice(start, tag.start);
  if (before.trim() === VOICE_DIRECTIVE) return start + before.indexOf(VOICE_DIRECTIVE);
  if (before.trim() !== "" || start === 0) return null;
  const previousStart = lineStart(text, start - 1);
  const previous = text.slice(previousStart, start - 1).replace(/\r$/, "");
  return previous.trim() === VOICE_DIRECTIVE
    ? previousStart + previous.indexOf(VOICE_DIRECTIVE)
    : null;
}

function findTags(masked: string): FoundTag[] {
  const tags: FoundTag[] = [];
  for (const match of masked.matchAll(MEDIA_TAG)) {
    const path = normalizeMediaPath(match[1] ?? "");
    if (path === null) continue;
    const span = { start: match.index, end: match.index + match[0].length };
    const directiveStart = voiceDirectiveStart(masked, span, pathExtension(path));
    tags.push({
      ...span,
      path,
      voice: directiveStart !== null,
      ...(directiveStart !== null ? { directiveStart } : {}),
    });
  }
  let offset = 0;
  for (const line of masked.split("\n")) {
    const end = offset + line.length;
    const standalone = STANDALONE_MEDIA_TAG.exec(line.replace(/\r$/, ""));
    if (standalone && !tags.some((tag) => tag.start < end && tag.end > offset)) {
      const path = normalizeMediaPath(standalone[1]!.replace(/[`"'*_]{1,3}$/, ""));
      if (path !== null) {
        const start = offset + line.search(/\S/);
        tags.push({
          start,
          end: offset + line.replace(/\r$/, "").trimEnd().length,
          path,
          voice: false,
        });
      }
    }
    offset = end + 1;
  }
  return tags.sort((a, b) => a.start - b.start);
}

/** Drops removed spans. A line they empty goes with them, so a tag line leaves no blank gap. */
function removeSpans(text: string, spans: ReadonlyArray<Span>): string {
  const lines = text.split("\n");
  const kept: string[] = [];
  let offset = 0;
  let droppedSinceKept = false;
  for (const line of lines) {
    const end = offset + line.length;
    let result = "";
    let cursor = offset;
    let touched = false;
    for (const span of spans) {
      if (span.end <= offset || span.start >= end + 1) continue;
      touched = true;
      const from = Math.max(span.start, offset);
      const before = text.slice(cursor, from);
      result += before;
      cursor = Math.max(cursor, Math.min(span.end, end));
      // Removing a tag between two spaces must not leave a double space behind.
      if (/[ \t]$/.test(result) && /^[ \t]/.test(text.slice(cursor, end))) cursor += 1;
    }
    result += text.slice(cursor, end);
    offset = end + 1;
    if (touched) result = result.trimEnd();
    const emptied = touched && /^\s*(?:(?:[-*+]|\d{1,9}[.)])\s*)?$/.test(result);
    if (emptied) {
      droppedSinceKept = true;
      continue;
    }
    // Two blank lines around a dropped one collapse to one.
    if (droppedSinceKept && result.trim() === "" && kept.at(-1)?.trim() === "") {
      droppedSinceKept = false;
      continue;
    }
    droppedSinceKept = false;
    kept.push(result);
  }
  // Trim blank lines only: leading indentation on the first real line is meaningful Markdown.
  while (kept.length > 0 && kept[0]!.trim() === "") kept.shift();
  while (kept.length > 0 && kept.at(-1)!.trim() === "") kept.pop();
  return kept.join("\n");
}

let lastParsed: { readonly input: string; readonly output: ParsedAgentMessageContent } | undefined;

/**
 * Splits an agent reply into its visible text and the files it delivers. Tags are read anywhere
 * in a line, never from code or quotes, and de-duplicated by path in first-seen order.
 */
export function parseAgentMessageContent(text: string): ParsedAgentMessageContent {
  if (!/MEDIA:/i.test(text)) return { text, media: [] };
  if (lastParsed?.input === text) return lastParsed.output;
  const tags = findTags(maskSpans(text, protectedSpans(text)));
  let output: ParsedAgentMessageContent = { text, media: [] };
  if (tags.length > 0) {
    const media = new Map<string, AgentMediaKind>();
    for (const tag of tags) {
      const kind = tag.voice ? "voice" : agentMediaKindForPath(tag.path);
      if (!media.has(tag.path) || (tag.voice && media.get(tag.path) === "audio")) {
        media.set(tag.path, kind);
      }
    }
    output = {
      text: removeSpans(
        text,
        tags.map((tag) => ({ start: tag.directiveStart ?? tag.start, end: tag.end })),
      ),
      media: [...media].map(([path, kind]) => ({ path, kind })),
    };
  }
  lastParsed = { input: text, output };
  return output;
}

/**
 * Byte size of a delivered file, when the asset route reports one. Its `fileRevision` is
 * `device:inode:size:mtimeNs:ctimeNs`; the route sends no separate size, and changing the
 * server's contract is out of scope for showing a number on a card.
 */
export function agentMediaSizeFromRevision(fileRevision: string | undefined): number | null {
  const size = /^\d+:\d+:(\d+):\d+:\d+$/.exec(fileRevision ?? "")?.[1];
  return size === undefined ? null : Number(size);
}
