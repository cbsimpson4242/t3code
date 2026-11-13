import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { OrchestrationV2Command } from "./orchestrationV2.ts";
import {
  StoredThreadIcon,
  THREAD_ICON_IMAGE_MAX_DATA_URL_LENGTH,
  ThreadIcon,
} from "./threadIcon.ts";

const decodeStored = Schema.decodeUnknownSync(StoredThreadIcon);
const decodeInput = Schema.decodeUnknownSync(ThreadIcon);
const decodeCommand = Schema.decodeUnknownSync(OrchestrationV2Command);

describe("thread icons", () => {
  it("accepts an emoji, including joined sequences, and rejects an empty one", () => {
    expect(decodeInput({ kind: "emoji", emoji: "🚀" })).toEqual({ kind: "emoji", emoji: "🚀" });
    expect(decodeInput({ kind: "emoji", emoji: "👩‍💻" }).kind).toBe("emoji");
    expect(() => decodeInput({ kind: "emoji", emoji: "" })).toThrow();
  });

  it("accepts small raster data URLs only", () => {
    const png = "data:image/png;base64,iVBORw0KGgo=";
    expect(decodeInput({ kind: "image", dataUrl: png })).toEqual({ kind: "image", dataUrl: png });
    expect(() =>
      decodeInput({ kind: "image", dataUrl: "data:image/svg+xml;base64,PHN2Zz4=" }),
    ).toThrow();
    expect(() => decodeInput({ kind: "image", dataUrl: "https://example.com/a.png" })).toThrow();
    const oversized = `data:image/png;base64,${"A".repeat(THREAD_ICON_IMAGE_MAX_DATA_URL_LENGTH)}`;
    expect(() => decodeInput({ kind: "image", dataUrl: oversized })).toThrow();
  });

  it("reads an icon this build cannot decode as none instead of failing the thread", () => {
    expect(decodeStored({ kind: "sticker", id: 1 })).toBeNull();
    expect(decodeStored(null)).toBeNull();
    expect(decodeStored({ kind: "emoji", emoji: "🚀" })).toEqual({ kind: "emoji", emoji: "🚀" });
  });

  it("carries set and clear on the thread metadata command", () => {
    const base = { type: "thread.metadata.update", commandId: "cmd-1", threadId: "thread-1" };
    expect(decodeCommand({ ...base, icon: { kind: "emoji", emoji: "🚀" } })).toMatchObject({
      icon: { kind: "emoji", emoji: "🚀" },
    });
    expect(decodeCommand({ ...base, icon: null })).toMatchObject({ icon: null });
    expect("icon" in decodeCommand(base)).toBe(false);
  });
});
