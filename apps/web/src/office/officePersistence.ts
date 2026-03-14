import { OFFICE_LAYOUT_STORAGE_KEY, createDefaultOfficePersistedState } from "./officeDefaults";
import {
  createLegacyDefaultOfficeFurnitureAsFloating,
  isLegacyDefaultOfficeFurnitureId,
} from "./officeFurniture";
import type {
  OfficeFurniturePlacement,
  OfficePersistedFurniture,
  OfficePersistedState,
} from "./officeTypes";

type LegacyOfficeFurnitureType = OfficePersistedFurniture["type"] | "serverRack" | "tv";

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

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  if (!value.every((entry) => typeof entry === "string")) {
    return null;
  }
  return [...value];
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

function isOfficeFurnitureType(value: unknown): value is LegacyOfficeFurnitureType {
  return (
    value === "waterCooler" ||
    value === "conferenceTable" ||
    value === "chair" ||
    value === "plant" ||
    value === "coffeeBar" ||
    value === "serverRack" ||
    value === "tv"
  );
}

function readPlacement(value: unknown): OfficeFurniturePlacement | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const placement = value as {
    kind?: unknown;
    position?: unknown;
    groupKey?: unknown;
    offset?: unknown;
  };
  if (placement.kind === "floating" && isPointRecord(placement.position)) {
    return {
      kind: "floating",
      position: { x: placement.position.x, y: placement.position.y },
    };
  }
  if (
    placement.kind === "groupLinked" &&
    typeof placement.groupKey === "string" &&
    isPointRecord(placement.offset)
  ) {
    return {
      kind: "groupLinked",
      groupKey: placement.groupKey,
      offset: { x: placement.offset.x, y: placement.offset.y },
    };
  }
  return null;
}

type PersistedFurnitureRecord = {
  id: string;
  type: LegacyOfficeFurnitureType;
  width: number;
  height: number;
  draggable: boolean;
  placement: OfficeFurniturePlacement;
  parentId?: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

function isOfficePersistedFurnitureRecord(value: unknown): value is PersistedFurnitureRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const furniture = value as Partial<OfficePersistedFurniture>;
  if (
    typeof furniture.id !== "string" ||
    !isOfficeFurnitureType(furniture.type) ||
    !isFiniteNumber(furniture.width) ||
    !isFiniteNumber(furniture.height) ||
    typeof furniture.draggable !== "boolean" ||
    !readPlacement(furniture.placement)
  ) {
    return false;
  }
  if (furniture.parentId !== undefined && typeof furniture.parentId !== "string") {
    return false;
  }
  if (
    furniture.metadata !== undefined &&
    (typeof furniture.metadata !== "object" || furniture.metadata === null || Array.isArray(furniture.metadata))
  ) {
    return false;
  }
  return true;
}

function readPersistedFurniture(value: unknown): PersistedFurnitureRecord[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const furniture: PersistedFurnitureRecord[] = [];
  for (const entry of value) {
    if (!isOfficePersistedFurnitureRecord(entry)) {
      return null;
    }
    furniture.push({
      id: entry.id,
      type: entry.type,
      width: entry.width,
      height: entry.height,
      draggable: entry.draggable,
      placement: readPlacement(entry.placement)!,
      ...(entry.parentId ? { parentId: entry.parentId } : {}),
      ...(entry.metadata ? { metadata: { ...entry.metadata } } : {}),
    });
  }
  return furniture;
}

function normalizePersistedFurniture(furniture: PersistedFurnitureRecord[]): OfficePersistedFurniture[] {
  const normalized: OfficePersistedFurniture[] = [];

  for (const element of furniture) {
    if (element.type === "serverRack" || element.type === "tv") {
      continue;
    }

    if (
      element.type === "coffeeBar" &&
      element.placement.kind === "groupLinked" &&
      typeof element.placement.groupKey === "string" &&
      element.id === `group:${element.placement.groupKey}:coffee-bar`
    ) {
      continue;
    }

    normalized.push({
      id: element.id,
      type: element.type,
      width: element.width,
      height: element.height,
      draggable: element.draggable,
      placement: element.placement,
      ...(element.parentId ? { parentId: element.parentId } : {}),
      ...(element.metadata ? { metadata: { ...element.metadata } } : {}),
    });
  }

  return normalized;
}

interface LegacyOfficeElement {
  id: string;
  type: LegacyOfficeFurnitureType;
  x: number;
  y: number;
  width: number;
  height: number;
  draggable: boolean;
  parentId?: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
}

function isLegacyOfficeElementType(value: unknown): value is LegacyOfficeElement["type"] {
  return isOfficeFurnitureType(value);
}

function isLegacyOfficeElementRecord(value: unknown): value is LegacyOfficeElement {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const element = value as Partial<LegacyOfficeElement>;
  if (
    typeof element.id !== "string" ||
    !isLegacyOfficeElementType(element.type) ||
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

function readLegacyFurniture(value: unknown): LegacyOfficeElement[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const furniture: LegacyOfficeElement[] = [];
  for (const element of value) {
    if (!isLegacyOfficeElementRecord(element)) {
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

function migrateLegacyElementsToPersistedFurniture(
  furniture: LegacyOfficeElement[],
): OfficePersistedFurniture[] {
  const droppedLegacyIds = new Set(
    furniture
      .filter(
        (element) =>
          isLegacyDefaultOfficeFurnitureId(element.id) ||
          (element.parentId ? isLegacyDefaultOfficeFurnitureId(element.parentId) : false),
      )
      .map((element) => element.id),
  );

  const migrated: OfficePersistedFurniture[] = [];
  for (const element of furniture) {
    if (droppedLegacyIds.has(element.id) || element.type === "serverRack" || element.type === "tv") {
      continue;
    }
    const next: OfficePersistedFurniture = {
      id: element.id,
      type: element.type,
      width: element.width,
      height: element.height,
      draggable: element.draggable,
      placement: {
        kind: "floating",
        position: { x: element.x, y: element.y },
      },
    };
    if (element.parentId) {
      next.parentId = element.parentId;
    }
    if (element.metadata) {
      next.metadata = { ...element.metadata };
    }
    migrated.push(next);
  }
  return migrated;
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
    expandedGroupKeys?: unknown;
    hiddenGroupKeys?: unknown;
    adminDeskPosition?: unknown;
    defaultFurnitureSeededGroupKeys?: unknown;
  };

  if (value.version === 4 && isCameraRecord(value.camera)) {
    const furniture = readPersistedFurniture(value.furniture);
    const projectGroupAnchors = readPointMap(value.projectGroupAnchors);
    const projectGroupSizesByKey =
      value.projectGroupSizesByKey === undefined ? {} : readSizeMap(value.projectGroupSizesByKey);
    const deskOffsetsByThreadId = readPointMap(value.deskOffsetsByThreadId);
    const groupAccentColorsByKey =
      value.groupAccentColorsByKey === undefined ? {} : readStringMap(value.groupAccentColorsByKey);
    const expandedGroupKeys =
      value.expandedGroupKeys === undefined ? [] : readStringArray(value.expandedGroupKeys);
    const hiddenGroupKeys = value.hiddenGroupKeys === undefined ? [] : readStringArray(value.hiddenGroupKeys);
    const adminDeskPosition =
      value.adminDeskPosition === undefined
        ? createDefaultOfficePersistedState().adminDeskPosition
        : value.adminDeskPosition;
    const defaultFurnitureSeededGroupKeys =
      value.defaultFurnitureSeededGroupKeys === undefined
        ? []
        : readStringArray(value.defaultFurnitureSeededGroupKeys);

    if (
      !furniture ||
      !projectGroupAnchors ||
      !projectGroupSizesByKey ||
      !deskOffsetsByThreadId ||
      !groupAccentColorsByKey ||
      !expandedGroupKeys ||
      !hiddenGroupKeys ||
      !isPointRecord(adminDeskPosition) ||
      !defaultFurnitureSeededGroupKeys
    ) {
      return null;
    }

    return {
      version: 4,
      camera: {
        x: value.camera.x,
        y: value.camera.y,
        zoom: value.camera.zoom,
      },
      furniture: normalizePersistedFurniture(furniture),
      projectGroupAnchors,
      projectGroupSizesByKey,
      deskOffsetsByThreadId,
      groupAccentColorsByKey,
      expandedGroupKeys,
      hiddenGroupKeys,
      adminDeskPosition: { x: adminDeskPosition.x, y: adminDeskPosition.y },
      defaultFurnitureSeededGroupKeys,
    };
  }

  if (value.version === 2 && isCameraRecord(value.camera)) {
    const furniture = readLegacyFurniture(value.furniture);
    const projectGroupAnchors = readPointMap(value.projectGroupAnchors);
    const projectGroupSizesByKey =
      value.projectGroupSizesByKey === undefined ? {} : readSizeMap(value.projectGroupSizesByKey);
    const deskOffsetsByThreadId = readPointMap(value.deskOffsetsByThreadId);
    const groupAccentColorsByKey =
      value.groupAccentColorsByKey === undefined ? {} : readStringMap(value.groupAccentColorsByKey);
    const adminDeskPosition =
      value.adminDeskPosition === undefined
        ? createDefaultOfficePersistedState().adminDeskPosition
        : value.adminDeskPosition;
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
      version: 4,
      camera: {
        x: value.camera.x,
        y: value.camera.y,
        zoom: value.camera.zoom,
      },
      furniture: migrateLegacyElementsToPersistedFurniture(furniture),
      projectGroupAnchors,
      projectGroupSizesByKey,
      deskOffsetsByThreadId,
      groupAccentColorsByKey,
      expandedGroupKeys: [],
      hiddenGroupKeys: [],
      adminDeskPosition: { x: adminDeskPosition.x, y: adminDeskPosition.y },
      defaultFurnitureSeededGroupKeys: [],
    };
  }

  if (value.version === 3 && isCameraRecord(value.camera)) {
    const furniture = readPersistedFurniture(value.furniture);
    const projectGroupAnchors = readPointMap(value.projectGroupAnchors);
    const projectGroupSizesByKey =
      value.projectGroupSizesByKey === undefined ? {} : readSizeMap(value.projectGroupSizesByKey);
    const deskOffsetsByThreadId = readPointMap(value.deskOffsetsByThreadId);
    const groupAccentColorsByKey =
      value.groupAccentColorsByKey === undefined ? {} : readStringMap(value.groupAccentColorsByKey);
    const adminDeskPosition =
      value.adminDeskPosition === undefined
        ? createDefaultOfficePersistedState().adminDeskPosition
        : value.adminDeskPosition;
    const defaultFurnitureSeededGroupKeys =
      value.defaultFurnitureSeededGroupKeys === undefined
        ? []
        : readStringArray(value.defaultFurnitureSeededGroupKeys);

    if (
      !furniture ||
      !projectGroupAnchors ||
      !projectGroupSizesByKey ||
      !deskOffsetsByThreadId ||
      !groupAccentColorsByKey ||
      !isPointRecord(adminDeskPosition) ||
      !defaultFurnitureSeededGroupKeys
    ) {
      return null;
    }

    return {
      version: 4,
      camera: {
        x: value.camera.x,
        y: value.camera.y,
        zoom: value.camera.zoom,
      },
      furniture: normalizePersistedFurniture(furniture),
      projectGroupAnchors,
      projectGroupSizesByKey,
      deskOffsetsByThreadId,
      groupAccentColorsByKey,
      expandedGroupKeys: [],
      hiddenGroupKeys: [],
      adminDeskPosition: { x: adminDeskPosition.x, y: adminDeskPosition.y },
      defaultFurnitureSeededGroupKeys,
    };
  }

  const legacyState = parseLegacyOfficePersistedState(raw);
  if (!legacyState) {
    return null;
  }

  const legacyFurniture = createLegacyDefaultOfficeFurnitureAsFloating().map((element) => {
    const position =
      element.placement.kind === "floating" ? legacyState.elementsById[element.id] : undefined;
    if (!position || element.placement.kind !== "floating") {
      return element;
    }
    return Object.assign({}, element, {
      placement: {
        kind: "floating" as const,
        position: { x: position.x, y: position.y },
      },
    });
  });

  const migratedLegacyFurniture: LegacyOfficeElement[] = legacyFurniture.map((element) => {
    const next: LegacyOfficeElement = {
      id: element.id,
      type: element.type,
      x: element.placement.kind === "floating" ? element.placement.position.x : 0,
      y: element.placement.kind === "floating" ? element.placement.position.y : 0,
      width: element.width,
      height: element.height,
      draggable: element.draggable,
    };
    if (element.parentId) {
      next.parentId = element.parentId;
    }
    if (element.metadata) {
      next.metadata = { ...element.metadata };
    }
    return next;
  });

  return {
    version: 4,
    camera: legacyState.camera,
    furniture: migrateLegacyElementsToPersistedFurniture(migratedLegacyFurniture),
    projectGroupAnchors: legacyState.projectGroupAnchors,
    projectGroupSizesByKey: {},
    deskOffsetsByThreadId: legacyState.deskOffsetsByThreadId,
    groupAccentColorsByKey: {},
    expandedGroupKeys: [],
    hiddenGroupKeys: [],
    adminDeskPosition: createDefaultOfficePersistedState().adminDeskPosition,
    defaultFurnitureSeededGroupKeys: [],
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

function compareStringArrays(left: string[] | undefined, right: string[] | undefined): boolean {
  if (!left || !right || left.length !== right.length) {
    return false;
  }
  return left.every((entry, index) => entry === right[index]);
}

function arePlacementsEqual(left: OfficeFurniturePlacement, right: OfficeFurniturePlacement): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  if (left.kind === "floating" && right.kind === "floating") {
    return left.position.x === right.position.x && left.position.y === right.position.y;
  }
  if (left.kind === "groupLinked" && right.kind === "groupLinked") {
    return (
      left.groupKey === right.groupKey &&
      left.offset.x === right.offset.x &&
      left.offset.y === right.offset.y
    );
  }
  return false;
}

function areOfficeFurnitureEqual(left: OfficePersistedFurniture, right: OfficePersistedFurniture): boolean {
  return (
    left.id === right.id &&
    left.type === right.type &&
    left.width === right.width &&
    left.height === right.height &&
    left.draggable === right.draggable &&
    arePlacementsEqual(left.placement, right.placement) &&
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
    left.furniture.every((element, index) => areOfficeFurnitureEqual(element, right.furniture[index]!)) &&
    comparePointMaps(left.projectGroupAnchors, right.projectGroupAnchors) &&
    compareSizeMaps(left.projectGroupSizesByKey, right.projectGroupSizesByKey) &&
    comparePointMaps(left.deskOffsetsByThreadId, right.deskOffsetsByThreadId) &&
    compareStringMaps(left.groupAccentColorsByKey, right.groupAccentColorsByKey) &&
    compareStringArrays(left.expandedGroupKeys, right.expandedGroupKeys) &&
    compareStringArrays(left.hiddenGroupKeys, right.hiddenGroupKeys) &&
    left.adminDeskPosition.x === right.adminDeskPosition.x &&
    left.adminDeskPosition.y === right.adminDeskPosition.y &&
    compareStringArrays(left.defaultFurnitureSeededGroupKeys, right.defaultFurnitureSeededGroupKeys)
  );
}
