import { memo, useEffect, type ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";

const EASE = Easing.bezier(0.22, 1, 0.36, 1);

/**
 * Something arriving on screen: a fade with a short travel (or a small pop),
 * on mount. Plain shared values, so the element never leaves the layout while
 * it animates — the thing below it does not jump — on every platform alike.
 * Remount it (a new `key`) to play it again. Still under "reduce motion".
 */
export const Appear = memo(function Appear({
  children,
  from = "below",
  distance = 12,
  delay = 0,
  duration = 320,
  style,
}: {
  children?: ReactNode;
  from?: "below" | "above" | "right" | "pop" | "none";
  distance?: number;
  delay?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value =
      from === "pop"
        ? withDelay(delay, withSpring(1, { damping: 12, stiffness: 220, reduceMotion: ReduceMotion.System }))
        : withDelay(delay, withTiming(1, { duration, easing: EASE, reduceMotion: ReduceMotion.System }));
  }, [delay, duration, from, v]);
  const animated = useAnimatedStyle(() => {
    const rest = 1 - v.value;
    return {
      opacity: Math.min(1, v.value * 1.4),
      transform: [
        { translateY: from === "below" ? rest * distance : from === "above" ? -rest * distance : 0 },
        { translateX: from === "right" ? rest * distance : 0 },
        { scale: from === "pop" ? 0.6 + 0.4 * v.value : 1 },
      ],
    };
  });
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
});
