import { secondTick } from "@t3tools/client-runtime/clock";
import { act, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("./use-visible-second-clock", () => ({
  // The real hook also gates on navigation focus and app state; the tick is the same.
  useVisibleSecondClock: () =>
    useSyncExternalStore(secondTick.subscribe, secondTick.getSnapshot, secondTick.getSnapshot),
}));

import { ThreadRunDuration, useObservedRunEnd } from "./thread-run-clock";

const START = Date.UTC(2026, 2, 9, 10, 0, 0);

function mount(element: () => React.ReactNode) {
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => root.render(element()));
  return {
    container,
    render: (next: () => React.ReactNode) => act(() => root.render(next())),
    [Symbol.dispose]: () => act(() => root.unmount()),
  };
}

describe("ThreadRunDuration", () => {
  it("ticks each second while running and stays frozen once the run has ended", () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    using _globals = { [Symbol.dispose]: () => vi.unstubAllGlobals() };
    using _timers = { [Symbol.dispose]: () => vi.useRealTimers() };
    vi.useFakeTimers({ now: START + 4_000 });
    const text = (view: ReturnType<typeof mount>) => view.container.textContent;

    using view = mount(() => (
      <span>
        <ThreadRunDuration timer={{ phase: "running", startedAtMs: START, endedAtMs: null }} />
      </span>
    ));
    expect(text(view)).toBe(" 4s");
    act(() => vi.advanceTimersByTime(3_000));
    expect(text(view)).toBe(" 7s");

    view.render(() => (
      <span>
        <ThreadRunDuration
          timer={{ phase: "done", startedAtMs: START, endedAtMs: START + 7_000 }}
        />
      </span>
    ));
    expect(text(view)).toBe(" 7s");
    act(() => vi.advanceTimersByTime(60_000));
    expect(text(view)).toBe(" 7s");
    // Nothing is left ticking for a finished run.
    expect(vi.getTimerCount()).toBe(0);

    // The next run starts again from zero, never from the old duration.
    act(() => vi.setSystemTime(START + 200_000));
    view.render(() => (
      <span>
        <ThreadRunDuration
          timer={{ phase: "running", startedAtMs: START + 200_000, endedAtMs: null }}
        />
      </span>
    ));
    expect(text(view)).toBe(" 0s");
    act(() => vi.advanceTimersByTime(2_000));
    expect(text(view)).toBe(" 2s");
  });

  it("renders nothing for a clock with no usable start", () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    using _globals = { [Symbol.dispose]: () => vi.unstubAllGlobals() };
    using view = mount(() => (
      <span>
        <ThreadRunDuration timer={{ phase: "failed", startedAtMs: null, endedAtMs: null }} />
      </span>
    ));
    expect(view.container.textContent).toBe("");
  });
});

describe("useObservedRunEnd", () => {
  function Probe(props: { identity: string; busy: boolean; ready: boolean }) {
    const endedAtMs = useObservedRunEnd(props.identity, props.busy, props.ready);
    return <span>{endedAtMs === null ? "none" : String(endedAtMs)}</span>;
  }

  it("records when a row sees its thread finish, and forgets it for a recycled row", () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    using _globals = { [Symbol.dispose]: () => vi.unstubAllGlobals() };
    using _timers = { [Symbol.dispose]: () => vi.useRealTimers() };
    vi.useFakeTimers({ now: START });
    using view = mount(() => <Probe identity="a" busy ready={false} />);
    expect(view.container.textContent).toBe("none");

    act(() => vi.setSystemTime(START + 9_000));
    view.render(() => <Probe identity="a" busy={false} ready />);
    expect(view.container.textContent).toBe(String(START + 9_000));

    // The cell is recycled for another thread that was already done: nothing was observed.
    view.render(() => <Probe identity="b" busy={false} ready />);
    expect(view.container.textContent).toBe("none");

    // A new run for the first thread spends the old finish.
    view.render(() => <Probe identity="a" busy ready={false} />);
    expect(view.container.textContent).toBe("none");
  });
});
