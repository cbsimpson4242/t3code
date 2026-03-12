export const OFFICE_GROUP_ACCENT_OPTIONS = [
  { label: "Rose", accentColor: "#fb7185" },
  { label: "Amber", accentColor: "#f59e0b" },
  { label: "Emerald", accentColor: "#22c55e" },
  { label: "Cyan", accentColor: "#06b6d4" },
  { label: "Blue", accentColor: "#3b82f6" },
  { label: "Violet", accentColor: "#8b5cf6" },
  { label: "Pink", accentColor: "#ec4899" },
  { label: "Teal", accentColor: "#14b8a6" },
  { label: "Orange", accentColor: "#f97316" },
  { label: "Lime", accentColor: "#84cc16" },
] as const;

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function getDefaultOfficeGroupAccent(groupKey: string): string {
  return OFFICE_GROUP_ACCENT_OPTIONS[hashString(groupKey) % OFFICE_GROUP_ACCENT_OPTIONS.length]!.accentColor;
}

export function resolveOfficeGroupAccent(
  groupKey: string,
  overridesByGroupKey: Record<string, string>,
): string {
  return overridesByGroupKey[groupKey] ?? getDefaultOfficeGroupAccent(groupKey);
}
