import {
  OFFICE_LAYOUT_STORAGE_KEY,
  createDefaultOfficePersistedState,
} from "./officeDefaults";
import { createDefaultOfficeFurniture } from "./officeFurniture";
import type { OfficeElement, OfficePersistedState } from "./officeTypes";

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

function isCameraRecord(value: unknown): value is OfficePersistedState["camera"] {
  return (
    typeof value === "object" &&
    value !== null &&
    isFiniteNumber((value as { x?: unknown }).x) &&
    isFiniteNumber((value as { y?: unknown }).y) &&
    isFiniteNumber((value as { zoom?: unknown }).zoom)
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

function readStringMap(value: unknown): Record<string, string> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const entries = Object.entries(value);
  const next: Record<string, string> = {};
  for (const [key, item] of entries) {
    if (typeof item !== "string") {
      return null;
    }
    next[key] = item;
  }
  return next;
}

function readSizeMap(value: unknown): Record<string, { width: number; height: number }> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const entries = Object.entries(value);
  const next: Record<string, { width: number; height: number }> = {};
  for (const [key, item] of entries) {
    if (
      typeof item !== "object" ||
      item === null ||
      !isFiniteNumber((item as { width?: unknown }).width) ||
      !isFiniteNumber((item as { height?: unknown }).height)
    ) {
      return null;
    }
    next[key] = {
      width: (item as { width: number }).width,
      height: (item as { height: number }).height,
    };
  }
  return next;
}

function isOfficeElementType(
  value: unknown,
): value is OfficeElement["type"] {
  return (
    value === "projectGroup" ||
    value === "desk" ||
    value === "waterCooler" ||
    value === "conferenceTable" ||
    value === "chair" ||
    value === "plant" ||
    value === "coffeeBar"
  );
}

function isOfficeElementRecord(value: unknown): value is OfficeElement {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const element = value as Partial<OfficeElement>;
  if (
    typeof element.id !== "string" ||
    !isOfficeElementType(element.type) ||
    !isFiniteNumber(element.x) ||
    !isFiniteNumber(element.y) ||
    !isFiniteNumber(element.width) ||
    !isFiniteNumber(element.height) ||
    typeof element.draggable !== "boolean"
  ) {
    return false;
  }
  if (element.parentId !== undefined && typeof element.parentId !== "string") {
    return false;
  }
  if (
    element.metadata !== undefined &&
    (typeof element.metadata !== "object" || element.metadata === null || Array.isArray(element.metadata))
  ) {
    return false;
  }
  return true;
}

function readFurniture(value: unknown): OfficeElement[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const furniture: OfficeElement[] = [];
  for (const element of value) {
    if (!isOfficeElementRecord(element)) {
      return null;
    }
    furniture.push({
      id: element.id,
      type: element.type,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      draggable: element.draggable,
      ...(element.parentId ? { parentId: element.parentId } : {}),
      ...(element.metadata ? { metadata: { ...element.metadata } } : {}),
    });
  }
  return furniture;
}

interface LegacyOfficePersistedState {
  version: 1;
  camera: OfficePersistedState["camera"];
  elementsById: Record<string, { x: number; y: number }>;
  projectGroupAnchors: Record<string, { x: number; y: number }>;
  deskOffsetsByThreadId: Record<string, { x: number; y: number }>;
}

function parseLegacyOfficePersistedState(raw: unknown): LegacyOfficePersistedState | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }

  const value = raw as {
    version?: unknown;
    camera?: unknown;
    elementsById?: unknown;
    projectGroupAnchors?: unknown;
    deskOffsetsByThreadId?: unknown;
  };
  if (value.version !== 1 || !isCameraRecord(value.camera)) {
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

export function parseOfficePersistedState(raw: unknown): OfficePersistedState | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }

  const value = raw as {
    version?: unknown;
    camera?: unknown;
    furniture?: unknown;
    projectGroupAnchors?: unknown;
    projectGroupSizesByKey?: unknown;
    deskOffsetsByThreadId?: unknown;
    groupAccentColorsByKey?: unknown;
    adminDeskPosition?: unknown;
  };
  if (value.version === 2 && isCameraRecord(value.camera)) {
    const furniture = readFurniture(value.furniture);
    const projectGroupAnchors = readPointMap(value.projectGroupAnchors);
    const projectGroupSizesByKey =
      value.projectGroupSizesByKey === undefined ? {} : readSizeMap(value.projectGroupSizesByKey);
    const deskOffsetsByThreadId = readPointMap(value.deskOffsetsByThreadId);
    const groupAccentColorsByKey =
      value.groupAccentColorsByKey === undefined
        ? {}
        : readStringMap(value.groupAccentColorsByKey);
    const adminDeskPosition =
      value.adminDeskPosition === undefined ? createDefaultOfficePersistedState().adminDeskPosition : value.adminDeskPosition;
    if (
      !furniture ||
      !projectGroupAnchors ||
      !projectGroupSizesByKey ||
      !deskOffsetsByThreadId ||
      !groupAccentColorsByKey ||
      !isPointRecord(adminDeskPosition)
    ) {
      return null;
    }

    return {
      version: 2,
      camera: {
        x: value.camera.x,
        y: value.camera.y,
        zoom: value.camera.zoom,
      },
      furniture,
      projectGroupAnchors,
      projectGroupSizesByKey,
      deskOffsetsByThreadId,
      groupAccentColorsByKey,
      adminDeskPosition: { x: adminDeskPosition.x, y: adminDeskPosition.y },
    };
  }

  const legacyState = parseLegacyOfficePersistedState(raw);
  if (!legacyState) {
    return null;
  }

  return {
    version: 2,
    camera: legacyState.camera,
    furniture: (() => {
      const furniture = createDefaultOfficeFurniture();
      for (const element of furniture) {
        const position = legacyState.elementsById[element.id];
        if (!position) {
          continue;
        }
        element.x = position.x;
        element.y = position.y;
      }
      return furniture;
    })(),
    projectGroupAnchors: legacyState.projectGroupAnchors,
    projectGroupSizesByKey: {},
    deskOffsetsByThreadId: legacyState.deskOffsetsByThreadId,
    groupAccentColorsByKey: {},
    adminDeskPosition: createDefaultOfficePersistedState().adminDeskPosition,
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
  left: Record<string, { x: number; y: number }> | undefined,
  right: Record<string, { x: number; y: number }> | undefined,
): boolean {
  if (!left || !right) {
    return false;
  }
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

function compareStringMaps(
  left: Record<string, string> | undefined,
  right: Record<string, string> | undefined,
): boolean {
  if (!left || !right) {
    return false;
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    if (left[key] !== right[key]) {
      return false;
    }
  }
  return true;
}

function compareSizeMaps(
  left: Record<string, { width: number; height: number }> | undefined,
  right: Record<string, { width: number; height: number }> | undefined,
): boolean {
  if (!left || !right) {
    return false;
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    const leftSize = left[key];
    const rightSize = right[key];
    if (
      !leftSize ||
      !rightSize ||
      leftSize.width !== rightSize.width ||
      leftSize.height !== rightSize.height
    ) {
      return false;
    }
  }
  return true;
}

function areOfficeElementsEqual(left: OfficeElement, right: OfficeElement): boolean {
  return (
    left.id === right.id &&
    left.type === right.type &&
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height &&
    left.draggable === right.draggable &&
    left.parentId === right.parentId &&
    JSON.stringify(left.metadata ?? null) === JSON.stringify(right.metadata ?? null)
  );
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
    left.furniture.length === right.furniture.length &&
    left.furniture.every((element, index) => areOfficeElementsEqual(element, right.furniture[index]!)) &&
    comparePointMaps(left.projectGroupAnchors, right.projectGroupAnchors) &&
    compareSizeMaps(left.projectGroupSizesByKey, right.projectGroupSizesByKey) &&
    comparePointMaps(left.deskOffsetsByThreadId, right.deskOffsetsByThreadId) &&
    compareStringMaps(left.groupAccentColorsByKey, right.groupAccentColorsByKey) &&
    left.adminDeskPosition.x === right.adminDeskPosition.x &&
    left.adminDeskPosition.y === right.adminDeskPosition.y
  );
}
