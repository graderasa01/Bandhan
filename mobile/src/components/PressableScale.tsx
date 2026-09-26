import { forwardRef, type ReactNode } from "react";
import { Pressable, View, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

/**
 * The press every tappable surface shares: a short spring down while the
 * finger is on it and a softer one back — felt more than seen. It runs on the
 * UI thread, and with the system's "reduce motion" on it simply does not move
 * (Reanimated honours that setting by default).
 */
const PRESS_IN = { damping: 20, stiffness: 420, mass: 0.6 } as const;
const PRESS_OUT = { damping: 14, stiffness: 240, mass: 0.7 } as const;

/**
 * For a surface whose press target is not the part that should move — a card
 * whose body opens a profile while a button inside it does something else:
 * put `style` on the moving wrapper, the handlers on the Pressable.
 */
export function usePressScale(scaleTo = 0.97) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return {
    style,
    // `set()` rather than `.value =`: the form the React Compiler can see is a shared value, not a prop being mutated.
    onPressIn: () => {
      scale.set(withSpring(scaleTo, PRESS_IN));
    },
    onPressOut: () => {
      scale.set(withSpring(1, PRESS_OUT));
    },
  };
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends Omit<PressableProps, "style" | "children"> {
  children?: ReactNode;
  /** A plain style — the scale is layered on top of it. */
  style?: StyleProp<ViewStyle>;
  /** How far it sinks — 0.97 for buttons, closer to 1 for big cards. */
  scaleTo?: number;
}

/** A Pressable that sinks under the finger. Layout and look stay the caller's. */
export const PressableScale = forwardRef<View, PressableScaleProps>(function PressableScale(
  { children, style, scaleTo = 0.97, onPressIn, onPressOut, disabled, ...rest },
  ref,
) {
  const press = usePressScale(scaleTo);
  return (
    <AnimatedPressable
      ref={ref}
      {...rest}
      disabled={disabled}
      onPressIn={(e: GestureResponderEvent) => {
        if (!disabled) press.onPressIn();
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        press.onPressOut();
        onPressOut?.(e);
      }}
      style={[style, press.style]}
    >
      {children}
    </AnimatedPressable>
  );
});
