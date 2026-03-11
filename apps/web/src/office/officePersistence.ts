import {
  OFFICE_LAYOUT_STORAGE_KEY,
  createDefaultOfficePersistedState,
} from "./officeDefaults";
import type { OfficePersistedState } from "./officeTypes";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPointRecord(value: unknown): value is { x: number; y: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    isFiniteNumber((value as { x?: unknown }).x) &&
    isFiniteNumber((value as { y?: unknown }).y)
  );
}

function readPointMap(value: unknown): Record<string, { x: number; y: number }> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const entries = Object.entries(value);
  const next: Record<string, { x: number; y: number }> = {};
  for (const [key, point] of entries) {
    if (!isPointRecord(point)) {
      return null;
    }
    next[key] = { x: point.x, y: point.y };
  }
  return next;
}

export function parseOfficePersistedState(raw: unknown): OfficePersistedState | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }

  const value = raw as Partial<OfficePersistedState>;
  if (value.version !== 1 || !isPointRecord(value.camera)) {
    return null;
  }

  const elementsById = readPointMap(value.elementsById);
  const projectGroupAnchors = readPointMap(value.projectGroupAnchors);
  const deskOffsetsByThreadId = readPointMap(value.deskOffsetsByThreadId);
  if (!elementsById || !projectGroupAnchors || !deskOffsetsByThreadId) {
    return null;
  }

  return {
    version: 1,
    camera: {
      x: value.camera.x,
      y: value.camera.y,
      zoom: value.camera.zoom,
    },
    elementsById,
    projectGroupAnchors,
    deskOffsetsByThreadId,
  };
}

export function readOfficePersistedState(): OfficePersistedState | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(OFFICE_LAYOUT_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return parseOfficePersistedState(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeOfficePersistedState(state: OfficePersistedState): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(OFFICE_LAYOUT_STORAGE_KEY, JSON.stringify(state));
}

export function clearOfficePersistedState(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(OFFICE_LAYOUT_STORAGE_KEY);
}

export function createResetOfficePersistedState(): OfficePersistedState {
  return createDefaultOfficePersistedState();
}

function comparePointMaps(
  left: Record<string, { x: number; y: number }>,
  right: Record<string, { x: number; y: number }>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    const leftPoint = left[key];
    const rightPoint = right[key];
    if (!leftPoint || !rightPoint || leftPoint.x !== rightPoint.x || leftPoint.y !== rightPoint.y) {
      return false;
    }
  }
  return true;
}

export function areOfficePersistedStatesEqual(
  left: OfficePersistedState,
  right: OfficePersistedState,
): boolean {
  return (
    left.version === right.version &&
    left.camera.x === right.camera.x &&
    left.camera.y === right.camera.y &&
    left.camera.zoom === right.camera.zoom &&
    comparePointMaps(left.elementsById, right.elementsById) &&
    comparePointMaps(left.projectGroupAnchors, right.projectGroupAnchors) &&
    comparePointMaps(left.deskOffsetsByThreadId, right.deskOffsetsByThreadId)
  );
}
