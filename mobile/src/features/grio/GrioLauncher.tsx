import { LinearGradient } from "expo-linear-gradient";
import { memo, useEffect } from "react";
import { Pressable, StyleSheet } from "react-native";
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Appear, GrioSeal } from "~/components";
import { useTheme } from "~/theme";
import { haptics } from "~/utils/haptics";
import type { GrioEntry } from "./engine/types";
import { useGrioScreen, useOpenGrio } from "./GrioProvider";
import { useLauncherHidden } from "./launcherScroll";

/**
 * Grio's one always-present door on the tabs — a seal floating just above the
 * tab bar, in the room's accent. It opens Grio with whatever the screen under
 * it is about (Home: the day; Search: the member's filters). It never covers a
 * fixed control: it sits above the bar, the tab screens leave room for it at
 * their foot (`layout.tabBarClearance`), it hides while the keyboard is up
 * and while a list is being read downward (`launcherScroll.ts`), and the
 * Reels tab — whose card has its own "Ask Grio" — does not show it.
 */
export const GrioLauncher = memo(function GrioLauncher({ bottom, fallback }: { bottom: number; fallback: GrioEntry }) {
  const t = useTheme();
  const openGrio = useOpenGrio();
  const published = useGrioScreen((s) => s.entry);
  const hidden = useLauncherHidden((s) => s.hidden);
  const shown = useSharedValue(1);
  useEffect(() => {
    shown.set(withTiming(hidden ? 0 : 1, { duration: 180, reduceMotion: ReduceMotion.System }));
  }, [hidden, shown]);
  const fade = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * 18 }, { scale: 0.85 + 0.15 * shown.value }],
  }));
  return (
    <Appear from="pop" style={[styles.slot, { bottom }]}>
      <Animated.View
        style={fade}
        pointerEvents={hidden ? "none" : "auto"}
        accessibilityElementsHidden={hidden}
        importantForAccessibility={hidden ? "no-hide-descendants" : "auto"}
      >
      <Pressable
        onPress={() => {
          haptics.tap();
          openGrio(published ?? fallback);
        }}
        accessibilityRole="button"
        accessibilityLabel="Open Grio"
        accessibilityHint="Grio se poochhiye ya kahiye — aaj ke rishtey, messages, profile"
        hitSlop={6}
        style={({ pressed }) => [styles.button, { shadowColor: t.colors.shadow, transform: [{ scale: pressed ? 0.94 : 1 }] }]}
      >
        <LinearGradient
          colors={t.gradients.accent}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.disc, { borderColor: t.dark ? "rgba(255,236,200,0.45)" : t.colors.gold }]}
        >
          <GrioSeal size={42} />
        </LinearGradient>
      </Pressable>
      </Animated.View>
    </Appear>
  );
});

const SIZE = 56;

const styles = StyleSheet.create({
  slot: { position: "absolute", right: 16 },
  button: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  disc: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, alignItems: "center", justifyContent: "center", borderWidth: 1.2 },
});
