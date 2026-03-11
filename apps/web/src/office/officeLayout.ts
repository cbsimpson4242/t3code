import type { Project, Thread } from "../types";
import { derivePendingApprovals, derivePendingUserInputs } from "../session-logic";
import {
  DEFAULT_FURNITURE_ELEMENTS,
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
import type {
  OfficeDeskInput,
  OfficeDeskScene,
  OfficeElement,
  OfficePersistedState,
  OfficePoint,
  OfficeProjectGroupInput,
  OfficeProjectGroupScene,
  OfficeSceneBounds,
  OfficeSceneBuildResult,
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

export function deriveOfficeInputs(
  projects: Project[],
  threads: Thread[],
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
        isActive:
          thread.session?.status === "running" ||
          thread.session?.orchestrationStatus === "running" ||
          thread.latestTurn?.state === "running",
        isError:
          thread.session?.status === "error" || thread.latestTurn?.state === "error",
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
  for (const group of input.groups) {
    const anchor = input.persistedState.projectGroupAnchors[group.key];
    if (anchor) {
      nextProjectGroupAnchors[group.key] = anchor;
      continue;
    }
    nextProjectGroupAnchors[group.key] = nextGroupAnchor(Object.values(nextProjectGroupAnchors));
  }

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
    const minLocalX = groupDeskScenes.length
      ? Math.min(...groupDeskScenes.map((desk) => desk.element.x - anchor.x))
      : 0;
    const minLocalY = groupDeskScenes.length
      ? Math.min(...groupDeskScenes.map((desk) => desk.element.y - anchor.y))
      : 0;
    const maxLocalRight = groupDeskScenes.length
      ? Math.max(...groupDeskScenes.map((desk) => desk.element.x - anchor.x + desk.element.width))
      : GROUP_MIN_WIDTH - GROUP_FRAME_SIDE_PADDING * 2;
    const maxLocalBottom = groupDeskScenes.length
      ? Math.max(...groupDeskScenes.map((desk) => desk.element.y - anchor.y + desk.element.height))
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

    groupScenes.push({
      key: group.key,
      label: group.label,
      cwd: group.cwd,
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
        width: frameWidth,
        height: frameHeight,
        draggable: true,
        metadata: {
          groupKey: group.key,
          anchorX: anchor.x,
          anchorY: anchor.y,
        },
      },
      deskThreadIds: group.threadIds,
    });
  }

  const nextElementsById: Record<string, OfficePoint> = {};
  const furniture = DEFAULT_FURNITURE_ELEMENTS.map((element) => {
    const persistedPosition = input.persistedState.elementsById[element.id];
    const position = persistedPosition ?? { x: element.x, y: element.y };
    nextElementsById[element.id] = position;
    const nextElement: OfficeElement = {
      id: element.id,
      type: element.type,
      x: position.x,
      y: position.y,
      width: element.width,
      height: element.height,
      draggable: element.draggable,
    };
    if (element.parentId) {
      nextElement.parentId = element.parentId;
    }
    if (element.metadata) {
      nextElement.metadata = element.metadata;
    }
    return nextElement;
  });

  const bounds = unionBounds([
    ...groupScenes.map((group) => elementBounds(group.element)),
    ...deskScenes.map((desk) => elementBounds(desk.element)),
    ...furniture.map((element) => elementBounds(element)),
  ]);

  return {
    persistedState: {
      version: 1,
      camera: input.persistedState.camera,
      elementsById: nextElementsById,
      projectGroupAnchors: nextProjectGroupAnchors,
      deskOffsetsByThreadId: nextDeskOffsetsByThreadId,
    },
    scene: {
      groups: groupScenes,
      desks: deskScenes,
      furniture,
      bounds,
    },
  };
}
