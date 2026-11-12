import type { ProviderDriverKind } from "@t3tools/contracts";
import { resolveModelShortName } from "@t3tools/client-runtime/provider-clients";

export type ModelEsque = {
  slug: string;
  name: string;
  shortName?: string | undefined;
  subProvider?: string | undefined;
  aliases?: ReadonlyArray<string> | undefined;
  isDefault?: boolean | undefined;
  badge?: "new" | undefined;
  isLegacy?: boolean | undefined;
  isUnavailable?: boolean | undefined;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripLeadingQualifier(value: string, qualifier: string | null | undefined): string {
  const trimmedQualifier = qualifier?.trim();
  if (!trimmedQualifier) {
    return value;
  }

  const pattern = new RegExp(`^${escapeRegExp(trimmedQualifier)}(?:\\s*[.:/-]\\s*|\\s+)`, "iu");
  return value.replace(pattern, "").trim() || value;
}

const QUALIFIED_MODEL_NAME_SEPARATOR = " · ";

/**
 * Splits ACP model names shaped "Upstream label · model-id" (e.g. Hermes reports
 * "OpenRouter · anthropic/claude-fable-5.2") so the model id can lead the row.
 */
export function splitQualifiedModelName(
  name: string,
): { readonly label: string; readonly modelId: string } | null {
  const index = name.indexOf(QUALIFIED_MODEL_NAME_SEPARATOR);
  if (index <= 0) return null;
  const label = name.slice(0, index).trim();
  const modelId = name.slice(index + QUALIFIED_MODEL_NAME_SEPARATOR.length).trim();
  return label && modelId ? { label, modelId } : null;
}

export function getDisplayModelName(
  model: ModelEsque,
  options?: { preferShortName?: boolean },
): string {
  const name = options?.preferShortName && model.shortName ? model.shortName : model.name;
  const qualified = splitQualifiedModelName(name);
  if (qualified) return qualified.modelId;
  return stripLeadingQualifier(name, model.subProvider);
}

export function getTriggerDisplayModelName(
  model: ModelEsque,
  driverKind: ProviderDriverKind | null | undefined,
): string {
  const shortName = resolveModelShortName(model, driverKind);
  return getDisplayModelName({ ...model, shortName }, { preferShortName: true });
}
