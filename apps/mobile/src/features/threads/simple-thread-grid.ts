export function simpleThreadColumns(width: number, fontScale = 1): number {
  return Math.max(1, Math.min(6, Math.floor((width - 16) / (148 * Math.max(1, fontScale)))));
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
