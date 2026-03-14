import { describe, expect, it } from "vitest";

import {
  createDefaultOfficeFurnitureForGroup,
  createOfficeFurniture,
  getDefaultOfficeFurnitureFootprint,
  moveOfficeFurnitureWithChildren,
  removeOfficeFurniture,
  resolveOfficeFurniture,
} from "./officeFurniture";
import type { OfficePersistedFurniture } from "./officeTypes";

describe("officeFurniture", () => {
  it("moves linked furniture by updating local offsets instead of absolute coordinates", () => {
    const furniture = createDefaultOfficeFurnitureForGroup("group-a", []);
    const table = furniture.find((element) => element.type === "conferenceTable");
    if (!table || table.placement.kind !== "groupLinked") {
      throw new Error("Missing linked table");
    }

    const movedFurniture = moveOfficeFurnitureWithChildren({
      furniture,
      movedId: table.id,
      nextPoint: { x: 480, y: 340 },
      groupAnchors: { "group-a": { x: 200, y: 100 } },
    });
    const movedTable = movedFurniture.find((element) => element.id === table.id);

    expect(movedTable?.placement).toEqual({
      kind: "groupLinked",
      groupKey: "group-a",
      offset: { x: 280, y: 240 },
    });
  });

  it("seeds the default office furniture in the new individual office layout", () => {
    const furniture = createDefaultOfficeFurnitureForGroup("group-a", []);
    const placementsById = new Map(
      furniture.flatMap((element) =>
        element.placement.kind === "groupLinked"
          ? [[element.id, element.placement.offset] as const]
          : [],
      ),
    );

    expect(placementsById.get("group:group-a:water-cooler")).toEqual({ x: 18, y: 184 });
    expect(placementsById.get("group:group-a:conference-table")).toEqual({ x: 118, y: 286 });
    expect(placementsById.get("group:group-a:plant-left")).toEqual({ x: 26, y: 426 });
    expect(placementsById.get("group:group-a:plant-right")).toEqual({ x: 402, y: 426 });
  });

  it("uses the remaining seeded furniture for the default office footprint", () => {
    expect(getDefaultOfficeFurnitureFootprint()).toEqual({
      minWidth: 476,
      minHeight: 530,
    });
  });

  it("still allows manually adding a coffee bar", () => {
    const [coffeeBar] = createOfficeFurniture("coffeeBar", { x: 420, y: 260 }, []);

    expect(coffeeBar).toMatchObject({
      type: "coffeeBar",
      placement: {
        kind: "floating",
        position: { x: 372, y: 196 },
      },
    });
  });

  it("moves linked children when a linked parent moves", () => {
    const furniture: OfficePersistedFurniture[] = [
      {
        id: "group:group-a:table",
        type: "conferenceTable",
        width: 256,
        height: 96,
        draggable: true,
        placement: {
          kind: "groupLinked",
          groupKey: "group-a",
          offset: { x: 20, y: 30 },
        },
      },
      {
        id: "group:group-a:chair",
        type: "chair",
        width: 16,
        height: 16,
        draggable: true,
        parentId: "group:group-a:table",
        placement: {
          kind: "groupLinked",
          groupKey: "group-a",
          offset: { x: 44, y: 48 },
        },
      },
    ];

    const movedFurniture = moveOfficeFurnitureWithChildren({
      furniture,
      movedId: "group:group-a:table",
      nextPoint: { x: 320, y: 260 },
      groupAnchors: { "group-a": { x: 200, y: 100 } },
    });

    expect(movedFurniture.find((element) => element.id === "group:group-a:table")?.placement).toEqual({
      kind: "groupLinked",
      groupKey: "group-a",
      offset: { x: 120, y: 160 },
    });
    expect(movedFurniture.find((element) => element.id === "group:group-a:chair")?.placement).toEqual({
      kind: "groupLinked",
      groupKey: "group-a",
      offset: { x: 144, y: 178 },
    });
  });

  it("keeps floating furniture absolute when moved", () => {
    const [plant] = createOfficeFurniture("plant", { x: 300, y: 200 }, []);
    if (!plant) {
      throw new Error("Missing plant");
    }
    const movedFurniture = moveOfficeFurnitureWithChildren({
      furniture: [plant],
      movedId: plant.id,
      nextPoint: { x: 420, y: 310 },
      groupAnchors: {},
    });

    expect(movedFurniture[0]?.placement).toEqual({
      kind: "floating",
      position: { x: 420, y: 310 },
    });
  });

  it("produces congregation targets from resolved office furniture", () => {
    const furniture = createDefaultOfficeFurnitureForGroup("group-a", []);
    const resolved = resolveOfficeFurniture({
      furniture,
      groupAnchors: { "group-a": { x: 200, y: 100 } },
    });

    const targets = resolved.congregationTargetsByGroupKey["group-a"] ?? [];
    expect(targets.some((target) => target.furnitureType === "conferenceTable")).toBe(true);
    expect(targets.some((target) => target.furnitureType === "waterCooler")).toBe(true);
    expect(targets.some((target) => target.furnitureType === "plant")).toBe(true);
  });

  it("removes descendant furniture when deleting a parent set", () => {
    const furniture = createOfficeFurniture("conferenceSet", { x: 800, y: 420 }, []);
    const table = furniture.find((element) => element.type === "conferenceTable");
    if (!table) {
      throw new Error("Missing conference table");
    }

    const nextFurniture = removeOfficeFurniture(furniture, table.id);

    expect(nextFurniture.some((element) => element.id === table.id)).toBe(false);
    expect(nextFurniture.some((element) => element.parentId === table.id)).toBe(false);
  });
});
