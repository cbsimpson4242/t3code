import { Schema } from "effect";

import { IsoDateTime, TrimmedNonEmptyString } from "./baseSchemas";
import { ProviderKind } from "./orchestration";

export const RUNTIME_WS_METHODS = {
  getCatalog: "runtime.getCatalog",
} as const;

export const RUNTIME_WS_CHANNELS = {
  catalogUpdated: "runtime.catalogUpdated",
} as const;

export const RuntimeAuthBackend = Schema.Literals(["codex-cli-bridge"]);
export type RuntimeAuthBackend = typeof RuntimeAuthBackend.Type;

export const RuntimeCatalogModel = Schema.Struct({
  id: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  available: Schema.Boolean,
  legacy: Schema.optional(Schema.Boolean),
});
export type RuntimeCatalogModel = typeof RuntimeCatalogModel.Type;

export const RuntimeCatalogAccountSummary = Schema.Struct({
  authStatus: Schema.Literals(["authenticated", "unauthenticated", "unknown"]),
  bridgeMessage: Schema.optional(TrimmedNonEmptyString),
  checkedAt: IsoDateTime,
});
export type RuntimeCatalogAccountSummary = typeof RuntimeCatalogAccountSummary.Type;

export const RuntimeCatalog = Schema.Struct({
  provider: ProviderKind,
  authBackend: RuntimeAuthBackend,
  models: Schema.Array(RuntimeCatalogModel),
  defaultModel: TrimmedNonEmptyString,
  bridgeHealthy: Schema.Boolean,
  accountSummary: Schema.optional(RuntimeCatalogAccountSummary),
});
export type RuntimeCatalog = typeof RuntimeCatalog.Type;

export const RuntimeGetCatalogInput = Schema.Struct({});
export type RuntimeGetCatalogInput = typeof RuntimeGetCatalogInput.Type;

export const RuntimeGetCatalogResult = RuntimeCatalog;
export type RuntimeGetCatalogResult = typeof RuntimeGetCatalogResult.Type;
