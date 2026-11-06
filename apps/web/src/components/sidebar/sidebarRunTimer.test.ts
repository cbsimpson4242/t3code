import { ProviderInstanceId, RunId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { SidebarThreadSummary } from "../../types";

import {
  hasRunningDelegatedWork,
  hasUnseenCompletion,
  resolveSidebarThreadStatus,
  resolveWorkingStartedAt,
} from "../Sidebar.logic";
import {
  advanceObservedRunEnd,
  resolveFullCompletionMs,
  resolveSidebarRunTimer,
  type ObservedRunEnd,
} from "./sidebarRunTimer";

const T0 = Date.parse("2026-03-09T10:00:00.000Z");
const iso = (offsetSeconds: number) => new Date(T0 + offsetSeconds * 1_000).toISOString();
const at = (offsetSeconds: number) => T0 + offsetSeconds * 1_000;

type Shell = Pick<
  SidebarThreadSummary,
  | "hasPendingApprovals"
  | "hasPendingUserInput"
  | "pendingSubagentRequest"
  | "pendingGuestMessageCount"
  | "blockedOnThreadWait"
  | "pendingBackgroundTasks"
  | "runtime"
  | "latestRun"
  | "interactionMode"
  | "hasActionableProposedPlan"
>;

function runtime(
  status: NonNullable<Shell["runtime"]>["status"],
  activityStartedAt?: string | null,
): NonNullable<Shell["runtime"]> {
  return {
    status,
    activeRunId: status === "idle" || status === "completed" ? null : RunId.make("run-1"),
    activityStartedAt,
    providerInstanceId: ProviderInstanceId.make("codex"),
    providerName: "Codex",
    lastError: null,
    updatedAt: iso(0),
  };
}

function latestRun(
  status: NonNullable<Shell["latestRun"]>["status"],
  window: { startedAt?: string | null; completedAt?: string | null; requestedAt?: string | null },
): NonNullable<Shell["latestRun"]> {
  return {
    runId: RunId.make("run-1"),
    status,
    requestedAt: window.requestedAt ?? null,
    startedAt: window.startedAt ?? null,
    completedAt: window.completedAt ?? null,
    assistantMessageId: null,
  };
}

function shell(overrides: Partial<Shell>): Shell {
  return {
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    pendingSubagentRequest: null,
    pendingGuestMessageCount: 0,
    blockedOnThreadWait: false,
    pendingBackgroundTasks: [],
    runtime: null,
    latestRun: null,
    interactionMode: "default",
    hasActionableProposedPlan: false,
    ...overrides,
  };
}

/** The same derivation SidebarThreadRow performs for one render. */
function present(
  thread: Shell,
  options: {
    descendantWorkRunning?: boolean;
    descendantCompletedAt?: string | null;
    observedEndedAtMs?: number | null;
    isActive?: boolean;
    lastVisitedAt?: string | undefined;
  } = {},
) {
  const status = resolveSidebarThreadStatus(thread);
  const delegatedWorkRunning =
    (options.descendantWorkRunning ?? false) || hasRunningDelegatedWork(thread);
  const fullCompletionMs = resolveFullCompletionMs({
    thread,
    descendantCompletedAt: options.descendantCompletedAt ?? null,
    observedEndedAtMs: options.observedEndedAtMs ?? null,
  });
  const isUnread = hasUnseenCompletion({
    ...thread,
    lastVisitedAt: options.lastVisitedAt,
    latestRun:
      thread.latestRun === null || fullCompletionMs === null
        ? thread.latestRun
        : { ...thread.latestRun, completedAt: new Date(fullCompletionMs).toISOString() },
  });
  const timer = resolveSidebarRunTimer({
    thread,
    status,
    delegatedWorkRunning,
    activityStartedAt: resolveWorkingStartedAt(thread),
    fullCompletionMs,
    showFinished: true,
  });
  return { status, timer, isUnread };
}

describe("sidebar run timer lifecycle", () => {
  it("falls back to the matching running run when activity start is null or invalid", () => {
    for (const activityStart of [null, "invalid"]) {
      const { timer } = present(
        shell({
          runtime: runtime("running", activityStart),
          latestRun: latestRun("running", { startedAt: iso(5) }),
        }),
      );
      expect(timer).toEqual({ phase: "running", startedAtMs: at(5), endedAtMs: null });
    }
  });

  it("never counts a live clock for a failure whose completion timestamp is missing", () => {
    const { timer } = present(
      shell({
        runtime: runtime("failed"),
        latestRun: latestRun("failed", { startedAt: iso(0) }),
      }),
    );
    expect(timer).toEqual({ phase: "failed", startedAtMs: null, endedAtMs: null });
  });

  it("counts a fresh run from its activity start, live until it ends", () => {
    const { timer } = present(
      shell({
        runtime: runtime("running", iso(5)),
        latestRun: latestRun("running", { startedAt: iso(5) }),
      }),
    );
    expect(timer).toEqual({ phase: "running", startedAtMs: at(5), endedAtMs: null });
    expect(at(65) - timer!.startedAtMs!).toBe(60_000);
  });

  it("resets on a re-run: the new activity start replaces the old, the finished state is gone", () => {
    const finished = present(
      shell({
        runtime: runtime("completed"),
        latestRun: latestRun("completed", { startedAt: iso(5), completedAt: iso(125) }),
      }),
      { lastVisitedAt: iso(0) },
    );
    expect(finished.timer).toEqual({ phase: "done", startedAtMs: at(5), endedAtMs: at(125) });

    const rerun = present(
      shell({
        runtime: runtime("running", iso(300)),
        latestRun: latestRun("running", { startedAt: iso(300) }),
      }),
      { lastVisitedAt: iso(0) },
    );
    expect(rerun.timer).toEqual({ phase: "running", startedAtMs: at(300), endedAtMs: null });
  });

  it("shows no clock for a queued re-run until the server reports a start", () => {
    const { status, timer } = present(
      shell({
        runtime: runtime("queued", null),
        latestRun: latestRun("completed", { startedAt: iso(5), completedAt: iso(125) }),
      }),
    );
    expect(status).toBe("working");
    expect(timer).toBeNull();
  });

  it("freezes the final duration on finish for an unfocused thread that was not yet visited", () => {
    const { status, timer, isUnread } = present(
      shell({
        runtime: runtime("completed"),
        latestRun: latestRun("completed", { startedAt: iso(10), completedAt: iso(190) }),
      }),
      { lastVisitedAt: iso(5) },
    );
    expect(status).toBe("ready");
    expect(isUnread).toBe(true);
    expect(timer).toEqual({ phase: "done", startedAtMs: at(10), endedAtMs: at(190) });
    // Frozen: the end is fixed, so the duration no longer follows the clock.
    expect(timer!.endedAtMs! - timer!.startedAtMs!).toBe(180_000);
  });

  it("keeps Done on show for the focused thread even though its visit watermark is current", () => {
    const thread = shell({
      runtime: runtime("completed"),
      latestRun: latestRun("completed", { startedAt: iso(10), completedAt: iso(190) }),
    });
    const focused = present(thread, { isActive: true, lastVisitedAt: iso(200) });
    expect(focused.isUnread).toBe(false);
    expect(focused.timer?.phase).toBe("done");
    // Read state and navigation must not erase the final duration.
    expect(present(thread, { isActive: false, lastVisitedAt: iso(200) }).timer?.phase).toBe("done");
  });

  it("shows Done and the final duration even when the thread was never opened", () => {
    const { timer } = present(
      shell({
        runtime: runtime("completed"),
        latestRun: latestRun("completed", { startedAt: iso(10), completedAt: iso(190) }),
      }),
      { lastVisitedAt: undefined },
    );
    expect(timer).toEqual({ phase: "done", startedAtMs: at(10), endedAtMs: at(190) });
  });
});

describe("sidebar run timer with delegated work", () => {
  const parentRun = latestRun("completed", { startedAt: iso(0), completedAt: iso(100) });

  it("is delegating, not done, while a subagent outlives the parent's turn", () => {
    const { status, timer } = present(
      shell({
        runtime: runtime("idle"),
        latestRun: parentRun,
        pendingBackgroundTasks: [{ taskId: "sub-1", kind: "subagent" }],
      }),
      { lastVisitedAt: iso(50) },
    );
    expect(status).toBe("waiting");
    expect(timer).toEqual({ phase: "delegating", startedAtMs: at(0), endedAtMs: null });
  });

  it("is delegating while a parent is parked on a thread wait, counted from its activity start", () => {
    const { status, timer } = present(
      shell({
        runtime: runtime("running", iso(3)),
        blockedOnThreadWait: true,
        latestRun: latestRun("running", { startedAt: iso(3) }),
      }),
    );
    expect(status).toBe("waiting");
    expect(timer).toEqual({ phase: "delegating", startedAtMs: at(3), endedAtMs: null });
  });

  it("is delegating while a child thread is busy, even though the parent itself is ready", () => {
    const { status, timer } = present(
      shell({ runtime: runtime("completed"), latestRun: parentRun }),
      {
        descendantWorkRunning: true,
        lastVisitedAt: iso(50),
      },
    );
    expect(status).toBe("ready");
    expect(timer?.phase).toBe("delegating");
  });

  it("becomes done only when the last child finishes, at the child's time, not the parent's", () => {
    const thread = shell({ runtime: runtime("completed"), latestRun: parentRun });
    // The user visited between the parent's turn ending and the child finishing.
    const options = { lastVisitedAt: iso(150), descendantCompletedAt: iso(400) };
    const { isUnread, timer } = present(thread, options);
    expect(isUnread).toBe(true);
    expect(timer).toEqual({ phase: "done", startedAtMs: at(0), endedAtMs: at(400) });
    // Judged by the parent's own completion alone, that visit would have hidden it.
    expect(hasUnseenCompletion({ ...thread, lastVisitedAt: iso(150) })).toBe(false);
  });

  it("ignores a delegated completion left over from an earlier run", () => {
    expect(
      resolveFullCompletionMs({
        thread: shell({
          latestRun: latestRun("completed", { startedAt: iso(500), completedAt: iso(600) }),
        }),
        descendantCompletedAt: iso(400),
        observedEndedAtMs: null,
      }),
    ).toBe(at(600));
  });

  it("ends a provider-native subagent run when the row saw it wind down", () => {
    const { timer } = present(shell({ runtime: runtime("completed"), latestRun: parentRun }), {
      observedEndedAtMs: at(700),
      lastVisitedAt: iso(50),
    });
    expect(timer).toEqual({ phase: "done", startedAtMs: at(0), endedAtMs: at(700) });
  });

  it("does not claim done while ordinary background work holds the thread at waiting", () => {
    const { status, timer } = present(
      shell({
        runtime: runtime("idle"),
        latestRun: parentRun,
        pendingBackgroundTasks: [{ taskId: "job", kind: "background_task" }],
      }),
      { lastVisitedAt: iso(50) },
    );
    expect(status).toBe("waiting");
    expect(timer).toBeNull();
  });
});

describe("sidebar run timer error and attention states", () => {
  it("reports a failed run with its duration, whether or not it was seen", () => {
    const { status, timer } = present(
      shell({
        runtime: { ...runtime("failed"), lastErrorClass: "provider_error" },
        latestRun: latestRun("failed", { startedAt: iso(0), completedAt: iso(42) }),
      }),
      { lastVisitedAt: iso(500) },
    );
    expect(status).toBe("failed");
    expect(timer).toEqual({ phase: "failed", startedAtMs: at(0), endedAtMs: at(42) });
  });

  it("distinguishes a cancelled or interrupted run from a completed one", () => {
    for (const runStatus of ["cancelled", "interrupted"] as const) {
      const { status, timer } = present(
        shell({
          runtime: runtime(runStatus),
          latestRun: latestRun(runStatus, { startedAt: iso(0), completedAt: iso(30) }),
        }),
        { lastVisitedAt: iso(-5) },
      );
      expect(status).toBe("ready");
      expect(timer).toEqual({ phase: "cancelled", startedAtMs: at(0), endedAtMs: at(30) });
    }
  });

  it("carries no clock while the thread waits on approval, input or a guest", () => {
    const run = latestRun("running", { startedAt: iso(0) });
    const working = runtime("running", iso(0));
    for (const attention of [
      { hasPendingApprovals: true },
      { hasPendingUserInput: true },
      { pendingGuestMessageCount: 1 },
    ]) {
      const { status, timer } = present(shell({ runtime: working, latestRun: run, ...attention }));
      expect(["approval", "input", "request"]).toContain(status);
      expect(timer).toBeNull();
    }
    // Resolved, the same activity start carries on: the approval time is part of the run.
    expect(present(shell({ runtime: working, latestRun: run })).timer?.startedAtMs).toBe(at(0));
  });

  it("never reports a rolled-back run as done", () => {
    const { timer } = present(
      shell({
        runtime: runtime("completed"),
        latestRun: latestRun("rolled_back", { startedAt: iso(0), completedAt: iso(30) }),
      }),
      { lastVisitedAt: iso(-5) },
    );
    expect(timer).toBeNull();
  });
});

describe("advanceObservedRunEnd", () => {
  const first = (phase: Parameters<typeof advanceObservedRunEnd>[1]) =>
    advanceObservedRunEnd(null, phase, 0);

  it("records the finish time only when busy work gives way to ready", () => {
    const busy = first("busy");
    expect(busy.endedAtMs).toBeNull();
    expect(advanceObservedRunEnd(busy, "ready", 900)).toEqual({
      phase: "ready",
      hadBusy: false,
      endedAtMs: 900,
    });
  });

  it("does not invent a finish for a row that mounts on an already ready thread", () => {
    expect(first("ready").endedAtMs).toBeNull();
  });

  it("carries busy work through an approval detour, and clears when work resumes", () => {
    const busy = first("busy");
    const detour = advanceObservedRunEnd(busy, "other", 100);
    expect(detour.endedAtMs).toBeNull();
    const resumed = advanceObservedRunEnd(detour, "busy", 200);
    expect(resumed.endedAtMs).toBeNull();
    expect(advanceObservedRunEnd(detour, "ready", 300).endedAtMs).toBe(300);
  });

  it("does not record a second finish after the first was spent", () => {
    const ended: ObservedRunEnd = advanceObservedRunEnd(first("busy"), "ready", 900);
    const attention = advanceObservedRunEnd(ended, "other", 1_000);
    expect(advanceObservedRunEnd(attention, "ready", 2_000).endedAtMs).toBeNull();
  });
});
