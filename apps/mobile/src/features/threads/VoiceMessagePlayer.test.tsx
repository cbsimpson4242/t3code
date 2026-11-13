import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, it, expect, vi } from "vite-plus/test";
const m = vi.hoisted(() => ({
  status: {
    isLoaded: true,
    playing: false,
    isBuffering: false,
    didJustFinish: false,
    currentTime: 0,
    duration: 20,
    error: null as unknown,
  },
  failedAsset: false,
  callbacks: [] as ((state: string) => void)[],
  player: {
    setPlaybackRate: vi.fn(),
    seekTo: vi.fn(async () => {}),
    pause: vi.fn(),
    play: vi.fn(),
  },
  pause: vi.fn(),
  play: vi.fn(async (prepare?: () => Promise<void>) => {
    await prepare?.();
  }),
  saveSpeed: vi.fn(),
}));
vi.mock("react-native", async () => {
  const R = await import("react");
  return {
    View: ({ children, onLayout, onResponderRelease, ...props }: any) => {
      R.useEffect(() => onLayout?.({ nativeEvent: { layout: { width: 200 } } }), [onLayout]);
      return R.createElement(
        "div",
        {
          "aria-label": props.accessibilityLabel,
          onPointerUp: (event: any) =>
            onResponderRelease?.({ nativeEvent: { locationX: event.clientX } }),
        },
        children,
      );
    },
    Pressable: ({ children, onPress, disabled, accessibilityLabel, accessibilityState }: any) =>
      R.createElement(
        "button",
        {
          onClick: onPress,
          disabled,
          "aria-label": accessibilityLabel,
          "aria-pressed": accessibilityState?.selected,
        },
        children,
      ),
    ActivityIndicator: () => R.createElement("span", null, "Loading"),
    AppState: {
      addEventListener: (_name: string, callback: any) => {
        m.callbacks.push(callback);
        return { remove: vi.fn() };
      },
    },
  };
});
vi.mock("../../components/ui/AppText", () => ({
  AppText: ({ children }: any) => React.createElement("span", null, children),
}));
vi.mock("../../components/ui/AppSymbol", () => ({ SymbolView: () => null }));
vi.mock("uniwind", () => ({ useCSSVariable: () => "#888" }));
vi.mock("../../state/assets", () => ({
  useAssetUrlState: () =>
    m.failedAsset
      ? { _tag: "Failure" }
      : { _tag: "Success", url: "https://fixture.invalid/signed-audio" },
}));
vi.mock("../voice-input/usePlaybackAudioPlayer", () => ({
  usePlaybackAudioPlayer: () => m.player,
}));
vi.mock("expo-audio", () => ({ useAudioPlayerStatus: () => m.status }));
vi.mock("../../lib/audioSession", () => ({
  createAudioPlaybackSession: () => ({
    play: m.play,
    pause: m.pause,
    requested: false,
    playingChanged: vi.fn(),
  }),
}));
vi.mock("./voicePlaybackSpeed", () => ({ useVoicePlaybackSpeed: () => [1, m.saveSpeed] }));
import { VoiceMessagePlayer } from "./VoiceMessagePlayer";
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
async function mount() {
  await act(async () => {
    root.render(
      <VoiceMessagePlayer
        id="test"
        environmentId={"e" as any}
        threadId={"t" as any}
        path="/voice.ogg"
      />,
    );
  });
}
function button(name: string) {
  return container.querySelector(`button[aria-label="${name}"]`) as HTMLButtonElement;
}
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  m.status = {
    isLoaded: true,
    playing: false,
    isBuffering: false,
    didJustFinish: false,
    currentTime: 0,
    duration: 20,
    error: null,
  };
  m.failedAsset = false;
  m.callbacks = [];
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
describe("VoiceMessagePlayer", () => {
  it("renders and starts native session playback", async () => {
    await mount();
    await act(async () => button("Play voice message").click());
    expect(m.play).toHaveBeenCalledOnce();
    expect(m.player.setPlaybackRate).toHaveBeenCalledWith(1, "medium");
  });
  it("pauses playing audio", async () => {
    m.status.playing = true;
    await mount();
    await act(async () => button("Pause voice message").click());
    expect(m.pause).toHaveBeenCalled();
  });
  it("restarts a completed recording", async () => {
    m.status.didJustFinish = true;
    m.status.currentTime = 20;
    await mount();
    await act(async () => button("Play voice message").click());
    expect(m.player.seekTo).toHaveBeenCalledWith(0);
  });
  it("offers all speeds and saves the selected rate", async () => {
    await mount();
    await act(async () => button("Set voice playback speed to 1.5 times").click());
    expect(m.saveSpeed).toHaveBeenCalledWith(1.5);
  });
  it("pauses on background and cleanup", async () => {
    await mount();
    await act(async () => m.callbacks.at(-1)!("background"));
    expect(m.pause).toHaveBeenCalled();
    m.pause.mockClear();
    await act(async () => root.unmount());
    expect(m.pause).toHaveBeenCalled();
    root = createRoot(container);
  });
  it("does not enable playback before load", async () => {
    m.status.isLoaded = false;
    await mount();
    expect(button("Play voice message").disabled).toBe(true);
  });
  it("shows a retry control for an inaccessible asset", async () => {
    m.failedAsset = true;
    await mount();
    expect(container.textContent).toContain("Voice message unavailable");
    expect(button("Retry voice message")).toBeTruthy();
  });
  it("seeks on a scrub gesture", async () => {
    await mount();
    const view = container.querySelector('[aria-label="Voice message playback position"]')!;
    await act(async () =>
      view.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 100 })),
    );
    expect(m.player.seekTo).toHaveBeenCalledWith(10);
  });
});
