import { describe, expect, it } from "vite-plus/test";

import {
  getDisplayModelName,
  getTriggerDisplayModelName,
  splitQualifiedModelName,
} from "./providerIconUtils";

describe("qualified ACP model names", () => {
  it("leads with the model id and keeps the upstream label separate", () => {
    expect(splitQualifiedModelName("OpenRouter · anthropic/claude-fable-5.2")).toEqual({
      label: "OpenRouter",
      modelId: "anthropic/claude-fable-5.2",
    });
    expect(splitQualifiedModelName("ChatGPT or Codex Subscription · gpt-6.1-sol")).toEqual({
      label: "ChatGPT or Codex Subscription",
      modelId: "gpt-6.1-sol",
    });
    expect(splitQualifiedModelName("GPT-5.5")).toBeNull();
    expect(splitQualifiedModelName("OpenRouter · ")).toBeNull();
    expect(splitQualifiedModelName(" · x")).toBeNull();
  });

  it("shows the model id wherever the name is displayed compactly", () => {
    const model = {
      slug: "openai-codex:gpt-6.1-sol",
      name: "ChatGPT or Codex Subscription · gpt-6.1-sol",
    };
    expect(getDisplayModelName(model)).toBe("gpt-6.1-sol");
    expect(getTriggerDisplayModelName(model, null)).toBe("gpt-6.1-sol");
  });

  it("leaves other names unchanged", () => {
    expect(getDisplayModelName({ slug: "a", name: "OpenAI GPT-5", subProvider: "OpenAI" })).toBe(
      "GPT-5",
    );
    expect(getDisplayModelName({ slug: "b", name: "Claude Sonnet 4" })).toBe("Claude Sonnet 4");
  });
});
