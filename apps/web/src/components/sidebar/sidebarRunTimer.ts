import type { SidebarThreadSummary } from "../../types";
import type { SidebarThreadStatus } from "../Sidebar.logic";

// `delegating` is a parent parked on, or past its turn but still waiting for, agents it started.
// Approval, input and guest requests carry no timer: their label says what the thread needs,
// and the same run clock carries on when the agent resumes.
export type SidebarRunTimerPhase = "running" | "delegating" | "done" | "cancelled" | "failed";

export interface SidebarRunTimer {
  readonly phase: SidebarRunTimerPhase;
  /** Epoch ms the run's clock started, or null when the shell carries no usable start. */
  readonly startedAtMs: number | null;
  /** Epoch ms the run fully finished; null while it is still going. */
  readonly endedAtMs: number | null;
}

type RunTimerThread = Pick<SidebarThreadSummary, "latestRun" | "runtime">;

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
 * When the work the clock measures began. A live activity run's start wins, so a re-run (or a
 * wake continuing earlier work) resets or continues exactly as the server says; a parent
 * whose turn has ended falls back to the run that spawned the agents it still waits on.
 */
function workStartMs(thread: RunTimerThread, activityStartedAt: string | null): number | null {
  return parseMs(activityStartedAt) ?? latestRunStartMs(thread);
}

/**
 * When the whole run finished: the parent's own turn, or any agent delegated from it
 * (a child thread, or one the sidebar saw wind down), whichever ended last. Completions that
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

export function resolveSidebarRunTimer(input: {
  readonly thread: RunTimerThread;
  readonly status: SidebarThreadStatus;
  readonly delegatedWorkRunning: boolean;
  /** `resolveWorkingStartedAt(thread)`: the live activity run's start. */
  readonly activityStartedAt: string | null;
  readonly fullCompletionMs: number | null;
  /** Whether to display the completed run result independently of its unread state. */
  readonly showFinished: boolean;
}): SidebarRunTimer | null {
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
  if (status !== "ready" || !input.showFinished || input.fullCompletionMs === null) return null;
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
