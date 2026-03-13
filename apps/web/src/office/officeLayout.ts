import type { Project, Thread } from "../types";
import { derivePendingApprovals, derivePendingUserInputs, derivePhase } from "../session-logic";
import {
  DEFAULT_GROUP_APPEND_STEP,
  DEFAULT_GROUP_START,
  DESK_BOT_TARGET,
  DESK_HEIGHT,
  DESK_WIDTH,
  GROUP_FRAME_BOTTOM_PADDING,
  GROUP_FRAME_SIDE_PADDING,
  GROUP_FRAME_TOP_PADDING,
  GROUP_MIN_HEIGHT,
  GROUP_MIN_WIDTH,
} from "./officeDefaults";
import { resolveOfficeGroupAccent } from "./officeColors";
import {
  createDefaultOfficeFurnitureForGroup,
  resolveOfficeFurniture,
} from "./officeFurniture";
import type {
  OfficeDeskInput,
  OfficeDeskScene,
  OfficeElement,
  OfficePersistedFurniture,
  OfficePersistedState,
  OfficePoint,
  OfficeProjectGroupInput,
  OfficeProjectGroupScene,
  OfficeSceneBounds,
  OfficeSceneBuildResult,
  OfficeSize,
} from "./officeTypes";

function getPathLeaf(path: string | null | undefined) {
  if (!path) return null;
  const segments = path.split(/[/\\]/).filter(Boolean);
  return segments.at(-1) ?? null;
}

function elementBounds(element: OfficeElement): OfficeSceneBounds {
  return {
    minX: element.x,
    minY: element.y,
    maxX: element.x + element.width,
    maxY: element.y + element.height,
  };
}

function unionBounds(boundsList: OfficeSceneBounds[]): OfficeSceneBounds {
  if (boundsList.length === 0) {
    return {
      minX: 0,
      minY: 0,
      maxX: 1,
      maxY: 1,
    };
  }
  return boundsList.reduce(
    (current, next) => ({
      minX: Math.min(current.minX, next.minX),
      minY: Math.min(current.minY, next.minY),
      maxX: Math.max(current.maxX, next.maxX),
      maxY: Math.max(current.maxY, next.maxY),
    }),
    boundsList[0]!,
  );
}

function nextGroupAnchor(existingAnchors: OfficePoint[]): OfficePoint {
  if (existingAnchors.length === 0) {
    return { ...DEFAULT_GROUP_START };
  }
  const rightMostAnchor = existingAnchors.reduce((best, candidate) =>
    candidate.x > best.x ? candidate : best,
  );
  return {
    x: rightMostAnchor.x + DEFAULT_GROUP_APPEND_STEP.x,
    y: rightMostAnchor.y + DEFAULT_GROUP_APPEND_STEP.y,
  };
}

function clampGroupFrameSize(size: OfficeSize): OfficeSize {
  return {
    width: Math.max(GROUP_MIN_WIDTH, Math.round(size.width)),
    height: Math.max(GROUP_MIN_HEIGHT, Math.round(size.height)),
  };
}

function deskSlotCandidates(): OfficePoint[] {
  const candidates: OfficePoint[] = [];
  for (let row = 0; row < 10; row += 1) {
    if (row === 0) {
      candidates.push({ x: 102, y: 34 });
    }
    candidates.push({ x: 18, y: 34 + row * 70 });
    candidates.push({ x: 186, y: 34 + row * 70 });
    if (row > 0) {
      candidates.push({ x: 102, y: 34 + row * 70 });
    }
  }
  return candidates;
}

const DEFAULT_DESK_SLOTS = deskSlotCandidates();

function isSlotOccupied(candidate: OfficePoint, existing: OfficePoint[]): boolean {
  return existing.some(
    (current) => Math.abs(current.x - candidate.x) < 8 && Math.abs(current.y - candidate.y) < 8,
  );
}

function nextDeskOffset(existingOffsets: OfficePoint[]): OfficePoint {
  for (const candidate of DEFAULT_DESK_SLOTS) {
    if (!isSlotOccupied(candidate, existingOffsets)) {
      return candidate;
    }
  }
  const extraIndex = existingOffsets.length;
  return {
    x: 18 + (extraIndex % 3) * 84,
    y: 34 + Math.floor(extraIndex / 3) * 70,
  };
}

function clonePersistedFurniture(furniture: OfficePersistedFurniture): OfficePersistedFurniture {
  return {
    id: furniture.id,
    type: furniture.type,
    width: furniture.width,
    height: furniture.height,
    draggable: furniture.draggable,
    placement:
      furniture.placement.kind === "floating"
        ? {
            kind: "floating",
            position: { ...furniture.placement.position },
          }
        : {
            kind: "groupLinked",
            groupKey: furniture.placement.groupKey,
            offset: { ...furniture.placement.offset },
          },
    ...(furniture.parentId ? { parentId: furniture.parentId } : {}),
    ...(furniture.metadata ? { metadata: { ...furniture.metadata } } : {}),
  };
}

function threadHasVisibleOfficeActivity(thread: Thread): boolean {
  const sessionPhase = derivePhase(thread.session);
  if (sessionPhase === "running" || sessionPhase === "connecting") {
    return true;
  }
  return thread.messages.some((message) => message.role === "assistant" && message.streaming);
}

function threadHasOfficeError(thread: Thread): boolean {
  return thread.session?.status === "error" || thread.latestTurn?.state === "error";
}

export function deriveOfficeInputs(
  projects: Project[],
  threads: Thread[],
  groupAccentColorsByKey: Record<string, string> = {},
): { groups: OfficeProjectGroupInput[]; desks: OfficeDeskInput[] } {
  const projectById = new Map(projects.map((project) => [project.id, project] as const));
  const groupedThreads = new Map<
    string,
    {
      key: string;
      label: string;
      cwd: string | null;
      threads: Thread[];
    }
  >();

  for (const thread of threads) {
    const project = projectById.get(thread.projectId);
    const cwd = thread.worktreePath ?? project?.cwd ?? null;
    const key = cwd ?? `project:${thread.projectId}`;
    const label = getPathLeaf(cwd) ?? project?.name ?? "Unassigned";
    const existing = groupedThreads.get(key);
    if (existing) {
      existing.threads.push(thread);
      continue;
    }
    groupedThreads.set(key, {
      key,
      label,
      cwd,
      threads: [thread],
    });
  }

  const groups = [...groupedThreads.values()].map((group) => ({
    key: group.key,
    label: group.label,
    cwd: group.cwd,
    threadIds: group.threads.map((thread) => thread.id),
  }));

  const desks = [...groupedThreads.values()].flatMap((group, groupIndex) =>
    group.threads.map((thread, threadIndex) => {
      const hasPendingUserInput = derivePendingUserInputs(thread.activities).length > 0;
      const hasPendingApproval = derivePendingApprovals(thread.activities).length > 0;
      return {
        hasPendingUserInput,
        hasPendingApproval,
        needsAttention: hasPendingUserInput || hasPendingApproval,
        threadId: thread.id,
        title: thread.title,
        model: thread.model,
        groupKey: group.key,
        accentColor: resolveOfficeGroupAccent(group.key, groupAccentColorsByKey),
        isActive: threadHasVisibleOfficeActivity(thread),
        isError: threadHasOfficeError(thread),
        colorIndex: groupIndex + threadIndex,
      };
    }),
  );

  return { groups, desks };
}

export function buildOfficeScene(input: {
  groups: OfficeProjectGroupInput[];
  desks: OfficeDeskInput[];
  persistedState: OfficePersistedState;
}): OfficeSceneBuildResult {
  const desksByGroupKey = new Map<string, OfficeDeskInput[]>();
  for (const desk of input.desks) {
    const next = desksByGroupKey.get(desk.groupKey);
    if (next) {
      next.push(desk);
    } else {
      desksByGroupKey.set(desk.groupKey, [desk]);
    }
  }

  const nextProjectGroupAnchors: Record<string, OfficePoint> = {};
  const nextProjectGroupSizesByKey: Record<string, OfficeSize> = {};
  for (const group of input.groups) {
    const anchor = input.persistedState.projectGroupAnchors[group.key];
    if (anchor) {
      nextProjectGroupAnchors[group.key] = anchor;
      continue;
    }
    nextProjectGroupAnchors[group.key] = nextGroupAnchor(Object.values(nextProjectGroupAnchors));
  }

  const seededGroupKeys = new Set(input.persistedState.defaultFurnitureSeededGroupKeys);
  const nextPersistedFurniture = input.persistedState.furniture.map(clonePersistedFurniture);
  for (const group of input.groups) {
    if (seededGroupKeys.has(group.key)) {
      continue;
    }
    nextPersistedFurniture.push(...createDefaultOfficeFurnitureForGroup(group.key, nextPersistedFurniture));
    seededGroupKeys.add(group.key);
  }

  const resolvedFurniture = resolveOfficeFurniture({
    furniture: nextPersistedFurniture,
    groupAnchors: nextProjectGroupAnchors,
  });

  const nextDeskOffsetsByThreadId: Record<string, OfficePoint> = {};
  const deskScenes: OfficeDeskScene[] = [];
  const groupScenes: OfficeProjectGroupScene[] = [];

  for (const group of input.groups) {
    const anchor = nextProjectGroupAnchors[group.key]!;
    const groupDeskInputs = desksByGroupKey.get(group.key) ?? [];
    const existingOffsets = groupDeskInputs
      .map((desk) => input.persistedState.deskOffsetsByThreadId[desk.threadId])
      .filter((value): value is OfficePoint => value !== undefined);

    for (const desk of groupDeskInputs) {
      const offset =
        input.persistedState.deskOffsetsByThreadId[desk.threadId] ?? nextDeskOffset(existingOffsets);
      if (!input.persistedState.deskOffsetsByThreadId[desk.threadId]) {
        existingOffsets.push(offset);
      }
      nextDeskOffsetsByThreadId[desk.threadId] = offset;
      deskScenes.push({
        ...desk,
        element: {
          id: `desk:${desk.threadId}`,
          type: "desk",
          x: anchor.x + offset.x,
          y: anchor.y + offset.y,
          width: DESK_WIDTH,
          height: DESK_HEIGHT,
          draggable: true,
          parentId: `group:${group.key}`,
          metadata: {
            threadId: desk.threadId,
            groupKey: group.key,
          },
        },
        botTarget: {
          x: anchor.x + offset.x + DESK_BOT_TARGET.x,
          y: anchor.y + offset.y + DESK_BOT_TARGET.y,
        },
      });
    }

    const groupDeskScenes = deskScenes.filter((desk) => desk.groupKey === group.key);
    const linkedFurniture = resolvedFurniture.linkedFurnitureByGroupKey[group.key] ?? [];
    const groupLocalElements = [...groupDeskScenes.map((desk) => desk.element), ...linkedFurniture];

    const minLocalX = groupLocalElements.length
      ? Math.min(...groupLocalElements.map((element) => element.x - anchor.x))
      : 0;
    const minLocalY = groupLocalElements.length
      ? Math.min(...groupLocalElements.map((element) => element.y - anchor.y))
      : 0;
    const maxLocalRight = groupLocalElements.length
      ? Math.max(...groupLocalElements.map((element) => element.x - anchor.x + element.width))
      : GROUP_MIN_WIDTH - GROUP_FRAME_SIDE_PADDING * 2;
    const maxLocalBottom = groupLocalElements.length
      ? Math.max(...groupLocalElements.map((element) => element.y - anchor.y + element.height))
      : GROUP_MIN_HEIGHT - GROUP_FRAME_TOP_PADDING - GROUP_FRAME_BOTTOM_PADDING;

    const frameLeft = anchor.x + Math.min(0, minLocalX - GROUP_FRAME_SIDE_PADDING);
    const frameTop =
      anchor.y + Math.min(-GROUP_FRAME_TOP_PADDING, minLocalY - GROUP_FRAME_TOP_PADDING);
    const frameWidth = Math.max(
      GROUP_MIN_WIDTH,
      maxLocalRight + GROUP_FRAME_SIDE_PADDING - Math.min(0, minLocalX - GROUP_FRAME_SIDE_PADDING),
    );
    const frameHeight = Math.max(
      GROUP_MIN_HEIGHT,
      maxLocalBottom +
        GROUP_FRAME_BOTTOM_PADDING -
        Math.min(-GROUP_FRAME_TOP_PADDING, minLocalY - GROUP_FRAME_TOP_PADDING),
    );
    const persistedGroupSize = input.persistedState.projectGroupSizesByKey[group.key];
    const resolvedFrameSize = clampGroupFrameSize({
      width: Math.max(frameWidth, persistedGroupSize?.width ?? 0),
      height: Math.max(frameHeight, persistedGroupSize?.height ?? 0),
    });
    nextProjectGroupSizesByKey[group.key] = resolvedFrameSize;

    groupScenes.push({
      key: group.key,
      label: group.label,
      cwd: group.cwd,
      accentColor: resolveOfficeGroupAccent(group.key, input.persistedState.groupAccentColorsByKey),
      anchor: {
        key: group.key,
        x: anchor.x,
        y: anchor.y,
      },
      element: {
        id: `group:${group.key}`,
        type: "projectGroup",
        x: frameLeft,
        y: frameTop,
        width: resolvedFrameSize.width,
        height: resolvedFrameSize.height,
        draggable: true,
        metadata: {
          groupKey: group.key,
          anchorX: anchor.x,
          anchorY: anchor.y,
        },
      },
      deskThreadIds: group.threadIds,
      congregationTargets: (resolvedFurniture.congregationTargetsByGroupKey[group.key] ?? []).map(
        (target) => ({
          id: target.id,
          furnitureId: target.furnitureId,
          furnitureType: target.furnitureType,
          x: target.x,
          y: target.y,
        }),
      ),
    });
  }

  const bounds = unionBounds([
    ...groupScenes.map((group) => elementBounds(group.element)),
    ...deskScenes.map((desk) => elementBounds(desk.element)),
    ...resolvedFurniture.allFurniture.map((element) => elementBounds(element)),
  ]);

  return {
    persistedState: {
      version: 3,
      camera: { ...input.persistedState.camera },
      furniture: nextPersistedFurniture.map(clonePersistedFurniture),
      projectGroupAnchors: nextProjectGroupAnchors,
      projectGroupSizesByKey: nextProjectGroupSizesByKey,
      deskOffsetsByThreadId: nextDeskOffsetsByThreadId,
      groupAccentColorsByKey: { ...input.persistedState.groupAccentColorsByKey },
      adminDeskPosition: { ...input.persistedState.adminDeskPosition },
      defaultFurnitureSeededGroupKeys: [...seededGroupKeys],
    },
    scene: {
      groups: groupScenes,
      desks: deskScenes,
      furniture: resolvedFurniture.allFurniture,
      bounds,
    },
  };
}
