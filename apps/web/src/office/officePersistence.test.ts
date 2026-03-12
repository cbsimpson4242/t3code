import { describe, expect, it } from "vitest";

import { createDefaultOfficePersistedState } from "./officeDefaults";
import { areOfficePersistedStatesEqual, parseOfficePersistedState } from "./officePersistence";

describe("officePersistence", () => {
  it("returns null for invalid persisted payloads", () => {
    expect(parseOfficePersistedState(null)).toBeNull();
    expect(parseOfficePersistedState({ version: 3 })).toBeNull();
    expect(
      parseOfficePersistedState({
        version: 2,
        camera: { x: 0, y: 0, zoom: 1 },
        furniture: [{ id: "water-cooler", type: "waterCooler", x: 10, y: "bad" }],
        projectGroupAnchors: {},
        deskOffsetsByThreadId: {},
      }),
    ).toBeNull();
    expect(
      parseOfficePersistedState({
        version: 2,
        camera: { x: 0, y: 0, zoom: 1 },
        furniture: [],
        projectGroupAnchors: {},
        deskOffsetsByThreadId: {},
        groupAccentColorsByKey: { "group-a": 42 },
      }),
    ).toBeNull();
  });

  it("accepts a valid v1 payload and compares persisted states deeply", () => {
    const state = createDefaultOfficePersistedState();
    const parsed = parseOfficePersistedState(state);

    expect(parsed).not.toBeNull();
    expect(areOfficePersistedStatesEqual(parsed!, state)).toBe(true);
  });

  it("migrates legacy v1 furniture positions into v2 furniture state", () => {
    const parsed = parseOfficePersistedState({
      version: 1,
      camera: { x: 10, y: 20, zoom: 1.2 },
      elementsById: {
        "water-cooler": { x: 220, y: 320 },
      },
      projectGroupAnchors: {},
      deskOffsetsByThreadId: {},
    });

    expect(parsed?.version).toBe(2);
    expect(parsed?.furniture.find((element) => element.id === "water-cooler")).toMatchObject({
      x: 220,
      y: 320,
    });
    expect(parsed?.groupAccentColorsByKey).toEqual({});
  });

  it("preserves group accent overrides from v2 payloads", () => {
    const parsed = parseOfficePersistedState({
      version: 2,
      camera: { x: 10, y: 20, zoom: 1.2 },
      furniture: [],
      projectGroupAnchors: {},
      projectGroupSizesByKey: {
        "group-a": { width: 420, height: 260 },
      },
      deskOffsetsByThreadId: {},
      groupAccentColorsByKey: {
        "group-a": "#06b6d4",
      },
    });

    expect(parsed?.projectGroupSizesByKey).toEqual({
      "group-a": { width: 420, height: 260 },
    });
    expect(parsed?.groupAccentColorsByKey).toEqual({
      "group-a": "#06b6d4",
    });
  });
});
