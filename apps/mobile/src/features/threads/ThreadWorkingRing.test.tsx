import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
const h = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  setValue: vi.fn(),
  motion: null as null | ((value: boolean) => void),
  app: null as null | ((value: string) => void),
}));
vi.mock("react-native", () => ({
  View: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Animated: {
    View: () => <span data-testid="ring" />,
    Value: class {
      setValue = h.setValue;
      interpolate() {
        return "0deg";
      }
    },
    timing: vi.fn(),
    loop: () => ({ start: h.start, stop: h.stop }),
  },
  Easing: { linear: () => 0 },
  AppState: {
    currentState: "active",
    addEventListener: (_: string, callback: (state: string) => void) => {
      h.app = callback;
      return { remove: vi.fn() };
    },
  },
  AccessibilityInfo: {
    isReduceMotionEnabled: async () => false,
    addEventListener: (_: string, callback: (value: boolean) => void) => {
      h.motion = callback;
      return { remove: vi.fn() };
    },
  },
}));
import { ThreadWorkingRing } from "./ThreadWorkingRing";
it("stops motion for reduced motion, background, completion, and unmount", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  const render = async (busy: boolean) =>
    act(async () => {
      root.render(
        <ThreadWorkingRing busy={busy}>
          <span>logo</span>
        </ThreadWorkingRing>,
      );
    });
  try {
    await render(true);
    expect(h.start).toHaveBeenCalledTimes(1);
    act(() => h.motion?.(true));
    expect(h.stop).toHaveBeenCalledTimes(1);
    act(() => h.motion?.(false));
    expect(h.start).toHaveBeenCalledTimes(2);
    act(() => h.app?.("background"));
    expect(h.stop).toHaveBeenCalledTimes(2);
    act(() => h.app?.("active"));
    expect(h.start).toHaveBeenCalledTimes(3);
    await render(false);
    expect(h.stop).toHaveBeenCalledTimes(3);
    expect(container.querySelector('[data-testid="ring"]')).toBeNull();
    await render(true);
    act(() => root.unmount());
    expect(h.stop).toHaveBeenCalledTimes(4);
  } finally {
    vi.unstubAllGlobals();
  }
});
