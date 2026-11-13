import { describe, expect, it } from "vite-plus/test";

import {
  isHermesAcpProvider,
  isHermesCommandPath,
  isHermesLocalAcpConfig,
  resolveAcpRegistryAgentId,
} from "./hermesProvider";

describe("hermes provider detection", () => {
  it("matches the executable basename only", () => {
    expect(isHermesCommandPath("/home/chris/.local/bin/hermes")).toBe(true);
    expect(isHermesCommandPath("hermes")).toBe(true);
    expect(isHermesCommandPath("C:\\Tools\\hermes.EXE")).toBe(true);
    expect(isHermesCommandPath("/opt/hermes/bin/other")).toBe(false);
    expect(isHermesCommandPath("/usr/bin/hermes-proxy")).toBe(false);
    expect(isHermesCommandPath(undefined)).toBe(false);
  });

  it("requires a local source for config detection", () => {
    expect(isHermesLocalAcpConfig({ source: "local", commandPath: "/x/hermes" })).toBe(true);
    expect(isHermesLocalAcpConfig({ source: "registry", commandPath: "/x/hermes" })).toBe(false);
    expect(isHermesLocalAcpConfig(null)).toBe(false);
  });

  it("prefers the agent id and uses the display name only as a last fallback", () => {
    expect(isHermesAcpProvider({ agentId: "hermes-agent", displayName: "Anything" })).toBe(true);
    expect(isHermesAcpProvider({ agentId: "devin", displayName: "Hermes" })).toBe(false);
    expect(isHermesAcpProvider({ displayName: " Hermes " })).toBe(true);
    expect(isHermesAcpProvider({ displayName: "Hermes Work" })).toBe(false);
  });

  it("resolves the registry agent id for local and registry instance configs", () => {
    expect(
      resolveAcpRegistryAgentId({
        source: "local",
        commandPath: "/home/chris/.local/bin/hermes",
        commandArgs: ["-p", "default", "acp"],
      }),
    ).toBe("hermes-agent");
    expect(resolveAcpRegistryAgentId({ source: "local", commandPath: "/usr/bin/other" })).toBe(
      undefined,
    );
    expect(resolveAcpRegistryAgentId({ source: "local", commandPath: "dsh" })).toBe(undefined);
    expect(resolveAcpRegistryAgentId({ source: "registry", agentId: " hermes-agent " })).toBe(
      "hermes-agent",
    );
    expect(resolveAcpRegistryAgentId({ agentId: "devin" })).toBe("devin");
    expect(resolveAcpRegistryAgentId({ source: "registry", agentId: "  " })).toBe(undefined);
    expect(resolveAcpRegistryAgentId(undefined)).toBe(undefined);
  });
});
