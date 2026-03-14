import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BotIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  CoffeeIcon,
  FolderIcon,
  MonitorIcon,
  MoreHorizontalIcon,
  PlusIcon,
  RotateCcwIcon,
  ScanSearchIcon,
  Trash2Icon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import type { ProjectId, ThreadId } from "@t3tools/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "./ui/button";
import OfficeAgentCreateDialog from "./OfficeAgentCreateDialog";
import OfficeAdminWindow from "./OfficeAdminWindow";
import OfficeThreadWindow, {
  OfficeThreadWindowPreview,
  getOfficeAdminWindowDefaultSize,
  buildDefaultOfficeThreadWindowRect,
  normalizeOfficeThreadWindowRect,
  type OfficeThreadWindowRect,
} from "./OfficeThreadWindow";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "./ui/menu";
import { useAppSettings } from "../appSettings";
import { useComposerDraftStore } from "../composerDraftStore";
import { gitRemoveWorktreeMutationOptions } from "../lib/gitReactQuery";
import { ensureProjectExists, findMostRecentThreadIdForProject } from "../lib/projectLifecycle";
import {
  createOrReuseProjectDraftThread,
  deleteThreadWithCleanup,
  renameThread,
} from "../lib/threadLifecycle";
import { mergeThreadsWithDrafts } from "../lib/threadDrafts";
import { readNativeApi } from "../nativeApi";
import { deriveWorkLogEntries, isLatestTurnSettled } from "../session-logic";
import { useStore } from "../store";
import { useTerminalStateStore } from "../terminalStateStore";
import type { Thread } from "../types";
import {
  COFFEE_BAR_SNACK_IDS,
  DESK_HEIGHT,
  DESK_WIDTH,
  GROUP_DESK_LAYOUT_LEFT_PADDING,
  GROUP_DESK_LAYOUT_TOP_PADDING,
  GROUP_FRAME_BOTTOM_PADDING,
  GROUP_FRAME_SIDE_PADDING,
  GROUP_FRAME_TOP_PADDING,
  GROUP_MIN_HEIGHT,
  GROUP_MIN_WIDTH,
  OFFICE_DRAG_THRESHOLD_PX,
  createDefaultOfficePersistedState,
} from "../office/officeDefaults";
import {
  fitCameraToBounds,
  screenToWorld,
  worldRectToScreenRect,
  worldToScreen,
  zoomAtPoint,
} from "../office/officeCamera";
import { OFFICE_GROUP_ACCENT_OPTIONS, getDefaultOfficeGroupAccent } from "../office/officeColors";
import {
  createOfficeFurniture,
  moveOfficeFurnitureWithChildren,
  removeOfficeFurniture,
  type OfficeFurnitureAddKind,
} from "../office/officeFurniture";
import { getIdleOfficeDestination } from "../office/officeBotRouting";
import { buildOfficeScene, deriveOfficeInputs } from "../office/officeLayout";
import {
  areOfficePersistedStatesEqual,
  clearOfficePersistedState,
  readOfficePersistedState,
  writeOfficePersistedState,
} from "../office/officePersistence";
import type {
  OfficeCameraState,
  OfficeElement,
  OfficePersistedState,
  OfficePoint,
  OfficeSceneBounds,
  OfficeSize,
} from "../office/officeTypes";

const THOUGHT_EMOJIS = ["\u2615", "\ud83d\udca4", "\ud83d\udca1", "\ud83c\udf3f", "\ud83c\udfb5", "\ud83d\ude80", "\ud83d\udcda", "\u2728"];
const ADMIN_WINDOW_ACCENT = "#f59e0b";
const ADMIN_WINDOW_SCREEN_ZOOM = 1;
const OFFICE_MINIMAP_WIDTH = 320;
const OFFICE_MINIMAP_HEIGHT = 220;
const OFFICE_MINIMAP_PADDING = 14;
const OFFICE_MINIMAP_HEADER_HEIGHT = 30;
const OFFICE_VIEWPORT_POINTER_BLOCK_SELECTOR = [
  "[data-office-thread-window]",
  "[data-office-admin-window]",
  "[data-office-toolbar]",
  "[data-office-minimap]",
  "[data-office-group-color-trigger]",
  "[data-office-group-color-option]",
  "[data-office-group-resize]",
  "[data-office-element]",
  "[data-office-desk]",
  "[data-office-bot]",
  "[data-office-bot-card]",
  "[data-office-bot-thought]",
  "[data-office-thread-link]",
  "[data-office-notification]",
].join(", ");
const OFFICE_VIEWPORT_CONTEXT_MENU_BLOCK_SELECTOR = [
  "[data-office-thread-window]",
  "[data-office-admin-window]",
  "[data-office-toolbar]",
  "[data-office-minimap]",
  "[data-office-group-color-trigger]",
  "[data-office-group-color-option]",
  "[data-office-group-resize]",
  "[data-office-element]",
  "[data-office-desk]",
  "[data-office-bot]",
  "[data-office-bot-card]",
  "[data-office-bot-thought]",
  "[data-office-thread-link]",
  "[data-office-notification]",
].join(", ");
const OFFICE_NOTIFICATION_LIMIT = 4;
const OFFICE_NOTIFICATION_DURATION_MS = 6_500;
const OFFICE_FAR_LABEL_ZOOM_THRESHOLD = 0.82;
const OFFICE_WINDOW_AUTO_MINIMIZE_ZOOM_THRESHOLD = 0.72;
const OFFICE_WINDOW_AUTO_RESTORE_ZOOM_THRESHOLD = 0.88;
const OFFICE_THREAD_PREVIEW_WIDTH = 280;
const OFFICE_THREAD_PREVIEW_HEIGHT = 124;

const OFFICE_FURNITURE_LABELS: Record<OfficeFurnitureAddKind, string> = {
  conferenceSet: "Boardroom set",
  waterCooler: "Water cooler",
  conferenceTable: "Table",
  chair: "Chair",
  plant: "Plant",
  coffeeBar: "Coffee machine",
};

interface BotState {
  x: number;
  y: number;
  nextMoveTime: number;
  transitionMs: number;
  facingLeft: boolean;
  thoughtEmoji: string | null;
  idleStep: number;
}

interface VirtualOfficeProps {
  onOpenThreadInMainWindow?: (threadId: ThreadId) => void;
  focusThreadId?: ThreadId | null;
}

type PanState = {
  pointerId: number;
  startPointer: OfficePoint;
  startCamera: OfficeCameraState;
  moved: boolean;
};

type DragState =
  | {
      pointerId: number;
      kind: "group";
      groupKeys: string[];
      linkedThreadIdsByGroupKey: Record<string, string[]>;
      startPointer: OfficePoint;
      startAnchorsByGroupKey: Record<string, OfficePoint>;
      lastDelta: OfficePoint;
      moved: boolean;
    }
  | {
      pointerId: number;
      kind: "groupResize";
      key: string;
      linkedThreadIds: string[];
      startPointer: OfficePoint;
      startSize: OfficeSize;
      startMinOffset: OfficePoint;
      startDeskOffsetsByThreadId: Record<string, OfficePoint>;
      moved: boolean;
    }
  | {
      pointerId: number;
      kind: "desk";
      key: string;
      startPointer: OfficePoint;
      startValue: OfficePoint;
      moved: boolean;
    }
  | {
      pointerId: number;
      kind: "element";
      key: string;
      startPointer: OfficePoint;
      startValue: OfficePoint;
      moved: boolean;
    };

interface OpenOfficeThreadWindow {
  threadId: ThreadId;
  rect: OfficeThreadWindowRect;
  minimized?: boolean;
}

type OfficeNotificationKind = "success" | "attention";

type OfficeScreenRect = OfficePoint & OfficeSize;
type OfficeSceneGroup = {
  key: string;
  label: string;
  cwd: string | null;
  accentColor: string;
  isCollapsed: boolean;
  anchor: OfficePoint;
  deskThreadIds: string[];
  element: OfficeElement & OfficePoint & OfficeSize;
};

interface GroupSelectionState {
  pointerId: number;
  startScreen: OfficePoint;
  currentScreen: OfficePoint;
  moved: boolean;
}

interface OfficeNotification {
  id: string;
  threadId: ThreadId;
  kind: OfficeNotificationKind;
  title: string;
  description: string;
  createdAt: number;
}

function closestPointOnRect(point: OfficePoint, rect: OfficeThreadWindowRect): OfficePoint {
  return {
    x: Math.min(Math.max(point.x, rect.x), rect.x + rect.width),
    y: Math.min(Math.max(point.y, rect.y), rect.y + rect.height),
  };
}

function truncateOfficeThought(text: string, maxLength = 84) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
}

function summarizeOfficeThought(thread: Thread) {
  const latestEntry = deriveWorkLogEntries(
    thread.activities,
    thread.latestTurn?.turnId ?? undefined,
  ).at(-1);

  if (!latestEntry) {
    return thread.session?.orchestrationStatus === "running" ? "Working..." : null;
  }

  if (latestEntry.detail) {
    return truncateOfficeThought(latestEntry.detail);
  }
  if (latestEntry.command) {
    return truncateOfficeThought(`Running ${latestEntry.command}`, 72);
  }
  if (latestEntry.changedFiles && latestEntry.changedFiles.length > 0) {
    return truncateOfficeThought(`Updating ${latestEntry.changedFiles.slice(0, 2).join(", ")}`, 72);
  }
  return truncateOfficeThought(latestEntry.label);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getOfficeNotificationDescription(input: {
  kind: OfficeNotificationKind;
  hasPendingApproval: boolean;
  hasPendingUserInput: boolean;
}) {
  if (input.kind === "success") {
    return "The latest turn finished and is ready for review.";
  }
  if (input.hasPendingApproval) {
    return "The agent is blocked until you approve the next step.";
  }
  if (input.hasPendingUserInput) {
    return "The agent is waiting for your reply before it can continue.";
  }
  return "The agent is waiting for your input before it can continue.";
}

function getOfficeNotificationTonePattern(kind: OfficeNotificationKind) {
  return kind === "attention"
    ? [
        { frequency: 698, durationMs: 110, gain: 0.048 },
        { frequency: 784, durationMs: 150, gain: 0.05 },
      ]
    : [
        { frequency: 523.25, durationMs: 95, gain: 0.035 },
        { frequency: 659.25, durationMs: 130, gain: 0.04 },
      ];
}

function rectToBounds(rect: OfficePoint & OfficeSize): OfficeSceneBounds {
  return {
    minX: rect.x,
    minY: rect.y,
    maxX: rect.x + rect.width,
    maxY: rect.y + rect.height,
  };
}

function rectFromPoints(start: OfficePoint, end: OfficePoint): OfficeScreenRect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

function rectsIntersect(left: OfficeScreenRect, right: OfficeScreenRect): boolean {
  return (
    left.x <= right.x + right.width &&
    left.x + left.width >= right.x &&
    left.y <= right.y + right.height &&
    left.y + left.height >= right.y
  );
}

function unionOfficeBounds(boundsList: OfficeSceneBounds[]): OfficeSceneBounds {
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

function clampGroupSize(size: OfficeSize): OfficeSize {
  return {
    width: Math.max(GROUP_MIN_WIDTH, Math.round(size.width)),
    height: Math.max(GROUP_MIN_HEIGHT, Math.round(size.height)),
  };
}

function maxDeskOffsetXForGroupSize(groupSize: OfficeSize, minOffsetX: number) {
  return Math.max(
    minOffsetX,
    groupSize.width - DESK_WIDTH - GROUP_FRAME_SIDE_PADDING * 2 + minOffsetX,
  );
}

function maxDeskOffsetYForGroupSize(groupSize: OfficeSize, minOffsetY: number) {
  return Math.max(
    minOffsetY,
    groupSize.height -
      DESK_HEIGHT -
      GROUP_FRAME_TOP_PADDING -
      GROUP_FRAME_BOTTOM_PADDING +
      minOffsetY,
  );
}

function scaleDeskOffsetAxis(
  value: number,
  startMin: number,
  startMax: number,
  nextMin: number,
  nextMax: number,
) {
  if (startMax <= startMin || nextMax <= nextMin) {
    return Math.round(clamp(value, nextMin, nextMax));
  }
  const ratio = clamp((value - startMin) / (startMax - startMin), 0, 1);
  return Math.round(nextMin + ratio * (nextMax - nextMin));
}

function scaleDeskOffsetForGroupResize(
  offset: OfficePoint,
  startSize: OfficeSize,
  nextSize: OfficeSize,
  startMinOffset: OfficePoint,
): OfficePoint {
  return {
    x: scaleDeskOffsetAxis(
      offset.x,
      startMinOffset.x,
      maxDeskOffsetXForGroupSize(startSize, startMinOffset.x),
      startMinOffset.x,
      maxDeskOffsetXForGroupSize(nextSize, startMinOffset.x),
    ),
    y: scaleDeskOffsetAxis(
      offset.y,
      startMinOffset.y,
      maxDeskOffsetYForGroupSize(startSize, startMinOffset.y),
      startMinOffset.y,
      maxDeskOffsetYForGroupSize(nextSize, startMinOffset.y),
    ),
  };
}

function getServerHttpOrigin() {
  const envUrl = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (typeof window === "undefined") {
    return envUrl?.replace(/^wss:/, "https:").replace(/^ws:/, "http:") ?? "";
  }

  const bridgeUrl = window.localStorage.getItem("serverUrl");
  const wsUrl = bridgeUrl
    ? bridgeUrl
    : envUrl && envUrl.length > 0
      ? envUrl
      : `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:${window.location.port}`;
  const httpUrl = wsUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
  try {
    return new URL(httpUrl).origin;
  } catch {
    return httpUrl;
  }
}

const serverHttpOrigin = getServerHttpOrigin();

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function mod(value: number, divisor: number) {
  if (divisor === 0) {
    return 0;
  }
  return ((value % divisor) + divisor) % divisor;
}

function trySetPointerCapture(element: HTMLDivElement, pointerId: number) {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    return;
  }
}

function tryReleasePointerCapture(element: HTMLDivElement, pointerId: number) {
  try {
    if (element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
  } catch {
    return;
  }
}

function isKeyboardEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function ProjectOfficeIcon({ cwd }: { cwd: string | null }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(cwd ? "loading" : "error");

  if (!cwd || status === "error") {
    return <FolderIcon className="size-3 shrink-0 text-muted-foreground/60" />;
  }

  return (
    <img
      src={`${serverHttpOrigin}/api/project-favicon?cwd=${encodeURIComponent(cwd)}`}
      alt=""
      className={`size-3 shrink-0 rounded-sm object-contain ${status === "loading" ? "hidden" : ""}`}
      onLoad={() => setStatus("loaded")}
      onError={() => setStatus("error")}
    />
  );
}

function OfficeGroupMenu(props: {
  group: OfficeSceneGroup;
  groupAccentColorsByKey: OfficePersistedState["groupAccentColorsByKey"];
  isFarMenu?: boolean;
  scale?: number;
  style?: React.CSSProperties;
  onMenuPointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onMenuPointerMove?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onMenuPointerUp?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onMenuPointerCancel?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onCreate: (group: OfficeSceneGroup) => void;
  onToggleCollapsed: (groupKey: string) => void;
  onDelete: (groupKey: string) => void;
  onSetAccentColor: (groupKey: string, accentColor: string | null) => void;
}) {
  const {
    group,
    groupAccentColorsByKey,
    isFarMenu = false,
    scale = 1,
    style,
    onMenuPointerDown,
    onMenuPointerMove,
    onMenuPointerUp,
    onMenuPointerCancel,
    onCreate,
    onToggleCollapsed,
    onDelete,
    onSetAccentColor,
  } = props;

  const containerClassName = isFarMenu
    ? "absolute z-10 flex min-w-max -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full border bg-background/96 px-2.5 py-1.5 text-[11px] font-semibold tracking-[0.12em] text-foreground/80 uppercase shadow-[0_18px_40px_-18px_rgba(15,23,42,0.9)] backdrop-blur-md cursor-grab active:cursor-grabbing"
    : `absolute flex items-center gap-1.5 border bg-background/95 px-3 py-1 text-[10px] font-semibold tracking-[0.12em] text-foreground/75 uppercase shadow-sm ${
        group.isCollapsed
          ? "inset-x-2 top-2 rounded-xl"
          : "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full"
      }`;
  const actionButtonClassName = isFarMenu
    ? "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] font-medium normal-case"
    : "inline-flex h-5 items-center gap-1 rounded-full border px-1.5 text-[10px] font-medium normal-case";
  const colorTriggerClassName = isFarMenu
    ? "inline-flex h-6 items-center gap-1 rounded-full border px-2 shadow-sm transition-transform hover:scale-105"
    : "inline-flex h-5 items-center gap-1 rounded-full border px-1.5 shadow-sm transition-transform hover:scale-105";
  const iconClassName = isFarMenu ? "size-3.5" : "size-3";
  const colorDotClassName = isFarMenu
    ? "inline-flex size-2.5 rounded-full border border-black/10"
    : "inline-flex size-2.5 rounded-full border border-black/10";

  return (
    <div
      data-office-group-menu={group.key}
      data-office-far-menu={isFarMenu ? group.key : undefined}
      className={containerClassName}
      style={{
        borderColor: `${group.accentColor}88`,
        boxShadow: isFarMenu
          ? `0 0 0 1px ${group.accentColor}34, 0 18px 40px -18px rgba(15,23,42,0.9)`
          : `0 10px 30px -20px ${group.accentColor}`,
        background: isFarMenu
          ? `linear-gradient(180deg, ${group.accentColor}2a, rgba(15,23,42,0.88))`
          : undefined,
        transform: isFarMenu ? `translate(-50%, -50%) scale(${scale})` : undefined,
        transformOrigin: "center",
        ...style,
      }}
      onPointerDown={(event) => {
        if (isFarMenu) {
          const target = event.target instanceof Element ? event.target : null;
          if (!target?.closest("button, [data-slot='menu-item']")) {
            onMenuPointerDown?.(event);
            return;
          }
        }
        event.stopPropagation();
      }}
      onPointerMove={isFarMenu ? onMenuPointerMove : undefined}
      onPointerUp={isFarMenu ? onMenuPointerUp : undefined}
      onPointerCancel={isFarMenu ? onMenuPointerCancel : undefined}
      onClick={(event) => {
        event.stopPropagation();
      }}
      onContextMenu={(event) => {
        event.stopPropagation();
      }}
    >
      <ProjectOfficeIcon cwd={group.cwd} />
      <span className="min-w-0 flex-1 truncate">{group.label}</span>
      <div>
        <Menu>
          <MenuTrigger
            render={
              <button
                type="button"
                className={colorTriggerClassName}
                style={{
                  borderColor: `${group.accentColor}88`,
                  backgroundColor: `${group.accentColor}24`,
                  boxShadow: `0 0 0 1px ${group.accentColor}22`,
                }}
                aria-label={`Change color for ${group.label}`}
                data-office-group-color-trigger={group.key}
              />
            }
          >
            <span className={colorDotClassName} style={{ backgroundColor: group.accentColor }} />
            <span className={isFarMenu ? "text-xs font-medium normal-case" : "text-[10px] font-medium normal-case"}>
              Color
            </span>
          </MenuTrigger>
          <MenuPopup align="end" sideOffset={8}>
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Group color</div>
            <MenuItem
              data-office-group-color-option={`${group.key}:auto`}
              onClick={() => {
                onSetAccentColor(group.key, null);
              }}
            >
              <div className="flex w-full items-center gap-2">
                <span
                  className="inline-flex size-3 rounded-full border border-border/70 bg-linear-to-r from-transparent via-foreground/45 to-transparent"
                  style={{
                    boxShadow: `0 0 0 1px ${getDefaultOfficeGroupAccent(group.key)}24`,
                  }}
                />
                <span>Auto</span>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {groupAccentColorsByKey[group.key] ? "" : "Selected"}
                </span>
              </div>
            </MenuItem>
            <MenuSeparator />
            {OFFICE_GROUP_ACCENT_OPTIONS.map((option) => (
              <MenuItem
                key={option.accentColor}
                data-office-group-color-option={`${group.key}:${option.accentColor}`}
                onClick={() => {
                  onSetAccentColor(group.key, option.accentColor);
                }}
              >
                <div className="flex w-full items-center gap-2">
                  <span
                    className="inline-flex size-3 rounded-full border border-black/10"
                    style={{ backgroundColor: option.accentColor }}
                  />
                  <span>{option.label}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {groupAccentColorsByKey[group.key] === option.accentColor ? "Selected" : ""}
                  </span>
                </div>
              </MenuItem>
            ))}
          </MenuPopup>
        </Menu>
      </div>
      <button
        type="button"
        className={actionButtonClassName}
        style={{
          borderColor: `${group.accentColor}88`,
          color: group.accentColor,
          backgroundColor: `${group.accentColor}14`,
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onCreate(group);
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        aria-label={`Create agent in ${group.label}`}
      >
        <PlusIcon className={iconClassName} />
        Create
      </button>
      <button
        type="button"
        className={actionButtonClassName}
        style={{
          borderColor: `${group.accentColor}88`,
          color: group.accentColor,
          backgroundColor: `${group.accentColor}14`,
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onToggleCollapsed(group.key);
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        aria-label={`${group.isCollapsed ? "Expand" : "Collapse"} ${group.label}`}
        data-office-group-collapse={group.key}
      >
        {group.isCollapsed ? <ChevronRightIcon className={iconClassName} /> : <ChevronDownIcon className={iconClassName} />}
        {group.isCollapsed ? "Expand" : "Collapse"}
      </button>
      <button
        type="button"
        className={`${actionButtonClassName} text-red-200`}
        style={{
          borderColor: "rgba(248,113,113,0.55)",
          backgroundColor: "rgba(127,29,29,0.22)",
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onDelete(group.key);
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        aria-label={`Delete ${group.label}`}
        data-office-group-delete={group.key}
      >
        <Trash2Icon className={iconClassName} />
        Delete
      </button>
    </div>
  );
}

function FurnitureNode(props: {
  element: OfficeElement;
  isSelected: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLDivElement>) => void;
  onClick?: (() => void) | undefined;
}) {
  const { element } = props;
  const selectedClassName = props.isSelected
    ? "ring-2 ring-primary/70 ring-offset-2 ring-offset-background"
    : "";

  if (element.type === "waterCooler") {
    return (
      <div
        data-office-element={element.id}
        data-office-element-selected={props.isSelected ? "true" : undefined}
        className={`absolute flex cursor-grab flex-col items-center rounded-lg active:cursor-grabbing ${selectedClassName}`}
        style={{ left: element.x, top: element.y, width: element.width, height: element.height }}
        onPointerDown={props.onPointerDown}
        onPointerMove={props.onPointerMove}
        onPointerUp={props.onPointerUp}
        onPointerCancel={props.onPointerCancel}
      >
        <div className="h-14 w-10 rounded-t-full border border-sky-300 bg-sky-200/80 shadow-inner" />
        <div className="relative flex h-12 w-8 items-center justify-center rounded-b bg-muted-foreground/40">
          <div className="mt-2 h-3 w-1 rounded-b bg-sky-400" />
          <div
            className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-sky-400/80"
            style={{
              animation: "officeDrip 2.5s ease-in-out infinite",
            }}
          />
        </div>
      </div>
    );
  }

  if (element.type === "conferenceTable") {
    return (
      <div
        data-office-element={element.id}
        data-office-element-selected={props.isSelected ? "true" : undefined}
        className={`absolute cursor-grab rounded-full active:cursor-grabbing ${selectedClassName}`}
        style={{ left: element.x, top: element.y, width: element.width, height: element.height }}
        onPointerDown={props.onPointerDown}
        onPointerMove={props.onPointerMove}
        onPointerUp={props.onPointerUp}
        onPointerCancel={props.onPointerCancel}
      >
        <div className="absolute inset-[-16px] rounded-[50%] border border-amber-700/10 bg-amber-800/10" />
        <div className="absolute inset-0 flex items-center justify-center rounded-full border border-amber-800/30 bg-amber-900/25 shadow">
          <div className="h-16 w-56 rounded-full border border-amber-800/20 bg-amber-900/15" />
        </div>
      </div>
    );
  }

  if (element.type === "chair") {
    return (
      <div
        data-office-element={element.id}
        data-office-element-selected={props.isSelected ? "true" : undefined}
        className={`absolute cursor-grab rounded-full border border-slate-500/20 bg-slate-600/20 active:cursor-grabbing ${selectedClassName}`}
        style={{ left: element.x, top: element.y, width: element.width, height: element.height }}
        onPointerDown={props.onPointerDown}
        onPointerMove={props.onPointerMove}
        onPointerUp={props.onPointerUp}
        onPointerCancel={props.onPointerCancel}
      />
    );
  }

  if (element.type === "plant") {
    return (
      <div
        data-office-element={element.id}
        data-office-element-selected={props.isSelected ? "true" : undefined}
        className={`absolute flex cursor-grab flex-col items-center rounded-lg active:cursor-grabbing ${selectedClassName}`}
        style={{ left: element.x, top: element.y, width: element.width, height: element.height }}
        onPointerDown={props.onPointerDown}
        onPointerMove={props.onPointerMove}
        onPointerUp={props.onPointerUp}
        onPointerCancel={props.onPointerCancel}
      >
        <div className="relative h-16 w-14">
          <div className="absolute left-1 top-2 h-12 w-10 rounded-full bg-emerald-600/70" />
          <div className="absolute left-4 top-0 h-10 w-8 rounded-full bg-emerald-500/80" />
          <div className="absolute left-0 top-4 h-9 w-7 rounded-full bg-emerald-400/60" />
        </div>
        <div className="h-6 w-8 rounded-b border-t-2 border-amber-900/60 bg-amber-800/80" />
      </div>
    );
  }

  return (
    <div
      data-office-element={element.id}
      data-office-element-selected={props.isSelected ? "true" : undefined}
      className={`absolute cursor-grab rounded-lg active:cursor-grabbing ${selectedClassName}`}
      style={{ left: element.x, top: element.y, width: element.width, height: element.height }}
      onPointerDown={props.onPointerDown}
      onPointerMove={props.onPointerMove}
      onPointerUp={props.onPointerUp}
      onPointerCancel={props.onPointerCancel}
    >
      <div className="flex h-full w-full flex-col gap-2 rounded border-2 border-slate-700 bg-slate-800 p-2 shadow-lg">
        <div className="flex h-4 items-center justify-center rounded bg-slate-900">
          <CoffeeIcon className="size-3 text-amber-400/80" />
        </div>
        <div className="grid flex-1 grid-cols-2 grid-rows-3 gap-1 rounded bg-slate-900 p-1">
          {COFFEE_BAR_SNACK_IDS.map((snackId) => (
            <div key={snackId} className="rounded bg-amber-700/60" />
          ))}
        </div>
        <div className="ml-auto flex h-8 w-full items-center gap-1 rounded bg-slate-700 px-1">
          <div className="h-4 w-4 rounded-sm bg-green-500" />
          <div className="ml-auto h-4 w-2 rounded-sm bg-red-500" />
        </div>
      </div>
    </div>
  );
}

export default function VirtualOffice({
  onOpenThreadInMainWindow,
  focusThreadId = null,
}: VirtualOfficeProps) {
  const threads = useStore((store) => store.threads);
  const projects = useStore((store) => store.projects);
  const { settings } = useAppSettings();
  const getDraftThread = useComposerDraftStore((store) => store.getDraftThread);
  const getDraftThreadByProjectId = useComposerDraftStore((store) => store.getDraftThreadByProjectId);
  const draftThreadsByThreadId = useComposerDraftStore((store) => store.draftThreadsByThreadId);
  const setDraftThreadContext = useComposerDraftStore((store) => store.setDraftThreadContext);
  const setProjectDraftThreadId = useComposerDraftStore((store) => store.setProjectDraftThreadId);
  const clearComposerDraftForThread = useComposerDraftStore((store) => store.clearThreadDraft);
  const clearProjectDraftThreadById = useComposerDraftStore((store) => store.clearProjectDraftThreadById);
  const clearTerminalState = useTerminalStateStore((store) => store.clearTerminalState);
  const queryClient = useQueryClient();
  const removeWorktreeMutation = useMutation(gitRemoveWorktreeMutationOptions({ queryClient }));
  const viewportRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<OfficePersistedState | null>(null);
  const persistTimerRef = useRef<number | null>(null);
  const previousViewportSizeRef = useRef({ width: 0, height: 0 });
  const officeNotificationIdRef = useRef(0);
  const officeNotificationTimerIdsRef = useRef<Record<string, number>>({});
  const officeNotificationAudioContextRef = useRef<AudioContext | null>(null);
  const previousNeedsAttentionByThreadIdRef = useRef(new Map<string, boolean>());
  const previousSettledTurnIdByThreadIdRef = useRef(new Map<string, string | null>());
  const notificationsInitializedRef = useRef(false);
  const suppressClickUntilRef = useRef(0);
  const suppressContextMenuUntilRef = useRef(0);
  const panStateRef = useRef<PanState | null>(null);
  const groupSelectionStateRef = useRef<GroupSelectionState | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const [initialPersistedState] = useState<OfficePersistedState | null>(() => readOfficePersistedState());
  const [officeState, setOfficeState] = useState<OfficePersistedState>(
    () => initialPersistedState ?? createDefaultOfficePersistedState(),
  );
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [hoveredBotId, setHoveredBotId] = useState<string | null>(null);
  const [isInteracting, setIsInteracting] = useState(false);
  const [openWindows, setOpenWindows] = useState<OpenOfficeThreadWindow[]>([]);
  const [adminWindowRect, setAdminWindowRect] = useState<OfficeThreadWindowRect | null>(null);
  const [windowStackOrder, setWindowStackOrder] = useState<string[]>([]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [createDialogProjectId, setCreateDialogProjectId] = useState<ProjectId | null>(null);
  const [selectedFurnitureId, setSelectedFurnitureId] = useState<string | null>(null);
  const [selectedGroupKeys, setSelectedGroupKeys] = useState<string[]>([]);
  const [groupSelectionRect, setGroupSelectionRect] = useState<OfficeScreenRect | null>(null);
  const [officeNotifications, setOfficeNotifications] = useState<OfficeNotification[]>([]);
  const [officeWindowsMinimizedForZoom, setOfficeWindowsMinimizedForZoom] = useState(false);
  const shouldFitCameraRef = useRef(initialPersistedState === null);
  const camera = officeState.camera;

  stateRef.current = officeState;

  const moveWindowTokenToFront = useCallback((token: string) => {
    setWindowStackOrder((current) => [...current.filter((entry) => entry !== token), token]);
  }, []);

  const removeWindowToken = useCallback((token: string) => {
    setWindowStackOrder((current) => current.filter((entry) => entry !== token));
  }, []);

  const dismissOfficeNotification = useCallback((notificationId: string) => {
    const timerId = officeNotificationTimerIdsRef.current[notificationId];
    if (typeof timerId === "number") {
      window.clearTimeout(timerId);
      delete officeNotificationTimerIdsRef.current[notificationId];
    }
    setOfficeNotifications((current) => current.filter((notification) => notification.id !== notificationId));
  }, []);

  const ensureOfficeNotificationAudioContext = useCallback(async () => {
    if (typeof window === "undefined") {
      return null;
    }

    let audioContext = officeNotificationAudioContextRef.current;
    if (!audioContext) {
      const AudioContextConstructor =
        window.AudioContext ??
        (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioContextConstructor) {
        return null;
      }
      audioContext = new AudioContextConstructor();
      officeNotificationAudioContextRef.current = audioContext;
    }

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    return audioContext;
  }, []);

  const playOfficeNotificationSound = useCallback(
    async (kind: OfficeNotificationKind) => {
      try {
        const audioContext = await ensureOfficeNotificationAudioContext();
        if (!audioContext || audioContext.state === "closed") {
          return;
        }

        let startTime = audioContext.currentTime;
        const waveform = kind === "attention" ? "triangle" : "sine";
        for (const tone of getOfficeNotificationTonePattern(kind)) {
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();

          oscillator.type = waveform;
          oscillator.frequency.setValueAtTime(tone.frequency, startTime);
          gainNode.gain.setValueAtTime(0.0001, startTime);
          gainNode.gain.exponentialRampToValueAtTime(tone.gain, startTime + 0.01);
          gainNode.gain.exponentialRampToValueAtTime(
            0.0001,
            startTime + tone.durationMs / 1000,
          );

          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);
          oscillator.start(startTime);
          oscillator.stop(startTime + tone.durationMs / 1000 + 0.03);

          startTime += tone.durationMs / 1000 + 0.045;
        }
      } catch {
        // Ignore browser autoplay or audio-device failures and keep the visual notification.
      }
    },
    [ensureOfficeNotificationAudioContext],
  );

  const pushOfficeNotification = useCallback(
    (notification: Omit<OfficeNotification, "id" | "createdAt">) => {
      const nextNotification: OfficeNotification = {
        ...notification,
        id: `office-notification-${officeNotificationIdRef.current++}`,
        createdAt: Date.now(),
      };

      setOfficeNotifications((current) => {
        const deduped = current.filter(
          (entry) =>
            !(entry.threadId === nextNotification.threadId && entry.kind === nextNotification.kind),
        );
        const next = [nextNotification, ...deduped];
        const overflow = next.slice(OFFICE_NOTIFICATION_LIMIT);
        for (const removed of overflow) {
          const timerId = officeNotificationTimerIdsRef.current[removed.id];
          if (typeof timerId === "number") {
            window.clearTimeout(timerId);
            delete officeNotificationTimerIdsRef.current[removed.id];
          }
        }
        return next.slice(0, OFFICE_NOTIFICATION_LIMIT);
      });

      officeNotificationTimerIdsRef.current[nextNotification.id] = window.setTimeout(() => {
        dismissOfficeNotification(nextNotification.id);
      }, OFFICE_NOTIFICATION_DURATION_MS);

      void playOfficeNotificationSound(notification.kind);
    },
    [dismissOfficeNotification, playOfficeNotificationSound],
  );

  const mergedThreads = useMemo(
    () =>
      mergeThreadsWithDrafts({
        threads,
        draftThreadsByThreadId,
        projects,
      }),
    [draftThreadsByThreadId, projects, threads],
  );
  const officeInputs = useMemo(
    () => deriveOfficeInputs(projects, mergedThreads, officeState.groupAccentColorsByKey),
    [mergedThreads, officeState.groupAccentColorsByKey, projects],
  );
  const { scene, persistedState: normalizedPersistedState } = useMemo(
    () =>
      buildOfficeScene({
        groups: officeInputs.groups,
        desks: officeInputs.desks,
        persistedState: officeState,
      }),
    [officeInputs, officeState],
  );
  const selectedFurniture = useMemo(
    () => scene.furniture.find((element) => element.id === selectedFurnitureId) ?? null,
    [scene.furniture, selectedFurnitureId],
  );
  const selectedGroupKeySet = useMemo(() => new Set(selectedGroupKeys), [selectedGroupKeys]);
  const windowZIndices = useMemo(
    () =>
      new Map(
        windowStackOrder.map((token, index) => [token, 20_000 + index] as const),
      ),
    [windowStackOrder],
  );
  const isAdminWindowFocused = windowStackOrder[windowStackOrder.length - 1] === "admin:office-admin";

  useEffect(() => {
    setOpenWindows((current) =>
      current.filter((windowState) => mergedThreads.some((thread) => thread.id === windowState.threadId)),
    );
  }, [mergedThreads]);

  useEffect(() => {
    const validThreadTokens = new Set(mergedThreads.map((thread) => `thread:${thread.id}`));
    setWindowStackOrder((current) =>
      current.filter(
        (token) =>
          token === "admin:office-admin" ||
          validThreadTokens.has(token),
      ),
    );
  }, [mergedThreads, scene.groups]);

  useEffect(() => {
    if (areOfficePersistedStatesEqual(officeState, normalizedPersistedState)) {
      return;
    }
    setOfficeState(normalizedPersistedState);
  }, [normalizedPersistedState, officeState]);

  useEffect(() => {
    if (selectedFurnitureId && !scene.furniture.some((element) => element.id === selectedFurnitureId)) {
      setSelectedFurnitureId(null);
    }
  }, [scene.furniture, selectedFurnitureId]);

  useEffect(() => {
    const validGroupKeys = new Set(scene.groups.map((group) => group.key));
    setSelectedGroupKeys((current) => {
      const next = current.filter((groupKey) => validGroupKeys.has(groupKey));
      return next.length === current.length ? current : next;
    });
  }, [scene.groups]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      setViewportSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const fitCameraToScene = useCallback(() => {
    if (viewportSize.width <= 0 || viewportSize.height <= 0) {
      return;
    }
    setOfficeState((current) => ({
      ...current,
      camera: fitCameraToBounds({
        bounds: scene.bounds,
        viewport: viewportSize,
      }),
    }));
  }, [scene.bounds, viewportSize]);

  const setGroupAccentColor = useCallback((groupKey: string, accentColor: string | null) => {
    setOfficeState((current) => {
      const currentAccentColor = current.groupAccentColorsByKey[groupKey];
      if (accentColor === null && currentAccentColor === undefined) {
        return current;
      }
      if (accentColor !== null && currentAccentColor === accentColor) {
        return current;
      }

      const nextGroupAccentColorsByKey = { ...current.groupAccentColorsByKey };
      if (accentColor === null) {
        delete nextGroupAccentColorsByKey[groupKey];
      } else {
        nextGroupAccentColorsByKey[groupKey] = accentColor;
      }

      return {
        ...current,
        groupAccentColorsByKey: nextGroupAccentColorsByKey,
      };
    });
  }, []);

  useEffect(() => {
    setOfficeWindowsMinimizedForZoom((current) => {
      if (!current && camera.zoom <= OFFICE_WINDOW_AUTO_MINIMIZE_ZOOM_THRESHOLD) {
        return true;
      }
      if (current && camera.zoom >= OFFICE_WINDOW_AUTO_RESTORE_ZOOM_THRESHOLD) {
        return false;
      }
      return current;
    });
  }, [camera.zoom]);

  useEffect(() => {
    const previousViewportSize = previousViewportSizeRef.current;
    if (viewportSize.width <= 0 || viewportSize.height <= 0) {
      return;
    }

    if (shouldFitCameraRef.current) {
      shouldFitCameraRef.current = false;
      previousViewportSizeRef.current = viewportSize;
      setOfficeState((current) => ({
        ...current,
        camera: fitCameraToBounds({
          bounds: scene.bounds,
          viewport: viewportSize,
        }),
      }));
      return;
    }

    if (
      previousViewportSize.width > 0 &&
      previousViewportSize.height > 0 &&
      (previousViewportSize.width !== viewportSize.width ||
        previousViewportSize.height !== viewportSize.height)
    ) {
      setOfficeState((current) => {
        const centerWorld = screenToWorld(
          {
            x: previousViewportSize.width / 2,
            y: previousViewportSize.height / 2,
          },
          current.camera,
        );
        return {
          ...current,
          camera: {
            zoom: current.camera.zoom,
            x: viewportSize.width / 2 - centerWorld.x * current.camera.zoom,
            y: viewportSize.height / 2 - centerWorld.y * current.camera.zoom,
          },
        };
      });
    }

    previousViewportSizeRef.current = viewportSize;
  }, [scene.bounds, viewportSize]);

  useEffect(() => {
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = window.setTimeout(() => {
      writeOfficePersistedState(officeState);
      persistTimerRef.current = null;
    }, 120);

    return () => {
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, [officeState]);

  useEffect(() => {
    return () => {
      const currentState = stateRef.current;
      if (currentState) {
        writeOfficePersistedState(currentState);
      }
      for (const timerId of Object.values(officeNotificationTimerIdsRef.current)) {
        window.clearTimeout(timerId);
      }
      officeNotificationTimerIdsRef.current = {};
      const audioContext = officeNotificationAudioContextRef.current;
      officeNotificationAudioContextRef.current = null;
      if (audioContext && audioContext.state !== "closed") {
        void audioContext.close().catch(() => {});
      }
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };
  }, []);

  useEffect(() => {
    const primeAudio = () => {
      void ensureOfficeNotificationAudioContext().catch(() => {});
    };

    window.addEventListener("pointerdown", primeAudio, { passive: true });
    window.addEventListener("keydown", primeAudio);
    return () => {
      window.removeEventListener("pointerdown", primeAudio);
      window.removeEventListener("keydown", primeAudio);
    };
  }, [ensureOfficeNotificationAudioContext]);

  const deskByThreadId = useMemo(
    () => new Map(scene.desks.map((desk) => [desk.threadId, desk] as const)),
    [scene.desks],
  );
  const groupByKey = useMemo(
    () => new Map(scene.groups.map((group) => [group.key, group] as const)),
    [scene.groups],
  );
  const centerCameraOnGroup = useCallback(
    (groupKey: string) => {
      if (viewportSize.width <= 0 || viewportSize.height <= 0) {
        return;
      }

      const group = groupByKey.get(groupKey);
      if (!group) {
        return;
      }

      const centerX = group.element.x + group.element.width / 2;
      const centerY = group.element.y + group.element.height / 2;
      setOfficeState((current) => ({
        ...current,
        camera: {
          zoom: current.camera.zoom,
          x: viewportSize.width / 2 - centerX * current.camera.zoom,
          y: viewportSize.height / 2 - centerY * current.camera.zoom,
        },
      }));
    },
    [groupByKey, viewportSize],
  );
  const toggleGroupCollapsed = useCallback((groupKey: string) => {
    setOfficeState((current) => {
      const expandedGroupKeys = new Set(current.expandedGroupKeys);
      if (expandedGroupKeys.has(groupKey)) {
        expandedGroupKeys.delete(groupKey);
      } else {
        expandedGroupKeys.add(groupKey);
      }

      return {
        ...current,
        expandedGroupKeys: [...expandedGroupKeys],
      };
    });
  }, []);
  const handleDeleteGroup = useCallback(
    async (groupKey: string) => {
      const group = groupByKey.get(groupKey);
      if (!group) {
        return;
      }

      const api = readNativeApi();
      const confirmed = await api?.dialogs.confirm(
        `Remove ${group.label} from the office view?\n\nThis only removes the office from the layout. Threads, worktrees, and project data stay intact. Use Reset layout to bring it back.`,
      );
      if (!confirmed) {
        return;
      }

      const threadIds = new Set(group.deskThreadIds.map((threadId) => String(threadId)));
      setSelectedGroupKeys((current) => current.filter((key) => key !== groupKey));
      setHoveredBotId((current) => (current && threadIds.has(current) ? null : current));
      setOpenWindows((current) => current.filter((windowState) => !threadIds.has(String(windowState.threadId))));
      setWindowStackOrder((current) =>
        current.filter((token) => !(token.startsWith("thread:") && threadIds.has(token.slice("thread:".length)))),
      );
      setOfficeState((current) => {
        const nextProjectGroupAnchors = { ...current.projectGroupAnchors };
        const nextProjectGroupSizesByKey = { ...current.projectGroupSizesByKey };
        const nextDeskOffsetsByThreadId = { ...current.deskOffsetsByThreadId };
        const nextGroupAccentColorsByKey = { ...current.groupAccentColorsByKey };
        delete nextProjectGroupAnchors[groupKey];
        delete nextProjectGroupSizesByKey[groupKey];
        delete nextGroupAccentColorsByKey[groupKey];
        for (const threadId of threadIds) {
          delete nextDeskOffsetsByThreadId[threadId];
        }

        return {
          ...current,
          furniture: current.furniture.filter(
            (element) => element.placement.kind !== "groupLinked" || element.placement.groupKey !== groupKey,
          ),
          projectGroupAnchors: nextProjectGroupAnchors,
          projectGroupSizesByKey: nextProjectGroupSizesByKey,
          deskOffsetsByThreadId: nextDeskOffsetsByThreadId,
          groupAccentColorsByKey: nextGroupAccentColorsByKey,
          expandedGroupKeys: current.expandedGroupKeys.filter((key) => key !== groupKey),
          hiddenGroupKeys: [...new Set([...current.hiddenGroupKeys, groupKey])],
          defaultFurnitureSeededGroupKeys: current.defaultFurnitureSeededGroupKeys.filter(
            (entry) => entry !== groupKey && !entry.includes(`group:${groupKey}:`),
          ),
        };
      });
    },
    [groupByKey],
  );
  const groupScreenRects = useMemo(
    () =>
      scene.groups.map((group) => {
        const topLeft = worldToScreen(
          {
            x: group.element.x,
            y: group.element.y,
          },
          camera,
        );
        return {
          key: group.key,
          rect: {
            x: topLeft.x,
            y: topLeft.y,
            width: group.element.width * camera.zoom,
            height: group.element.height * camera.zoom,
          },
        };
      }),
    [camera, scene.groups],
  );
  const farOfficeMenus = useMemo(
    () =>
      camera.zoom > OFFICE_FAR_LABEL_ZOOM_THRESHOLD
        ? []
        : scene.groups.map((group) => ({
            key: group.key,
            group,
            anchor: worldToScreen(
              {
                x: group.element.x + group.element.width / 2,
                y: group.element.y,
              },
              camera,
            ),
            scale: clamp(OFFICE_FAR_LABEL_ZOOM_THRESHOLD / Math.max(camera.zoom, 0.5), 1, 1.28),
          })),
    [camera, scene.groups],
  );
  const devicePixelRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const projectWindowRect = useCallback(
    (rect: OfficeThreadWindowRect) =>
      worldRectToScreenRect({
        rect,
        camera,
        devicePixelRatio,
      }),
    [camera, devicePixelRatio],
  );
  const projectedThreadWindowRects = useMemo(
    () =>
      new Map(
        openWindows
          .filter((windowState) => windowState.minimized !== true)
          .map((windowState) => [windowState.threadId, projectWindowRect(windowState.rect)] as const),
      ),
    [openWindows, projectWindowRect],
  );
  const minimizedThreadWindows = useMemo(
    () => openWindows.filter((windowState) => windowState.minimized === true),
    [openWindows],
  );
  const expandedThreadWindows = useMemo(
    () => openWindows.filter((windowState) => windowState.minimized !== true),
    [openWindows],
  );
  const projectedThreadPreviewRects = useMemo(
    () =>
      new Map(
        openWindows.flatMap((windowState) => {
          const desk = deskByThreadId.get(windowState.threadId);
          if (!desk) {
            return [];
          }

          const anchor = worldToScreen(
            {
              x: desk.element.x + DESK_WIDTH * 0.5,
              y: desk.element.y - 18,
            },
            camera,
          );

          return [
            [
              windowState.threadId,
              {
                x: Math.round(anchor.x - OFFICE_THREAD_PREVIEW_WIDTH * 0.5),
                y: Math.round(anchor.y - OFFICE_THREAD_PREVIEW_HEIGHT),
                width: OFFICE_THREAD_PREVIEW_WIDTH,
                height: OFFICE_THREAD_PREVIEW_HEIGHT,
              },
            ] as const,
          ];
        }),
      ),
    [camera, deskByThreadId, openWindows],
  );
  const projectedAdminWindowRect = useMemo(
    () =>
      adminWindowRect
        ? worldRectToScreenRect({
            rect: adminWindowRect,
            camera,
            devicePixelRatio,
            sizeZoom: ADMIN_WINDOW_SCREEN_ZOOM,
          })
        : null,
    [adminWindowRect, camera, devicePixelRatio],
  );
  const bots = useMemo(
    () =>
      officeInputs.desks
        .map((desk) => {
          const deskScene = deskByThreadId.get(desk.threadId);
          const groupScene = groupByKey.get(desk.groupKey);
          if (!deskScene) {
            return null;
          }
          return {
            ...desk,
            deskLocation: deskScene.botTarget,
            officeTargets: groupScene?.congregationTargets ?? [],
          };
        })
        .filter((desk): desk is NonNullable<typeof desk> => desk !== null),
    [deskByThreadId, groupByKey, officeInputs.desks],
  );

  const [botStates, setBotStates] = useState<Record<string, BotState>>({});

  useEffect(() => {
    const currentNeedsAttentionByThreadId = new Map<string, boolean>();
    const currentSettledTurnIdByThreadId = new Map<string, string | null>();

    for (const thread of mergedThreads) {
      const threadId = thread.id as string;
      const desk = deskByThreadId.get(thread.id);
      const needsAttention = desk?.needsAttention === true;
      const settledTurnId =
        isLatestTurnSettled(thread.latestTurn, thread.session) && thread.latestTurn?.turnId
          ? (thread.latestTurn.turnId as string)
          : null;

      currentNeedsAttentionByThreadId.set(threadId, needsAttention);
      currentSettledTurnIdByThreadId.set(threadId, settledTurnId);

      const previousNeedsAttention = previousNeedsAttentionByThreadIdRef.current.get(threadId);
      const previousSettledTurnId = previousSettledTurnIdByThreadIdRef.current.get(threadId);
      if (
        !notificationsInitializedRef.current ||
        previousNeedsAttention === undefined ||
        previousSettledTurnId === undefined
      ) {
        continue;
      }

      let sentAttentionNotification = false;
      if (!previousNeedsAttention && needsAttention) {
        pushOfficeNotification({
          threadId: thread.id,
          kind: "attention",
          title: `${thread.title} needs your attention`,
          description: getOfficeNotificationDescription({
            kind: "attention",
            hasPendingApproval: desk?.hasPendingApproval === true,
            hasPendingUserInput: desk?.hasPendingUserInput === true,
          }),
        });
        sentAttentionNotification = true;
      }

      if (!sentAttentionNotification && settledTurnId && previousSettledTurnId !== settledTurnId) {
        pushOfficeNotification({
          threadId: thread.id,
          kind: "success",
          title: `${thread.title} finished work`,
          description: getOfficeNotificationDescription({
            kind: "success",
            hasPendingApproval: false,
            hasPendingUserInput: false,
          }),
        });
      }
    }

    previousNeedsAttentionByThreadIdRef.current = currentNeedsAttentionByThreadId;
    previousSettledTurnIdByThreadIdRef.current = currentSettledTurnIdByThreadId;
    notificationsInitializedRef.current = true;
  }, [deskByThreadId, mergedThreads, pushOfficeNotification]);

  const openThreadWindow = useCallback(
    (threadId: ThreadId) => {
      moveWindowTokenToFront(`thread:${threadId}`);
      setOpenWindows((current) => {
        const existing = current.find((entry) => entry.threadId === threadId);
        if (existing) {
          if (existing.minimized === true) {
            return current.map((entry) =>
              entry.threadId === threadId
                ? {
                    ...entry,
                    minimized: false,
                  }
                : entry,
            );
          }
          return current;
        }
        const desk = deskByThreadId.get(threadId);
        const fallbackAnchor =
          viewportSize.width > 0 && viewportSize.height > 0
            ? screenToWorld(
                {
                  x: viewportSize.width / 2,
                  y: viewportSize.height / 2,
                },
                camera,
              )
            : { x: 0, y: 0 };
        const anchor = desk
          ? {
              x: desk.element.x + DESK_WIDTH,
              y: desk.element.y + 24,
            }
          : fallbackAnchor;

        return [
          ...current,
          {
            threadId,
            rect: buildDefaultOfficeThreadWindowRect(anchor, current.length),
            minimized: false,
          },
        ];
      });
    },
    [camera, deskByThreadId, moveWindowTokenToFront, viewportSize.height, viewportSize.width],
  );

  const closeThreadWindow = useCallback((threadId: ThreadId) => {
    setOpenWindows((current) =>
      current.map((entry) =>
        entry.threadId === threadId
          ? {
              ...entry,
              minimized: true,
            }
          : entry,
      ),
    );
    removeWindowToken(`thread:${threadId}`);
  }, [removeWindowToken]);

  const focusThreadWindow = useCallback((threadId: ThreadId) => {
    moveWindowTokenToFront(`thread:${threadId}`);
  }, [moveWindowTokenToFront]);

  const handleOfficeNotificationOpen = useCallback(
    (notification: OfficeNotification) => {
      openThreadWindow(notification.threadId);
      focusThreadWindow(notification.threadId);
      dismissOfficeNotification(notification.id);
    },
    [dismissOfficeNotification, focusThreadWindow, openThreadWindow],
  );

  useEffect(() => {
    if (!focusThreadId) {
      return;
    }
    openThreadWindow(focusThreadId);
    focusThreadWindow(focusThreadId);
  }, [focusThreadId, focusThreadWindow, openThreadWindow]);

  const updateThreadWindowRect = useCallback((threadId: ThreadId, rect: OfficeThreadWindowRect) => {
    setOpenWindows((current) =>
      current.map((entry) =>
        entry.threadId === threadId
          ? { ...entry, rect: normalizeOfficeThreadWindowRect(rect) }
          : entry,
      ),
    );
  }, []);

  const openAdminWindowAtPoint = useCallback(
    (anchor: OfficePoint) => {
      moveWindowTokenToFront("admin:office-admin");
      const defaultSize = getOfficeAdminWindowDefaultSize();
      setAdminWindowRect(
        normalizeOfficeThreadWindowRect({
          width: defaultSize.width,
          height: defaultSize.height,
          x: Math.round(anchor.x),
          y: Math.round(anchor.y),
        }),
      );
    },
    [moveWindowTokenToFront],
  );

  const closeAdminWindow = useCallback(() => {
    setAdminWindowRect(null);
    removeWindowToken("admin:office-admin");
  }, [removeWindowToken]);

  const focusAdminWindow = useCallback(() => {
    moveWindowTokenToFront("admin:office-admin");
  }, [moveWindowTokenToFront]);

  const updateAdminWindowRect = useCallback((rect: OfficeThreadWindowRect) => {
    setAdminWindowRect(normalizeOfficeThreadWindowRect(rect));
  }, []);

  const openWindowConnections = useMemo(
    () =>
      expandedThreadWindows.flatMap((windowState) => {
        const desk = deskByThreadId.get(windowState.threadId);
        if (!desk) {
          return [];
        }

        const deskPointWorld = {
          x: desk.element.x + DESK_WIDTH / 2,
          y: desk.element.y + 18,
        };
        const windowPointWorld = closestPointOnRect(deskPointWorld, windowState.rect);
        return [
          {
            threadId: windowState.threadId,
            accentColor: desk.accentColor,
            deskPoint: deskPointWorld,
            windowPoint: windowPointWorld,
          },
        ];
      }),
    [deskByThreadId, expandedThreadWindows],
  );
  const minimapState = useMemo(() => {
    const viewportTopLeft =
      viewportSize.width > 0 && viewportSize.height > 0
        ? screenToWorld({ x: 0, y: 0 }, camera)
        : { x: scene.bounds.minX, y: scene.bounds.minY };
    const viewportBottomRight =
      viewportSize.width > 0 && viewportSize.height > 0
        ? screenToWorld(
            {
              x: viewportSize.width,
              y: viewportSize.height,
            },
            camera,
          )
        : { x: scene.bounds.maxX, y: scene.bounds.maxY };
    const viewportWorldRect = {
      x: Math.min(viewportTopLeft.x, viewportBottomRight.x),
      y: Math.min(viewportTopLeft.y, viewportBottomRight.y),
      width: Math.abs(viewportBottomRight.x - viewportTopLeft.x),
      height: Math.abs(viewportBottomRight.y - viewportTopLeft.y),
    };
    const worldBounds = unionOfficeBounds([
      scene.bounds,
      ...expandedThreadWindows.map((windowState) => rectToBounds(windowState.rect)),
      ...(adminWindowRect ? [rectToBounds(adminWindowRect)] : []),
    ]);
    const paddedWorldBounds = {
      minX: worldBounds.minX - 64,
      minY: worldBounds.minY - 64,
      maxX: worldBounds.maxX + 64,
      maxY: worldBounds.maxY + 64,
    };
    const worldWidth = Math.max(paddedWorldBounds.maxX - paddedWorldBounds.minX, 1);
    const worldHeight = Math.max(paddedWorldBounds.maxY - paddedWorldBounds.minY, 1);
    const minimapInnerWidth = OFFICE_MINIMAP_WIDTH - OFFICE_MINIMAP_PADDING * 2;
    const minimapInnerHeight =
      OFFICE_MINIMAP_HEIGHT - OFFICE_MINIMAP_HEADER_HEIGHT - OFFICE_MINIMAP_PADDING * 2;
    const scale = Math.min(minimapInnerWidth / worldWidth, minimapInnerHeight / worldHeight);
    const contentWidth = worldWidth * scale;
    const contentHeight = worldHeight * scale;
    const offsetX = (OFFICE_MINIMAP_WIDTH - contentWidth) / 2;
    const offsetY =
      OFFICE_MINIMAP_HEADER_HEIGHT +
      OFFICE_MINIMAP_PADDING +
      (minimapInnerHeight - contentHeight) / 2;
    const mapRect = (rect: OfficePoint & OfficeSize) => ({
      x: offsetX + (rect.x - paddedWorldBounds.minX) * scale,
      y: offsetY + (rect.y - paddedWorldBounds.minY) * scale,
      width: Math.max(rect.width * scale, 3),
      height: Math.max(rect.height * scale, 3),
    });
    const mapPoint = (point: OfficePoint) => ({
      x: offsetX + (point.x - paddedWorldBounds.minX) * scale,
      y: offsetY + (point.y - paddedWorldBounds.minY) * scale,
    });

    return {
      offsetX,
      offsetY,
      scale,
      worldBounds: paddedWorldBounds,
      worldWidth,
      worldHeight,
      viewportRect: mapRect(viewportWorldRect),
      groupRects: scene.groups.map((group) => ({
        key: group.key,
        accentColor: group.accentColor,
        rect: mapRect(group.element),
      })),
      deskDots: scene.desks.map((desk) => ({
        threadId: desk.threadId,
        accentColor: desk.accentColor,
        isActive: desk.isActive,
        point: mapPoint({
          x: desk.element.x + DESK_WIDTH / 2,
          y: desk.element.y + DESK_HEIGHT / 2,
        }),
      })),
      windowRects: expandedThreadWindows.map((windowState) => {
        const desk = deskByThreadId.get(windowState.threadId);
        return {
          id: `thread:${windowState.threadId}`,
          accentColor: desk?.accentColor ?? "#94a3b8",
          rect: mapRect(windowState.rect),
        };
      }),
      adminWindowRect: adminWindowRect ? mapRect(adminWindowRect) : null,
    };
  }, [
    adminWindowRect,
    camera,
    deskByThreadId,
    expandedThreadWindows,
    scene.bounds,
    scene.desks,
    scene.groups,
    viewportSize.height,
    viewportSize.width,
  ]);
  const centeredGroupKey = useMemo(() => {
    if (viewportSize.width <= 0 || viewportSize.height <= 0) {
      return null;
    }

    const viewportCenter = screenToWorld(
      {
        x: viewportSize.width / 2,
        y: viewportSize.height / 2,
      },
      camera,
    );

    const centeredGroup = scene.groups.find((group) => {
      const { x, y, width, height } = group.element;
      return (
        viewportCenter.x >= x &&
        viewportCenter.x <= x + width &&
        viewportCenter.y >= y &&
        viewportCenter.y <= y + height
      );
    });

    return centeredGroup?.key ?? null;
  }, [camera, scene.groups, viewportSize.height, viewportSize.width]);
  const handleMinimapPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || viewportSize.width <= 0 || viewportSize.height <= 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      const localX = clamp(event.clientX - rect.left, 0, rect.width);
      const localY = clamp(event.clientY - rect.top, 0, rect.height);
      const contentX = clamp(
        localX,
        minimapState.offsetX,
        minimapState.offsetX + minimapState.worldWidth * minimapState.scale,
      );
      const contentY = clamp(
        localY,
        minimapState.offsetY,
        minimapState.offsetY + minimapState.worldHeight * minimapState.scale,
      );
      const targetWorldX =
        minimapState.worldBounds.minX + (contentX - minimapState.offsetX) / minimapState.scale;
      const targetWorldY =
        minimapState.worldBounds.minY + (contentY - minimapState.offsetY) / minimapState.scale;

      setOfficeState((current) => ({
        ...current,
        camera: {
          ...current.camera,
          x: viewportSize.width / 2 - targetWorldX * current.camera.zoom,
          y: viewportSize.height / 2 - targetWorldY * current.camera.zoom,
        },
      }));
    },
    [minimapState, viewportSize.height, viewportSize.width],
  );

  const threadById = useMemo(
    () => new Map(mergedThreads.map((thread) => [thread.id as string, thread] as const)),
    [mergedThreads],
  );
  const activeThoughtByThreadId = useMemo(
    () =>
      new Map(
        bots.flatMap((bot) => {
          if (!bot.isActive) {
            return [];
          }
          const thread = threadById.get(bot.threadId);
          if (!thread) {
            return [];
          }
          const summary = summarizeOfficeThought(thread);
          return summary ? [[bot.threadId, summary] as const] : [];
        }),
      ),
    [bots, threadById],
  );

  useEffect(() => {
    setBotStates((previous) => {
      const next = { ...previous };
      let changed = false;
      const activeBotIds = new Set(bots.map((bot) => bot.threadId));

      for (const key of Object.keys(next)) {
        if (!activeBotIds.has(key)) {
          delete next[key];
          changed = true;
        }
      }

      for (const bot of bots) {
        if (next[bot.threadId]) {
          continue;
        }
        next[bot.threadId] = {
          x: bot.deskLocation.x,
          y: bot.deskLocation.y,
          nextMoveTime: Date.now() + 1000 + Math.random() * 2000,
          transitionMs: 2000,
          facingLeft: false,
          thoughtEmoji: null,
          idleStep: 0,
        };
        changed = true;
      }

      return changed ? next : previous;
    });
  }, [bots]);

  useEffect(() => {
    setBotStates((previous) => {
      const next = { ...previous };
      let changed = false;

      for (const bot of bots) {
        if (!bot.isActive) {
          continue;
        }
        const state = previous[bot.threadId];
        if (!state) {
          continue;
        }
        const atDesk =
          Math.abs(state.x - bot.deskLocation.x) < 5 &&
          Math.abs(state.y - bot.deskLocation.y) < 5 &&
          state.thoughtEmoji === null;
        if (atDesk) {
          continue;
        }
        next[bot.threadId] = {
          ...state,
          x: bot.deskLocation.x,
          y: bot.deskLocation.y,
          transitionMs: 500,
          nextMoveTime: Date.now() + 500,
          facingLeft: bot.deskLocation.x < state.x,
          thoughtEmoji: null,
          idleStep: state.idleStep,
        };
        changed = true;
      }

      return changed ? next : previous;
    });
  }, [bots]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      const now = Date.now();
      setBotStates((previous) => {
        const next = { ...previous };
        let changed = false;

        for (const bot of bots) {
          const state = previous[bot.threadId];
          if (!state || now < state.nextMoveTime) {
            continue;
          }

          if (bot.isActive) {
            const atDesk =
              Math.abs(state.x - bot.deskLocation.x) < 5 &&
              Math.abs(state.y - bot.deskLocation.y) < 5;
            if (!atDesk) {
              const dist = distance(state, bot.deskLocation);
              next[bot.threadId] = {
                ...state,
                x: bot.deskLocation.x,
                y: bot.deskLocation.y,
                transitionMs: Math.max(800, dist * 4),
                nextMoveTime: now + Math.max(1000, dist * 4) + 500,
                facingLeft: bot.deskLocation.x < state.x,
                thoughtEmoji: null,
                idleStep: state.idleStep,
              };
            } else {
              next[bot.threadId] = {
                ...state,
                x: bot.deskLocation.x + (Math.random() > 0.5 ? -1.5 : 1.5),
                y: bot.deskLocation.y,
                transitionMs: 400,
                nextMoveTime: now + 1500 + Math.random() * 1000,
                thoughtEmoji: null,
                idleStep: state.idleStep,
              };
            }
            changed = true;
            continue;
          }

          if (Math.random() < 0.3) {
            next[bot.threadId] = {
              ...state,
              nextMoveTime: now + 2000 + Math.random() * 2000,
              thoughtEmoji:
                Math.random() < 0.25
                  ? THOUGHT_EMOJIS[Math.floor(Math.random() * THOUGHT_EMOJIS.length)]!
                  : null,
              idleStep: state.idleStep,
            };
            changed = true;
            continue;
          }

          const nextIdleStep = state.idleStep + 1;
          const destination = getIdleOfficeDestination({
            threadId: bot.threadId,
            officeTargets: bot.officeTargets,
            deskLocation: bot.deskLocation,
            idleStep: nextIdleStep,
          });
          const dist = distance(state, destination);
          const transitionMs = Math.max(1500, dist * 5);
          next[bot.threadId] = {
            ...state,
            x: destination.x,
            y: destination.y,
            transitionMs,
            nextMoveTime: now + transitionMs + 500 + Math.random() * 2000,
            facingLeft: destination.x < state.x,
            thoughtEmoji:
              Math.random() < 0.15
                ? THOUGHT_EMOJIS[Math.floor(Math.random() * THOUGHT_EMOJIS.length)]!
                : null,
            idleStep: nextIdleStep,
          };
          changed = true;
        }

        return changed ? next : previous;
      });
    }, 500);

    return () => clearInterval(intervalId);
  }, [bots]);

  const shouldSuppressClick = useCallback(() => performance.now() < suppressClickUntilRef.current, []);

  const handleThreadClick = useCallback(
    (threadId: ThreadId) => {
      if (shouldSuppressClick()) {
        return;
      }
      const existingWindow = openWindows.find((entry) => entry.threadId === threadId);
      if (existingWindow && existingWindow.minimized !== true) {
        closeThreadWindow(threadId);
        return;
      }
      openThreadWindow(threadId);
    },
    [closeThreadWindow, openThreadWindow, openWindows, shouldSuppressClick],
  );

  const openCreateDialog = useCallback((projectId: ProjectId | null = null) => {
    setCreateDialogProjectId(projectId ?? projects[0]?.id ?? null);
    setIsCreateDialogOpen(true);
  }, [projects]);

  const handleCreateAgent = useCallback(
    async (input: { projectId: ProjectId; title: string | null }) => {
      const result = await createOrReuseProjectDraftThread(
        {
          getDraftThreadByProjectId,
          getDraftThread,
          setDraftThreadContext,
          setProjectDraftThreadId,
        },
        {
          projectId: input.projectId,
          title: input.title,
          reuseExisting: false,
        },
      );
      openThreadWindow(result.threadId);
    },
    [getDraftThread, getDraftThreadByProjectId, openThreadWindow, setDraftThreadContext, setProjectDraftThreadId],
  );

  const handleCreateAgentForProject = useCallback(
    async (projectId: ProjectId) => {
      await handleCreateAgent({
        projectId,
        title: null,
      });
    },
    [handleCreateAgent],
  );

  const handleOpenLatestProjectThread = useCallback(
    (projectId: ProjectId) => {
      const latestThreadId = findMostRecentThreadIdForProject(mergedThreads, projectId);
      if (!latestThreadId) {
        void handleCreateAgentForProject(projectId);
        return;
      }
      openThreadWindow(latestThreadId);
    },
    [handleCreateAgentForProject, mergedThreads, openThreadWindow],
  );

  const handleAddProjectFromOffice = useCallback(
    async (rawCwd: string) => {
      const result = await ensureProjectExists(projects, rawCwd);
      if (result.status === "existing") {
        handleOpenLatestProjectThread(result.projectId);
        return;
      }
      await handleCreateAgentForProject(result.projectId);
    },
    [handleCreateAgentForProject, handleOpenLatestProjectThread, projects],
  );

  const handlePickProjectFolder = useCallback(async () => {
    const api = readNativeApi();
    if (!api) {
      return null;
    }
    return api.dialogs.pickFolder();
  }, []);

  const handleDeleteThread = useCallback(
    async (threadId: ThreadId) => {
      const result = await deleteThreadWithCleanup(
        {
          threads,
          projects,
          confirmThreadDelete: settings.confirmThreadDelete,
          getDraftThread,
          clearComposerDraftForThread,
          clearProjectDraftThreadById,
          clearTerminalState,
          removeWorktree: (input) => removeWorktreeMutation.mutateAsync(input),
        },
        threadId,
      );
      if (result.deletedDraftOnly || openWindows.some((entry) => entry.threadId === threadId)) {
        setOpenWindows((current) => current.filter((entry) => entry.threadId !== threadId));
        removeWindowToken(`thread:${threadId}`);
      }
    },
    [
      clearComposerDraftForThread,
      clearProjectDraftThreadById,
      clearTerminalState,
      getDraftThread,
      openWindows,
      projects,
      removeWindowToken,
      removeWorktreeMutation,
      settings.confirmThreadDelete,
      threads,
    ],
  );

  const handleRenameThread = useCallback(
    async (threadId: ThreadId, title: string) => {
      await renameThread(
        {
          threads,
          getDraftThread,
          setDraftThreadContext,
        },
        {
          threadId,
          title,
        },
      );
    },
    [getDraftThread, setDraftThreadContext, threads],
  );

  const getViewportCenterWorldPoint = useCallback((): OfficePoint => {
    if (viewportSize.width > 0 && viewportSize.height > 0) {
      return screenToWorld(
        {
          x: viewportSize.width / 2,
          y: viewportSize.height / 2,
        },
        camera,
      );
    }

    return {
      x: (scene.bounds.minX + scene.bounds.maxX) / 2,
      y: (scene.bounds.minY + scene.bounds.maxY) / 2,
    };
  }, [camera, scene.bounds, viewportSize]);

  const handleAddFurniture = useCallback(
    (kind: OfficeFurnitureAddKind) => {
      const anchor = getViewportCenterWorldPoint();
      const currentState = stateRef.current ?? officeState;
      const addedFurniture = createOfficeFurniture(kind, anchor, currentState.furniture);
      setOfficeState({
        ...currentState,
        furniture: [...currentState.furniture, ...addedFurniture],
      });
      setSelectedGroupKeys([]);
      setSelectedFurnitureId(addedFurniture[0]?.id ?? null);
    },
    [getViewportCenterWorldPoint, officeState],
  );

  const handleRemoveSelectedFurniture = useCallback(() => {
    if (!selectedFurnitureId) {
      return;
    }
    setOfficeState((current) => ({
      ...current,
      furniture: removeOfficeFurniture(current.furniture, selectedFurnitureId),
    }));
    setSelectedFurnitureId(null);
  }, [selectedFurnitureId]);

  useEffect(() => {
    function handleWindowKeyDown(event: KeyboardEvent) {
      if (event.key !== "Delete" || event.defaultPrevented) {
        return;
      }
      if (!selectedFurnitureId || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }
      if (isKeyboardEditableTarget(event.target)) {
        return;
      }
      event.preventDefault();
      setOfficeState((current) => ({
        ...current,
        furniture: removeOfficeFurniture(current.furniture, selectedFurnitureId),
      }));
      setSelectedFurnitureId(null);
    }

    window.addEventListener("keydown", handleWindowKeyDown);
    return () => window.removeEventListener("keydown", handleWindowKeyDown);
  }, [selectedFurnitureId]);

  const beginDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, nextDragState: DragState) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      trySetPointerCapture(event.currentTarget, event.pointerId);
      dragStateRef.current = nextDragState;
      setSelectedFurnitureId(nextDragState.kind === "element" ? nextDragState.key : null);
      if (nextDragState.kind !== "group" && nextDragState.kind !== "groupResize") {
        setSelectedGroupKeys([]);
      }
      setIsInteracting(true);
      setHoveredBotId(null);
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
    },
    [],
  );

  const startGroupDrag = useCallback(
    (group: OfficeSceneGroup, event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      const isSelected = selectedGroupKeySet.has(group.key);
      const dragGroupKeys = isSelected ? selectedGroupKeys : [group.key];
      const linkedThreadIdsByGroupKey = Object.fromEntries(
        dragGroupKeys.map((groupKey) => [groupKey, groupByKey.get(groupKey)?.deskThreadIds ?? []] as const),
      );
      const startAnchorsByGroupKey = Object.fromEntries(
        dragGroupKeys.flatMap((groupKey) => {
          const dragGroup = groupByKey.get(groupKey);
          return dragGroup ? ([[groupKey, { x: dragGroup.anchor.x, y: dragGroup.anchor.y }] as const]) : [];
        }),
      );

      setSelectedGroupKeys(dragGroupKeys);
      beginDrag(event, {
        pointerId: event.pointerId,
        kind: "group",
        groupKeys: dragGroupKeys,
        linkedThreadIdsByGroupKey,
        startPointer: { x: event.clientX, y: event.clientY },
        startAnchorsByGroupKey,
        lastDelta: { x: 0, y: 0 },
        moved: false,
      });
    },
    [beginDrag, groupByKey, selectedGroupKeys, selectedGroupKeySet],
  );

  const endInteraction = useCallback(() => {
    dragStateRef.current = null;
    panStateRef.current = null;
    groupSelectionStateRef.current = null;
    setGroupSelectionRect(null);
    setIsInteracting(false);
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
  }, []);

  const handleViewportPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(OFFICE_VIEWPORT_POINTER_BLOCK_SELECTOR)) {
        return;
      }
      if (event.button === 0) {
        event.preventDefault();
        const viewportRect = event.currentTarget.getBoundingClientRect();
        trySetPointerCapture(event.currentTarget, event.pointerId);
        groupSelectionStateRef.current = {
          pointerId: event.pointerId,
          startScreen: {
            x: event.clientX - viewportRect.left,
            y: event.clientY - viewportRect.top,
          },
          currentScreen: {
            x: event.clientX - viewportRect.left,
            y: event.clientY - viewportRect.top,
          },
          moved: false,
        };
        setIsInteracting(true);
        setHoveredBotId(null);
        document.body.style.cursor = "crosshair";
        document.body.style.userSelect = "none";
        return;
      }
      if (event.button !== 1) {
        return;
      }
      event.preventDefault();
      trySetPointerCapture(event.currentTarget, event.pointerId);
      panStateRef.current = {
        pointerId: event.pointerId,
        startPointer: {
          x: event.clientX,
          y: event.clientY,
        },
        startCamera: officeState.camera,
        moved: false,
      };
      setIsInteracting(true);
      setHoveredBotId(null);
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
    },
    [officeState.camera],
  );

  const handleViewportContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (performance.now() < suppressContextMenuUntilRef.current) {
        event.preventDefault();
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(OFFICE_VIEWPORT_CONTEXT_MENU_BLOCK_SELECTOR)) {
        return;
      }
      event.preventDefault();
      const viewportRect = event.currentTarget.getBoundingClientRect();
      const worldPoint = screenToWorld(
        {
          x: event.clientX - viewportRect.left,
          y: event.clientY - viewportRect.top,
        },
        camera,
      );
      setSelectedFurnitureId(null);
      setSelectedGroupKeys([]);
      openAdminWindowAtPoint(worldPoint);
    },
    [camera, openAdminWindowAtPoint],
  );

  const handleViewportPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const groupSelectionState = groupSelectionStateRef.current;
    if (groupSelectionState && groupSelectionState.pointerId === event.pointerId) {
      event.preventDefault();
      const viewportRect = event.currentTarget.getBoundingClientRect();
      const nextCurrentScreen = {
        x: event.clientX - viewportRect.left,
        y: event.clientY - viewportRect.top,
      };
      groupSelectionState.currentScreen = nextCurrentScreen;
      const nextSelectionRect = rectFromPoints(
        groupSelectionState.startScreen,
        groupSelectionState.currentScreen,
      );
      if (
        !groupSelectionState.moved &&
        Math.hypot(
          nextCurrentScreen.x - groupSelectionState.startScreen.x,
          nextCurrentScreen.y - groupSelectionState.startScreen.y,
        ) >= OFFICE_DRAG_THRESHOLD_PX
      ) {
        groupSelectionState.moved = true;
      }
      if (groupSelectionState.moved) {
        setGroupSelectionRect(nextSelectionRect);
        setSelectedGroupKeys(
          groupScreenRects
            .filter((group) => rectsIntersect(group.rect, nextSelectionRect))
            .map((group) => group.key),
        );
      }
      return;
    }

    const panState = panStateRef.current;
    if (!panState || panState.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    const dx = event.clientX - panState.startPointer.x;
    const dy = event.clientY - panState.startPointer.y;
    if (!panState.moved && Math.hypot(dx, dy) >= OFFICE_DRAG_THRESHOLD_PX) {
      panState.moved = true;
    }

    setOfficeState((current) => ({
      ...current,
      camera: {
        ...current.camera,
        x: panState.startCamera.x + dx,
        y: panState.startCamera.y + dy,
      },
    }));
  }, [groupScreenRects]);

  const handleViewportPointerEnd = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const groupSelectionState = groupSelectionStateRef.current;
      if (groupSelectionState && groupSelectionState.pointerId === event.pointerId) {
        if (!groupSelectionState.moved) {
          setSelectedFurnitureId(null);
          setSelectedGroupKeys([]);
        }
        if (groupSelectionState.moved) {
          suppressContextMenuUntilRef.current = performance.now() + 250;
        }
        tryReleasePointerCapture(event.currentTarget, event.pointerId);
        endInteraction();
        return;
      }

      const panState = panStateRef.current;
      if (!panState || panState.pointerId !== event.pointerId) {
        return;
      }
      if (panState.moved) {
        suppressClickUntilRef.current = performance.now() + 250;
      }
      tryReleasePointerCapture(event.currentTarget, event.pointerId);
      endInteraction();
    },
    [endInteraction],
  );

  const handleDragPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }
      event.preventDefault();
      const dx = event.clientX - dragState.startPointer.x;
      const dy = event.clientY - dragState.startPointer.y;
      if (!dragState.moved && Math.hypot(dx, dy) >= OFFICE_DRAG_THRESHOLD_PX) {
        dragState.moved = true;
      }
      const worldDx = dx / officeState.camera.zoom;
      const worldDy = dy / officeState.camera.zoom;

      if (dragState.kind === "groupResize") {
        const nextSize = clampGroupSize({
          width: dragState.startSize.width + worldDx,
          height: dragState.startSize.height + worldDy,
        });

        setOfficeState((current) => {
          const currentSize = current.projectGroupSizesByKey[dragState.key] ?? dragState.startSize;
          const sizeChanged =
            currentSize.width !== nextSize.width || currentSize.height !== nextSize.height;
          let deskOffsetsChanged = false;
          const nextDeskOffsetsByThreadId = { ...current.deskOffsetsByThreadId };

          for (const threadId of dragState.linkedThreadIds) {
            const startOffset = dragState.startDeskOffsetsByThreadId[threadId];
            if (!startOffset) {
              continue;
            }
            const nextOffset = scaleDeskOffsetForGroupResize(
              startOffset,
              dragState.startSize,
              nextSize,
              dragState.startMinOffset,
            );
            const currentOffset = current.deskOffsetsByThreadId[threadId] ?? startOffset;
            if (currentOffset.x === nextOffset.x && currentOffset.y === nextOffset.y) {
              continue;
            }
            nextDeskOffsetsByThreadId[threadId] = nextOffset;
            deskOffsetsChanged = true;
          }

          if (!sizeChanged && !deskOffsetsChanged) {
            return current;
          }

          return {
            ...current,
            projectGroupSizesByKey: {
              ...current.projectGroupSizesByKey,
              [dragState.key]: nextSize,
            },
            deskOffsetsByThreadId: deskOffsetsChanged
              ? nextDeskOffsetsByThreadId
              : current.deskOffsetsByThreadId,
          };
        });
        return;
      }

      if (dragState.kind === "group") {
        const nextDelta = {
          x: Math.round(worldDx),
          y: Math.round(worldDy),
        };
        const deltaX = nextDelta.x - dragState.lastDelta.x;
        const deltaY = nextDelta.y - dragState.lastDelta.y;
        if (deltaX === 0 && deltaY === 0) {
          return;
        }
        dragState.lastDelta = nextDelta;

        const linkedThreadIds = dragState.groupKeys.flatMap(
          (groupKey) => dragState.linkedThreadIdsByGroupKey[groupKey] ?? [],
        );

        if (linkedThreadIds.length > 0) {
          setOpenWindows((current) =>
            current.map((windowState) =>
              linkedThreadIds.includes(windowState.threadId)
                ? {
                    ...windowState,
                    rect: {
                      ...windowState.rect,
                      x: windowState.rect.x + deltaX,
                      y: windowState.rect.y + deltaY,
                    },
                  }
              : windowState,
            ),
          );
        }

        setOfficeState((current) => {
          let changed = false;
          const nextProjectGroupAnchors = { ...current.projectGroupAnchors };
          for (const groupKey of dragState.groupKeys) {
            const startAnchor = dragState.startAnchorsByGroupKey[groupKey];
            if (!startAnchor) {
              continue;
            }
            const nextAnchor = {
              x: startAnchor.x + nextDelta.x,
              y: startAnchor.y + nextDelta.y,
            };
            const currentAnchor = current.projectGroupAnchors[groupKey] ?? startAnchor;
            if (currentAnchor.x === nextAnchor.x && currentAnchor.y === nextAnchor.y) {
              continue;
            }
            nextProjectGroupAnchors[groupKey] = nextAnchor;
            changed = true;
          }
          if (!changed) {
            return current;
          }
          return {
            ...current,
            projectGroupAnchors: nextProjectGroupAnchors,
          };
        });
        return;
      }

      const nextPoint = {
        x: Math.round(dragState.startValue.x + worldDx),
        y: Math.round(dragState.startValue.y + worldDy),
      };

      setOfficeState((current) => {
        if (dragState.kind === "desk") {
          const currentOffset = current.deskOffsetsByThreadId[dragState.key] ?? dragState.startValue;
          if (currentOffset.x === nextPoint.x && currentOffset.y === nextPoint.y) {
            return current;
          }
          return {
            ...current,
            deskOffsetsByThreadId: {
              ...current.deskOffsetsByThreadId,
              [dragState.key]: nextPoint,
            },
          };
        }

        const movedFurniture = moveOfficeFurnitureWithChildren({
          furniture: current.furniture,
          movedId: dragState.key,
          nextPoint,
          groupAnchors: current.projectGroupAnchors,
        });
        const didChange = movedFurniture.some((element, index) => {
          const previous = current.furniture[index];
          return (
            previous?.id !== element.id ||
            previous?.parentId !== element.parentId ||
            JSON.stringify(previous?.placement ?? null) !== JSON.stringify(element.placement)
          );
        });
        if (!didChange) {
          return current;
        }
        return {
          ...current,
          furniture: movedFurniture,
        };
      });
    },
    [officeState.camera.zoom],
  );

  const handleDragPointerEnd = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }
      if (dragState.moved) {
        suppressClickUntilRef.current = performance.now() + 250;
      }
      tryReleasePointerCapture(event.currentTarget, event.pointerId);
      endInteraction();
    },
    [endInteraction],
  );

  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target : null;
    if (
      target?.closest("[data-office-thread-window], [data-office-admin-window]")
    ) {
      return;
    }

    event.preventDefault();
    const viewportRect = viewportRef.current?.getBoundingClientRect();
    if (!viewportRect) {
      return;
    }
    const screenPoint = {
      x: event.clientX - viewportRect.left,
      y: event.clientY - viewportRect.top,
    };
    const zoomMultiplier = Math.exp(-event.deltaY * 0.0015);
    setOfficeState((current) => ({
      ...current,
      camera: zoomAtPoint({
        camera: current.camera,
        nextZoom: current.camera.zoom * zoomMultiplier,
        screenPoint,
      }),
    }));
  }, []);

  const resetLayout = useCallback(() => {
    clearOfficePersistedState();
    shouldFitCameraRef.current = true;
    previousViewportSizeRef.current = { width: 0, height: 0 };
    setSelectedFurnitureId(null);
    setOfficeState(createDefaultOfficePersistedState());
  }, []);

  const gridColumn = 80 * camera.zoom;
  const gridRow = 40 * camera.zoom;
  const backgroundStyle = {
    backgroundImage: `
      radial-gradient(circle at top, rgba(120, 140, 255, 0.08), transparent 36%),
      repeating-linear-gradient(
        90deg,
        transparent,
        transparent ${Math.max(gridColumn - 2, 1)}px,
        color-mix(in srgb, var(--color-border) 58%, transparent) ${Math.max(gridColumn - 2, 1)}px,
        color-mix(in srgb, var(--color-border) 58%, transparent) ${gridColumn}px
      ),
      repeating-linear-gradient(
        0deg,
        transparent,
        transparent ${Math.max(gridRow - 2, 1)}px,
        color-mix(in srgb, var(--color-border) 40%, transparent) ${Math.max(gridRow - 2, 1)}px,
        color-mix(in srgb, var(--color-border) 40%, transparent) ${gridRow}px
      )
    `,
    backgroundPosition: `0 0, ${mod(camera.x, gridColumn)}px 0, 0 ${mod(camera.y, gridRow)}px`,
  } satisfies React.CSSProperties;

  return (
    <div
      ref={viewportRef}
      data-testid="virtual-office-viewport"
      data-camera-x={camera.x}
      data-camera-y={camera.y}
      data-camera-zoom={camera.zoom}
      data-office-windows-minimized={officeWindowsMinimizedForZoom ? "true" : "false"}
      className={`relative h-full w-full overflow-hidden bg-background ${isInteracting ? "cursor-grabbing" : ""}`}
      style={backgroundStyle}
      onWheel={handleWheel}
      onPointerDown={handleViewportPointerDown}
      onPointerMove={handleViewportPointerMove}
      onPointerUp={handleViewportPointerEnd}
      onPointerCancel={handleViewportPointerEnd}
      onContextMenu={handleViewportContextMenu}
    >
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-linear-to-t from-background via-background/70 to-transparent" />

      {farOfficeMenus.map(({ key, group, anchor, scale }) => (
        <OfficeGroupMenu
          key={key}
          group={group}
          groupAccentColorsByKey={officeState.groupAccentColorsByKey}
          isFarMenu
          scale={scale}
          onMenuPointerDown={(event) => {
            startGroupDrag(group, event);
          }}
          onMenuPointerMove={handleDragPointerMove}
          onMenuPointerUp={handleDragPointerEnd}
          onMenuPointerCancel={handleDragPointerEnd}
          onCreate={(nextGroup) => {
            openCreateDialog(
              nextGroup.deskThreadIds[0]
                ? (mergedThreads.find((thread) => thread.id === nextGroup.deskThreadIds[0])?.projectId ?? null)
                : null,
            );
          }}
          onToggleCollapsed={toggleGroupCollapsed}
          onDelete={(groupKey) => {
            void handleDeleteGroup(groupKey);
          }}
          onSetAccentColor={setGroupAccentColor}
          style={{ left: anchor.x, top: anchor.y }}
        />
      ))}

      {groupSelectionRect ? (
        <div
          data-office-group-selection-box=""
          className="pointer-events-none absolute z-30 border-2 border-dashed border-primary/80 bg-primary/10 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
          style={{
            left: groupSelectionRect.x,
            top: groupSelectionRect.y,
            width: groupSelectionRect.width,
            height: groupSelectionRect.height,
          }}
        />
      ) : null}

      <div className="pointer-events-none absolute left-4 top-4 z-20 flex max-w-[calc(100%-2rem)] items-center gap-2">
        <div
          data-office-toolbar
          className="pointer-events-auto flex items-center gap-2 rounded-full border border-border/60 bg-background/90 px-2 py-1.5 shadow-lg backdrop-blur-sm"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="rounded-full border border-border/60 bg-card/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/80">
            Office
          </div>
          <Button size="sm" variant="ghost" onClick={() => openCreateDialog()}>
            <PlusIcon className="size-4" />
            Create Agent
          </Button>
          <Menu>
            <MenuTrigger render={<Button size="sm" variant="ghost" />}>
              <PlusIcon className="size-4" />
              Add Furniture
            </MenuTrigger>
            <MenuPopup align="start">
              <MenuItem onClick={() => handleAddFurniture("conferenceSet")}>
                {OFFICE_FURNITURE_LABELS.conferenceSet}
              </MenuItem>
              <MenuItem onClick={() => handleAddFurniture("waterCooler")}>
                {OFFICE_FURNITURE_LABELS.waterCooler}
              </MenuItem>
              <MenuItem onClick={() => handleAddFurniture("plant")}>
                {OFFICE_FURNITURE_LABELS.plant}
              </MenuItem>
              <MenuItem onClick={() => handleAddFurniture("coffeeBar")}>
                {OFFICE_FURNITURE_LABELS.coffeeBar}
              </MenuItem>
              <MenuItem onClick={() => handleAddFurniture("chair")}>
                {OFFICE_FURNITURE_LABELS.chair}
              </MenuItem>
              <MenuItem onClick={() => handleAddFurniture("conferenceTable")}>
                {OFFICE_FURNITURE_LABELS.conferenceTable}
              </MenuItem>
            </MenuPopup>
          </Menu>
          <Button
            size="sm"
            variant="ghost"
            disabled={!selectedFurniture}
            onClick={handleRemoveSelectedFurniture}
          >
            Remove Selected
          </Button>
          {selectedFurniture && (
            <div className="rounded-full border border-border/60 bg-background/70 px-2 py-1 text-[11px] font-medium text-muted-foreground">
              {OFFICE_FURNITURE_LABELS[selectedFurniture.type as keyof typeof OFFICE_FURNITURE_LABELS] ??
                "Furniture"}
            </div>
          )}
          <div className="rounded-full border border-border/60 bg-background/70 px-2 py-1 text-[11px] font-medium">
            <span className="text-muted-foreground">Zoom</span>{" "}
            <span>{Math.round(camera.zoom * 100)}%</span>
          </div>
          <Menu>
            <MenuTrigger
              render={<Button aria-label="Office actions" size="icon-sm" variant="ghost" />}
            >
              <MoreHorizontalIcon className="size-4" />
            </MenuTrigger>
            <MenuPopup align="end">
              <MenuItem onClick={() => openCreateDialog()}>Create Agent</MenuItem>
              <MenuItem onClick={fitCameraToScene}>
                <ScanSearchIcon className="size-4" />
                Fit to content
              </MenuItem>
              <MenuItem onClick={resetLayout}>
                <RotateCcwIcon className="size-4" />
                Reset layout
              </MenuItem>
            </MenuPopup>
          </Menu>
        </div>
      </div>

      {officeNotifications.length > 0 ? (
        <div className="pointer-events-none absolute right-4 top-20 z-[30000] flex w-[min(24rem,calc(100%-2rem))] flex-col gap-2">
          {officeNotifications.map((notification) => {
            const isAttention = notification.kind === "attention";
            const accentColor = isAttention ? "#f59e0b" : "#10b981";
            const Icon = isAttention ? TriangleAlertIcon : CircleCheckIcon;

            return (
              <div
                key={notification.id}
                data-office-notification={notification.id}
                data-office-notification-thread={notification.threadId}
                data-office-notification-kind={notification.kind}
                className="pointer-events-auto rounded-2xl border bg-background/95 p-3 shadow-2xl backdrop-blur-sm"
                style={{
                  borderColor: `${accentColor}66`,
                  boxShadow: `0 20px 50px -28px ${accentColor}88`,
                }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-2xl border"
                    style={{
                      borderColor: `${accentColor}55`,
                      backgroundColor: `${accentColor}12`,
                      color: accentColor,
                    }}
                  >
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      className="text-[10px] font-semibold tracking-[0.14em] uppercase"
                      style={{ color: accentColor }}
                    >
                      {isAttention ? "Needs Attention" : "Work Finished"}
                    </div>
                    <div className="mt-1 truncate text-sm font-semibold text-foreground">
                      {notification.title}
                    </div>
                    <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {notification.description}
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <Button
                        size="sm"
                        className="h-8"
                        onClick={() => handleOfficeNotificationOpen(notification)}
                      >
                        Open
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8"
                        onClick={() => dismissOfficeNotification(notification.id)}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="Dismiss office notification"
                    onClick={() => dismissOfficeNotification(notification.id)}
                  >
                    <XIcon className="size-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="pointer-events-none absolute bottom-4 right-4 z-20 flex flex-col items-end gap-2">
        <div className="pointer-events-auto flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-1.5 rounded-2xl border border-border/70 bg-background/92 p-2.5 shadow-xl backdrop-blur-sm">
          <div className="flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground/75">
            <span>Offices</span>
            <span className="text-muted-foreground">Jump to center</span>
          </div>
          <div className="flex flex-col gap-1 pr-0.5">
            {scene.groups.map((group) => {
              const isCentered = centeredGroupKey === group.key;
              return (
                <button
                  key={group.key}
                  type="button"
                  data-office-shortcut={group.key}
                  className="flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors hover:bg-accent/60"
                  style={{
                    borderColor: isCentered ? `${group.accentColor}99` : `${group.accentColor}44`,
                    backgroundColor: isCentered ? `${group.accentColor}1f` : `${group.accentColor}12`,
                    boxShadow: isCentered ? `0 0 0 1px ${group.accentColor}30 inset` : undefined,
                  }}
                  onClick={() => {
                    centerCameraOnGroup(group.key);
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="inline-flex size-2.5 shrink-0 rounded-full border border-black/10"
                    style={{ backgroundColor: group.accentColor }}
                  />
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">{group.label}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {isCentered ? "Centered" : "Go"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div
          data-office-minimap
          className="pointer-events-auto relative overflow-hidden rounded-2xl border border-border/70 bg-background/90 shadow-xl backdrop-blur-sm"
          style={{
            width: OFFICE_MINIMAP_WIDTH,
            height: OFFICE_MINIMAP_HEIGHT,
          }}
          onPointerDown={handleMinimapPointerDown}
          role="button"
          tabIndex={0}
          aria-label="Office minimap"
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") {
              return;
            }
            event.preventDefault();
            fitCameraToScene();
          }}
        >
          <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between border-b border-border/60 bg-background/82 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground/75">
            <span>Mini Map</span>
            <span className="text-muted-foreground">
              {expandedThreadWindows.length + (adminWindowRect ? 1 : 0)} windows
            </span>
          </div>
          <svg
            className="absolute inset-0"
            viewBox={`0 0 ${OFFICE_MINIMAP_WIDTH} ${OFFICE_MINIMAP_HEIGHT}`}
            aria-hidden="true"
          >
            <rect
              x={0}
              y={0}
              width={OFFICE_MINIMAP_WIDTH}
              height={OFFICE_MINIMAP_HEIGHT}
              rx={16}
              fill="rgba(15, 23, 42, 0.45)"
            />
            {minimapState.groupRects.map((group) => (
              <rect
                key={group.key}
                data-office-minimap-group={group.key}
                x={group.rect.x}
                y={group.rect.y}
                width={group.rect.width}
                height={group.rect.height}
                rx={8}
                fill={`${group.accentColor}18`}
                stroke={`${group.accentColor}cc`}
                strokeWidth={1.6}
              />
            ))}
            {minimapState.windowRects.map((windowRect) => (
              <rect
                key={windowRect.id}
                data-office-minimap-window={windowRect.id}
                x={windowRect.rect.x}
                y={windowRect.rect.y}
                width={windowRect.rect.width}
                height={windowRect.rect.height}
                rx={5}
                fill="rgba(255,255,255,0.03)"
                stroke={windowRect.accentColor}
                strokeWidth={1.5}
                strokeDasharray="4 4"
              />
            ))}
            {minimapState.adminWindowRect ? (
              <rect
                data-office-minimap-window="office-admin"
                x={minimapState.adminWindowRect.x}
                y={minimapState.adminWindowRect.y}
                width={minimapState.adminWindowRect.width}
                height={minimapState.adminWindowRect.height}
                rx={5}
                fill="rgba(255,255,255,0.03)"
                stroke="rgba(245, 158, 11, 0.95)"
                strokeWidth={1.5}
                strokeDasharray="4 4"
              />
            ) : null}
            {minimapState.deskDots.map((desk) => (
              <circle
                key={desk.threadId}
                data-office-minimap-desk={desk.threadId}
                cx={desk.point.x}
                cy={desk.point.y}
                r={desk.isActive ? 3.4 : 2.7}
                fill={desk.accentColor}
                fillOpacity={desk.isActive ? 0.95 : 0.82}
              />
            ))}
            <rect
              data-office-minimap-viewport=""
              x={minimapState.viewportRect.x}
              y={minimapState.viewportRect.y}
              width={minimapState.viewportRect.width}
              height={minimapState.viewportRect.height}
              rx={8}
              fill="rgba(255,255,255,0.06)"
              stroke="rgba(248, 250, 252, 0.92)"
              strokeWidth={1.8}
            />
          </svg>
          <div className="absolute bottom-2 left-3 text-[10px] text-muted-foreground/85">
            Click to recenter the camera
          </div>
        </div>
      </div>

      <div
        className="absolute left-0 top-0 will-change-transform"
        style={{
          transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
          transformOrigin: "0 0",
        }}
      >
        {scene.groups.map((group) => (
          (() => {
            const isSelected = selectedGroupKeySet.has(group.key);

            return (
              <div
                key={group.key}
                data-office-group={group.key}
                data-office-group-accent={group.accentColor}
                data-office-group-width={Math.round(group.element.width)}
                data-office-group-height={Math.round(group.element.height)}
                data-office-group-collapsed={group.isCollapsed ? "true" : undefined}
                data-office-group-selected={isSelected ? "true" : undefined}
                className={`absolute rounded-2xl border bg-background/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] ${
                  group.isCollapsed ? "overflow-hidden" : "overflow-visible"
                }`}
                style={{
                  left: group.element.x,
                  top: group.element.y,
                  width: group.element.width,
                  height: group.element.height,
                  borderColor: `${group.accentColor}90`,
                  boxShadow: isSelected
                    ? `0 0 0 2px ${group.accentColor}88, 0 0 0 8px ${group.accentColor}14, inset 0 0 0 1px ${group.accentColor}24`
                    : `0 0 0 1px ${group.accentColor}24, inset 0 0 0 1px ${group.accentColor}20`,
                  background: group.isCollapsed
                    ? `linear-gradient(180deg, ${group.accentColor}18, rgba(15,23,42,0.24))`
                    : `linear-gradient(180deg, ${group.accentColor}12, rgba(255,255,255,0.02))`,
                }}
                onPointerDown={(event) => startGroupDrag(group, event)}
                onPointerMove={handleDragPointerMove}
                onPointerUp={handleDragPointerEnd}
                onPointerCancel={handleDragPointerEnd}
              >
              <OfficeGroupMenu
                group={group}
                groupAccentColorsByKey={officeState.groupAccentColorsByKey}
                onCreate={(nextGroup) => {
                  openCreateDialog(
                    nextGroup.deskThreadIds[0]
                      ? (mergedThreads.find((thread) => thread.id === nextGroup.deskThreadIds[0])?.projectId ?? null)
                      : null,
                  );
                }}
                onToggleCollapsed={toggleGroupCollapsed}
                onDelete={(groupKey) => {
                  void handleDeleteGroup(groupKey);
                }}
                onSetAccentColor={setGroupAccentColor}
              />
              {!group.isCollapsed ? (
                <>
                  <div
                    className="absolute inset-x-6 bottom-4 h-px bg-linear-to-r from-transparent to-transparent"
                    style={{
                      backgroundImage: `linear-gradient(90deg, transparent, ${group.accentColor}80, transparent)`,
                    }}
                  />
                  <div
                    className="absolute bottom-0 right-0 z-10 h-5 w-5 cursor-nwse-resize rounded-tl-md border-l border-t bg-background/92 shadow-sm"
                    style={{
                      borderColor: `${group.accentColor}66`,
                      boxShadow: `-1px -1px 0 0 ${group.accentColor}20`,
                    }}
                    data-office-group-resize={group.key}
                    onPointerDown={(event) =>
                      (() => {
                        if (event.button !== 0) {
                          return;
                        }
                        setSelectedGroupKeys([group.key]);
                        const startDeskOffsetsByThreadId = Object.fromEntries(
                          group.deskThreadIds.flatMap((threadId) => {
                            const deskScene = deskByThreadId.get(threadId);
                            if (!deskScene) {
                              return [];
                            }
                            const offset =
                              officeState.deskOffsetsByThreadId[threadId] ?? {
                                x: deskScene.element.x - group.anchor.x,
                                y: deskScene.element.y - group.anchor.y,
                              };
                            return [[threadId, offset] as const];
                          }),
                        );
                        const startOffsets = Object.values(startDeskOffsetsByThreadId);
                        return beginDrag(event, {
                          pointerId: event.pointerId,
                          kind: "groupResize",
                          key: group.key,
                          linkedThreadIds: group.deskThreadIds,
                          startPointer: { x: event.clientX, y: event.clientY },
                          startSize: {
                            width: group.element.width,
                            height: group.element.height,
                          },
                          startMinOffset: {
                            x:
                              startOffsets.length > 0
                                ? Math.min(...startOffsets.map((offset) => offset.x))
                                : GROUP_DESK_LAYOUT_LEFT_PADDING,
                            y:
                              startOffsets.length > 0
                                ? Math.min(...startOffsets.map((offset) => offset.y))
                                : GROUP_DESK_LAYOUT_TOP_PADDING,
                          },
                          startDeskOffsetsByThreadId,
                          moved: false,
                        });
                      })()
                    }
                  >
                    <div
                      className="absolute bottom-1.5 right-1.5 h-2 w-2 rounded-[2px] border-r border-b"
                      style={{ borderColor: `${group.accentColor}aa` }}
                    />
                  </div>
                </>
              ) : null}
              </div>
            );
          })()
        ))}

        {scene.furniture.map((element) => (
          <FurnitureNode
            key={element.id}
            element={element}
            isSelected={selectedFurnitureId === element.id}
            onPointerDown={(event) =>
              beginDrag(event, {
                pointerId: event.pointerId,
                kind: "element",
                key: element.id,
                startPointer: { x: event.clientX, y: event.clientY },
                startValue: { x: element.x, y: element.y },
                moved: false,
              })
            }
            onPointerMove={handleDragPointerMove}
            onPointerUp={handleDragPointerEnd}
            onPointerCancel={handleDragPointerEnd}
          />
        ))}

        {scene.desks.map((desk) => (
          <div
            key={desk.threadId}
            data-office-desk={desk.threadId}
            className="absolute flex cursor-pointer flex-col items-center"
            style={{
              left: desk.element.x,
              top: desk.element.y,
              width: DESK_WIDTH,
              height: DESK_HEIGHT,
            }}
            onPointerDown={(event) =>
              beginDrag(event, {
                pointerId: event.pointerId,
                kind: "desk",
                key: desk.threadId,
                startPointer: { x: event.clientX, y: event.clientY },
                startValue: officeState.deskOffsetsByThreadId[desk.threadId] ?? { x: 0, y: 0 },
                moved: false,
              })
            }
            onPointerMove={handleDragPointerMove}
            onPointerUp={handleDragPointerEnd}
            onPointerCancel={handleDragPointerEnd}
            onClick={() => handleThreadClick(desk.threadId as ThreadId)}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                handleThreadClick(desk.threadId as ThreadId);
              }
            }}
            aria-label={`Open chat for ${desk.title}`}
          >
            {desk.needsAttention && (
              <div className="absolute left-1/2 top-5 z-10 flex -translate-x-1/2 -translate-y-full items-center justify-center">
                <span className="absolute inline-flex h-7 w-7 animate-ping rounded-full bg-amber-400/25" />
                <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-full border border-amber-300/70 bg-amber-400/20 text-[13px] font-bold text-amber-200 shadow-lg">
                  ?
                </span>
              </div>
            )}
            <div className="mb-1 max-w-24 truncate rounded border border-border/60 bg-background/90 px-1.5 py-0.5 text-center text-[9px] font-mono text-foreground/80 shadow-sm">
              {desk.title.slice(0, 18)}
              {desk.title.length > 18 ? "..." : ""}
            </div>
            <div className="flex flex-col items-center">
              <div
                className="flex h-7 w-10 items-center justify-center rounded-sm border bg-slate-700/60"
                style={{
                  borderColor: `${desk.accentColor}88`,
                  boxShadow: `0 0 0 1px ${desk.accentColor}20`,
                }}
              >
                <MonitorIcon className="size-4" style={{ color: desk.accentColor }} />
              </div>
              <div className="h-1.5 w-1 bg-slate-600/50" />
              <div className="h-0.5 w-4 rounded bg-slate-600/50" />
            </div>
            <div className="mt-0.5 h-3 w-20 rounded-sm border-t border-amber-800/40 bg-amber-900/30" />
            <div className="-mt-px flex w-[72px] justify-between">
              <div className="h-3 w-1 bg-amber-900/25" />
              <div className="h-3 w-1 bg-amber-900/25" />
            </div>
            <div className="mt-1 h-5 w-8 rounded-t-lg border border-slate-500/20 bg-slate-600/20" />
          </div>
        ))}

        {bots.map((bot) => {
          const state = botStates[bot.threadId];
          const position = state ?? { x: bot.deskLocation.x, y: bot.deskLocation.y };
          const transitionMs = state?.transitionMs ?? 2000;
          const facingLeft = state?.facingLeft ?? false;
          const thoughtEmoji = state?.thoughtEmoji ?? null;
          const activeThought = activeThoughtByThreadId.get(bot.threadId) ?? null;
          const isHovered = !isInteracting && hoveredBotId === bot.threadId;
          const botLabelStyle =
            facingLeft || bot.isActive
              ? ({
                  ...(facingLeft ? { transform: "scaleX(-1)" } : {}),
                  ...(bot.isActive
                    ? {
                        borderColor: `${bot.accentColor}88`,
                        backgroundColor: `${bot.accentColor}14`,
                        color: bot.accentColor,
                      }
                    : {}),
                } satisfies React.CSSProperties)
              : undefined;

          return (
            <div
              key={bot.threadId}
              className="absolute left-0 top-0 flex w-10 cursor-pointer flex-col items-center group"
              style={{
                transform: `translate(${position.x - 20}px, ${position.y - 30}px)`,
                transition: `transform ${transitionMs}ms ease-in-out`,
                zIndex: isHovered ? 9999 : Math.round(position.y),
              }}
              onClick={() => handleThreadClick(bot.threadId as ThreadId)}
              onMouseEnter={() => setHoveredBotId(bot.threadId)}
              onMouseLeave={() => setHoveredBotId(null)}
              data-office-bot={bot.threadId}
            >
              {isHovered && (
                <div
                  className={`absolute left-1/2 w-56 -translate-x-1/2 rounded-lg border border-border bg-popover p-2.5 text-xs shadow-lg ${position.y < 80 ? "top-full mt-2" : "bottom-full mb-2"}`}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                  }}
                  data-office-bot-card={bot.threadId}
                >
                  <div className="mb-1 truncate font-semibold text-foreground">
                    {bot.title.slice(0, 30)}
                    {bot.title.length > 30 ? "..." : ""}
                  </div>
                  <div className="mb-1 flex items-center gap-1.5">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        bot.isActive ? "bg-green-500" : bot.isError ? "bg-red-500" : "bg-muted-foreground/50"
                      }`}
                    />
                    <span className={bot.isActive ? "text-green-500" : bot.isError ? "text-red-500" : "text-muted-foreground"}>
                      {bot.isActive ? "Running" : bot.isError ? "Error" : "Idle"}
                    </span>
                  </div>
                  <div className="truncate text-muted-foreground/70">{bot.model}</div>
                  <div className="mt-2 text-[10px] text-muted-foreground/40">Click to open</div>
                </div>
              )}

              {bot.isActive && activeThought && (
                <div
                  className="absolute bottom-full left-1/2 mb-3 flex w-56 -translate-x-1/2 flex-col items-center"
                  data-office-bot-thought={bot.threadId}
                >
                  <div
                    className="w-full rounded-2xl border bg-background/95 px-3 py-2 text-[11px] leading-relaxed text-foreground shadow-lg"
                    style={{
                      borderColor: `${deskByThreadId.get(bot.threadId)?.accentColor ?? "#94a3b8"}88`,
                    }}
                  >
                    <div className="line-clamp-3">{activeThought}</div>
                    <div className="mt-1.5 flex items-center gap-1">
                      <span
                        className="inline-block h-1.5 w-1.5 rounded-full"
                        style={{ animation: "officeTypingDot 1.2s ease-in-out infinite", backgroundColor: bot.accentColor }}
                      />
                      <span
                        className="inline-block h-1.5 w-1.5 rounded-full"
                        style={{
                          animation: "officeTypingDot 1.2s ease-in-out 0.2s infinite",
                          backgroundColor: bot.accentColor,
                        }}
                      />
                      <span
                        className="inline-block h-1.5 w-1.5 rounded-full"
                        style={{
                          animation: "officeTypingDot 1.2s ease-in-out 0.4s infinite",
                          backgroundColor: bot.accentColor,
                        }}
                      />
                    </div>
                  </div>
                  <div
                    className="-mt-1 h-3 w-3 rotate-45 border-r border-b bg-background/95"
                    style={{
                      borderColor: `${deskByThreadId.get(bot.threadId)?.accentColor ?? "#94a3b8"}88`,
                    }}
                  />
                </div>
              )}

              {!bot.isActive && !bot.isError && thoughtEmoji && (
                <div className="absolute -top-7 left-full -ml-2 flex items-end gap-0.5">
                  <div className="h-1 w-1 rounded-full bg-muted-foreground/30" />
                  <div className="-mb-0.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/20" />
                  <div className="rounded-full border border-border/40 bg-background/90 px-1.5 py-0.5 text-xs shadow">
                    {thoughtEmoji}
                  </div>
                </div>
              )}

              <div
                className={`relative flex flex-col items-center transition-transform duration-200 ${isHovered ? "scale-110" : ""}`}
                style={{ transform: facingLeft ? "scaleX(-1)" : undefined }}
              >
                <div
                  className={`relative flex h-7 w-7 items-center justify-center rounded-full shadow-sm ${
                    bot.isError ? "border border-red-400 bg-red-500/20 ring-2 ring-red-400/60" : "border"
                  }`}
                  style={
                    bot.isError
                      ? undefined
                      : bot.isActive
                        ? {
                            backgroundColor: `${bot.accentColor}22`,
                            borderColor: `${bot.accentColor}aa`,
                            boxShadow: `0 0 0 2px ${bot.accentColor}55`,
                          }
                        : {
                            backgroundColor: `${bot.accentColor}18`,
                            borderColor: `${bot.accentColor}66`,
                            opacity: 0.8,
                          }
                  }
                >
                  <BotIcon
                    className={`size-4 ${bot.isError ? "text-destructive" : ""}`}
                    style={
                      bot.isError
                        ? bot.isActive
                          ? { animation: "officeTyping 1s ease-in-out infinite" }
                          : undefined
                        : {
                            color: bot.accentColor,
                            ...(bot.isActive ? { animation: "officeTyping 1s ease-in-out infinite" } : {}),
                          }
                    }
                  />
                  {bot.isActive && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                    </span>
                  )}
                </div>
                <div
                  className={`-mt-1 h-3 w-5 rounded-b-lg ${bot.isError ? "border-x border-b border-red-400/30 bg-red-500/15" : "border-x border-b"}`}
                  style={
                    bot.isError
                      ? undefined
                      : bot.isActive
                        ? {
                            backgroundColor: `${bot.accentColor}28`,
                            borderColor: `${bot.accentColor}77`,
                          }
                        : {
                            backgroundColor: `${bot.accentColor}14`,
                            borderColor: `${bot.accentColor}44`,
                            opacity: 0.8,
                          }
                  }
                />
              </div>

              <div
                className={`mt-0.5 rounded border px-1.5 py-0.5 font-mono text-[9px] whitespace-nowrap shadow-sm transition-opacity ${
                  bot.isActive
                    ? "bg-background/90 font-bold opacity-100"
                    : "border-border/50 bg-background/90 text-muted-foreground opacity-0 group-hover:opacity-100"
                }`}
                style={botLabelStyle}
              >
                {bot.title.slice(0, 15)}
                {bot.title.length > 15 ? "..." : ""}
              </div>
            </div>
          );
        })}

        {officeWindowsMinimizedForZoom ? null : (
          <svg
            className="pointer-events-none absolute left-0 top-0 overflow-visible"
            width={1}
            height={1}
          >
              {openWindowConnections.map((connection) => (
                <g key={connection.threadId} data-office-thread-link={connection.threadId}>
                  <line
                    x1={connection.deskPoint.x}
                    y1={connection.deskPoint.y}
                    x2={connection.windowPoint.x}
                    y2={connection.windowPoint.y}
                    stroke={connection.accentColor}
                    strokeOpacity="0.7"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeDasharray="6 8"
                  />
                  <circle
                    cx={connection.deskPoint.x}
                    cy={connection.deskPoint.y}
                    r="4.5"
                    fill={connection.accentColor}
                    fillOpacity="0.9"
                  />
                  <circle
                    cx={connection.windowPoint.x}
                    cy={connection.windowPoint.y}
                    r="4.5"
                    fill={connection.accentColor}
                    fillOpacity="0.9"
                  />
                </g>
              ))}
          </svg>
        )}

      </div>
      <div data-office-windows-overlay="" className="pointer-events-none absolute inset-0 z-20">
        {minimizedThreadWindows.map((windowState, index) => {
          const desk = deskByThreadId.get(windowState.threadId);
          const previewRect = projectedThreadPreviewRects.get(windowState.threadId);
          if (!desk || !previewRect) {
            return null;
          }

          return (
            <OfficeThreadWindowPreview
              key={`minimized:${windowState.threadId}`}
              threadId={windowState.threadId}
              rect={previewRect}
              zIndex={windowZIndices.get(`thread:${windowState.threadId}`) ?? 19_000 + index}
              accentColor={desk.accentColor}
              projects={projects}
              threads={mergedThreads}
              onFocus={() => openThreadWindow(windowState.threadId)}
            />
          );
        })}

        {officeWindowsMinimizedForZoom
          ? expandedThreadWindows.map((windowState, index) => {
              const desk = deskByThreadId.get(windowState.threadId);
              const previewRect = projectedThreadPreviewRects.get(windowState.threadId);
              if (!desk || !previewRect) {
                return null;
              }

              return (
                <OfficeThreadWindowPreview
                  key={`zoom-preview:${windowState.threadId}`}
                  threadId={windowState.threadId}
                  rect={previewRect}
                  zIndex={windowZIndices.get(`thread:${windowState.threadId}`) ?? 19_000 + index}
                  accentColor={desk.accentColor}
                  projects={projects}
                  threads={mergedThreads}
                  onFocus={() => focusThreadWindow(windowState.threadId)}
                />
              );
            })
          : expandedThreadWindows.map((windowState, index) => {
              const desk = deskByThreadId.get(windowState.threadId);
              const displayRect = projectedThreadWindowRects.get(windowState.threadId);
              if (!desk || !displayRect) {
                return null;
              }

              return (
                <OfficeThreadWindow
                  key={windowState.threadId}
                  threadId={windowState.threadId}
                  rect={windowState.rect}
                  displayRect={displayRect}
                  zoom={camera.zoom}
                  zIndex={windowZIndices.get(`thread:${windowState.threadId}`) ?? 19_000 + index}
                  isFocused={isAdminWindowFocused ? false : windowStackOrder[windowStackOrder.length - 1] === `thread:${windowState.threadId}`}
                  accentColor={desk.accentColor}
                  projects={projects}
                  threads={mergedThreads}
                  onClose={() => closeThreadWindow(windowState.threadId)}
                  onDelete={handleDeleteThread}
                  onRename={handleRenameThread}
                  onFocus={() => focusThreadWindow(windowState.threadId)}
                  onRectChange={(rect) => updateThreadWindowRect(windowState.threadId, rect)}
                  {...(onOpenThreadInMainWindow ? { onOpenInMainWindow: onOpenThreadInMainWindow } : {})}
                />
              );
            })}

        {adminWindowRect && projectedAdminWindowRect ? (
          <OfficeAdminWindow
            rect={adminWindowRect}
            displayRect={projectedAdminWindowRect}
            zoom={camera.zoom}
            zIndex={windowZIndices.get("admin:office-admin") ?? 19_999}
            isFocused={isAdminWindowFocused}
            accentColor={ADMIN_WINDOW_ACCENT}
            projects={projects}
            threads={mergedThreads}
            onClose={closeAdminWindow}
            onFocus={focusAdminWindow}
            onRectChange={updateAdminWindowRect}
            onAddProject={handleAddProjectFromOffice}
            onPickFolder={handlePickProjectFolder}
            onOpenLatestThread={handleOpenLatestProjectThread}
            onCreateAgent={handleCreateAgentForProject}
          />
        ) : null}
      </div>
      <OfficeAgentCreateDialog
        open={isCreateDialogOpen}
        initialProjectId={createDialogProjectId}
        projects={projects}
        onOpenChange={setIsCreateDialogOpen}
        onCreate={handleCreateAgent}
      />

      <style>{`
        @keyframes officeTyping {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-1.5px); }
        }
        @keyframes officeTypingDot {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        @keyframes officeDrip {
          0%, 100% { opacity: 0; transform: translateX(-50%) translateY(0); }
          30% { opacity: 0.8; }
          70% { opacity: 0.6; transform: translateX(-50%) translateY(4px); }
          90% { opacity: 0; transform: translateX(-50%) translateY(8px); }
        }
      `}</style>
    </div>
  );
}
