import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVoiceMessageContent as parse } from "../packages/shared/src/voiceMessage.ts";
import {
  ExclusiveVoicePlaybackCoordinator,
  resolveSeekRatio,
  resolveVoicePlaybackSpeed,
} from "../packages/shared/src/voicePlayback.ts";
test("agent directive with prose", () =>
  assert.deepEqual(
    parse("Hello.\n\n[[audio_as_voice]]\nMEDIA:/home/chris/.hermes/audio_cache/one.ogg"),
    { text: "Hello.", audioPaths: ["/home/chris/.hermes/audio_cache/one.ogg"] },
  ));
test("same line and deduplication", () =>
  assert.deepEqual(
    parse("[[audio_as_voice]] MEDIA:/a.mp3\n[[audio_as_voice]]\nMEDIA:/a.mp3").audioPaths,
    ["/a.mp3"],
  ));
test("multiple recordings", () =>
  assert.deepEqual(
    parse("[[audio_as_voice]]\nMEDIA:/a.ogg\n[[audio_as_voice]]\nMEDIA:/b.m4a").audioPaths,
    ["/a.ogg", "/b.m4a"],
  ));
test("no directive leaves exact text untouched", () => {
  for (const s of [" hello \n", "MEDIA:/a.ogg", "normal response"]) assert.equal(parse(s).text, s);
});
test("invalid and remote paths remain visible", () => {
  for (const p of ["https://evil/a.ogg", "relative.ogg", "/secret.txt", "/a.ogg?x=1", "/a.ogg\0"]) {
    const s = "[[audio_as_voice]]\nMEDIA:" + p;
    assert.equal(parse(s).text, s);
    assert.deepEqual(parse(s).audioPaths, []);
  }
});
test("fenced and prose examples are not players", () => {
  for (const s of [
    "```\n[[audio_as_voice]]\nMEDIA:/a.ogg\n```",
    "Mention [[audio_as_voice]] MEDIA:/a.ogg",
    "~~~text\n[[audio_as_voice]] MEDIA:/a.wav\n~~~",
  ]) {
    assert.equal(parse(s).text, s);
    assert.deepEqual(parse(s).audioPaths, []);
  }
});
test("Windows and spaces", () =>
  assert.deepEqual(parse("[[audio_as_voice]] MEDIA:C:\\voice notes\\a.wav").audioPaths, [
    "C:\\voice notes\\a.wav",
  ]));
test("all supported formats", () => {
  for (const ext of ["aac", "flac", "webm", "mp3", "m4a", "ogg", "opus", "wav"])
    assert.equal(parse("[[audio_as_voice]] MEDIA:/a." + ext).audioPaths.length, 1);
});
test("seek clamps invalid and out of bounds", () => {
  assert.equal(resolveSeekRatio(-10, 100), 0);
  assert.equal(resolveSeekRatio(200, 100), 1);
  assert.equal(resolveSeekRatio(50, 100), 0.5);
  assert.equal(resolveSeekRatio(1, 0), 0);
  assert.equal(resolveSeekRatio(NaN, 5), 0);
});
test("speed validation", () => {
  assert.equal(resolveVoicePlaybackSpeed(1.5), 1.5);
  assert.equal(resolveVoicePlaybackSpeed(99), 1);
  assert.equal(resolveVoicePlaybackSpeed(null), 1);
});
test("exclusive playback and stale claim rejection", () => {
  const c = new ExclusiveVoicePlaybackCoordinator();
  let a = 0,
    b = 0;
  const off = c.register("a", () => a++);
  c.register("b", () => b++);
  const first = c.activate("a");
  assert.ok(c.isCurrent(first));
  c.activate("b");
  assert.equal(a, 1);
  assert.equal(b, 0);
  assert.equal(c.isCurrent(first), false);
  off();
  c.activate("a");
  assert.equal(b, 1);
});
