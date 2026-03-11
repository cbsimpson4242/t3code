import { describe, expect, it } from "vitest";

import { createDefaultOfficePersistedState } from "./officeDefaults";
import { areOfficePersistedStatesEqual, parseOfficePersistedState } from "./officePersistence";

describe("officePersistence", () => {
  it("returns null for invalid persisted payloads", () => {
    expect(parseOfficePersistedState(null)).toBeNull();
    expect(parseOfficePersistedState({ version: 2 })).toBeNull();
    expect(
      parseOfficePersistedState({
        version: 1,
        camera: { x: 0, y: 0, zoom: 1 },
        elementsById: { "water-cooler": { x: 10, y: "bad" } },
        projectGroupAnchors: {},
        deskOffsetsByThreadId: {},
      }),
    ).toBeNull();
  });

  it("accepts a valid v1 payload and compares persisted states deeply", () => {
    const state = createDefaultOfficePersistedState();
    const parsed = parseOfficePersistedState(state);

    expect(parsed).not.toBeNull();
    expect(areOfficePersistedStatesEqual(parsed!, state)).toBe(true);
  });
});
