import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";

/** Clients crop to a square and re-encode below this, so shells stay small. */
export const THREAD_ICON_IMAGE_MAX_DATA_URL_LENGTH = 48_000;
export const THREAD_ICON_IMAGE_SIZE_PX = 128;

const ThreadEmojiIcon = Schema.Struct({
  kind: Schema.Literal("emoji"),
  emoji: TrimmedNonEmptyString.check(Schema.isMaxLength(32)),
});
const ThreadImageIcon = Schema.Struct({
  kind: Schema.Literal("image"),
  dataUrl: Schema.String.check(
    Schema.isMaxLength(THREAD_ICON_IMAGE_MAX_DATA_URL_LENGTH),
    Schema.isPattern(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/),
  ),
});

/** An icon a user chose for a No project thread, shown where a project logo would be. */
export const ThreadIcon = Schema.Union([ThreadEmojiIcon, ThreadImageIcon]);
export type ThreadIcon = typeof ThreadIcon.Type;

/** Icons read back from storage or a peer; one this build cannot read becomes none instead of failing the thread. */
export const StoredThreadIcon = Schema.NullOr(ThreadIcon).pipe(
  Schema.catchDecoding(() => Effect.succeedSome(null)),
);
