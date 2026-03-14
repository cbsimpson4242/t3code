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

function snapToDevicePixels(value: number, devicePixelRatio: number): number {
  const pixelRatio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.round(value * pixelRatio) / pixelRatio;
}

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

export function worldRectToScreenRect(input: {
  rect: OfficePoint & OfficeSize;
  camera: OfficeCameraState;
  devicePixelRatio?: number;
  sizeZoom?: number;
}): OfficePoint & OfficeSize {
  const topLeft = worldToScreen({ x: input.rect.x, y: input.rect.y }, input.camera);
  const pixelRatio = input.devicePixelRatio ?? 1;
  const sizeZoom = input.sizeZoom ?? input.camera.zoom;
  const x = snapToDevicePixels(topLeft.x, pixelRatio);
  const y = snapToDevicePixels(topLeft.y, pixelRatio);
  const right = snapToDevicePixels(topLeft.x + input.rect.width * sizeZoom, pixelRatio);
  const bottom = snapToDevicePixels(topLeft.y + input.rect.height * sizeZoom, pixelRatio);

  return {
    x,
    y,
    width: Math.max(right - x, 1 / Math.max(pixelRatio, 1)),
    height: Math.max(bottom - y, 1 / Math.max(pixelRatio, 1)),
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
