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

/** The model id when the name is qualified, otherwise the name unchanged. */
export function getDisplayModelName(name: string): string {
  return splitQualifiedModelName(name)?.modelId ?? name;
}
