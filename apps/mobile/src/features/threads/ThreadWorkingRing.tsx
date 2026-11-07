import { memo, useEffect, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, AppState, Easing, View } from "react-native";

export const ThreadWorkingRing = memo(function ThreadWorkingRing(props: {
  readonly busy: boolean;
  readonly children: ReactNode;
}) {
  const [rotation] = useState(() => new Animated.Value(0));
  const [reduced, setReduced] = useState(true);
  const [active, setActive] = useState(AppState.currentState === "active");
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- subscribes to native accessibility and app lifecycle
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReduced(value);
    });
    const motion = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    const app = AppState.addEventListener("change", (state) => setActive(state === "active"));
    return () => {
      mounted = false;
      motion.remove();
      app.remove();
    };
  }, []);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- owns a native-driver animation and cancels it on background, completion, or unmount
  useEffect(() => {
    if (!props.busy || reduced || !active) {
      rotation.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: true,
        isInteraction: false,
      }),
    );
    animation.start();
    return () => {
      animation.stop();
      rotation.setValue(0);
    };
  }, [props.busy, reduced, active, rotation]);
  return (
    <View style={{ width: 52, height: 52, alignItems: "center", justifyContent: "center" }}>
      {props.busy ? (
        <Animated.View
          pointerEvents="none"
          testID="thread-working-ring"
          style={{
            position: "absolute",
            width: 52,
            height: 52,
            borderRadius: 26,
            borderWidth: 2,
            borderColor: "#38bdf8",
            borderRightColor: "transparent",
            transform: [
              {
                rotate: rotation.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0deg", "360deg"],
                }),
              },
            ],
          }}
        />
      ) : null}
      {props.children}
    </View>
  );
});
