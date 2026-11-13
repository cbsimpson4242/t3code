import remarkParse from "remark-parse";
import { unified } from "unified";
import { describe, expect, it } from "vite-plus/test";

import {
  agentMediaFileName,
  agentMediaKindForPath,
  agentMediaSizeFromRevision,
  parseAgentMessageContent,
  parseVoiceMessageContent,
  type AgentMediaItem,
} from "./voiceMessage.ts";

const paths = (text: string) => parseAgentMessageContent(text).media.map((item) => item.path);
const visible = (text: string) => parseAgentMessageContent(text).text;

describe("parseAgentMessageContent", () => {
  it("returns marker-free text untouched", () => {
    const text = "  indented\n\nplain text with MEDIA in it\n";
    expect(parseAgentMessageContent(text)).toEqual({ text, media: [] });
  });

  it("classifies delivered files in order and removes their standalone tag lines", () => {
    const parsed = parseAgentMessageContent(
      [
        "Here you go.",
        "",
        "MEDIA:/tmp/chart.png",
        "MEDIA:/tmp/report.pdf",
        "MEDIA:/tmp/inbox/message.eml",
        "MEDIA:/tmp/demo.mp4",
        "MEDIA:/tmp/song.mp3",
        "",
        "Enjoy!",
      ].join("\n"),
    );
    expect(parsed.media).toEqual<AgentMediaItem[]>([
      { path: "/tmp/chart.png", kind: "image" },
      { path: "/tmp/report.pdf", kind: "file" },
      { path: "/tmp/inbox/message.eml", kind: "file" },
      { path: "/tmp/demo.mp4", kind: "video" },
      { path: "/tmp/song.mp3", kind: "audio" },
    ]);
    expect(parsed.text).toBe("Here you go.\n\nEnjoy!");
  });

  it("reads tags anywhere in a line, several per line, even glued together", () => {
    expect(paths("Sent MEDIA:/a/one.pdf and MEDIA:/a/two.png today")).toEqual([
      "/a/one.pdf",
      "/a/two.png",
    ]);
    expect(visible("Sent MEDIA:/a/one.pdf and MEDIA:/a/two.png today")).toBe("Sent and today");
    expect(paths("MEDIA:/a/one.pngMEDIA:/a/two.png")).toEqual(["/a/one.png", "/a/two.png"]);
  });

  it("tolerates up to three quote, backtick and emphasis markers", () => {
    for (const wrapped of [
      "**MEDIA:/a/x.pdf**",
      "*MEDIA:/a/x.pdf*",
      "_MEDIA:/a/x.pdf_",
      '"MEDIA:/a/x.pdf"',
      "'MEDIA:/a/x.pdf'",
      "***MEDIA:/a/x.pdf***",
      "MEDIA:`/a/x.pdf`",
      'MEDIA:"/a/x.pdf"',
      "MEDIA:'/a/x.pdf'",
    ]) {
      expect(paths(`File: ${wrapped}`), wrapped).toEqual(["/a/x.pdf"]);
      expect(visible(`File: ${wrapped}`), wrapped).toBe("File:");
    }
  });

  it("accepts absolute, home and drive-letter paths, with spaces when quoted or inside a path", () => {
    expect(paths("MEDIA:/var/data/a.pdf")).toEqual(["/var/data/a.pdf"]);
    expect(paths("MEDIA:~/Documents/a.pdf")).toEqual(["~/Documents/a.pdf"]);
    expect(paths("MEDIA:C:\\Users\\me\\a.pdf")).toEqual(["C:\\Users\\me\\a.pdf"]);
    expect(paths("MEDIA:D:/work/a.pdf")).toEqual(["D:/work/a.pdf"]);
    expect(paths("MEDIA:`/home/me/My Reports/Q1 summary.pdf`")).toEqual([
      "/home/me/My Reports/Q1 summary.pdf",
    ]);
    expect(paths("MEDIA:/home/me/My Reports/Q1 summary.pdf")).toEqual([
      "/home/me/My Reports/Q1 summary.pdf",
    ]);
  });

  it("treats a sentence-final period as punctuation but keeps multi-part extensions", () => {
    expect(paths("Saved it as MEDIA:/a/data.csv.")).toEqual(["/a/data.csv"]);
    expect(visible("Saved it as MEDIA:/a/data.csv.")).toBe("Saved it as");
    expect(paths("MEDIA:/a/archive.tar.gz")).toEqual(["/a/archive.tar.gz"]);
    expect(paths("(MEDIA:/a/x.pdf), then done")).toEqual(["/a/x.pdf"]);
    expect(visible("(MEDIA:/a/x.pdf), then done")).toBe("(), then done");
  });

  it("ends a path at CJK punctuation", () => {
    expect(paths("MEDIA:D:\\报告\\早报.pdf（782.6 KB）")).toEqual(["D:\\报告\\早报.pdf"]);
    expect(visible("MEDIA:/a/早报.pdf：内容")).toBe("：内容");
  });

  it("recognizes any extension on a standalone tag line, and only there", () => {
    expect(parseAgentMessageContent("MEDIA:/var/log/run.log").media).toEqual([
      { path: "/var/log/run.log", kind: "file" },
    ]);
    expect(paths("- MEDIA:/a/Caddyfile")).toEqual(["/a/Caddyfile"]);
    expect(visible("Intro\n\n- MEDIA:/a/Caddyfile\n- keep me")).toBe("Intro\n\n- keep me");
    const prose = "Use MEDIA:/tmp/x.weird to attach files";
    expect(parseAgentMessageContent(prose)).toEqual({ text: prose, media: [] });
  });

  it("leaves tags it cannot deliver visible", () => {
    for (const text of [
      "MEDIA:relative/path.pdf",
      "MEDIA:https://example.com/a.pdf",
      "MEDIA:",
      "MEDIA: nothing here",
      `MEDIA:/${"a".repeat(1100)}.pdf`,
    ]) {
      expect(parseAgentMessageContent(text), text).toEqual({ text, media: [] });
    }
  });

  it("de-duplicates by path and strips every repeat", () => {
    const parsed = parseAgentMessageContent("MEDIA:/a/x.pdf\nsee MEDIA:/a/x.pdf\nMEDIA:/a/y.pdf");
    expect(parsed.media.map((item) => item.path)).toEqual(["/a/x.pdf", "/a/y.pdf"]);
    expect(parsed.text).toBe("see");
  });

  it("handles CRLF input", () => {
    const parsed = parseAgentMessageContent("Done\r\n\r\nMEDIA:/a/x.pdf\r\n\r\nBye");
    expect(parsed.media).toEqual([{ path: "/a/x.pdf", kind: "file" }]);
    expect(parsed.text.replaceAll("\r", "")).toBe("Done\n\nBye");
  });

  it("collapses the blank gap a removed tag line would leave", () => {
    expect(visible("One\n\nMEDIA:/a/x.pdf\n\nTwo")).toBe("One\n\nTwo");
    expect(visible("One\nMEDIA:/a/x.pdf\nTwo")).toBe("One\nTwo");
    expect(visible("MEDIA:/a/x.pdf")).toBe("");
  });

  it("is case-insensitive on the tag and extension", () => {
    expect(parseAgentMessageContent("media:/A/Photo.JPG").media).toEqual([
      { path: "/A/Photo.JPG", kind: "image" },
    ]);
  });
});

describe("parseAgentMessageContent protected Markdown", () => {
  const example = "MEDIA:/tmp/example.pdf";

  it.each([
    ["backtick fence", `Look:\n\n\`\`\`\n${example}\n\`\`\`\n`],
    ["tilde fence", `~~~text\n${example}\n~~~`],
    ["longer fence", `\`\`\`\`\n\`\`\`\n${example}\n\`\`\`\n\`\`\`\``],
    ["info string", `\`\`\`bash\n${example}\n\`\`\``],
    ["fence inside a list item", `- item\n\n  \`\`\`\n  ${example}\n  \`\`\``],
    ["fence inside a blockquote", `> \`\`\`\n> ${example}\n> \`\`\``],
    ["indented code", `Example:\n\n    ${example}\n`],
    ["tab-indented code", `Example:\n\n\t${example}\n`],
    ["inline code", `Write \`${example}\` to attach a file.`],
    ["double-backtick inline code", `Write \`\`${example}\`\` to attach a file.`],
    ["blockquote", `> ${example}`],
    ["nested blockquote", `> > ${example}`],
    ["unclosed fence", `\`\`\`\n${example}\nmore`],
  ])("never extracts from %s", (_name, text) => {
    expect(parseAgentMessageContent(text)).toEqual({ text, media: [] });
  });

  it("does not treat a fence closer with trailing text as a closer", () => {
    const text = `\`\`\`\nfoo\n\`\`\` not a closer\n${example}\n\`\`\``;
    expect(parseAgentMessageContent(text)).toEqual({ text, media: [] });
  });

  it("extracts a real tag after a code block that ended", () => {
    const text = `\`\`\`\n${example}\n\`\`\`\n\nMEDIA:/tmp/real.pdf`;
    const parsed = parseAgentMessageContent(text);
    expect(parsed.media).toEqual([{ path: "/tmp/real.pdf", kind: "file" }]);
    expect(parsed.text).toBe(`\`\`\`\n${example}\n\`\`\``);
  });

  it("keeps indented code intact next to a real attachment", () => {
    const text = `    ${example}\n\nMEDIA:/tmp/real.png`;
    const parsed = parseAgentMessageContent(text);
    expect(paths(text)).toEqual(["/tmp/real.png"]);
    // Trimming blank lines must not strip the code block's four-space indent.
    expect(parsed.text).toBe(`    ${example}`);
    const types = (
      unified().use(remarkParse).parse(parsed.text).children as { type: string }[]
    ).map((node) => node.type);
    expect(types).toEqual(["code"]);
  });

  it("keeps a fenced example, its indentation, and a real tag in a list item", () => {
    const text = [
      "1. Steps:",
      "",
      "   ```sh",
      `   echo ${example}`,
      "   ```",
      "",
      "   MEDIA:/tmp/real.pdf",
    ].join("\n");
    const parsed = parseAgentMessageContent(text);
    expect(parsed.media).toEqual([{ path: "/tmp/real.pdf", kind: "file" }]);
    expect(parsed.text).toBe(
      ["1. Steps:", "", "   ```sh", `   echo ${example}`, "   ```"].join("\n"),
    );
  });

  it("reads a tag in an indented list continuation, which is a paragraph, not code", () => {
    expect(paths("- item\n\n    MEDIA:/tmp/in-list.pdf")).toEqual(["/tmp/in-list.pdf"]);
  });

  it("still reads a backquoted path that belongs to a tag", () => {
    expect(paths("MEDIA:`/tmp/My File.pdf` and `MEDIA:/tmp/code.pdf`")).toEqual([
      "/tmp/My File.pdf",
    ]);
  });

  it("does not move a tag between fenced and plain text on streaming prefixes", () => {
    const full = "Here\n\nMEDIA:/tmp/a.pdf\n\n```\nMEDIA:/tmp/b.pdf\n```";
    for (let length = 0; length <= full.length; length++) {
      expect(paths(full.slice(0, length)).includes("/tmp/b.pdf")).toBe(false);
    }
  });
});

describe("parseAgentMessageContent voice messages", () => {
  const voiceInputs = [
    "[[audio_as_voice]]\nMEDIA:/tmp/voice.mp3",
    "[[audio_as_voice]] MEDIA:/tmp/voice.mp3",
    "  [[audio_as_voice]]\n  MEDIA:/tmp/voice.mp3  ",
    "Transcript.\n\n[[audio_as_voice]]\nMEDIA:/tmp/voice.ogg\n\nMore text",
    "[[audio_as_voice]]\nMEDIA:C:\\v\\voice.wav",
    "[[audio_as_voice]]\nMEDIA:/tmp/a.opus\n[[audio_as_voice]]\nMEDIA:/tmp/b.m4a",
    "[[audio_as_voice]]\nMEDIA:/tmp/a.aac\n[[audio_as_voice]]\nMEDIA:/tmp/a.aac",
    "```\n[[audio_as_voice]]\nMEDIA:/tmp/example.mp3\n```",
    "[[audio_as_voice]]\n\nMEDIA:/tmp/gap.mp3",
    "[[audio_as_voice]]\nMEDIA:/tmp/voice.mp3 trailing words",
    "[[audio_as_voice]]\nMEDIA:/tmp/voice.pdf",
  ];

  it.each(voiceInputs)("matches the previous voice parser for %j", (input) => {
    const legacy = parseVoiceMessageContent(input);
    const parsed = parseAgentMessageContent(input);
    expect(
      parsed.media.filter((item) => item.kind === "voice").map((item) => item.path),
      input,
    ).toEqual(legacy.audioPaths);
    // Like Hermes, a removed tag line no longer leaves a double blank line behind.
    if (legacy.audioPaths.length > 0) {
      expect(parsed.text).toBe(legacy.text.replace(/\n{3,}/g, "\n\n"));
    }
  });

  it("plays the directive-marked audio as voice and the same file plain as audio", () => {
    expect(parseAgentMessageContent("[[audio_as_voice]]\nMEDIA:/tmp/v.mp3").media).toEqual([
      { path: "/tmp/v.mp3", kind: "voice" },
    ]);
    expect(parseAgentMessageContent("MEDIA:/tmp/v.mp3").media).toEqual([
      { path: "/tmp/v.mp3", kind: "audio" },
    ]);
    expect(parseAgentMessageContent("[[audio_as_voice]]\nMEDIA:/tmp/v.webm").media).toEqual([
      { path: "/tmp/v.webm", kind: "voice" },
    ]);
  });

  it("keeps the directive visible when no deliverable audio follows", () => {
    const text = "[[audio_as_voice]]\nMEDIA:/tmp/photo.png";
    const parsed = parseAgentMessageContent(text);
    expect(parsed.media).toEqual([{ path: "/tmp/photo.png", kind: "image" }]);
    expect(parsed.text).toBe("[[audio_as_voice]]");
    expect(visible("[[audio_as_voice]] on its own")).toBe("[[audio_as_voice]] on its own");
  });

  it("upgrades a path that appears as audio and then as voice", () => {
    const parsed = parseAgentMessageContent(
      "MEDIA:/tmp/v.mp3\n[[audio_as_voice]]\nMEDIA:/tmp/v.mp3",
    );
    expect(parsed.media).toEqual([{ path: "/tmp/v.mp3", kind: "voice" }]);
  });

  it("mixes voice messages with other attachments and prose", () => {
    const parsed = parseAgentMessageContent(
      "Notes.\n\n[[audio_as_voice]]\nMEDIA:/tmp/v.ogg\n\nAlso MEDIA:/tmp/r.pdf",
    );
    expect(parsed.media).toEqual([
      { path: "/tmp/v.ogg", kind: "voice" },
      { path: "/tmp/r.pdf", kind: "file" },
    ]);
    expect(parsed.text).toBe("Notes.\n\nAlso");
  });
});

describe("agent media helpers", () => {
  it("picks inline kinds only for types the asset route can serve inline", () => {
    expect(agentMediaKindForPath("/a/x.PNG")).toBe("image");
    expect(agentMediaKindForPath("/a/x.svg")).toBe("image");
    expect(agentMediaKindForPath("/a/x.mov")).toBe("video");
    expect(agentMediaKindForPath("/a/x.flac")).toBe("audio");
    for (const name of ["x.tiff", "x.3gp", "x.m2a", "x.pdf", "x.eml", "Makefile", "x."]) {
      expect(agentMediaKindForPath(`/a/${name}`), name).toBe("file");
    }
  });

  it("names the file from either path separator", () => {
    expect(agentMediaFileName("/a/b/c d.pdf")).toBe("c d.pdf");
    expect(agentMediaFileName("C:\\a\\b\\c.pdf")).toBe("c.pdf");
    expect(agentMediaFileName("~/c.pdf")).toBe("c.pdf");
  });

  it("reads the size out of an asset file revision", () => {
    expect(agentMediaSizeFromRevision("64769:1234:52428:1700000000:1700000001")).toBe(52428);
    expect(agentMediaSizeFromRevision("64769:1234:0:1:2")).toBe(0);
    expect(agentMediaSizeFromRevision("opaque-revision")).toBeNull();
    expect(agentMediaSizeFromRevision(undefined)).toBeNull();
  });
});
