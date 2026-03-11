import {
  OFFICE_FIT_PADDING,
  OFFICE_MAX_ZOOM,
  OFFICE_MIN_ZOOM,
} from "./officeDefaults";
import type {
  OfficeCameraState,
  OfficePoint,
  OfficeSceneBounds,
  OfficeSize,
} from "./officeTypes";

export function clampZoom(
  zoom: number,
  minimumZoom = OFFICE_MIN_ZOOM,
  maximumZoom = OFFICE_MAX_ZOOM,
): number {
  return Math.min(Math.max(zoom, minimumZoom), maximumZoom);
}

export function screenToWorld(point: OfficePoint, camera: OfficeCameraState): OfficePoint {
  return {
    x: (point.x - camera.x) / camera.zoom,
    y: (point.y - camera.y) / camera.zoom,
  };
}

export function worldToScreen(point: OfficePoint, camera: OfficeCameraState): OfficePoint {
  return {
    x: point.x * camera.zoom + camera.x,
    y: point.y * camera.zoom + camera.y,
  };
}

export function zoomAtPoint(input: {
  camera: OfficeCameraState;
  screenPoint: OfficePoint;
  nextZoom: number;
}): OfficeCameraState {
  const zoom = clampZoom(input.nextZoom);
  if (zoom === input.camera.zoom) {
    return input.camera;
  }
  const worldPoint = screenToWorld(input.screenPoint, input.camera);
  return {
    zoom,
    x: input.screenPoint.x - worldPoint.x * zoom,
    y: input.screenPoint.y - worldPoint.y * zoom,
  };
}

export function fitCameraToBounds(input: {
  bounds: OfficeSceneBounds;
  viewport: OfficeSize;
  padding?: number;
}): OfficeCameraState {
  const { bounds, viewport } = input;
  const padding = input.padding ?? OFFICE_FIT_PADDING;
  const boundsWidth = Math.max(bounds.maxX - bounds.minX, 1);
  const boundsHeight = Math.max(bounds.maxY - bounds.minY, 1);
  const usableWidth = Math.max(viewport.width - padding * 2, 1);
  const usableHeight = Math.max(viewport.height - padding * 2, 1);
  const zoom = clampZoom(Math.min(usableWidth / boundsWidth, usableHeight / boundsHeight));
  const renderedWidth = boundsWidth * zoom;
  const renderedHeight = boundsHeight * zoom;
  const leftInset = (viewport.width - renderedWidth) / 2;
  const topInset = (viewport.height - renderedHeight) / 2;

  return {
    zoom,
    x: leftInset - bounds.minX * zoom,
    y: topInset - bounds.minY * zoom,
  };
}
