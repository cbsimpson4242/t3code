import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageId } from "@t3tools/contracts";

import {
  applyCortanaLikeSpeechStyle,
  canReadMessage,
  isTextToSpeechSupported,
  normalizeTextForSpeech,
  selectPreferredSpeechVoice,
} from "./textToSpeech";
import type { ChatMessage } from "./types";

function FakeSpeechSynthesisUtterance() {
  return undefined;
}

function createMessage(partial: Partial<ChatMessage>): ChatMessage {
  return {
    id: MessageId.makeUnsafe("message-1"),
    role: "assistant",
    text: "",
    createdAt: "2026-03-04T12:00:00.000Z",
    streaming: false,
    ...partial,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isTextToSpeechSupported", () => {
  it("returns false when browser speech APIs are unavailable", () => {
    vi.stubGlobal("window", {});

    expect(isTextToSpeechSupported()).toBe(false);
  });

  it("returns true when the browser speech APIs are available", () => {
    vi.stubGlobal("window", {
      speechSynthesis: {},
      SpeechSynthesisUtterance: FakeSpeechSynthesisUtterance,
    });

    expect(isTextToSpeechSupported()).toBe(true);
  });
});

describe("normalizeTextForSpeech", () => {
  it("flattens inline markdown formatting into readable plain text", () => {
    expect(normalizeTextForSpeech("## Heading\nUse `bun run test` with **care**.")).toBe(
      "Heading\nUse bun run test with care.",
    );
  });

  it("replaces fenced code blocks with a placeholder", () => {
    expect(normalizeTextForSpeech("Before\n```ts\nconst x = 1;\n```\nAfter")).toBe(
      "Before\nCode block omitted.\nAfter",
    );
  });

  it("reads markdown links using only their label text", () => {
    expect(
      normalizeTextForSpeech("Read the [Codex SDK docs](https://developers.openai.com/codex/sdk)."),
    ).toBe("Read the Codex SDK docs.");
  });

  it("collapses repeated blank lines and whitespace noise", () => {
    expect(normalizeTextForSpeech("Line one\n\n\n   Line   two   \n\nLine three")).toBe(
      "Line one\n\nLine two\n\nLine three",
    );
  });

  it("returns an empty string for formatting-only content", () => {
    expect(normalizeTextForSpeech("## \n- **\n---")).toBe("");
  });
});

describe("canReadMessage", () => {
  it("rejects non-assistant, streaming, and empty assistant messages", () => {
    expect(canReadMessage(createMessage({ role: "user", text: "hello" }))).toBe(false);
    expect(canReadMessage(createMessage({ role: "system", text: "hello" }))).toBe(false);
    expect(canReadMessage(createMessage({ streaming: true, text: "hello" }))).toBe(false);
    expect(canReadMessage(createMessage({ text: "```ts\nconst x = 1;\n```" }))).toBe(true);
    expect(canReadMessage(createMessage({ text: "## \n- **\n---" }))).toBe(false);
  });
});

describe("selectPreferredSpeechVoice", () => {
  it("prefers Cortana-like Microsoft female voices over generic defaults", () => {
    const preferredVoice = selectPreferredSpeechVoice([
      {
        name: "Microsoft David Desktop",
        lang: "en-US",
        default: true,
        localService: true,
        voiceURI: "microsoft-david",
      },
      {
        name: "Microsoft Aria Online (Natural)",
        lang: "en-US",
        default: false,
        localService: false,
        voiceURI: "microsoft-aria",
      },
      {
        name: "Google US English",
        lang: "en-US",
        default: false,
        localService: false,
        voiceURI: "google-us-english",
      },
    ]);

    expect(preferredVoice?.name).toBe("Microsoft Aria Online (Natural)");
  });
});

describe("applyCortanaLikeSpeechStyle", () => {
  it("assigns the preferred voice and Cortana-style delivery profile", () => {
    const utterance: Pick<SpeechSynthesisUtterance, "pitch" | "rate" | "voice" | "volume"> = {
      rate: 1,
      pitch: 1,
      volume: 1,
      voice: null,
    };

    applyCortanaLikeSpeechStyle(utterance, [
      {
        name: "Microsoft Zira Desktop",
        lang: "en-US",
        default: false,
        localService: true,
        voiceURI: "microsoft-zira",
      },
      {
        name: "Microsoft Aria Online (Natural)",
        lang: "en-US",
        default: false,
        localService: false,
        voiceURI: "microsoft-aria",
      },
    ]);

    expect(utterance.voice?.name).toBe("Microsoft Aria Online (Natural)");
    expect(utterance.rate).toBe(0.92);
    expect(utterance.pitch).toBe(1.08);
    expect(utterance.volume).toBe(1);
  });
});
