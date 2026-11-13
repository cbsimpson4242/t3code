import { describe, expect, it } from "vite-plus/test";

import { agentMediaMimeType } from "./agentMediaMimeType";

describe("agentMediaMimeType", () => {
  it.each([
    ["/a/report.pdf", "application/pdf"],
    ["/a/mail.eml", "message/rfc822"],
    ["/a/Notes.DOCX", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["/a/archive.tar.gz", "application/gzip"],
    ["C:\\a\\photo.JPG", "image/jpeg"],
    ["/a/clip.mp4", "video/mp4"],
    ["/a/voice.opus", "audio/ogg"],
    ["/a/Caddyfile", "application/octet-stream"],
    ["/a/run.weird", "application/octet-stream"],
  ])("types %s", (path, mimeType) => {
    expect(agentMediaMimeType(path)).toBe(mimeType);
  });
});
