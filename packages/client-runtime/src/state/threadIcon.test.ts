import { THREAD_ICON_IMAGE_MAX_DATA_URL_LENGTH, ThreadIcon } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import {
  filterThreadIconEmojis,
  pushRecentThreadEmoji,
  resolveThreadIcon,
  sanitizeRecentThreadEmojis,
  THREAD_ICON_EMOJIS,
  THREAD_ICON_SOURCE_MAX_BYTES,
  threadIconImageFits,
  validateThreadIconSourceFile,
} from "./threadIcon.ts";

const rocket = { kind: "emoji", emoji: "🚀" } as const;

describe("thread icons", () => {
  it("shows a chosen icon only for No project threads", () => {
    expect(resolveThreadIcon({ icon: rocket }, { isScratch: true })).toEqual(rocket);
    expect(resolveThreadIcon({ icon: rocket }, { isScratch: undefined })).toBeNull();
    expect(resolveThreadIcon({ icon: rocket }, null)).toBeNull();
    expect(resolveThreadIcon({}, { isScratch: true })).toBeNull();
  });

  it("validates upload type and size before decoding", () => {
    expect(validateThreadIconSourceFile({ type: "image/png", size: 1024 })).toBeNull();
    expect(validateThreadIconSourceFile({ type: "image/svg+xml", size: 1024 })).not.toBeNull();
    expect(
      validateThreadIconSourceFile({ type: "image/jpeg", size: THREAD_ICON_SOURCE_MAX_BYTES + 1 }),
    ).not.toBeNull();
    expect(threadIconImageFits("x".repeat(THREAD_ICON_IMAGE_MAX_DATA_URL_LENGTH))).toBe(true);
    expect(threadIconImageFits("x".repeat(THREAD_ICON_IMAGE_MAX_DATA_URL_LENGTH + 1))).toBe(false);
  });

  it("keeps recent emoji newest first, without repeats, and within the limit", () => {
    expect(pushRecentThreadEmoji(["🔥", "🚀"], "🚀")).toEqual(["🚀", "🔥"]);
    expect(pushRecentThreadEmoji(["a", "b", "c"], "d", 3)).toEqual(["d", "a", "b"]);
    expect(sanitizeRecentThreadEmojis(["🚀", 4, "", null, "🔥"])).toEqual(["🚀", "🔥"]);
    expect(sanitizeRecentThreadEmojis("nope")).toEqual([]);
  });

  it("searches emoji by every typed word, or by the emoji itself", () => {
    expect(filterThreadIconEmojis("")).toBe(THREAD_ICON_EMOJIS);
    expect(filterThreadIconEmojis("rocket").map((entry) => entry.emoji)).toContain("🚀");
    expect(filterThreadIconEmojis("heart red").map((entry) => entry.emoji)).toEqual(["❤️"]);
    expect(filterThreadIconEmojis("🚀").map((entry) => entry.emoji)).toEqual(["🚀"]);
    expect(filterThreadIconEmojis("zzzz")).toEqual([]);
  });

  it("lists only single emoji the server accepts as a thread icon", () => {
    const decode = Schema.decodeUnknownSync(ThreadIcon);
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    for (const { emoji } of THREAD_ICON_EMOJIS) {
      expect(() => decode({ kind: "emoji", emoji }), emoji).not.toThrow();
      expect(Array.from(segmenter.segment(emoji)), emoji).toHaveLength(1);
    }
  });
});
