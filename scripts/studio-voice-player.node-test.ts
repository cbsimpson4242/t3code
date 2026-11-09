import * as NodeTest from "node:test";
import * as NodeAssert from "node:assert/strict";
import { parseVoiceMessageContent as parse } from "@t3tools/shared/voiceMessage";
import {
  ExclusiveVoicePlaybackCoordinator,
  resolveSeekRatio,
  resolveVoicePlaybackSpeed,
} from "@t3tools/shared/voicePlayback";
NodeTest.test("agent directive with prose", () =>
  NodeAssert.deepEqual(
    parse("Hello.\n\n[[audio_as_voice]]\nMEDIA:/home/chris/.hermes/audio_cache/one.ogg"),
    { text: "Hello.", audioPaths: ["/home/chris/.hermes/audio_cache/one.ogg"] },
  ),
);
NodeTest.test("same line and deduplication", () =>
  NodeAssert.deepEqual(
    parse("[[audio_as_voice]] MEDIA:/a.mp3\n[[audio_as_voice]]\nMEDIA:/a.mp3").audioPaths,
    ["/a.mp3"],
  ),
);
NodeTest.test("multiple recordings", () =>
  NodeAssert.deepEqual(
    parse("[[audio_as_voice]]\nMEDIA:/a.ogg\n[[audio_as_voice]]\nMEDIA:/b.m4a").audioPaths,
    ["/a.ogg", "/b.m4a"],
  ),
);
NodeTest.test("no directive leaves exact text untouched", () => {
  for (const s of [" hello \n", "MEDIA:/a.ogg", "normal response"])
    NodeAssert.equal(parse(s).text, s);
});
NodeTest.test("invalid and remote paths remain visible", () => {
  for (const p of ["https://evil/a.ogg", "relative.ogg", "/secret.txt", "/a.ogg?x=1", "/a.ogg\0"]) {
    const s = "[[audio_as_voice]]\nMEDIA:" + p;
    NodeAssert.equal(parse(s).text, s);
    NodeAssert.deepEqual(parse(s).audioPaths, []);
  }
});
NodeTest.test("fenced and prose examples are not players", () => {
  for (const s of [
    "```\n[[audio_as_voice]]\nMEDIA:/a.ogg\n```",
    "Mention [[audio_as_voice]] MEDIA:/a.ogg",
    "~~~text\n[[audio_as_voice]] MEDIA:/a.wav\n~~~",
  ]) {
    NodeAssert.equal(parse(s).text, s);
    NodeAssert.deepEqual(parse(s).audioPaths, []);
  }
});
NodeTest.test("Windows and spaces", () =>
  NodeAssert.deepEqual(parse("[[audio_as_voice]] MEDIA:C:\\voice notes\\a.wav").audioPaths, [
    "C:\\voice notes\\a.wav",
  ]),
);
NodeTest.test("all supported formats", () => {
  for (const ext of ["aac", "flac", "webm", "mp3", "m4a", "ogg", "opus", "wav"])
    NodeAssert.equal(parse("[[audio_as_voice]] MEDIA:/a." + ext).audioPaths.length, 1);
});
NodeTest.test("seek clamps invalid and out of bounds", () => {
  NodeAssert.equal(resolveSeekRatio(-10, 100), 0);
  NodeAssert.equal(resolveSeekRatio(200, 100), 1);
  NodeAssert.equal(resolveSeekRatio(50, 100), 0.5);
  NodeAssert.equal(resolveSeekRatio(1, 0), 0);
  NodeAssert.equal(resolveSeekRatio(NaN, 5), 0);
});
NodeTest.test("speed validation", () => {
  NodeAssert.equal(resolveVoicePlaybackSpeed(1.5), 1.5);
  NodeAssert.equal(resolveVoicePlaybackSpeed(99), 1);
  NodeAssert.equal(resolveVoicePlaybackSpeed(null), 1);
});
NodeTest.test("exclusive playback and stale claim rejection", () => {
  const c = new ExclusiveVoicePlaybackCoordinator();
  let a = 0,
    b = 0;
  const off = c.register("a", () => a++);
  c.register("b", () => b++);
  const first = c.activate("a");
  NodeAssert.ok(c.isCurrent(first));
  c.activate("b");
  NodeAssert.equal(a, 1);
  NodeAssert.equal(b, 0);
  NodeAssert.equal(c.isCurrent(first), false);
  off();
  c.activate("a");
  NodeAssert.equal(b, 1);
});
