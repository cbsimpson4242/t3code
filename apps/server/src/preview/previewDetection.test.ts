import { DEFAULT_TERMINAL_ID, ThreadId, type TerminalEvent } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import {
  applyTerminalEventToPreviewSource,
  extractPreviewUrls,
  flattenPreviewSources,
  normalizePreviewUrl,
} from "./previewDetection";

const threadId = ThreadId.makeUnsafe("thread-preview");

function makeStartedEvent(history: string): TerminalEvent {
  return {
    type: "started",
    threadId,
    terminalId: DEFAULT_TERMINAL_ID,
    createdAt: "2026-03-13T10:00:00.000Z",
    snapshot: {
      threadId,
      terminalId: DEFAULT_TERMINAL_ID,
      cwd: "/repo/alpha",
      status: "running",
      pid: 4242,
      history,
      exitCode: null,
      exitSignal: null,
      updatedAt: "2026-03-13T10:00:00.000Z",
    },
  };
}

function makeOutputEvent(data: string, createdAt = "2026-03-13T10:01:00.000Z"): TerminalEvent {
  return {
    type: "output",
    threadId,
    terminalId: DEFAULT_TERMINAL_ID,
    createdAt,
    data,
  };
}

describe("previewDetection", () => {
  it("normalizes loopback preview URLs and rejects non-local hosts", () => {
    expect(normalizePreviewUrl("http://0.0.0.0:5173")).toEqual({
      url: "http://127.0.0.1:5173/",
      normalizedUrl: "http://127.0.0.1:5173/",
    });
    expect(normalizePreviewUrl("[::1]:3000")).toEqual({
      url: "http://127.0.0.1:3000/",
      normalizedUrl: "http://127.0.0.1:3000/",
    });
    expect(normalizePreviewUrl("https://example.com:3000")).toBeNull();
    expect(normalizePreviewUrl("http://localhost")).toBeNull();
  });

  it("extracts explicit and bare preview URLs without duplicates", () => {
    expect(
      extractPreviewUrls(
        [
          "Local: http://localhost:3000",
          "Network: 0.0.0.0:4173",
          "Again http://127.0.0.1:3000/",
        ].join("\n"),
      ),
    ).toEqual([
      {
        url: "http://127.0.0.1:3000/",
        normalizedUrl: "http://127.0.0.1:3000/",
      },
      {
        url: "http://127.0.0.1:4173/",
        normalizedUrl: "http://127.0.0.1:4173/",
      },
    ]);
  });

  it("tracks preview lifecycle from terminal output and activity", () => {
    const started = applyTerminalEventToPreviewSource(
      null,
      makeStartedEvent("ready at http://0.0.0.0:5173"),
    );
    if (!started) {
      throw new Error("Expected started preview source");
    }

    expect(flattenPreviewSources(new Map([["source", started]]))).toEqual([
      expect.objectContaining({
        threadId,
        terminalId: DEFAULT_TERMINAL_ID,
        cwd: "/repo/alpha",
        url: "http://127.0.0.1:5173/",
        normalizedUrl: "http://127.0.0.1:5173/",
        status: "live",
        detectedAt: "2026-03-13T10:00:00.000Z",
      }),
    ]);

    const afterOutput = applyTerminalEventToPreviewSource(
      started,
      makeOutputEvent("Also available on localhost:3000"),
    );
    if (!afterOutput) {
      throw new Error("Expected preview source after output");
    }

    expect(flattenPreviewSources(new Map([["source", afterOutput]]))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          normalizedUrl: "http://127.0.0.1:3000/",
          status: "live",
        }),
        expect.objectContaining({
          normalizedUrl: "http://127.0.0.1:5173/",
          status: "live",
        }),
      ]),
    );

    const unavailable = applyTerminalEventToPreviewSource(afterOutput, {
      type: "activity",
      threadId,
      terminalId: DEFAULT_TERMINAL_ID,
      createdAt: "2026-03-13T10:02:00.000Z",
      hasRunningSubprocess: false,
    });
    if (!unavailable) {
      throw new Error("Expected preview source after activity");
    }
    expect(flattenPreviewSources(new Map([["source", unavailable]])).every((preview) => preview.status === "unavailable")).toBe(true);

    const liveAgain = applyTerminalEventToPreviewSource(unavailable, {
      type: "activity",
      threadId,
      terminalId: DEFAULT_TERMINAL_ID,
      createdAt: "2026-03-13T10:03:00.000Z",
      hasRunningSubprocess: true,
    });
    if (!liveAgain) {
      throw new Error("Expected preview source after activity recovery");
    }
    expect(flattenPreviewSources(new Map([["source", liveAgain]])).every((preview) => preview.status === "live")).toBe(true);

    const exited = applyTerminalEventToPreviewSource(liveAgain, {
      type: "exited",
      threadId,
      terminalId: DEFAULT_TERMINAL_ID,
      createdAt: "2026-03-13T10:04:00.000Z",
      exitCode: 0,
      exitSignal: null,
    });
    if (!exited) {
      throw new Error("Expected preview source after exit");
    }
    expect(flattenPreviewSources(new Map([["source", exited]])).every((preview) => preview.status === "unavailable")).toBe(true);
  });
});
