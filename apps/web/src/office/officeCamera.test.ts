import { describe, expect, it } from "vitest";

import {
  clampZoom,
  fitCameraToBounds,
  screenToWorld,
  worldRectToScreenRect,
  worldToScreen,
  zoomAtPoint,
} from "./officeCamera";

describe("officeCamera", () => {
  it("clamps zoom into the supported range", () => {
    expect(clampZoom(0.1)).toBe(0.25);
    expect(clampZoom(9)).toBe(2.5);
    expect(clampZoom(1.25)).toBe(1.25);
  });

  it("keeps the world point under the cursor stable when zooming", () => {
    const camera = {
      x: 120,
      y: 80,
      zoom: 1,
    };
    const screenPoint = { x: 320, y: 200 };
    const worldPointBefore = screenToWorld(screenPoint, camera);

    const nextCamera = zoomAtPoint({
      camera,
      screenPoint,
      nextZoom: 1.75,
    });
    const worldPointAfter = screenToWorld(screenPoint, nextCamera);

    expect(worldPointAfter.x).toBeCloseTo(worldPointBefore.x, 6);
    expect(worldPointAfter.y).toBeCloseTo(worldPointBefore.y, 6);
  });

  it("fits scene bounds into the viewport with centered content", () => {
    const camera = fitCameraToBounds({
      bounds: {
        minX: 100,
        minY: 50,
        maxX: 500,
        maxY: 250,
      },
      viewport: {
        width: 1000,
        height: 600,
      },
      padding: 100,
    });

    const minScreen = worldToScreen({ x: 100, y: 50 }, camera);
    const maxScreen = worldToScreen({ x: 500, y: 250 }, camera);

    expect(minScreen.x).toBeCloseTo(100, 4);
    expect(maxScreen.x).toBeCloseTo(900, 4);
    expect(minScreen.y).toBeCloseTo(100, 4);
    expect(maxScreen.y).toBeCloseTo(500, 4);
  });

  it("projects world rects into screen rects with device-pixel snapping", () => {
    const screenRect = worldRectToScreenRect({
      rect: {
        x: 10,
        y: 20,
        width: 320,
        height: 180,
      },
      camera: {
        x: 5.25,
        y: 7.75,
        zoom: 0.85,
      },
      devicePixelRatio: 2,
    });

    expect(screenRect.x).toBe(14);
    expect(screenRect.y).toBe(25);
    expect(screenRect.width).toBe(272);
    expect(screenRect.height).toBe(153);
  });
});
