import type { OfficeElement, OfficeElementType, OfficePoint } from "./officeTypes";

export type OfficeFurnitureType = Exclude<OfficeElementType, "projectGroup" | "desk">;
export type OfficeFurnitureAddKind = OfficeFurnitureType | "conferenceSet";

const DEFAULT_CONFERENCE_TABLE_ID = "conference-table";

interface OfficeFurnitureBlueprint {
  type: OfficeFurnitureType;
  width: number;
  height: number;
  metadata?: OfficeElement["metadata"];
}

const FURNITURE_BLUEPRINTS: Record<OfficeFurnitureType, OfficeFurnitureBlueprint> = {
  waterCooler: {
    type: "waterCooler",
    width: 40,
    height: 92,
  },
  conferenceTable: {
    type: "conferenceTable",
    width: 256,
    height: 96,
  },
  chair: {
    type: "chair",
    width: 16,
    height: 16,
  },
  plant: {
    type: "plant",
    width: 56,
    height: 70,
  },
  coffeeBar: {
    type: "coffeeBar",
    width: 96,
    height: 128,
  },
};

const FURNITURE_BASE_IDS: Record<OfficeFurnitureType, string> = {
  waterCooler: "water-cooler",
  conferenceTable: "conference-table",
  chair: "chair",
  plant: "plant",
  coffeeBar: "coffee-bar",
};

type OfficeElementMetadata = Record<string, string | number | boolean | null | undefined>;

function cloneMetadata(metadata: OfficeElement["metadata"] | undefined): OfficeElementMetadata | undefined {
  if (!metadata) {
    return undefined;
  }
  return { ...metadata };
}

function cloneElement(element: OfficeElement): OfficeElement {
  return {
    id: element.id,
    type: element.type,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    draggable: element.draggable,
    ...(element.parentId ? { parentId: element.parentId } : {}),
    ...(element.metadata ? { metadata: { ...element.metadata } } : {}),
  };
}

export const DEFAULT_FURNITURE_ELEMENTS: OfficeElement[] = [
  {
    id: "water-cooler",
    type: "waterCooler",
    x: 160,
    y: 236,
    width: 40,
    height: 92,
    draggable: true,
  },
  {
    id: DEFAULT_CONFERENCE_TABLE_ID,
    type: "conferenceTable",
    x: 672,
    y: 352,
    width: 256,
    height: 96,
    draggable: true,
  },
  {
    id: "chair-1",
    type: "chair",
    x: 692,
    y: 372,
    width: 16,
    height: 16,
    draggable: true,
    parentId: DEFAULT_CONFERENCE_TABLE_ID,
    metadata: { group: "conference", seat: 1 },
  },
  {
    id: "chair-2",
    type: "chair",
    x: 732,
    y: 357,
    width: 16,
    height: 16,
    draggable: true,
    parentId: DEFAULT_CONFERENCE_TABLE_ID,
    metadata: { group: "conference", seat: 2 },
  },
  {
    id: "chair-3",
    type: "chair",
    x: 852,
    y: 357,
    width: 16,
    height: 16,
    draggable: true,
    parentId: DEFAULT_CONFERENCE_TABLE_ID,
    metadata: { group: "conference", seat: 3 },
  },
  {
    id: "chair-4",
    type: "chair",
    x: 892,
    y: 372,
    width: 16,
    height: 16,
    draggable: true,
    parentId: DEFAULT_CONFERENCE_TABLE_ID,
    metadata: { group: "conference", seat: 4 },
  },
  {
    id: "chair-5",
    type: "chair",
    x: 892,
    y: 412,
    width: 16,
    height: 16,
    draggable: true,
    parentId: DEFAULT_CONFERENCE_TABLE_ID,
    metadata: { group: "conference", seat: 5 },
  },
  {
    id: "chair-6",
    type: "chair",
    x: 852,
    y: 427,
    width: 16,
    height: 16,
    draggable: true,
    parentId: DEFAULT_CONFERENCE_TABLE_ID,
    metadata: { group: "conference", seat: 6 },
  },
  {
    id: "chair-7",
    type: "chair",
    x: 732,
    y: 427,
    width: 16,
    height: 16,
    draggable: true,
    parentId: DEFAULT_CONFERENCE_TABLE_ID,
    metadata: { group: "conference", seat: 7 },
  },
  {
    id: "chair-8",
    type: "chair",
    x: 692,
    y: 412,
    width: 16,
    height: 16,
    draggable: true,
    parentId: DEFAULT_CONFERENCE_TABLE_ID,
    metadata: { group: "conference", seat: 8 },
  },
  {
    id: "plant-left",
    type: "plant",
    x: 92,
    y: 452,
    width: 56,
    height: 70,
    draggable: true,
  },
  {
    id: "plant-right",
    type: "plant",
    x: 1452,
    y: 452,
    width: 56,
    height: 70,
    draggable: true,
  },
  {
    id: "coffee-bar",
    type: "coffeeBar",
    x: 1392,
    y: 84,
    width: 96,
    height: 128,
    draggable: true,
  },
];

export function createDefaultOfficeFurniture(): OfficeElement[] {
  return DEFAULT_FURNITURE_ELEMENTS.map(cloneElement);
}

function nextFurnitureId(existingFurniture: OfficeElement[], baseId: string): string {
  const existingIds = new Set(existingFurniture.map((element) => element.id));
  if (!existingIds.has(baseId)) {
    return baseId;
  }
  let suffix = 2;
  while (existingIds.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }
  return `${baseId}-${suffix}`;
}

function createFurnitureElement(
  type: OfficeFurnitureType,
  position: OfficePoint,
  existingFurniture: OfficeElement[],
  overrides?: Partial<OfficeElement>,
): OfficeElement {
  const blueprint = FURNITURE_BLUEPRINTS[type];
  const id = overrides?.id ?? nextFurnitureId(existingFurniture, FURNITURE_BASE_IDS[type]);
  const metadata = {
    ...cloneMetadata(blueprint.metadata),
    ...cloneMetadata(overrides?.metadata),
  };
  return {
    id,
    type,
    x: Math.round(position.x),
    y: Math.round(position.y),
    width: blueprint.width,
    height: blueprint.height,
    draggable: true,
    ...(overrides?.parentId ? { parentId: overrides.parentId } : {}),
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
}

function centeredTopLeft(anchor: OfficePoint, size: { width: number; height: number }): OfficePoint {
  return {
    x: Math.round(anchor.x - size.width / 2),
    y: Math.round(anchor.y - size.height / 2),
  };
}

export function createOfficeFurniture(
  kind: OfficeFurnitureAddKind,
  anchor: OfficePoint,
  existingFurniture: OfficeElement[],
): OfficeElement[] {
  if (kind === "conferenceSet") {
    const tablePosition = centeredTopLeft(anchor, FURNITURE_BLUEPRINTS.conferenceTable);
    const table = createFurnitureElement("conferenceTable", tablePosition, existingFurniture);
    const createdFurniture: OfficeElement[] = [table];
    const chairOffsets = [
      { x: 20, y: 20 },
      { x: 60, y: 5 },
      { x: 180, y: 5 },
      { x: 220, y: 20 },
      { x: 220, y: 60 },
      { x: 180, y: 75 },
      { x: 60, y: 75 },
      { x: 20, y: 60 },
    ];
    for (const [index, offset] of chairOffsets.entries()) {
      const chair = createFurnitureElement(
        "chair",
        {
          x: tablePosition.x + offset.x,
          y: tablePosition.y + offset.y,
        },
        [...existingFurniture, ...createdFurniture],
        {
          id: `${table.id}-chair-${index + 1}`,
          parentId: table.id,
          metadata: { group: "conference", seat: index + 1 },
        },
      );
      createdFurniture.push(chair);
    }
    return createdFurniture;
  }

  const blueprint = FURNITURE_BLUEPRINTS[kind];
  return [createFurnitureElement(kind, centeredTopLeft(anchor, blueprint), existingFurniture)];
}

function collectDescendantIds(
  furniture: OfficeElement[],
  parentId: string,
  descendants = new Set<string>(),
): Set<string> {
  const directChildren = furniture.filter((element) => element.parentId === parentId);
  for (const child of directChildren) {
    if (descendants.has(child.id)) {
      continue;
    }
    descendants.add(child.id);
    collectDescendantIds(furniture, child.id, descendants);
  }
  return descendants;
}

export function moveOfficeFurnitureWithChildren(
  furniture: OfficeElement[],
  movedId: string,
  nextPoint: OfficePoint,
): OfficeElement[] {
  const current = furniture.find((element) => element.id === movedId);
  if (!current) {
    return furniture;
  }

  const deltaX = nextPoint.x - current.x;
  const deltaY = nextPoint.y - current.y;
  if (deltaX === 0 && deltaY === 0) {
    return furniture;
  }

  const descendantIds = collectDescendantIds(furniture, movedId);
  return furniture.map((element) =>
    element.id === movedId || descendantIds.has(element.id)
      ? {
          ...cloneElement(element),
          x: element.x + deltaX,
          y: element.y + deltaY,
        }
      : cloneElement(element),
  );
}

export function removeOfficeFurniture(furniture: OfficeElement[], removedId: string): OfficeElement[] {
  const descendantIds = collectDescendantIds(furniture, removedId);
  return furniture
    .filter((element) => element.id !== removedId && !descendantIds.has(element.id))
    .map(cloneElement);
}
