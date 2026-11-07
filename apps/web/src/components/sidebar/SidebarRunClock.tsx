import { formatWorkingDurationLabel } from "@t3tools/client-runtime/state/models";
import { useState } from "react";

import { useNowSecond } from "../../hooks/useNowSecond";
import {
  advanceObservedRunEnd,
  type ObservedRunEnd,
  type ObservedRunPhase,
  type SidebarRunTimer,
} from "./sidebarRunTimer";

// Self-ticking so only this span re-renders each second, not the whole row; the shared
// tick lands every running row's update in the same frame.
function LiveRunDuration(props: { startedAtMs: number }) {
  const nowMs = useNowSecond();
  return (
    <span className="tabular-nums">{formatWorkingDurationLabel(nowMs - props.startedAtMs)}</span>
  );
}

/**
 * The run's elapsed time: counting while it runs, frozen at the final duration once it has
 * ended. A frozen clock never subscribes to the tick.
 */
export function SidebarRunDuration(props: { timer: SidebarRunTimer }) {
  const { startedAtMs, endedAtMs } = props.timer;
  if (startedAtMs === null) return null;
  if (endedAtMs === null) return <LiveRunDuration startedAtMs={startedAtMs} />;
  return (
    <span className="tabular-nums">{formatWorkingDurationLabel(endedAtMs - startedAtMs)}</span>
  );
}

/**
 * The moment this row saw its thread go from busy to finished; see advanceObservedRunEnd.
 * A row that mounts after the run ended, or a reload, falls back to the server's times.
 */
export function useObservedRunEnd(busy: boolean, ready: boolean): number | null {
  const phase: ObservedRunPhase = busy ? "busy" : ready ? "ready" : "other";
  // The clock is read inside the updater: the compiler caches a bare `Date.now()` in render
  // once per instance. React discards this render and re-runs with the update.
  const advance = (prev: ObservedRunEnd | null) => advanceObservedRunEnd(prev, phase, Date.now());
  const [state, setState] = useState<ObservedRunEnd>(() => advance(null));
  if (state.phase !== phase) setState(advance);
  return state.endedAtMs;
}
