import { describe, expect, it } from "vitest";

import {
  createDefaultOfficeFurniture,
  createOfficeFurniture,
  moveOfficeFurnitureWithChildren,
  removeOfficeFurniture,
} from "./officeFurniture";

describe("officeFurniture", () => {
  it("moves linked chairs when a conference table moves", () => {
    const furniture = createDefaultOfficeFurniture();
    const table = furniture.find((element) => element.id === "conference-table");
    const chair = furniture.find((element) => element.id === "chair-1");
    if (!table || !chair) {
      throw new Error("Missing default conference furniture");
    }

    const movedFurniture = moveOfficeFurnitureWithChildren(furniture, table.id, {
      x: table.x + 80,
      y: table.y + 24,
    });
    const movedTable = movedFurniture.find((element) => element.id === table.id);
    const movedChair = movedFurniture.find((element) => element.id === chair.id);

    expect(movedTable).toMatchObject({ x: table.x + 80, y: table.y + 24 });
    expect(movedChair).toMatchObject({ x: chair.x + 80, y: chair.y + 24 });
  });

  it("removes descendant furniture when deleting a parent set", () => {
    const furniture = createDefaultOfficeFurniture();

    const nextFurniture = removeOfficeFurniture(furniture, "conference-table");

    expect(nextFurniture.some((element) => element.id === "conference-table")).toBe(false);
    expect(nextFurniture.some((element) => element.parentId === "conference-table")).toBe(false);
  });

  it("creates a boardroom set with linked chairs", () => {
    const created = createOfficeFurniture("conferenceSet", { x: 800, y: 420 }, []);
    const table = created.find((element) => element.type === "conferenceTable");
    const chairs = created.filter((element) => element.type === "chair");

    expect(table).toBeTruthy();
    expect(chairs).toHaveLength(8);
    expect(chairs.every((element) => element.parentId === table?.id)).toBe(true);
  });
});
