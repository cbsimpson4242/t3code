import { describe, expect, it } from "vite-plus/test";
import { groupSimpleThreadRows, simpleThreadColumns } from "./simple-thread-grid";

describe("Simple thread grid", () => {
  it("fits phones, narrow sidebars, and tablets, accounting for large type", () => {
    expect(simpleThreadColumns(0)).toBe(1);
    expect(simpleThreadColumns(280)).toBe(1);
    expect(simpleThreadColumns(360)).toBe(2);
    expect(simpleThreadColumns(430)).toBe(2);
    expect(simpleThreadColumns(900)).toBe(5);
    expect(simpleThreadColumns(1600)).toBe(6);
    expect(simpleThreadColumns(360, 1.5)).toBe(1);
  });
  it("preserves shelf boundaries, row order, and non-thread actions", () => {
    const item = (type: string, key: string) => ({ type, key });
    const input = [
      item("v2-working-shelf", "working"),
      item("v2-thread", "a"),
      item("v2-thread", "b"),
      item("v2-thread", "c"),
      item("v2-settled-shelf", "settled"),
      item("v2-thread", "d"),
      item("v2-show-more", "more"),
    ];
    const rows = groupSimpleThreadRows(input, 2);
    expect(rows.map((row) => row.type)).toEqual([
      "v2-working-shelf",
      "simple-grid",
      "simple-grid",
      "v2-settled-shelf",
      "simple-grid",
      "v2-show-more",
    ]);
    expect(rows.flatMap((row) => ("cells" in row ? row.cells : [row]))).toEqual(input);
    expect(rows[0]).toBe(input[0]);
    expect(groupSimpleThreadRows(input, 2).map((row) => row.key)).toEqual(
      rows.map((row) => row.key),
    );
  });
});
