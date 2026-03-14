import {
  GROUP_DESK_LAYOUT_LEFT_PADDING,
  GROUP_DESK_LAYOUT_TOP_PADDING,
  GROUP_MIN_HEIGHT,
  GROUP_MIN_WIDTH,
} from "./officeDefaults";
import type {
  OfficeCongregationTarget,
  OfficeElement,
  OfficeElementMetadata,
  OfficeFurniturePlacement,
  OfficeFurnitureType,
  OfficePersistedFurniture,
  OfficePoint,
} from "./officeTypes";

export type OfficeFurnitureAddKind = OfficeFurnitureType | "conferenceSet";

const DEFAULT_OFFICE_TABLE_ID = "conference-table";
const LEGACY_DEFAULT_CONFERENCE_TABLE_ID = "conference-table";

interface OfficeFurnitureBlueprint {
  type: OfficeFurnitureType;
  width: number;
  height: number;
  metadata?: OfficeElementMetadata;
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

const DEFAULT_LINKED_FURNITURE_OFFSETS = {
  waterCooler: { x: 18, y: 184 },
  conferenceTable: { x: 118, y: 286 },
  plantLeft: { x: 26, y: 426 },
  plantRight: { x: 402, y: 426 },
} as const satisfies Record<string, OfficePoint>;

const DEFAULT_LINKED_FURNITURE_DESCRIPTORS = [
  {
    type: "conferenceTable",
    suffix: DEFAULT_OFFICE_TABLE_ID,
    offset: DEFAULT_LINKED_FURNITURE_OFFSETS.conferenceTable,
    seedOnExistingGroups: false,
  },
  {
    type: "waterCooler",
    suffix: "water-cooler",
    offset: DEFAULT_LINKED_FURNITURE_OFFSETS.waterCooler,
    seedOnExistingGroups: false,
  },
  {
    type: "plant",
    suffix: "plant-left",
    offset: DEFAULT_LINKED_FURNITURE_OFFSETS.plantLeft,
    seedOnExistingGroups: false,
  },
  {
    type: "plant",
    suffix: "plant-right",
    offset: DEFAULT_LINKED_FURNITURE_OFFSETS.plantRight,
    seedOnExistingGroups: false,
  },
] as const satisfies ReadonlyArray<{
  type: OfficeFurnitureType;
  suffix: string;
  offset: OfficePoint;
  seedOnExistingGroups: boolean;
}>;

const LEGACY_DEFAULT_FURNITURE_IDS = new Set([
  "water-cooler",
  LEGACY_DEFAULT_CONFERENCE_TABLE_ID,
  "chair-1",
  "chair-2",
  "chair-3",
  "chair-4",
  "chair-5",
  "chair-6",
  "chair-7",
  "chair-8",
  "plant-left",
  "plant-right",
  "coffee-bar",
]);

function cloneMetadata(metadata: OfficeElementMetadata | undefined): OfficeElementMetadata | undefined {
  if (!metadata) {
    return undefined;
  }
  return { ...metadata };
}

function clonePlacement(placement: OfficeFurniturePlacement): OfficeFurniturePlacement {
  if (placement.kind === "floating") {
    return {
      kind: "floating",
      position: { ...placement.position },
    };
  }
  return {
    kind: "groupLinked",
    groupKey: placement.groupKey,
    offset: { ...placement.offset },
  };
}

function clonePersistedFurniture(furniture: OfficePersistedFurniture): OfficePersistedFurniture {
  return {
    id: furniture.id,
    type: furniture.type,
    width: furniture.width,
    height: furniture.height,
    draggable: furniture.draggable,
    placement: clonePlacement(furniture.placement),
    ...(furniture.parentId ? { parentId: furniture.parentId } : {}),
    ...(furniture.metadata ? { metadata: { ...furniture.metadata } } : {}),
  };
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

function nextFurnitureId(existingFurniture: OfficePersistedFurniture[], baseId: string): string {
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

function centeredTopLeft(anchor: OfficePoint, size: { width: number; height: number }): OfficePoint {
  return {
    x: Math.round(anchor.x - size.width / 2),
    y: Math.round(anchor.y - size.height / 2),
  };
}

function createPersistedFurniture(
  type: OfficeFurnitureType,
  placement: OfficeFurniturePlacement,
  existingFurniture: OfficePersistedFurniture[],
  overrides?: Partial<OfficePersistedFurniture>,
): OfficePersistedFurniture {
  const blueprint = FURNITURE_BLUEPRINTS[type];
  const id = overrides?.id ?? nextFurnitureId(existingFurniture, FURNITURE_BASE_IDS[type]);
  const metadata = {
    ...cloneMetadata(blueprint.metadata),
    ...cloneMetadata(overrides?.metadata),
  };
  return {
    id,
    type,
    width: blueprint.width,
    height: blueprint.height,
    draggable: overrides?.draggable ?? true,
    placement: overrides?.placement ? clonePlacement(overrides.placement) : clonePlacement(placement),
    ...(overrides?.parentId ? { parentId: overrides.parentId } : {}),
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
}

function createGroupFurnitureId(groupKey: string, suffix: string): string {
  return `group:${groupKey}:${suffix}`;
}

function resolvePlacementPoint(
  placement: OfficeFurniturePlacement,
  groupAnchors: Record<string, OfficePoint>,
): OfficePoint | null {
  if (placement.kind === "floating") {
    return { ...placement.position };
  }
  const anchor = groupAnchors[placement.groupKey];
  if (!anchor) {
    return null;
  }
  return {
    x: anchor.x + placement.offset.x,
    y: anchor.y + placement.offset.y,
  };
}

function createResolvedElement(
  furniture: OfficePersistedFurniture,
  groupAnchors: Record<string, OfficePoint>,
): OfficeElement | null {
  const point = resolvePlacementPoint(furniture.placement, groupAnchors);
  if (!point) {
    return null;
  }
  return {
    id: furniture.id,
    type: furniture.type,
    x: point.x,
    y: point.y,
    width: furniture.width,
    height: furniture.height,
    draggable: furniture.draggable,
    ...(furniture.parentId ? { parentId: furniture.parentId } : {}),
    ...(furniture.metadata ? { metadata: { ...furniture.metadata } } : {}),
  };
}

function createCongregationTargets(element: OfficeElement): OfficeCongregationTarget[] {
  const centerX = Math.round(element.x + element.width / 2);
  const centerY = Math.round(element.y + element.height / 2);

  switch (element.type) {
    case "conferenceTable":
      return [
        {
          id: `${element.id}:top`,
          furnitureId: element.id,
          furnitureType: element.type,
          x: centerX,
          y: element.y - 8,
        },
        {
          id: `${element.id}:bottom`,
          furnitureId: element.id,
          furnitureType: element.type,
          x: centerX,
          y: element.y + element.height + 8,
        },
        {
          id: `${element.id}:left`,
          furnitureId: element.id,
          furnitureType: element.type,
          x: element.x - 10,
          y: centerY,
        },
        {
          id: `${element.id}:right`,
          furnitureId: element.id,
          furnitureType: element.type,
          x: element.x + element.width + 10,
          y: centerY,
        },
      ];
    case "coffeeBar":
      return [
        {
          id: `${element.id}:front`,
          furnitureId: element.id,
          furnitureType: element.type,
          x: centerX,
          y: element.y + element.height + 18,
        },
      ];
    case "waterCooler":
      return [
        {
          id: `${element.id}:front`,
          furnitureId: element.id,
          furnitureType: element.type,
          x: centerX,
          y: element.y + element.height + 14,
        },
      ];
    case "plant":
      return [
        {
          id: `${element.id}:nearby`,
          furnitureId: element.id,
          furnitureType: element.type,
          x: centerX,
          y: element.y + element.height + 10,
        },
      ];
    case "chair":
      return [
        {
          id: `${element.id}:seat`,
          furnitureId: element.id,
          furnitureType: element.type,
          x: centerX,
          y: centerY,
        },
      ];
    default:
      return [];
  }
}

function collectDescendantIds(
  furniture: OfficePersistedFurniture[],
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

export function createOfficeFurniture(
  kind: OfficeFurnitureAddKind,
  anchor: OfficePoint,
  existingFurniture: OfficePersistedFurniture[],
): OfficePersistedFurniture[] {
  if (kind === "conferenceSet") {
    const tablePosition = centeredTopLeft(anchor, FURNITURE_BLUEPRINTS.conferenceTable);
    const table = createPersistedFurniture(
      "conferenceTable",
      { kind: "floating", position: tablePosition },
      existingFurniture,
    );
    const createdFurniture: OfficePersistedFurniture[] = [table];
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
      createdFurniture.push(
        createPersistedFurniture(
          "chair",
          {
            kind: "floating",
            position: {
              x: tablePosition.x + offset.x,
              y: tablePosition.y + offset.y,
            },
          },
          [...existingFurniture, ...createdFurniture],
          {
            id: `${table.id}-chair-${index + 1}`,
            parentId: table.id,
            metadata: { group: "conference", seat: index + 1 },
          },
        ),
      );
    }
    return createdFurniture;
  }

  const blueprint = FURNITURE_BLUEPRINTS[kind];
  return [
    createPersistedFurniture(
      kind,
      { kind: "floating", position: centeredTopLeft(anchor, blueprint) },
      existingFurniture,
    ),
  ];
}

export function createDefaultOfficeFurnitureForGroup(
  groupKey: string,
  existingFurniture: OfficePersistedFurniture[],
): OfficePersistedFurniture[] {
  const linked = (type: OfficeFurnitureType, suffix: string, offset: OfficePoint) =>
    createPersistedFurniture(
      type,
      {
        kind: "groupLinked",
        groupKey,
        offset,
      },
      existingFurniture,
      { id: createGroupFurnitureId(groupKey, suffix) },
    );

  return DEFAULT_LINKED_FURNITURE_DESCRIPTORS.map((descriptor) =>
    linked(descriptor.type, descriptor.suffix, descriptor.offset),
  );
}

export function getDefaultOfficeFurnitureBackfillIds(groupKey: string): string[] {
  return DEFAULT_LINKED_FURNITURE_DESCRIPTORS.filter((descriptor) => descriptor.seedOnExistingGroups).map(
    (descriptor) => createGroupFurnitureId(groupKey, descriptor.suffix),
  );
}

export function resolveOfficeFurniture(input: {
  furniture: OfficePersistedFurniture[];
  groupAnchors: Record<string, OfficePoint>;
}): {
  allFurniture: OfficeElement[];
  floatingFurniture: OfficeElement[];
  linkedFurnitureByGroupKey: Record<string, OfficeElement[]>;
  congregationTargetsByGroupKey: Record<string, OfficeCongregationTarget[]>;
} {
  const allFurniture: OfficeElement[] = [];
  const floatingFurniture: OfficeElement[] = [];
  const linkedFurnitureByGroupKey: Record<string, OfficeElement[]> = {};
  const congregationTargetsByGroupKey: Record<string, OfficeCongregationTarget[]> = {};

  for (const furniture of input.furniture) {
    const resolved = createResolvedElement(furniture, input.groupAnchors);
    if (!resolved) {
      continue;
    }
    allFurniture.push(resolved);
    if (furniture.placement.kind === "floating") {
      floatingFurniture.push(resolved);
      continue;
    }
    linkedFurnitureByGroupKey[furniture.placement.groupKey] ??= [];
    linkedFurnitureByGroupKey[furniture.placement.groupKey]!.push(resolved);
    congregationTargetsByGroupKey[furniture.placement.groupKey] ??= [];
    congregationTargetsByGroupKey[furniture.placement.groupKey]!.push(
      ...createCongregationTargets(resolved),
    );
  }

  return {
    allFurniture: allFurniture.map(cloneElement),
    floatingFurniture: floatingFurniture.map(cloneElement),
    linkedFurnitureByGroupKey: Object.fromEntries(
      Object.entries(linkedFurnitureByGroupKey).map(([groupKey, furniture]) => [
        groupKey,
        furniture.map(cloneElement),
      ]),
    ),
    congregationTargetsByGroupKey: Object.fromEntries(
      Object.entries(congregationTargetsByGroupKey).map(([groupKey, targets]) => [
        groupKey,
        targets.map((target) => ({ ...target })),
      ]),
    ),
  };
}

export function moveOfficeFurnitureWithChildren(input: {
  furniture: OfficePersistedFurniture[];
  movedId: string;
  nextPoint: OfficePoint;
  groupAnchors: Record<string, OfficePoint>;
}): OfficePersistedFurniture[] {
  const current = input.furniture.find((element) => element.id === input.movedId);
  if (!current) {
    return input.furniture.map(clonePersistedFurniture);
  }

  const currentPoint = resolvePlacementPoint(current.placement, input.groupAnchors);
  if (!currentPoint) {
    return input.furniture.map(clonePersistedFurniture);
  }

  const deltaX = input.nextPoint.x - currentPoint.x;
  const deltaY = input.nextPoint.y - currentPoint.y;
  if (deltaX === 0 && deltaY === 0) {
    return input.furniture.map(clonePersistedFurniture);
  }

  const descendantIds = collectDescendantIds(input.furniture, input.movedId);
  return input.furniture.map((element) => {
    if (element.id !== input.movedId && !descendantIds.has(element.id)) {
      return clonePersistedFurniture(element);
    }

    if (element.placement.kind === "floating") {
      return {
        ...clonePersistedFurniture(element),
        placement: {
          kind: "floating",
          position: {
            x: element.placement.position.x + deltaX,
            y: element.placement.position.y + deltaY,
          },
        },
      };
    }

    return {
      ...clonePersistedFurniture(element),
      placement: {
        kind: "groupLinked",
        groupKey: element.placement.groupKey,
        offset: {
          x: element.placement.offset.x + deltaX,
          y: element.placement.offset.y + deltaY,
        },
      },
    };
  });
}

export function removeOfficeFurniture(
  furniture: OfficePersistedFurniture[],
  removedId: string,
): OfficePersistedFurniture[] {
  const descendantIds = collectDescendantIds(furniture, removedId);
  return furniture
    .filter((element) => element.id !== removedId && !descendantIds.has(element.id))
    .map(clonePersistedFurniture);
}

export function isLegacyDefaultOfficeFurnitureId(id: string): boolean {
  return LEGACY_DEFAULT_FURNITURE_IDS.has(id);
}

export function createLegacyDefaultOfficeFurnitureAsFloating(): OfficePersistedFurniture[] {
  const legacyFurniture: Array<{
    id: string;
    type: OfficeFurnitureType;
    position: OfficePoint;
    parentId?: string;
    metadata?: OfficeElementMetadata;
  }> = [
    {
      id: "water-cooler",
      type: "waterCooler",
      position: { x: 160, y: 236 },
    },
    {
      id: LEGACY_DEFAULT_CONFERENCE_TABLE_ID,
      type: "conferenceTable",
      position: { x: 672, y: 352 },
    },
    {
      id: "chair-1",
      type: "chair",
      position: { x: 692, y: 372 },
      parentId: LEGACY_DEFAULT_CONFERENCE_TABLE_ID,
      metadata: { group: "conference", seat: 1 },
    },
    {
      id: "chair-2",
      type: "chair",
      position: { x: 732, y: 357 },
      parentId: LEGACY_DEFAULT_CONFERENCE_TABLE_ID,
      metadata: { group: "conference", seat: 2 },
    },
    {
      id: "chair-3",
      type: "chair",
      position: { x: 852, y: 357 },
      parentId: LEGACY_DEFAULT_CONFERENCE_TABLE_ID,
      metadata: { group: "conference", seat: 3 },
    },
    {
      id: "chair-4",
      type: "chair",
      position: { x: 892, y: 372 },
      parentId: LEGACY_DEFAULT_CONFERENCE_TABLE_ID,
      metadata: { group: "conference", seat: 4 },
    },
    {
      id: "chair-5",
      type: "chair",
      position: { x: 892, y: 412 },
      parentId: LEGACY_DEFAULT_CONFERENCE_TABLE_ID,
      metadata: { group: "conference", seat: 5 },
    },
    {
      id: "chair-6",
      type: "chair",
      position: { x: 852, y: 427 },
      parentId: LEGACY_DEFAULT_CONFERENCE_TABLE_ID,
      metadata: { group: "conference", seat: 6 },
    },
    {
      id: "chair-7",
      type: "chair",
      position: { x: 732, y: 427 },
      parentId: LEGACY_DEFAULT_CONFERENCE_TABLE_ID,
      metadata: { group: "conference", seat: 7 },
    },
    {
      id: "chair-8",
      type: "chair",
      position: { x: 692, y: 412 },
      parentId: LEGACY_DEFAULT_CONFERENCE_TABLE_ID,
      metadata: { group: "conference", seat: 8 },
    },
    {
      id: "plant-left",
      type: "plant",
      position: { x: 92, y: 452 },
    },
    {
      id: "plant-right",
      type: "plant",
      position: { x: 1452, y: 452 },
    },
    {
      id: "coffee-bar",
      type: "coffeeBar",
      position: { x: 1392, y: 84 },
    },
  ];

  return legacyFurniture.map((item, index) =>
    createPersistedFurniture(
      item.type,
      {
        kind: "floating",
        position: item.position,
      },
      legacyFurniture
        .slice(0, index)
        .map((previous) =>
          createPersistedFurniture(
            previous.type,
            { kind: "floating", position: previous.position },
            [],
            {
              id: previous.id,
              ...(previous.parentId ? { parentId: previous.parentId } : {}),
              ...(previous.metadata ? { metadata: previous.metadata } : {}),
            },
          ),
        ),
      {
        id: item.id,
        ...(item.parentId ? { parentId: item.parentId } : {}),
        ...(item.metadata ? { metadata: item.metadata } : {}),
      },
    ),
  );
}

export function getDefaultOfficeFurnitureFootprint() {
  return {
    minWidth: Math.max(
      GROUP_MIN_WIDTH,
      DEFAULT_LINKED_FURNITURE_OFFSETS.conferenceTable.x +
        FURNITURE_BLUEPRINTS.conferenceTable.width +
        GROUP_DESK_LAYOUT_LEFT_PADDING,
      DEFAULT_LINKED_FURNITURE_OFFSETS.plantRight.x +
        FURNITURE_BLUEPRINTS.plant.width +
        GROUP_DESK_LAYOUT_LEFT_PADDING,
    ),
    minHeight: Math.max(
      GROUP_MIN_HEIGHT,
      DEFAULT_LINKED_FURNITURE_OFFSETS.plantLeft.y +
        FURNITURE_BLUEPRINTS.plant.height +
        GROUP_DESK_LAYOUT_TOP_PADDING,
      DEFAULT_LINKED_FURNITURE_OFFSETS.conferenceTable.y +
        FURNITURE_BLUEPRINTS.conferenceTable.height +
        GROUP_DESK_LAYOUT_TOP_PADDING,
    ),
  };
}
