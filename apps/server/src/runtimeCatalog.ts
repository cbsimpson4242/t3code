import type {
  RuntimeCatalog,
  ServerProviderStatus,
} from "@t3tools/contracts";
import { DEFAULT_MODEL_BY_PROVIDER, MODEL_OPTIONS_BY_PROVIDER } from "@t3tools/contracts";

const OPENAI_PROVIDER = "openai" as const;

export function buildRuntimeCatalog(
  providerStatuses: ReadonlyArray<ServerProviderStatus>,
): RuntimeCatalog {
  const openaiStatus =
    providerStatuses.find((status) => status.provider === OPENAI_PROVIDER) ?? null;

  return {
    provider: OPENAI_PROVIDER,
    authBackend: "codex-cli-bridge",
    models: MODEL_OPTIONS_BY_PROVIDER.openai.map((model) => ({
      id: model.slug,
      name: model.name,
      available: true,
    })),
    defaultModel: DEFAULT_MODEL_BY_PROVIDER.openai,
    bridgeHealthy: openaiStatus?.available === true && openaiStatus.status !== "error",
    ...(openaiStatus
      ? {
          accountSummary: {
            authStatus: openaiStatus.authStatus,
            checkedAt: openaiStatus.checkedAt,
            ...(openaiStatus.message ? { bridgeMessage: openaiStatus.message } : {}),
          },
        }
      : {}),
  };
}
