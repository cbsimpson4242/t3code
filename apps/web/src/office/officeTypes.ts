export type OfficeElementType =
  | "projectGroup"
  | "desk"
  | "waterCooler"
  | "conferenceTable"
  | "chair"
  | "plant"
  | "coffeeBar";

export type OfficeElementId = string;

export interface OfficePoint {
  x: number;
  y: number;
}

export interface OfficeSize {
  width: number;
  height: number;
}

export interface OfficeCameraState {
  x: number;
  y: number;
  zoom: number;
}

export interface OfficeSceneBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface OfficeElement {
  id: OfficeElementId;
  type: OfficeElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  draggable: boolean;
  parentId?: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
}

export interface OfficeProjectGroupAnchor extends OfficePoint {
  key: string;
}

export interface OfficeDeskOffset extends OfficePoint {
  threadId: string;
}

export interface OfficePersistedState {
  version: 2;
  camera: OfficeCameraState;
  furniture: OfficeElement[];
  projectGroupAnchors: Record<string, OfficePoint>;
  projectGroupSizesByKey: Record<string, OfficeSize>;
  deskOffsetsByThreadId: Record<string, OfficePoint>;
  groupAccentColorsByKey: Record<string, string>;
  adminDeskPosition: OfficePoint;
}

export interface OfficeProjectGroupInput {
  key: string;
  label: string;
  cwd: string | null;
  threadIds: string[];
}

export interface OfficeDeskInput {
  threadId: string;
  title: string;
  model: string;
  groupKey: string;
  accentColor: string;
  isActive: boolean;
  isError: boolean;
  hasPendingUserInput: boolean;
  hasPendingApproval: boolean;
  needsAttention: boolean;
  colorIndex: number;
}

export interface OfficeProjectGroupScene {
  key: string;
  label: string;
  cwd: string | null;
  accentColor: string;
  anchor: OfficeProjectGroupAnchor;
  element: OfficeElement;
  deskThreadIds: string[];
}

export interface OfficeDeskScene {
  threadId: string;
  title: string;
  model: string;
  groupKey: string;
  accentColor: string;
  isActive: boolean;
  isError: boolean;
  hasPendingUserInput: boolean;
  hasPendingApproval: boolean;
  needsAttention: boolean;
  colorIndex: number;
  element: OfficeElement;
  botTarget: OfficePoint;
}

export interface OfficeScene {
  groups: OfficeProjectGroupScene[];
  desks: OfficeDeskScene[];
  furniture: OfficeElement[];
  bounds: OfficeSceneBounds;
}

export interface OfficeSceneBuildResult {
  persistedState: OfficePersistedState;
  scene: OfficeScene;
}
