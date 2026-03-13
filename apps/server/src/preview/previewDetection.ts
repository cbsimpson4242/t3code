import type { DetectedPreview, PreviewStatus, TerminalEvent } from "@t3tools/contracts";
import { RuntimeSessionId, ThreadId } from "@t3tools/contracts";

interface PreviewMatch {
  readonly url: string;
  readonly normalizedUrl: string;
}

interface PreviewSourceState {
  readonly threadId: ThreadId;
  readonly terminalId: string;
  readonly cwd: string;
  readonly active: boolean;
  readonly previewsByUrl: ReadonlyMap<string, DetectedPreview>;
}

function stripTrailingPunctuation(value: string): string {
  let next = value.trim();
  while (/[.,;!?]$/.test(next)) {
    next = next.slice(0, -1);
  }
  while (next.endsWith(")") && next.split("(").length < next.split(")").length) {
    next = next.slice(0, -1);
  }
  while (next.endsWith("]") && next.split("[").length < next.split("]").length) {
    next = next.slice(0, -1);
  }
  return next;
}

function canonicalLoopbackHost(hostname: string): string | null {
  const normalized = hostname.trim().toLowerCase();
  switch (normalized) {
    case "localhost":
    case "127.0.0.1":
    case "0.0.0.0":
    case "::":
    case "[::]":
    case "::1":
    case "[::1]":
      return "127.0.0.1";
    default:
      return null;
  }
}

export function normalizePreviewUrl(raw: string): PreviewMatch | null {
  const trimmed = stripTrailingPunctuation(raw);
  if (trimmed.length === 0) {
    return null;
  }

  const withProtocol = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }
  if (parsed.port.length === 0) {
    return null;
  }

  const host = canonicalLoopbackHost(parsed.hostname);
  if (!host) {
    return null;
  }

  parsed.hostname = host;
  const normalizedUrl = parsed.toString();
  return {
    url: normalizedUrl,
    normalizedUrl,
  };
}

const EXPLICIT_PREVIEW_URL_PATTERN =
  /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::\]|\[::1\]|::1|::):\d{2,5}(?:\/[^\s"'`<>)\]]*)?/gi;
const BARE_PREVIEW_URL_PATTERN =
  /(?:^|[\s(])((?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d{2,5}(?:\/[^\s"'`<>)\]]*)?|\[(?:::|::1)\]:\d{2,5}(?:\/[^\s"'`<>)\]]*)?)/gi;

export function extractPreviewUrls(text: string): ReadonlyArray<PreviewMatch> {
  if (text.trim().length === 0) {
    return [];
  }

  const matches = new Map<string, PreviewMatch>();
  for (const match of text.matchAll(EXPLICIT_PREVIEW_URL_PATTERN)) {
    const candidate = normalizePreviewUrl(match[0]);
    if (candidate) {
      matches.set(candidate.normalizedUrl, candidate);
    }
  }
  for (const match of text.matchAll(BARE_PREVIEW_URL_PATTERN)) {
    const raw = match[1];
    if (!raw) {
      continue;
    }
    const candidate = normalizePreviewUrl(raw);
    if (candidate) {
      matches.set(candidate.normalizedUrl, candidate);
    }
  }
  return [...matches.values()];
}

function previewId(threadId: string, terminalId: string, normalizedUrl: string): RuntimeSessionId {
  return RuntimeSessionId.makeUnsafe(`${threadId}:${terminalId}:${normalizedUrl}`);
}

function applyPreviewStatus(
  previewsByUrl: ReadonlyMap<string, DetectedPreview>,
  status: PreviewStatus,
  updatedAt: string,
): Map<string, DetectedPreview> {
  const next = new Map<string, DetectedPreview>();
  for (const [normalizedUrl, preview] of previewsByUrl) {
    next.set(normalizedUrl, preview.status === status && preview.updatedAt === updatedAt ? preview : {
      ...preview,
      status,
      updatedAt,
    });
  }
  return next;
}

export function applyTerminalEventToPreviewSource(
  previous: PreviewSourceState | null,
  event: TerminalEvent,
): PreviewSourceState | null {
  const base =
    previous ??
    (event.type === "started" || event.type === "restarted"
      ? {
          threadId: ThreadId.makeUnsafe(event.threadId),
          terminalId: event.terminalId,
          cwd: event.snapshot.cwd,
          active: true,
          previewsByUrl: new Map<string, DetectedPreview>(),
        }
      : null);

  if (!base) {
    return null;
  }

  const timestamp =
    event.type === "started" || event.type === "restarted"
      ? event.snapshot.updatedAt
      : event.createdAt;
  const nextCwd =
    event.type === "started" || event.type === "restarted" ? event.snapshot.cwd : base.cwd;
  let nextActive = base.active;
  let nextPreviewsByUrl = new Map(base.previewsByUrl);

  if (event.type === "started" || event.type === "restarted") {
    nextActive = true;
    for (const match of extractPreviewUrls(event.snapshot.history)) {
      const existing = nextPreviewsByUrl.get(match.normalizedUrl);
      nextPreviewsByUrl.set(match.normalizedUrl, existing ?? {
        id: previewId(event.threadId, event.terminalId, match.normalizedUrl),
        threadId: base.threadId,
        terminalId: event.terminalId,
        cwd: nextCwd,
        url: match.url,
        normalizedUrl: match.normalizedUrl,
        status: "live",
        detectedAt: timestamp,
        updatedAt: timestamp,
      });
      if (existing) {
        nextPreviewsByUrl.set(match.normalizedUrl, {
          ...existing,
          cwd: nextCwd,
          url: match.url,
          status: "live",
          updatedAt: timestamp,
        });
      }
    }
  }

  if (event.type === "output") {
    for (const match of extractPreviewUrls(event.data)) {
      const existing = nextPreviewsByUrl.get(match.normalizedUrl);
      nextPreviewsByUrl.set(match.normalizedUrl, existing ?? {
        id: previewId(event.threadId, event.terminalId, match.normalizedUrl),
        threadId: base.threadId,
        terminalId: event.terminalId,
        cwd: nextCwd,
        url: match.url,
        normalizedUrl: match.normalizedUrl,
        status: nextActive ? "live" : "unavailable",
        detectedAt: timestamp,
        updatedAt: timestamp,
      });
      if (existing) {
        nextPreviewsByUrl.set(match.normalizedUrl, {
          ...existing,
          cwd: nextCwd,
          url: match.url,
          status: nextActive ? "live" : "unavailable",
          updatedAt: timestamp,
        });
      }
    }
  }

  if (event.type === "activity") {
    nextActive = event.hasRunningSubprocess;
    nextPreviewsByUrl = applyPreviewStatus(
      nextPreviewsByUrl,
      nextActive ? "live" : "unavailable",
      timestamp,
    );
  }

  if (event.type === "exited") {
    nextActive = false;
    nextPreviewsByUrl = applyPreviewStatus(nextPreviewsByUrl, "unavailable", timestamp);
  }

  return {
    threadId: base.threadId,
    terminalId: base.terminalId,
    cwd: nextCwd,
    active: nextActive,
    previewsByUrl: nextPreviewsByUrl,
  };
}

export function flattenPreviewSources(
  sources: ReadonlyMap<string, PreviewSourceState>,
): Array<DetectedPreview> {
  const previews: DetectedPreview[] = [];
  for (const source of sources.values()) {
    previews.push(...source.previewsByUrl.values());
  }
  return previews.toSorted((left, right) => left.detectedAt.localeCompare(right.detectedAt));
}
