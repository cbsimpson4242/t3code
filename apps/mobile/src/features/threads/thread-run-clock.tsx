import { formatWorkingDurationLabel } from "@t3tools/client-runtime/state/models";
import { useState } from "react";

import {
  advanceObservedRunEnd,
  type ObservedRunEnd,
  type ObservedRunPhase,
  type ThreadRunTimer,
} from "./threadRunTimer";
import { useVisibleSecondClock } from "./use-visible-second-clock";

// Self-ticking so only this text re-renders each second, not the whole row; the shared tick
// lands every running row's update in the same frame.
function LiveRunDuration(props: { readonly startedAtMs: number }) {
  const nowMs = useVisibleSecondClock(true);
  return ` ${formatWorkingDurationLabel(nowMs - props.startedAtMs)}`;
}

/**
 * The run's elapsed time: counting while it runs, frozen at the final duration once it has
 * ended. A frozen clock never subscribes to the tick.
 */
export function ThreadRunDuration(props: { readonly timer: ThreadRunTimer }) {
  const { startedAtMs, endedAtMs } = props.timer;
  if (startedAtMs === null) return null;
  if (endedAtMs === null) return <LiveRunDuration startedAtMs={startedAtMs} />;
  return ` ${formatWorkingDurationLabel(endedAtMs - startedAtMs)}`;
}

interface ObservedRunEndState {
  readonly identity: string;
  readonly end: ObservedRunEnd;
}

/**
 * The moment this row saw its thread go from busy to finished; see advanceObservedRunEnd.
 * A row that mounts after the run ended, or a reload, falls back to the server's times.
 * Recycled list cells keep their component state, so the state follows `identity`.
 */
export function useObservedRunEnd(identity: string, busy: boolean, ready: boolean): number | null {
  const phase: ObservedRunPhase = busy ? "busy" : ready ? "ready" : "other";
  // The clock is read inside the updater: the compiler caches a bare `Date.now()` in render
  // once per instance. React discards this render and re-runs with the update.
  const advance = (prev: ObservedRunEndState | null): ObservedRunEndState => {
    const sameThread = prev !== null && prev.identity === identity;
    return {
      identity,
      end: advanceObservedRunEnd(sameThread ? prev.end : null, phase, Date.now()),
    };
  };
  const [state, setState] = useState<ObservedRunEndState>(() => advance(null));
  if (state.identity !== identity || state.end.phase !== phase) setState(advance);
  return state.identity === identity ? state.end.endedAtMs : null;
}
