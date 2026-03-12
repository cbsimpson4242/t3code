import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BotIcon,
  CoffeeIcon,
  FolderIcon,
  MonitorIcon,
  MoreHorizontalIcon,
  PlusIcon,
  RotateCcwIcon,
  ScanSearchIcon,
} from "lucide-react";
import type { ProjectId, ThreadId } from "@t3tools/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "./ui/button";
import OfficeAgentCreateDialog from "./OfficeAgentCreateDialog";
import OfficeAdminWindow from "./OfficeAdminWindow";
import OfficeThreadWindow, {
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
import { deriveWorkLogEntries } from "../session-logic";
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
import { fitCameraToBounds, screenToWorld, zoomAtPoint } from "../office/officeCamera";
import { OFFICE_GROUP_ACCENT_OPTIONS, getDefaultOfficeGroupAccent } from "../office/officeColors";
import {
  createOfficeFurniture,
  moveOfficeFurnitureWithChildren,
  removeOfficeFurniture,
  type OfficeFurnitureAddKind,
} from "../office/officeFurniture";
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
  OfficeSize,
} from "../office/officeTypes";

const THOUGHT_EMOJIS = ["\u2615", "\ud83d\udca4", "\ud83d\udca1", "\ud83c\udf3f", "\ud83c\udfb5", "\ud83d\ude80", "\ud83d\udcda", "\u2728"];
const IDLE_POIS = [
  { x: 180, y: 310 },
  { x: 120, y: 500 },
  { x: 1480, y: 500 },
  { x: 800, y: 450 },
  { x: 900, y: 395 },
  { x: 700, y: 395 },
  { x: 1360, y: 110 },
  { x: 800, y: 290 },
  { x: 340, y: 450 },
];
const ADMIN_DESK_WIDTH = 156;
const ADMIN_DESK_HEIGHT = 120;
const ADMIN_WINDOW_ACCENT = "#f59e0b";

const OFFICE_FURNITURE_LABELS: Record<OfficeFurnitureAddKind, string> = {
  conferenceSet: "Boardroom set",
  waterCooler: "Water cooler",
  conferenceTable: "Table",
  chair: "Chair",
  plant: "Plant",
  coffeeBar: "Coffee bar",
};

interface BotState {
  x: number;
  y: number;
  nextMoveTime: number;
  transitionMs: number;
  facingLeft: boolean;
  thoughtEmoji: string | null;
}

interface VirtualOfficeProps {
  onOpenThreadInMainWindow?: (threadId: ThreadId) => void;
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
      key: string;
      linkedThreadIds: string[];
      startPointer: OfficePoint;
      startValue: OfficePoint;
      lastValue: OfficePoint;
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
      kind: "adminDesk";
      startPointer: OfficePoint;
      startValue: OfficePoint;
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

function getRandomPOI() {
  return IDLE_POIS[Math.floor(Math.random() * IDLE_POIS.length)]!;
}

function jitter(num: number, amount = 15) {
  return num + (Math.random() * amount * 2 - amount);
}

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

function FurnitureNode(props: {
  element: OfficeElement;
  isSelected: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLDivElement>) => void;
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

export default function VirtualOffice({ onOpenThreadInMainWindow }: VirtualOfficeProps) {
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
  const suppressClickUntilRef = useRef(0);
  const panStateRef = useRef<PanState | null>(null);
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
  const [isAdminWindowFocused, setIsAdminWindowFocused] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [createDialogProjectId, setCreateDialogProjectId] = useState<ProjectId | null>(null);
  const [selectedFurnitureId, setSelectedFurnitureId] = useState<string | null>(null);
  const shouldFitCameraRef = useRef(initialPersistedState === null);
  const camera = officeState.camera;

  stateRef.current = officeState;

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

  useEffect(() => {
    setOpenWindows((current) =>
      current.filter((windowState) => mergedThreads.some((thread) => thread.id === windowState.threadId)),
    );
  }, [mergedThreads]);

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
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };
  }, []);

  const deskByThreadId = useMemo(
    () => new Map(scene.desks.map((desk) => [desk.threadId, desk] as const)),
    [scene.desks],
  );
  const bots = useMemo(
    () =>
      officeInputs.desks
        .map((desk) => {
          const deskScene = deskByThreadId.get(desk.threadId);
          if (!deskScene) {
            return null;
          }
          return {
            ...desk,
            deskLocation: deskScene.botTarget,
          };
        })
        .filter((desk): desk is NonNullable<typeof desk> => desk !== null),
    [deskByThreadId, officeInputs.desks],
  );

  const [botStates, setBotStates] = useState<Record<string, BotState>>({});

  const openThreadWindow = useCallback(
    (threadId: ThreadId) => {
      setIsAdminWindowFocused(false);
      setOpenWindows((current) => {
        const existing = current.find((entry) => entry.threadId === threadId);
        if (existing) {
          return [...current.filter((entry) => entry.threadId !== threadId), existing];
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
          },
        ];
      });
    },
    [camera, deskByThreadId, viewportSize.height, viewportSize.width],
  );

  const closeThreadWindow = useCallback((threadId: ThreadId) => {
    setOpenWindows((current) => current.filter((entry) => entry.threadId !== threadId));
  }, []);

  const focusThreadWindow = useCallback((threadId: ThreadId) => {
    setIsAdminWindowFocused(false);
    setOpenWindows((current) => {
      const existing = current.find((entry) => entry.threadId === threadId);
      if (!existing || current[current.length - 1]?.threadId === threadId) {
        return current;
      }
      return [...current.filter((entry) => entry.threadId !== threadId), existing];
    });
  }, []);

  const updateThreadWindowRect = useCallback((threadId: ThreadId, rect: OfficeThreadWindowRect) => {
    setOpenWindows((current) =>
      current.map((entry) =>
        entry.threadId === threadId
          ? { ...entry, rect: normalizeOfficeThreadWindowRect(rect) }
          : entry,
      ),
    );
  }, []);

  const openAdminWindow = useCallback(() => {
    setIsAdminWindowFocused(true);
      setAdminWindowRect((current) =>
        current ??
        buildDefaultOfficeThreadWindowRect(
          {
            x: officeState.adminDeskPosition.x + ADMIN_DESK_WIDTH,
            y: officeState.adminDeskPosition.y + 32,
          },
          0,
        ),
      );
  }, [officeState.adminDeskPosition.x, officeState.adminDeskPosition.y]);

  const closeAdminWindow = useCallback(() => {
    setAdminWindowRect(null);
    setIsAdminWindowFocused(false);
  }, []);

  const focusAdminWindow = useCallback(() => {
    setIsAdminWindowFocused(true);
  }, []);

  const updateAdminWindowRect = useCallback((rect: OfficeThreadWindowRect) => {
    setAdminWindowRect(normalizeOfficeThreadWindowRect(rect));
  }, []);

  const openWindowConnections = useMemo(
    () =>
      openWindows.flatMap((windowState) => {
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
    [deskByThreadId, openWindows],
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
              };
            } else {
              next[bot.threadId] = {
                ...state,
                x: bot.deskLocation.x + (Math.random() > 0.5 ? -1.5 : 1.5),
                y: bot.deskLocation.y,
                transitionMs: 400,
                nextMoveTime: now + 1500 + Math.random() * 1000,
                thoughtEmoji: null,
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
            };
            changed = true;
            continue;
          }

          const target = getRandomPOI();
          const destination = { x: jitter(target.x, 25), y: jitter(target.y, 25) };
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
          };
          changed = true;
        }

        return changed ? next : previous;
      });
    }, 500);

    return () => clearInterval(intervalId);
  }, [bots]);

  const shouldSuppressClick = useCallback(() => performance.now() < suppressClickUntilRef.current, []);

  const handleAdminDeskClick = useCallback(() => {
    if (shouldSuppressClick()) {
      return;
    }
    openAdminWindow();
  }, [openAdminWindow, shouldSuppressClick]);

  const handleThreadClick = useCallback(
    (threadId: ThreadId) => {
      if (shouldSuppressClick()) {
        return;
      }
      openThreadWindow(threadId);
    },
    [openThreadWindow, shouldSuppressClick],
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
        closeThreadWindow(threadId);
      }
    },
    [
      clearComposerDraftForThread,
      clearProjectDraftThreadById,
      clearTerminalState,
      closeThreadWindow,
      getDraftThread,
      openWindows,
      projects,
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
      setIsInteracting(true);
      setHoveredBotId(null);
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
    },
    [],
  );

  const endInteraction = useCallback(() => {
    dragStateRef.current = null;
    panStateRef.current = null;
    setIsInteracting(false);
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
  }, []);

  const handleViewportPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[data-office-thread-window], [data-office-admin-window], [data-office-toolbar]")) {
        return;
      }
      if (event.button === 0) {
        setSelectedFurnitureId(null);
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

  const handleViewportPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
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
  }, []);

  const handleViewportPointerEnd = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
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

      const nextPoint = {
        x: Math.round(dragState.startValue.x + worldDx),
        y: Math.round(dragState.startValue.y + worldDy),
      };

      if (dragState.kind === "group") {
        const deltaX = nextPoint.x - dragState.lastValue.x;
        const deltaY = nextPoint.y - dragState.lastValue.y;
        if (deltaX === 0 && deltaY === 0) {
          return;
        }
        dragState.lastValue = nextPoint;

        if (dragState.linkedThreadIds.length > 0) {
          setOpenWindows((current) =>
            current.map((windowState) =>
              dragState.linkedThreadIds.includes(windowState.threadId)
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
          const currentAnchor = current.projectGroupAnchors[dragState.key] ?? dragState.startValue;
          if (currentAnchor.x === nextPoint.x && currentAnchor.y === nextPoint.y) {
            return current;
          }
          return {
            ...current,
            projectGroupAnchors: {
              ...current.projectGroupAnchors,
              [dragState.key]: nextPoint,
            },
          };
        });
        return;
      }

      setOfficeState((current) => {
        if (dragState.kind === "adminDesk") {
          const currentPosition = current.adminDeskPosition;
          if (currentPosition.x === nextPoint.x && currentPosition.y === nextPoint.y) {
            return current;
          }
          return {
            ...current,
            adminDeskPosition: nextPoint,
          };
        }

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

        const movedFurniture = moveOfficeFurnitureWithChildren(current.furniture, dragState.key, nextPoint);
        const didChange = movedFurniture.some((element, index) => {
          const previous = current.furniture[index];
          return (
            previous?.id !== element.id ||
            previous.x !== element.x ||
            previous.y !== element.y ||
            previous.parentId !== element.parentId
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
    if (target?.closest("[data-office-thread-window], [data-office-admin-window]")) {
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
      className={`relative h-full w-full overflow-hidden bg-background ${isInteracting ? "cursor-grabbing" : ""}`}
      style={backgroundStyle}
      onWheel={handleWheel}
      onPointerDown={handleViewportPointerDown}
      onPointerMove={handleViewportPointerMove}
      onPointerUp={handleViewportPointerEnd}
      onPointerCancel={handleViewportPointerEnd}
    >
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-linear-to-t from-background via-background/70 to-transparent" />

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

      <div
        className="absolute left-0 top-0 will-change-transform"
        style={{
          transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
          transformOrigin: "0 0",
        }}
      >
        <div
          data-office-admin-desk="office-admin"
          className="absolute flex cursor-pointer flex-col items-center"
          style={{
            left: officeState.adminDeskPosition.x,
            top: officeState.adminDeskPosition.y,
            width: ADMIN_DESK_WIDTH,
            height: ADMIN_DESK_HEIGHT,
          }}
          onPointerDown={(event) =>
            beginDrag(event, {
              pointerId: event.pointerId,
              kind: "adminDesk",
              startPointer: { x: event.clientX, y: event.clientY },
              startValue: officeState.adminDeskPosition,
              moved: false,
            })
          }
          onPointerMove={handleDragPointerMove}
          onPointerUp={handleDragPointerEnd}
          onPointerCancel={handleDragPointerEnd}
          onClick={handleAdminDeskClick}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              handleAdminDeskClick();
            }
          }}
          aria-label="Open CEO office administration window"
        >
          <div className="mb-1 rounded-full border border-amber-400/40 bg-background/95 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-200 shadow-sm">
            CEO Office
          </div>
          <div className="relative flex flex-col items-center">
            <div className="absolute -top-3 right-[-10px] rounded-full border border-border/70 bg-background/90 px-2 py-0.5 text-[10px] text-muted-foreground shadow-sm">
              {projects.length} projects
            </div>
            <div className="flex h-10 w-14 items-center justify-center rounded-md border border-amber-300/50 bg-amber-900/35 shadow-[0_0_0_1px_rgba(245,158,11,0.16)]">
              <MonitorIcon className="size-5 text-amber-200" />
            </div>
            <div className="h-1.5 w-1 bg-amber-100/20" />
            <div className="h-0.5 w-5 rounded bg-amber-100/20" />
          </div>
          <div className="mt-1 flex items-center gap-1 rounded-md border border-border/60 bg-background/90 px-2 py-1 text-[10px] text-muted-foreground shadow-sm">
            <FolderIcon className="size-3 text-foreground/70" />
            Admin controls
          </div>
          <div className="mt-1 h-3 w-24 rounded-sm border-t border-amber-800/40 bg-amber-900/30" />
          <div className="-mt-px flex w-[84px] justify-between">
            <div className="h-3 w-1 bg-amber-900/25" />
            <div className="h-3 w-1 bg-amber-900/25" />
          </div>
          <div className="mt-1 h-6 w-10 rounded-t-lg border border-slate-500/20 bg-slate-600/20" />
        </div>

        {scene.groups.map((group) => (
          <div
            key={group.key}
            data-office-group={group.key}
            data-office-group-accent={group.accentColor}
            data-office-group-width={Math.round(group.element.width)}
            data-office-group-height={Math.round(group.element.height)}
            className="absolute rounded-2xl border bg-background/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
            style={{
              left: group.element.x,
              top: group.element.y,
              width: group.element.width,
              height: group.element.height,
              borderColor: `${group.accentColor}90`,
              boxShadow: `0 0 0 1px ${group.accentColor}24, inset 0 0 0 1px ${group.accentColor}20`,
              background: `linear-gradient(180deg, ${group.accentColor}12, rgba(255,255,255,0.02))`,
            }}
            onPointerDown={(event) =>
              beginDrag(event, {
                pointerId: event.pointerId,
                kind: "group",
                key: group.key,
                linkedThreadIds: group.deskThreadIds,
                startPointer: { x: event.clientX, y: event.clientY },
                startValue: { x: group.anchor.x, y: group.anchor.y },
                lastValue: { x: group.anchor.x, y: group.anchor.y },
                moved: false,
              })
            }
            onPointerMove={handleDragPointerMove}
            onPointerUp={handleDragPointerEnd}
            onPointerCancel={handleDragPointerEnd}
          >
            <div
              className="absolute left-1/2 top-0 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full border bg-background/95 px-3 py-1 text-[10px] font-semibold tracking-[0.12em] text-foreground/75 uppercase shadow-sm"
              style={{
                borderColor: `${group.accentColor}88`,
                boxShadow: `0 10px 30px -20px ${group.accentColor}`,
              }}
            >
              <ProjectOfficeIcon cwd={group.cwd} />
              <span>{group.label}</span>
              <div
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
              >
                <Menu>
                  <MenuTrigger
                    render={
                      <button
                        type="button"
                        className="inline-flex h-5 items-center gap-1 rounded-full border px-1.5 shadow-sm transition-transform hover:scale-105"
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
                    <span
                      className="inline-flex size-2.5 rounded-full border border-black/10"
                      style={{ backgroundColor: group.accentColor }}
                    />
                    <span className="text-[10px] font-medium normal-case">Color</span>
                  </MenuTrigger>
                  <MenuPopup align="end" sideOffset={8}>
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Group color</div>
                  <MenuItem
                    data-office-group-color-option={`${group.key}:auto`}
                    onClick={() => {
                      setGroupAccentColor(group.key, null);
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
                        {officeState.groupAccentColorsByKey[group.key] ? "" : "Selected"}
                      </span>
                    </div>
                  </MenuItem>
                  <MenuSeparator />
                    {OFFICE_GROUP_ACCENT_OPTIONS.map((option) => (
                      <MenuItem
                        key={option.accentColor}
                        data-office-group-color-option={`${group.key}:${option.accentColor}`}
                        onClick={() => {
                          setGroupAccentColor(group.key, option.accentColor);
                        }}
                      >
                        <div className="flex w-full items-center gap-2">
                          <span
                            className="inline-flex size-3 rounded-full border border-black/10"
                            style={{ backgroundColor: option.accentColor }}
                          />
                          <span>{option.label}</span>
                          <span className="ml-auto text-[10px] text-muted-foreground">
                            {officeState.groupAccentColorsByKey[group.key] === option.accentColor ? "Selected" : ""}
                          </span>
                        </div>
                      </MenuItem>
                    ))}
                  </MenuPopup>
                </Menu>
              </div>
              <button
                type="button"
                className="ml-1 inline-flex h-5 items-center gap-1 rounded-full border px-1.5 text-[10px] font-medium normal-case"
                style={{
                  borderColor: `${group.accentColor}88`,
                  color: group.accentColor,
                  backgroundColor: `${group.accentColor}14`,
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  openCreateDialog(
                    group.deskThreadIds[0]
                      ? (mergedThreads.find((thread) => thread.id === group.deskThreadIds[0])?.projectId ?? null)
                      : null,
                  );
                }}
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                aria-label={`Create agent in ${group.label}`}
              >
                <PlusIcon className="size-3" />
                Create
              </button>
            </div>
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
                    x: startOffsets.length > 0 ? Math.min(...startOffsets.map((offset) => offset.x)) : GROUP_DESK_LAYOUT_LEFT_PADDING,
                    y: startOffsets.length > 0 ? Math.min(...startOffsets.map((offset) => offset.y)) : GROUP_DESK_LAYOUT_TOP_PADDING,
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
          </div>
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

        {openWindows.map((windowState, index) => {
          const desk = deskByThreadId.get(windowState.threadId);
          if (!desk) {
            return null;
          }

          return (
            <OfficeThreadWindow
              key={windowState.threadId}
              threadId={windowState.threadId}
              rect={windowState.rect}
              zoom={camera.zoom}
              zIndex={20_000 + index}
              isFocused={index === openWindows.length - 1}
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

        {adminWindowRect ? (
          <OfficeAdminWindow
            rect={adminWindowRect}
            zoom={camera.zoom}
            zIndex={isAdminWindowFocused ? 20_000 + openWindows.length + 1 : 19_999}
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
