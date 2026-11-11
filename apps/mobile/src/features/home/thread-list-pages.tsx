import { Pressable, View } from "react-native";
import { usePanGesture } from "react-native-gesture-handler";
import {
  Easing,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { AppText } from "../../components/ui/AppText";
import { cn } from "../../lib/cn";
import type { ThreadListV2Page } from "../threads/threadListV2";

const PAGE_SWITCH_DISTANCE = 64;
const PAGE_SWITCH_VELOCITY = 600;
const PAGE_ENTER_OFFSET = 48;
const PAGE_TIMING = {
  duration: 220,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.System,
};
const PAGE_LABEL = { pinned: "Pinned", threads: "Threads" } as const;
const PAGE_ORDER: ReadonlyArray<ThreadListV2Page> = ["pinned", "threads"];

/**
 * Pages the phone thread list between Pinned (left) and Threads (right). A horizontal
 * swipe toward the other page switches to it; vertical pans fail so the list still scrolls.
 */
export function useThreadListPageSwipe(options: {
  readonly page: ThreadListV2Page;
  readonly enabled: boolean;
  readonly onPageChange: (page: ThreadListV2Page) => void;
}) {
  const translation = useSharedValue(0);
  const opacity = useSharedValue(1);
  const { onPageChange, page } = options;
  const showPage = (next: ThreadListV2Page) => {
    if (next === page) return;
    onPageChange(next);
    // Pinned sits left of Threads, so it enters from the left and Threads from the right.
    translation.set(
      withSequence(
        withTiming(next === "pinned" ? -PAGE_ENTER_OFFSET : PAGE_ENTER_OFFSET, { duration: 0 }),
        withTiming(0, PAGE_TIMING),
      ),
    );
    opacity.set(withSequence(withTiming(0.35, { duration: 0 }), withTiming(1, PAGE_TIMING)));
  };
  // A rightward swipe reveals Pinned from Threads; a leftward one reveals Threads from Pinned.
  const toward = page === "threads" ? 1 : -1;
  const target: ThreadListV2Page = page === "threads" ? "pinned" : "threads";
  const gesture = usePanGesture({
    enabled: options.enabled,
    activeOffsetX: [-20, 20],
    failOffsetY: [-14, 14],
    onUpdate: (event) => {
      const forward = event.translationX * toward;
      // Follow the finger toward the other page; resist the other way, where no page is.
      translation.set(event.translationX * (forward > 0 ? 0.4 : 0.1));
    },
    onDeactivate: (event) => {
      const forward = event.translationX * toward;
      if (
        !event.canceled &&
        forward > 0 &&
        (forward > PAGE_SWITCH_DISTANCE || event.velocityX * toward > PAGE_SWITCH_VELOCITY)
      ) {
        runOnJS(showPage)(target);
      } else {
        translation.set(withTiming(0, PAGE_TIMING));
      }
    },
  });
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translation.value }],
  }));
  return { gesture, animatedStyle, showPage };
}

export function ThreadListPageTabs(props: {
  readonly page: ThreadListV2Page;
  readonly pinnedCount: number;
  readonly threadsCount: number;
  readonly horizontalInset: number;
  readonly onSelect: (page: ThreadListV2Page) => void;
}) {
  return (
    <View
      accessibilityRole="tablist"
      className="mt-3 mb-1 flex-row rounded-full bg-header p-1"
      style={{ marginHorizontal: 16 + props.horizontalInset }}
    >
      {PAGE_ORDER.map((page) => {
        const selected = props.page === page;
        const label = PAGE_LABEL[page];
        const count = page === "pinned" ? props.pinnedCount : props.threadsCount;
        return (
          <Pressable
            key={page}
            accessibilityRole="tab"
            accessibilityLabel={`${label}, ${count} ${count === 1 ? "thread" : "threads"}`}
            accessibilityHint="Swipe left or right on the list to switch between pinned and other threads."
            accessibilityState={{ selected }}
            onPress={() => props.onSelect(page)}
            className={cn(
              "flex-1 flex-row items-center justify-center gap-1.5 rounded-full px-3",
              selected && "bg-screen",
            )}
            style={{ minHeight: 40 }}
          >
            <AppText
              className={cn(
                "text-sm",
                selected ? "font-semibold text-foreground" : "text-foreground-muted",
              )}
            >
              {label}
            </AppText>
            <AppText className="text-xs tabular-nums text-foreground-tertiary">{count}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
