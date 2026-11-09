import { describe, expect, it } from "vite-plus/test";

import {
  buildThreadActionMenuItems,
  newThreadOnMainWorkspace,
  type ThreadActionMenuState,
} from "./threadActionMenu.logic";

const baseState: ThreadActionMenuState = {
  canOperate: true,
  branch: null,
  projectFilter: null,
  isPinned: false,
  isSettled: false,
  autoSettleEnabled: true,
  isSnoozed: false,
  canSnoozeNow: true,
  isRegeneratingTitle: false,
  isRunning: false,
  supports: {
    settlement: true,
    autoSettleOptOut: true,
    snooze: true,
    pinning: true,
    titleRegeneration: true,
  },
  snoozePresets: [
    { id: "hour", label: "In 1 hour", whenLabel: "3:00 PM", snoozedUntil: "2026-08-07T15:00:00Z" },
  ],
};

describe("buildThreadActionMenuItems", () => {
  it.each([false, true])(
    "disables both lifecycle directions without permission (reversed: %s)",
    (reversed) => {
      const items = buildThreadActionMenuItems({
        ...baseState,
        canOperate: false,
        isPinned: reversed,
        isSettled: reversed,
        isSnoozed: reversed,
      });
      const expected = reversed
        ? [
            "unpin",
            "unsettle",
            "unsnooze",
            "rename",
            "regenerate-title",
            "auto-settle",
            "archive",
            "delete",
          ]
        : [
            "pin",
            "settle",
            "snooze",
            "rename",
            "regenerate-title",
            "auto-settle",
            "archive",
            "delete",
          ];
      expect(items.filter((item) => item.disabled).map((item) => item.id)).toEqual(expected);
      expect(
        items.find((item) => item.id === "snooze")?.children?.every((child) => child.disabled) ??
          true,
      ).toBe(true);
    },
  );

  it("offers a main-checkout thread beside the source branch", () => {
    const items = buildThreadActionMenuItems({
      ...baseState,
      canOperate: false,
      branch: "feature/sidebar",
    });
    const ids = items.map((item) => item.id);
    expect(ids.indexOf("new-thread-on-main")).toBe(ids.indexOf("new-thread-on-branch") + 1);
    expect(items.find((item) => item.id === "new-thread-on-branch")).toMatchObject({
      label: "New thread on feature/sidebar",
    });
    expect(items.find((item) => item.id === "new-thread-on-main")).toMatchObject({
      label: "New thread on main",
    });
    expect(items.find((item) => item.id === "new-thread-on-branch")?.disabled).toBeUndefined();
    expect(items.find((item) => item.id === "new-thread-on-main")?.disabled).toBeUndefined();
    expect(newThreadOnMainWorkspace()).toEqual({
      branch: null,
      worktreePath: null,
      envMode: "local",
      startFromOrigin: false,
    });
  });

  it("omits branch actions when the thread has no branch", () => {
    const ids = buildThreadActionMenuItems(baseState).map((item) => item.id);
    expect(ids).not.toContain("new-thread-on-branch");
    expect(ids).not.toContain("new-thread-on-main");
  });

  it("disables archive and turning into a project while the thread is running", () => {
    const items = buildThreadActionMenuItems({
      ...baseState,
      isRunning: true,
      canTurnIntoProject: true,
    });
    expect(items.find((item) => item.id === "archive")?.disabled).toBe(true);
    expect(items.find((item) => item.id === "turn-into-project")?.disabled).toBe(true);
  });
});
