import { memo, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useTheme } from "~/theme";

/**
 * The frame the whole conversation is written in — the web's `.bolo-shell`:
 * not a pane (the room stays unveiled between the cards) but the device's
 * bright rim and a bloom around it that brightens while the microphone is
 * open. On Classic it is the invitation card's gold border instead.
 */
export const BoloShell = memo(function BoloShell({ voice }: { voice: "idle" | "connecting" | "listening" | "speaking" }) {
  const t = useTheme();
  const paper = t.material.kind === "paper";
  const bloom = useSharedValue(0.4);
  useEffect(() => {
    bloom.value = withTiming(voice === "speaking" ? 1 : voice === "listening" ? 0.8 : voice === "connecting" ? 0.68 : 0.4, { duration: 620 });
  }, [bloom, voice]);
  const glow = useAnimatedStyle(() => ({ opacity: bloom.value }));

  if (paper) {
    return (
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.paper, { borderColor: "rgba(201,169,110,0.7)" }]}>
        <View style={[StyleSheet.absoluteFill, styles.paperInner, { borderColor: "rgba(201,169,110,0.35)" }]} />
      </View>
    );
  }

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.bloom, glow]} />
      <View
        style={[
          StyleSheet.absoluteFill,
          styles.rim,
          {
            backgroundColor: t.photo ? "rgba(255,255,255,0.03)" : "rgba(118,103,92,0.06)",
            borderTopColor: "rgba(255,236,190,0.9)",
            borderLeftColor: "rgba(244,202,122,0.72)",
            borderRightColor: "rgba(208,158,78,0.5)",
            borderBottomColor: "rgba(255,228,172,0.68)",
          },
        ]}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  rim: { borderRadius: 26, borderWidth: 1.2, boxShadow: "0px 30px 60px -30px rgba(4,3,14,0.7)" },
  bloom: { borderRadius: 26, boxShadow: "0px 0px 26px 0px rgba(255,226,170,0.28), 0px 0px 70px 0px rgba(226,158,62,0.16)" },
  paper: { borderRadius: 22, borderWidth: 1.2 },
  paperInner: { top: 5, left: 5, right: 5, bottom: 5, borderRadius: 17, borderWidth: 1 },
});
