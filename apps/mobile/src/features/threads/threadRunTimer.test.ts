import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { resolveThreadWorkingStartedAt } from "@t3tools/client-runtime/state/models";
import { EnvironmentId, ProviderInstanceId, RunId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { makeThreadShellFixture } from "../../test-fixtures";
import {
  buildThreadListV2ListItems,
  resolveThreadListV2Status,
  threadHasUnseenCompletion,
  threadListV2ListItemsAreEqual,
  type ThreadListV2Item,
} from "./threadListV2";
import {
  advanceObservedRunEnd,
  hasRunningDelegatedWork,
  isThreadRunBusy,
  resolveThreadDescendantWork,
  resolveThreadRowRun,
  type ThreadDescendantWork,
  type ThreadRunTimer,
} from "./threadRunTimer";

const environmentId = EnvironmentId.make("environment-1");
const T0 = Date.parse("2026-03-09T10:00:00.000Z");
const iso = (offsetSeconds: number) => new Date(T0 + offsetSeconds * 1_000).toISOString();
const at = (offsetSeconds: number) => T0 + offsetSeconds * 1_000;

type RunStatus = NonNullable<EnvironmentThreadShell["latestRun"]>["status"];

function run(
  runId: string,
  status: RunStatus,
  window: { startedAt?: number | null; completedAt?: number | null },
): NonNullable<EnvironmentThreadShell["latestRun"]> {
  return {
    runId: RunId.make(runId),
    status,
    requestedAt: window.startedAt == null ? null : iso(window.startedAt - 1),
    startedAt: window.startedAt == null ? null : iso(window.startedAt),
    completedAt: window.completedAt == null ? null : iso(window.completedAt),
    assistantMessageId: null,
  };
}

function runtime(
  status: NonNullable<EnvironmentThreadShell["runtime"]>["status"],
  runId: string | null,
  activityStartedAt?: number | null,
): NonNullable<EnvironmentThreadShell["runtime"]> {
  return {
    status,
    activeRunId: runId === null ? null : RunId.make(runId),
    activityStartedAt: activityStartedAt == null ? undefined : iso(activityStartedAt),
    providerInstanceId: ProviderInstanceId.make("codex"),
    providerName: "Codex",
    lastError: null,
    updatedAt: iso(0),
  };
}

function thread(id: string, overrides: Partial<EnvironmentThreadShell> = {}) {
  return makeThreadShellFixture({
    environmentId,
    id: ThreadId.make(id),
    title: id,
    ...overrides,
  });
}

function child(id: string, parentId: string, overrides: Partial<EnvironmentThreadShell> = {}) {
  return thread(id, {
    lineage: {
      rootThreadId: ThreadId.make(parentId),
      parentThreadId: ThreadId.make(parentId),
      relationshipToParent: "subagent",
    },
    ...overrides,
  });
}

const subagentTask = { taskId: "sub-1", kind: "subagent" } as const;
const subagentTasks = [subagentTask] as unknown as EnvironmentThreadShell["pendingBackgroundTasks"];

/** What a row does for one shell update: status, parent-and-descendant state, then the clock. */
function rowTimer(
  shell: EnvironmentThreadShell,
  options: {
    descendants?: ThreadDescendantWork | undefined;
    observedEndedAtMs?: number | null;
  } = {},
) {
  const status = resolveThreadListV2Status(shell);
  const delegatedWorkRunning =
    options.descendants?.running === true || hasRunningDelegatedWork(shell);
  return resolveThreadRowRun({
    thread: shell,
    status,
    delegatedWorkRunning,
    descendantCompletedAt: options.descendants?.completedAt ?? null,
    observedEndedAtMs: options.observedEndedAtMs ?? null,
    activityStartedAt: resolveThreadWorkingStartedAt(shell),
  });
}

/** The label a row would show for a clock at `nowMs`. */
function shown(timer: ThreadRunTimer | null, nowMs: number): [string, number] | null {
  if (timer === null || timer.startedAtMs === null) return null;
  return [timer.phase, ((timer.endedAtMs ?? nowMs) - timer.startedAtMs) / 1_000];
}

describe("thread run clock lifecycle", () => {
  it("counts while running, freezes on Done, survives being seen, and resets on the next run", () => {
    const working = thread("a", {
      latestRun: run("run-1", "running", { startedAt: 0 }),
      runtime: runtime("running", "run-1", 0),
    });
    expect(shown(rowTimer(working).timer, at(5))).toEqual(["running", 5]);
    expect(shown(rowTimer(working).timer, at(42))).toEqual(["running", 42]);

    const done = thread("a", {
      latestRun: run("run-1", "completed", { startedAt: 0, completedAt: 90 }),
      runtime: runtime("completed", null),
    });
    expect(shown(rowTimer(done).timer, at(95))).toEqual(["done", 90]);
    // Time passing never changes a finished run's duration.
    expect(shown(rowTimer(done).timer, at(86_400))).toEqual(["done", 90]);

    // Opening the thread marks the completion seen; the result stays.
    const seen = { ...done, lastVisitedAt: iso(120) };
    expect(threadHasUnseenCompletion(seen)).toBe(false);
    expect(shown(rowTimer(seen).timer, at(130))).toEqual(["done", 90]);

    // A queued follow-up never shows the previous run's time.
    const queued = { ...seen, runtime: runtime("queued", "run-2") };
    expect(rowTimer(queued).timer).toBeNull();

    // The next run starts its own clock from zero.
    const rerun = {
      ...seen,
      latestRun: run("run-2", "running", { startedAt: 200 }),
      runtime: runtime("running", "run-2", 200),
    };
    expect(shown(rowTimer(rerun).timer, at(203))).toEqual(["running", 3]);

    const rerunDone = {
      ...rerun,
      latestRun: run("run-2", "completed", { startedAt: 200, completedAt: 230 }),
      runtime: runtime("completed", null),
    };
    expect(shown(rowTimer(rerunDone).timer, at(999))).toEqual(["done", 30]);
  });

  it("falls back to the running run's own start when the activity start is missing", () => {
    const working = thread("a", {
      latestRun: run("run-1", "running", { startedAt: 10 }),
      runtime: runtime("running", "run-1"),
    });
    expect(shown(rowTimer(working).timer, at(15))).toEqual(["running", 5]);
    const staleRun = thread("a", {
      latestRun: run("run-0", "completed", { startedAt: 0, completedAt: 5 }),
      runtime: runtime("starting", "run-1"),
    });
    expect(rowTimer(staleRun).timer).toBeNull();
  });

  it("keeps cancelled and failed runs distinct from Done", () => {
    const cancelled = thread("a", {
      latestRun: run("run-1", "cancelled", { startedAt: 0, completedAt: 20 }),
      runtime: runtime("cancelled", null),
    });
    expect(shown(rowTimer(cancelled).timer, at(99))).toEqual(["cancelled", 20]);
    const interrupted = {
      ...cancelled,
      latestRun: run("run-1", "interrupted", { startedAt: 0, completedAt: 25 }),
      runtime: runtime("interrupted", null),
    };
    expect(shown(rowTimer(interrupted).timer, at(99))).toEqual(["cancelled", 25]);
    const failed = thread("a", {
      latestRun: run("run-1", "failed", { startedAt: 0, completedAt: 15 }),
      runtime: runtime("failed", null),
    });
    expect(shown(rowTimer(failed).timer, at(99))).toEqual(["failed", 15]);
    // A failure with no recorded end freezes rather than subscribing to a live clock.
    const unknownEnd = {
      ...failed,
      latestRun: run("run-1", "failed", { startedAt: 0, completedAt: null }),
    };
    expect(rowTimer(unknownEnd).timer?.startedAtMs).toBeNull();
  });

  it("shows no result for a thread that never ran and never for attention states", () => {
    expect(rowTimer(thread("a")).timer).toBeNull();
    const needsApproval = thread("a", {
      latestRun: run("run-1", "running", { startedAt: 0 }),
      runtime: runtime("running", "run-1", 0),
      hasPendingApprovals: true,
    });
    expect(rowTimer(needsApproval).timer).toBeNull();
  });
});

describe("delegated work", () => {
  const parentDone = thread("parent", {
    latestRun: run("run-1", "completed", { startedAt: 0, completedAt: 60 }),
    runtime: runtime("completed", null),
  });

  it("keeps the parent's clock running while delegated threads work, then freezes at the last finish", () => {
    const busyChild = child("child", "parent", {
      latestRun: run("child-run", "running", { startedAt: 10 }),
      runtime: runtime("running", "child-run", 10),
    });
    const whileBusy = resolveThreadDescendantWork([parentDone, busyChild]);
    const parentKey = `${environmentId}:parent`;
    expect(whileBusy.get(parentKey)).toEqual({ running: true, completedAt: null });
    const delegating = rowTimer(parentDone, { descendants: whileBusy.get(parentKey) });
    expect(shown(delegating.timer, at(100))).toEqual(["delegating", 100]);
    expect(isThreadRunBusy(resolveThreadListV2Status(parentDone), true)).toBe(true);

    const finishedChild = {
      ...busyChild,
      latestRun: run("child-run", "completed", { startedAt: 10, completedAt: 150 }),
      runtime: runtime("completed", null),
    };
    const after = resolveThreadDescendantWork([parentDone, finishedChild]);
    expect(after.get(parentKey)).toEqual({ running: false, completedAt: iso(150) });
    const done = rowTimer(parentDone, { descendants: after.get(parentKey) });
    expect(shown(done.timer, at(9_999))).toEqual(["done", 150]);
  });

  it("reaches ancestors through grandchildren and ignores cycles", () => {
    const grandchild = child("grandchild", "child", {
      runtime: runtime("running", "g-run", 20),
    });
    const middle = child("child", "parent", {
      latestRun: run("child-run", "completed", { startedAt: 10, completedAt: 40 }),
      runtime: runtime("completed", null),
    });
    const work = resolveThreadDescendantWork([parentDone, middle, grandchild]);
    expect(work.get(`${environmentId}:parent`)?.running).toBe(true);
    expect(work.get(`${environmentId}:child`)?.running).toBe(true);
    // A child's earlier finish is the parent's last finish only while nothing is still busy.
    const cyclic = resolveThreadDescendantWork([
      child("x", "y", { runtime: runtime("running", "r", 0) }),
      child("y", "x"),
    ]);
    expect(cyclic.get(`${environmentId}:y`)?.running).toBe(true);
  });

  it("ignores completions from before the run started and archived children", () => {
    const old = child("child", "parent", {
      latestRun: run("old-run", "completed", { startedAt: -500, completedAt: -400 }),
      runtime: runtime("completed", null),
    });
    const work = resolveThreadDescendantWork([parentDone, old]);
    const result = rowTimer(parentDone, { descendants: work.get(`${environmentId}:parent`) });
    expect(shown(result.timer, at(500))).toEqual(["done", 60]);
    const archived = child("child2", "parent", {
      runtime: runtime("running", "r", 0),
      archivedAt: iso(1),
    });
    expect(
      resolveThreadDescendantWork([parentDone, archived]).get(`${environmentId}:parent`)?.running,
    ).toBe(false);
  });

  it("treats a provider-native subagent that outlives the turn as delegated work", () => {
    const native = { ...parentDone, pendingBackgroundTasks: subagentTasks };
    expect(shown(rowTimer(native).timer, at(75))).toEqual(["delegating", 75]);
    // The row records the moment the agents wound down; no thread reports it.
    const idle = rowTimer(parentDone, { observedEndedAtMs: at(140) });
    expect(shown(idle.timer, at(999))).toEqual(["done", 140]);
  });

  it("tracks the observed finish across a detour through an attention state", () => {
    let state = advanceObservedRunEnd(null, "busy", at(0));
    state = advanceObservedRunEnd(state, "other", at(5));
    state = advanceObservedRunEnd(state, "ready", at(9));
    expect(state.endedAtMs).toBe(at(9));
    // Mounting already finished records nothing; the server's times are used.
    expect(advanceObservedRunEnd(null, "ready", at(9)).endedAtMs).toBeNull();
    // Starting the next run spends the finish.
    expect(advanceObservedRunEnd(state, "busy", at(20)).endedAtMs).toBeNull();
  });
});

describe("thread list items carry delegated work", () => {
  const parent = thread("parent", {
    latestRun: run("run-1", "completed", { startedAt: 0, completedAt: 60 }),
    runtime: runtime("completed", null),
  });
  const listItem = (value: EnvironmentThreadShell): ThreadListV2Item => ({
    thread: value,
    variant: "card",
    snoozed: false,
    pinned: false,
    wokeAt: null,
    isLast: true,
  });

  it("re-renders a recycled row when only its delegated work changes", () => {
    const build = (descendantWork: ReadonlyMap<string, ThreadDescendantWork>) =>
      buildThreadListV2ListItems({
        items: [listItem(parent)],
        pendingTasks: [],
        descendantWork,
      })[0]!;
    const key = `${environmentId}:parent`;
    const idle = build(new Map());
    const running = build(new Map([[key, { running: true, completedAt: null }]]));
    const finished = build(new Map([[key, { running: false, completedAt: iso(150) }]]));
    expect(idle).toMatchObject({ descendantWorkRunning: false, descendantCompletedAt: null });
    expect(running).toMatchObject({ descendantWorkRunning: true, descendantCompletedAt: null });
    expect(finished).toMatchObject({
      descendantWorkRunning: false,
      descendantCompletedAt: iso(150),
    });
    expect(threadListV2ListItemsAreEqual(idle, build(new Map()))).toBe(true);
    expect(threadListV2ListItemsAreEqual(idle, running)).toBe(false);
    expect(threadListV2ListItemsAreEqual(running, finished)).toBe(false);
  });
});
