import { describe, expect, it } from "vite-plus/test";

import { resolveGridTarget, type GridRect } from "./sidebarTree";

const cell = (column: number, line: number): GridRect => ({
  left: column * 100,
  top: line * 32,
  width: 100,
});
const fullWidth = (line: number): GridRect => ({ left: 0, top: line * 32, width: 300 });

// Reading order: a header, then three columns of two lines, then a lone cell under a full-width row.
const rects = [
  fullWidth(0),
  cell(0, 1),
  cell(1, 1),
  cell(2, 1),
  cell(0, 2),
  cell(1, 2),
  fullWidth(3),
  cell(0, 4),
];

describe("resolveGridTarget", () => {
  it("steps through the reading order sideways, clamped at the ends", () => {
    expect(resolveGridTarget(rects, 1, "ArrowRight")).toBe(2);
    expect(resolveGridTarget(rects, 3, "ArrowRight")).toBe(4);
    expect(resolveGridTarget(rects, 2, "ArrowLeft")).toBe(1);
    expect(resolveGridTarget(rects, 0, "ArrowLeft")).toBe(0);
    expect(resolveGridTarget(rects, 7, "ArrowRight")).toBe(7);
  });

  it("moves to the same column on the next and previous line", () => {
    expect(resolveGridTarget(rects, 2, "ArrowDown")).toBe(5);
    expect(resolveGridTarget(rects, 5, "ArrowUp")).toBe(2);
    expect(resolveGridTarget(rects, 1, "ArrowDown")).toBe(4);
  });

  it("lands on the nearest cell when the line below is shorter", () => {
    // Column 2 has no cell on line 2; column 1 is the nearest.
    expect(resolveGridTarget(rects, 3, "ArrowDown")).toBe(5);
  });

  it("treats a full-width row as its own line", () => {
    expect(resolveGridTarget(rects, 5, "ArrowDown")).toBe(6);
    expect(resolveGridTarget(rects, 6, "ArrowDown")).toBe(7);
    expect(resolveGridTarget(rects, 7, "ArrowUp")).toBe(6);
    expect(resolveGridTarget(rects, 1, "ArrowUp")).toBe(0);
  });

  it("stays put at the first and last lines", () => {
    expect(resolveGridTarget(rects, 0, "ArrowUp")).toBe(0);
    expect(resolveGridTarget(rects, 7, "ArrowDown")).toBe(7);
  });

  it("matches a single-column list when every row is full width", () => {
    const column = [fullWidth(0), fullWidth(1), fullWidth(2)];
    expect(resolveGridTarget(column, 0, "ArrowDown")).toBe(1);
    expect(resolveGridTarget(column, 2, "ArrowUp")).toBe(1);
  });
});
