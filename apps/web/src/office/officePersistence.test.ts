import { describe, expect, it } from "vitest";

import { createDefaultOfficePersistedState } from "./officeDefaults";
import { areOfficePersistedStatesEqual, parseOfficePersistedState } from "./officePersistence";

describe("officePersistence", () => {
  it("returns null for invalid persisted payloads", () => {
    expect(parseOfficePersistedState(null)).toBeNull();
    expect(parseOfficePersistedState({ version: 4 })).toBeNull();
    expect(
      parseOfficePersistedState({
        version: 3,
        camera: { x: 0, y: 0, zoom: 1 },
        furniture: [{ id: "plant-1", type: "plant", width: 56, height: 70, draggable: true }],
        projectGroupAnchors: {},
        deskOffsetsByThreadId: {},
      }),
    ).toBeNull();
    expect(
      parseOfficePersistedState({
        version: 3,
        camera: { x: 0, y: 0, zoom: 1 },
        furniture: [],
        projectGroupAnchors: {},
        deskOffsetsByThreadId: {},
        groupAccentColorsByKey: { "group-a": 42 },
      }),
    ).toBeNull();
  });

  it("accepts a valid v3 payload and compares persisted states deeply", () => {
    const state = createDefaultOfficePersistedState();
    const parsed = parseOfficePersistedState(state);

    expect(parsed).not.toBeNull();
    expect(areOfficePersistedStatesEqual(parsed!, state)).toBe(true);
  });

  it("drops shared default v2 furniture while preserving custom floating furniture", () => {
    const parsed = parseOfficePersistedState({
      version: 2,
      camera: { x: 10, y: 20, zoom: 1.2 },
      furniture: [
        {
          id: "water-cooler",
          type: "waterCooler",
          x: 220,
          y: 320,
          width: 40,
          height: 92,
          draggable: true,
        },
        {
          id: "plant-extra",
          type: "plant",
          x: 1200,
          y: 220,
          width: 56,
          height: 70,
          draggable: true,
        },
      ],
      projectGroupAnchors: {},
      projectGroupSizesByKey: {},
      deskOffsetsByThreadId: {},
      groupAccentColorsByKey: {},
    });

    expect(parsed?.version).toBe(3);
    expect(parsed?.defaultFurnitureSeededGroupKeys).toEqual([]);
    expect(parsed?.furniture.some((element) => element.id === "water-cooler")).toBe(false);
    expect(parsed?.furniture.find((element) => element.id === "plant-extra")?.placement).toEqual({
      kind: "floating",
      position: { x: 1200, y: 220 },
    });
  });

  it("parses v3 linked furniture correctly", () => {
    const parsed = parseOfficePersistedState({
      version: 3,
      camera: { x: 10, y: 20, zoom: 1.2 },
      furniture: [
        {
          id: "group:group-a:conference-table",
          type: "conferenceTable",
          width: 256,
          height: 96,
          draggable: true,
          placement: {
            kind: "groupLinked",
            groupKey: "group-a",
            offset: { x: 12, y: 34 },
          },
        },
      ],
      projectGroupAnchors: { "group-a": { x: 220, y: 88 } },
      projectGroupSizesByKey: {
        "group-a": { width: 420, height: 260 },
      },
      deskOffsetsByThreadId: {},
      groupAccentColorsByKey: {
        "group-a": "#06b6d4",
      },
      defaultFurnitureSeededGroupKeys: ["group-a"],
    });

    expect(parsed?.furniture[0]?.placement).toEqual({
      kind: "groupLinked",
      groupKey: "group-a",
      offset: { x: 12, y: 34 },
    });
    expect(parsed?.defaultFurnitureSeededGroupKeys).toEqual(["group-a"]);
  });

  it("accepts TVs in persisted v3 furniture records", () => {
    const parsed = parseOfficePersistedState({
      version: 3,
      camera: { x: 0, y: 0, zoom: 1 },
      furniture: [
        {
          id: "group:group-a:tv",
          type: "tv",
          width: 132,
          height: 90,
          draggable: true,
          placement: {
            kind: "groupLinked",
            groupKey: "group-a",
            offset: { x: 372, y: 44 },
          },
          metadata: {
            groupKey: "group-a",
            role: "tv",
          },
        },
      ],
      projectGroupAnchors: { "group-a": { x: 220, y: 88 } },
      projectGroupSizesByKey: {},
      deskOffsetsByThreadId: {},
      groupAccentColorsByKey: {},
      adminDeskPosition: { x: 40, y: 40 },
      defaultFurnitureSeededGroupKeys: ["group-a"],
    });

    expect(parsed?.furniture[0]?.type).toBe("tv");
    expect(parsed?.furniture[0]?.metadata).toEqual({
      groupKey: "group-a",
      role: "tv",
    });
  });
});
