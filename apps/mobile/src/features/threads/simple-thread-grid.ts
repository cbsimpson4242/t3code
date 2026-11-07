/** Inset on each side of a Simple row. SimpleGridCells uses the same value. */
export const SIMPLE_THREAD_GRID_PADDING = 6;
/** Space between Simple tiles. The column count subtracts this, so the two stay paired. */
export const SIMPLE_THREAD_GRID_GAP = 4;
// 108dp is the smallest square that still holds the compact ring, two title lines, and status.
// Phones from 360dp through 448dp stay at three columns; four starts at 456dp.
const SIMPLE_THREAD_MIN_TILE_WIDTH = 108;
const SIMPLE_THREAD_MAX_COLUMNS = 6;

export function simpleThreadColumns(width: number, fontScale = 1): number {
  const tile = SIMPLE_THREAD_MIN_TILE_WIDTH * Math.max(1, fontScale);
  const inner =
    (Number.isFinite(width) ? width : 0) - SIMPLE_THREAD_GRID_PADDING * 2 + SIMPLE_THREAD_GRID_GAP;
  return Math.max(
    1,
    Math.min(SIMPLE_THREAD_MAX_COLUMNS, Math.floor(inner / (tile + SIMPLE_THREAD_GRID_GAP))),
  );
}

export type SimpleGridRow<T> = {
  readonly type: "simple-grid";
  readonly key: string;
  readonly cells: readonly T[];
};

export function groupSimpleThreadRows<T extends { readonly type: string; readonly key: string }>(
  items: readonly T[],
  columns: number,
): (T | SimpleGridRow<T>)[] {
  const result: (T | SimpleGridRow<T>)[] = [];
  let cells: T[] = [];
  const flush = () => {
    if (cells.length === 0) return;
    result.push({
      type: "simple-grid",
      key: `simple:${cells.map((item) => item.key).join("|")}`,
      cells,
    });
    cells = [];
  };
  for (const item of items) {
    if (item.type !== "v2-thread") {
      flush();
      result.push(item);
      continue;
    }
    cells.push(item);
    if (cells.length >= Math.max(1, columns)) flush();
  }
  flush();
  return result;
}
