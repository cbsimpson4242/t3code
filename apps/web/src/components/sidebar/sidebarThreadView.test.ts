import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import type { SidebarThreadStatus } from "../Sidebar.logic";
import {
  DEFAULT_SIDEBAR_THREAD_VIEW,
  isSidebarThreadStatusAnimated,
  SidebarThreadView,
} from "./sidebarThreadView";

describe("SidebarThreadView", () => {
  it("accepts the two views and rejects anything else, so a bad stored value falls back", () => {
    const decode = Schema.decodeUnknownSync(SidebarThreadView);
    expect(decode("standard")).toBe("standard");
    expect(decode("simple")).toBe("simple");
    expect(() => decode("grid")).toThrow();
    expect(() => decode(null)).toThrow();
    expect(DEFAULT_SIDEBAR_THREAD_VIEW).toBe("standard");
  });
});

describe("isSidebarThreadStatusAnimated", () => {
  it("animates only a working thread", () => {
    const statuses = [
      "working",
      "waiting",
      "approval",
      "input",
      "request",
      "limited",
      "failed",
      "ready",
    ] satisfies SidebarThreadStatus[];
    expect(statuses.filter((status) => isSidebarThreadStatusAnimated(status))).toEqual(["working"]);
  });

  it("also animates a waiting or ready parent while delegated work runs, never an attention state", () => {
    const statuses = [
      "working",
      "waiting",
      "approval",
      "input",
      "request",
      "limited",
      "failed",
      "ready",
    ] satisfies SidebarThreadStatus[];
    expect(statuses.filter((status) => isSidebarThreadStatusAnimated(status, true))).toEqual([
      "working",
      "waiting",
      "ready",
    ]);
  });
});
