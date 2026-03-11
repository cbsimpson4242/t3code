import type { OfficeElement, OfficePersistedState } from "./officeTypes";

export const OFFICE_LAYOUT_STORAGE_KEY = "t3code:office-layout:v1";
export const OFFICE_MIN_ZOOM = 0.25;
export const OFFICE_MAX_ZOOM = 2.5;
export const OFFICE_FIT_PADDING = 96;
export const OFFICE_DRAG_THRESHOLD_PX = 4;

export const GROUP_MIN_WIDTH = 280;
export const GROUP_MIN_HEIGHT = 136;
export const GROUP_FRAME_TOP_PADDING = 40;
export const GROUP_FRAME_SIDE_PADDING = 28;
export const GROUP_FRAME_BOTTOM_PADDING = 30;

export const DEFAULT_GROUP_START = { x: 220, y: 88 };
export const DEFAULT_GROUP_APPEND_STEP = { x: 360, y: 0 };

export const DESK_WIDTH = 116;
export const DESK_HEIGHT = 90;
export const DESK_BOT_TARGET = { x: 58, y: 74 };

export const COFFEE_BAR_SNACK_IDS = [
  "snack-a",
  "snack-b",
  "snack-c",
  "snack-d",
  "snack-e",
  "snack-f",
] as const;

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
    id: "conference-table",
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
    metadata: { group: "conference" },
  },
  {
    id: "chair-2",
    type: "chair",
    x: 732,
    y: 357,
    width: 16,
    height: 16,
    draggable: true,
    metadata: { group: "conference" },
  },
  {
    id: "chair-3",
    type: "chair",
    x: 852,
    y: 357,
    width: 16,
    height: 16,
    draggable: true,
    metadata: { group: "conference" },
  },
  {
    id: "chair-4",
    type: "chair",
    x: 892,
    y: 372,
    width: 16,
    height: 16,
    draggable: true,
    metadata: { group: "conference" },
  },
  {
    id: "chair-5",
    type: "chair",
    x: 892,
    y: 412,
    width: 16,
    height: 16,
    draggable: true,
    metadata: { group: "conference" },
  },
  {
    id: "chair-6",
    type: "chair",
    x: 852,
    y: 427,
    width: 16,
    height: 16,
    draggable: true,
    metadata: { group: "conference" },
  },
  {
    id: "chair-7",
    type: "chair",
    x: 732,
    y: 427,
    width: 16,
    height: 16,
    draggable: true,
    metadata: { group: "conference" },
  },
  {
    id: "chair-8",
    type: "chair",
    x: 692,
    y: 412,
    width: 16,
    height: 16,
    draggable: true,
    metadata: { group: "conference" },
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
] as const;

export function createDefaultOfficePersistedState(): OfficePersistedState {
  return {
    version: 1,
    camera: {
      x: 0,
      y: 0,
      zoom: 1,
    },
    elementsById: Object.fromEntries(
      DEFAULT_FURNITURE_ELEMENTS.map((element) => [element.id, { x: element.x, y: element.y }]),
    ),
    projectGroupAnchors: {},
    deskOffsetsByThreadId: {},
  };
}
