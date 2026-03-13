import { describe, expect, it } from "vitest";

import { getIdleOfficeDestination } from "./officeBotRouting";

describe("officeBotRouting", () => {
  it("keeps idle bots inside their office target set", () => {
    const officeTargets = [
      { id: "group-a:table", furnitureId: "group-a:table", furnitureType: "conferenceTable" as const, x: 100, y: 140 },
      { id: "group-a:coffee", furnitureId: "group-a:coffee", furnitureType: "coffeeBar" as const, x: 180, y: 90 },
    ];

    const destination = getIdleOfficeDestination({
      threadId: "thread-1",
      officeTargets,
      deskLocation: { x: 40, y: 60 },
      idleStep: 2,
    });

    expect(destination.x).toBeGreaterThanOrEqual(92);
    expect(destination.x).toBeLessThanOrEqual(188);
    expect(destination.y).toBeGreaterThanOrEqual(82);
    expect(destination.y).toBeLessThanOrEqual(148);
  });

  it("returns to the desk when an office has no congregation targets", () => {
    expect(
      getIdleOfficeDestination({
        threadId: "thread-1",
        officeTargets: [],
        deskLocation: { x: 44, y: 88 },
        idleStep: 1,
      }),
    ).toEqual({ x: 44, y: 88 });
  });

  it("stays deterministic for the same bot and idle step", () => {
    const officeTargets = [
      { id: "group-a:table", furnitureId: "group-a:table", furnitureType: "conferenceTable" as const, x: 100, y: 140 },
      { id: "group-a:coffee", furnitureId: "group-a:coffee", furnitureType: "coffeeBar" as const, x: 180, y: 90 },
      { id: "group-a:water", furnitureId: "group-a:water", furnitureType: "waterCooler" as const, x: 32, y: 72 },
    ];

    const first = getIdleOfficeDestination({
      threadId: "thread-1",
      officeTargets,
      deskLocation: { x: 44, y: 88 },
      idleStep: 3,
    });
    const second = getIdleOfficeDestination({
      threadId: "thread-1",
      officeTargets,
      deskLocation: { x: 44, y: 88 },
      idleStep: 3,
    });

    expect(first).toEqual(second);
  });
});
