/** ACP `agentInfo.name` Hermes reports from `initialize`; the client never sees it, so it doubles as our brand id. */
export const HERMES_ACP_AGENT_NAME = "hermes-agent";

const HERMES_DISPLAY_NAMES = new Set(["hermes", "hermes agent", HERMES_ACP_AGENT_NAME]);

/** True when the executable's basename is `hermes`, ignoring directories and Windows extensions. */
export function isHermesCommandPath(commandPath: unknown): boolean {
  if (typeof commandPath !== "string") return false;
  const basename = commandPath.trim().split(/[\\/]/).at(-1)?.toLowerCase() ?? "";
  return basename.replace(/\.(?:exe|cmd|bat)$/, "") === "hermes";
}

/** Local ACP instance config (`source: "local"`) whose command is Hermes. */
export function isHermesLocalAcpConfig(config: unknown): boolean {
  if (config === null || typeof config !== "object") return false;
  const record = config as Readonly<Record<string, unknown>>;
  return record.source === "local" && isHermesCommandPath(record.commandPath);
}

/** Display-name matching is only the last fallback for callers that lack the instance config. */
export function isHermesAcpProvider(input: {
  readonly agentId?: string | undefined;
  readonly displayName?: string | undefined;
}): boolean {
  if (input.agentId !== undefined) return input.agentId === HERMES_ACP_AGENT_NAME;
  return HERMES_DISPLAY_NAMES.has(input.displayName?.trim().toLowerCase() ?? "");
}

/**
 * Registry agent id used for ACP icon branding: the configured `agentId` for registry instances, the
 * Hermes brand id for a local Hermes command, and nothing for other local commands.
 */
export function resolveAcpRegistryAgentId(config: unknown): string | undefined {
  if (config === null || typeof config !== "object") return undefined;
  if (isHermesLocalAcpConfig(config)) return HERMES_ACP_AGENT_NAME;
  const record = config as Readonly<Record<string, unknown>>;
  if (record.source === "local") return undefined;
  return typeof record.agentId === "string" ? record.agentId.trim() || undefined : undefined;
}
