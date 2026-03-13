import { Schema } from "effect";

import { RuntimeSessionId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas";
import { DEFAULT_TERMINAL_ID } from "./terminal";

const PreviewUrlSchema = TrimmedNonEmptyString;

export const PreviewStatus = Schema.Literals(["live", "unavailable"]);
export type PreviewStatus = typeof PreviewStatus.Type;

export const DetectedPreview = Schema.Struct({
  id: RuntimeSessionId,
  threadId: ThreadId,
  terminalId: Schema.String.check(Schema.isNonEmpty()).pipe(
    Schema.withDecodingDefault(() => DEFAULT_TERMINAL_ID),
  ),
  cwd: TrimmedNonEmptyString,
  url: PreviewUrlSchema,
  normalizedUrl: PreviewUrlSchema,
  status: PreviewStatus,
  detectedAt: Schema.String,
  updatedAt: Schema.String,
});
export type DetectedPreview = typeof DetectedPreview.Type;

export const PreviewSnapshot = Schema.Struct({
  previews: Schema.Array(DetectedPreview),
});
export type PreviewSnapshot = typeof PreviewSnapshot.Type;
