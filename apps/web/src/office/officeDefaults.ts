import type { OfficePersistedState } from "./officeTypes";

export const OFFICE_LAYOUT_STORAGE_KEY = "t3code:office-layout:v1";
export const OFFICE_MIN_ZOOM = 0.25;
export const OFFICE_MAX_ZOOM = 2.5;
export const OFFICE_FIT_PADDING = 96;
export const OFFICE_DRAG_THRESHOLD_PX = 4;

export const GROUP_MIN_WIDTH = 280;
export const GROUP_MIN_HEIGHT = 136;
export const GROUP_COLLAPSED_WIDTH = 360;
export const GROUP_COLLAPSED_HEIGHT = 54;
export const GROUP_FRAME_TOP_PADDING = 40;
export const GROUP_FRAME_SIDE_PADDING = 28;
export const GROUP_FRAME_BOTTOM_PADDING = 30;
export const GROUP_DESK_LAYOUT_LEFT_PADDING = 18;
export const GROUP_DESK_LAYOUT_TOP_PADDING = 34;

export const DEFAULT_GROUP_START = { x: 220, y: 88 };
export const DEFAULT_GROUP_APPEND_STEP = { x: 360, y: 0 };
export const DEFAULT_ADMIN_DESK_POSITION = { x: 72, y: 84 };

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

export function createDefaultOfficePersistedState(): OfficePersistedState {
  return {
    version: 4,
    camera: {
      x: 0,
      y: 0,
      zoom: 1,
    },
    furniture: [],
    projectGroupAnchors: {},
    projectGroupSizesByKey: {},
    deskOffsetsByThreadId: {},
    groupAccentColorsByKey: {},
    expandedGroupKeys: [],
    hiddenGroupKeys: [],
    adminDeskPosition: { ...DEFAULT_ADMIN_DESK_POSITION },
    defaultFurnitureSeededGroupKeys: [],
  };
}
