import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";

import type { ThreadListV2Status } from "./threadListV2";

// `delegating` is a parent parked on, or past its turn but still waiting for, agents it started.
// Approval, input and guest requests carry no timer: their label says what the thread needs,
// and the same run clock carries on when the agent resumes.
export type ThreadRunTimerPhase = "running" | "delegating" | "done" | "cancelled" | "failed";

export interface ThreadRunTimer {
  readonly phase: ThreadRunTimerPhase;
  /** Epoch ms the run's clock started, or null when the shell carries no usable start. */
  readonly startedAtMs: number | null;
  /** Epoch ms the run fully finished; null while it is still going. */
  readonly endedAtMs: number | null;
}

type RunTimerThread = Pick<EnvironmentThreadShell, "latestRun" | "runtime">;

function parseMs(value: string | null | undefined): number | null {
  if (value == null) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/** When the latest run began, from its own record; null when the shell has none. */
function latestRunStartMs(thread: RunTimerThread): number | null {
  const run = thread.latestRun;
  return run === null ? null : (parseMs(run.startedAt) ?? parseMs(run.requestedAt));
}

/**
 * Agents this thread handed work to are still running: its own turn is parked on them
 * (a thread wait or blocking delegate), or its turn ended while a subagent it started keeps
 * going. Ordinary waiting for the user, and other background tasks, are not delegated work.
 */
export function hasRunningDelegatedWork(
  thread: Pick<
    EnvironmentThreadShell,
    "runtime" | "blockedOnThreadWait" | "pendingBackgroundTasks"
  >,
): boolean {
  return (
    (thread.runtime?.status === "running" && thread.blockedOnThreadWait === true) ||
    (thread.pendingBackgroundTasks ?? []).some((task) => task.kind === "subagent")
  );
}

type DelegationShell = Pick<
  EnvironmentThreadShell,
  | "environmentId"
  | "id"
  | "lineage"
  | "runtime"
  | "archivedAt"
  | "blockedOnThreadWait"
  | "pendingBackgroundTasks"
  | "delegatedFrom"
> & {
  readonly latestRun: Pick<NonNullable<EnvironmentThreadShell["latestRun"]>, "completedAt"> | null;
};

export interface ThreadDescendantWork {
  /** A subagent or delegated task somewhere below the thread is running. */
  readonly running: boolean;
  /** When the last of those agents finished its run; null when none has. */
  readonly completedAt: string | null;
}

const NO_DESCENDANT_WORK: ThreadDescendantWork = { running: false, completedAt: null };

export function threadDescendantWorkKey(input: {
  readonly environmentId: string;
  readonly id: string;
}): string {
  return `${input.environmentId}:${input.id}`;
}

/**
 * Per listed thread: whether delegated threads below it are still running, and when the last
 * one finished. Child threads have no row of their own, so their activity shows on the nearest
 * listed parent; a grandchild's work reaches its ancestors through every link of the chain.
 */
export function resolveThreadDescendantWork(
  threads: ReadonlyArray<DelegationShell>,
): ReadonlyMap<string, ThreadDescendantWork> {
  const children: Array<{
    key: string;
    parentKey: string;
    busy: boolean;
    thread: DelegationShell;
  }> = [];
  for (const thread of threads) {
    const parentKey = thread.delegatedFrom
      ? threadDescendantWorkKey({
          environmentId: thread.delegatedFrom.environmentId,
          id: thread.delegatedFrom.threadId,
        })
      : thread.lineage.relationshipToParent === "subagent" && thread.lineage.parentThreadId !== null
        ? threadDescendantWorkKey({
            environmentId: thread.environmentId,
            id: thread.lineage.parentThreadId,
          })
        : null;
    if (parentKey === null) continue;
    const runtimeActive =
      thread.runtime !== null &&
      ["preparing", "queued", "starting", "running", "waiting"].includes(thread.runtime.status);
    children.push({
      key: threadDescendantWorkKey(thread),
      parentKey,
      busy: thread.archivedAt === null && (runtimeActive || hasRunningDelegatedWork(thread)),
      thread,
    });
  }
  if (children.length === 0) return new Map();
  const parentKeyByChild = new Map(children.map((child) => [child.key, child.parentKey]));
  const work = new Map<
    string,
    { running: boolean; completedMs: number; completedAt: string | null }
  >();
  const entryFor = (key: string) => {
    let entry = work.get(key);
    if (entry === undefined) {
      entry = { running: false, completedMs: Number.NEGATIVE_INFINITY, completedAt: null };
      work.set(key, entry);
    }
    return entry;
  };
  for (const child of children) {
    const completedAt = child.thread.latestRun?.completedAt ?? null;
    const completedMs = child.busy || completedAt === null ? Number.NaN : Date.parse(completedAt);
    // Cycle-safe walk up through every listed ancestor, nearest first.
    const visited = new Set<string>([child.key]);
    for (
      let parent = parentKeyByChild.get(child.key);
      parent !== undefined && !visited.has(parent);
      parent = parentKeyByChild.get(parent)
    ) {
      visited.add(parent);
      const entry = entryFor(parent);
      if (child.busy) entry.running = true;
      if (!Number.isNaN(completedMs) && completedMs > entry.completedMs) {
        entry.completedMs = completedMs;
        entry.completedAt = completedAt;
      }
    }
  }
  return new Map(
    [...work].map(([key, { running, completedAt }]) => [key, { running, completedAt }]),
  );
}

export function descendantWorkOf(
  work: ReadonlyMap<string, ThreadDescendantWork> | undefined,
  thread: Pick<EnvironmentThreadShell, "environmentId" | "id">,
): ThreadDescendantWork {
  return work?.get(threadDescendantWorkKey(thread)) ?? NO_DESCENDANT_WORK;
}

/**
 * When the work the clock measures began. A live activity run's start wins, so a re-run (or a
 * wake continuing earlier work) resets or continues exactly as the server says; a parent
 * whose turn has ended falls back to the run that spawned the agents it still waits on.
 */
function workStartMs(thread: RunTimerThread, activityStartedAt: string | null): number | null {
  return parseMs(activityStartedAt) ?? latestRunStartMs(thread);
}

/**
 * When the whole run finished: the parent's own turn, or any agent delegated from it
 * (a child thread, or one the list saw wind down), whichever ended last. Completions that
 * predate the run's start belong to an earlier run and are ignored.
 */
export function resolveFullCompletionMs(input: {
  readonly thread: RunTimerThread;
  readonly descendantCompletedAt: string | null;
  readonly observedEndedAtMs: number | null;
}): number | null {
  const startMs = latestRunStartMs(input.thread);
  const candidates = [
    parseMs(input.thread.latestRun?.completedAt),
    parseMs(input.descendantCompletedAt),
    input.observedEndedAtMs,
  ].filter((ms): ms is number => ms !== null && (startMs === null || ms >= startMs));
  return candidates.length === 0 ? null : Math.max(...candidates);
}

export function resolveThreadRunTimer(input: {
  readonly thread: RunTimerThread;
  readonly status: ThreadListV2Status;
  readonly delegatedWorkRunning: boolean;
  /** `resolveThreadWorkingStartedAt(thread)`: the live activity run's start. */
  readonly activityStartedAt: string | null;
  readonly fullCompletionMs: number | null;
}): ThreadRunTimer | null {
  const { thread, status } = input;
  if (status === "working") {
    // A null/malformed activity timestamp must not hide a matching running run's clock.
    // Never reuse an older completed run while a new run is queued or starting.
    const startedAtMs =
      parseMs(input.activityStartedAt) ??
      (thread.latestRun?.status === "running" &&
      thread.latestRun.runId === thread.runtime?.activeRunId
        ? latestRunStartMs(thread)
        : null);
    return startedAtMs === null ? null : { phase: "running", startedAtMs, endedAtMs: null };
  }
  if (input.delegatedWorkRunning && (status === "waiting" || status === "ready")) {
    return {
      phase: "delegating",
      startedAtMs: workStartMs(thread, input.activityStartedAt),
      endedAtMs: null,
    };
  }
  if (status === "failed") {
    const endedAtMs = parseMs(thread.latestRun?.completedAt) ?? input.fullCompletionMs;
    // A terminal state must never subscribe to the live clock when its end is missing.
    return {
      phase: "failed",
      startedAtMs: endedAtMs === null ? null : latestRunStartMs(thread),
      endedAtMs,
    };
  }
  if (status !== "ready" || input.fullCompletionMs === null) return null;
  const runStatus = thread.latestRun?.status;
  const phase =
    runStatus === "completed"
      ? "done"
      : runStatus === "cancelled" || runStatus === "interrupted"
        ? "cancelled"
        : null;
  return phase === null
    ? null
    : { phase, startedAtMs: latestRunStartMs(thread), endedAtMs: input.fullCompletionMs };
}

/**
 * A row's run clock and the end of its whole run: the parent's own turn plus everything
 * delegated from it. `observedEndedAtMs` is `useObservedRunEnd`'s reading.
 */
export function resolveThreadRowRun(input: {
  readonly thread: RunTimerThread;
  readonly status: ThreadListV2Status;
  readonly delegatedWorkRunning: boolean;
  readonly descendantCompletedAt: string | null;
  readonly observedEndedAtMs: number | null;
  /** `resolveThreadWorkingStartedAt(thread)`. */
  readonly activityStartedAt: string | null;
}): { readonly fullCompletionMs: number | null; readonly timer: ThreadRunTimer | null } {
  const fullCompletionMs = resolveFullCompletionMs({
    thread: input.thread,
    descendantCompletedAt: input.descendantCompletedAt,
    observedEndedAtMs: input.observedEndedAtMs,
  });
  return {
    fullCompletionMs,
    timer: resolveThreadRunTimer({
      thread: input.thread,
      status: input.status,
      delegatedWorkRunning: input.delegatedWorkRunning,
      activityStartedAt: input.activityStartedAt,
      fullCompletionMs,
    }),
  };
}

/**
 * A thread whose agent is running animates its clock. A parent parked on delegated agents, or
 * whose subagents outlive its turn, is still busy; waiting for the user alone and attention
 * states (approval, input, failure) stay still.
 */
export function isThreadRunBusy(
  status: ThreadListV2Status,
  delegatedWorkRunning: boolean,
): boolean {
  return (
    status === "working" || (delegatedWorkRunning && (status === "waiting" || status === "ready"))
  );
}

export type ObservedRunPhase = "busy" | "ready" | "other";

export interface ObservedRunEnd {
  readonly phase: ObservedRunPhase;
  readonly hadBusy: boolean;
  readonly endedAtMs: number | null;
}

/**
 * Tracks the moment a row saw its thread go from busy (working, or parked on delegated
 * agents) to finished, which a provider-native subagent has no thread to report. Busy work
 * survives a detour through an attention state (approval, input) on its way to finishing,
 * and is spent once the finish is recorded. Call only when the phase changes.
 */
export function advanceObservedRunEnd(
  prev: ObservedRunEnd | null,
  phase: ObservedRunPhase,
  nowMs: number,
): ObservedRunEnd {
  if (prev === null) return { phase, hadBusy: phase === "busy", endedAtMs: null };
  const hadBusy = prev.hadBusy || prev.phase === "busy";
  if (phase === "ready" && hadBusy) return { phase, hadBusy: false, endedAtMs: nowMs };
  return { phase, hadBusy: phase === "busy" ? false : hadBusy, endedAtMs: null };
}
