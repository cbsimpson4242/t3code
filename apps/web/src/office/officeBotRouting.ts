import type { OfficeCongregationTarget, OfficePoint } from "./officeTypes";

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function jitterFromSeed(seed: number): OfficePoint {
  return {
    x: ((seed % 9) - 4) * 2,
    y: ((Math.floor(seed / 9) % 9) - 4) * 2,
  };
}

export function getIdleOfficeDestination(input: {
  threadId: string;
  officeTargets: OfficeCongregationTarget[];
  deskLocation: OfficePoint;
  idleStep: number;
}): OfficePoint {
  if (input.officeTargets.length === 0) {
    return { ...input.deskLocation };
  }

  const baseSeed = hashString(input.threadId);
  const target = input.officeTargets[(baseSeed + input.idleStep) % input.officeTargets.length]!;
  const jitter = jitterFromSeed(hashString(`${input.threadId}:${input.idleStep}:${target.id}`));
  return {
    x: Math.round(target.x + jitter.x),
    y: Math.round(target.y + jitter.y),
  };
}
