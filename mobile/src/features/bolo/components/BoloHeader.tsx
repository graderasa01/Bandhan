import { memo, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { Text } from "~/components";
import { useSvgId } from "~/hooks/useSvgId";
import { fonts, useTheme } from "~/theme";

/**
 * Bolo's whole chrome — the mark, and how far the profile has come as eight
 * beads (the web's `BoloHeader`). The tile is drawn here rather than by
 * BrandMark: on this ground the seal is a deeper wine and the rings brighter.
 */
export const BoloHeader = memo(function BoloHeader({ done, total }: { done: number; total: number }) {
  const t = useTheme();
  const foil = useSvgId("bolo-ring");
  const paper = t.material.kind === "paper";

  return (
    <View style={styles.row}>
      <View style={styles.brand} accessibilityRole="header" accessibilityLabel="BandhanTak">
        <View style={[styles.tile, paper && styles.tilePaper]}>
          <Svg width={34} height={34} viewBox="0 0 34 34">
            <Defs>
              <LinearGradient id={foil} x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#ffe6b0" />
                <Stop offset="0.45" stopColor="#f5c04e" />
                <Stop offset="1" stopColor="#d2932a" />
              </LinearGradient>
            </Defs>
            <Circle cx="13.6" cy="17" r="6.2" fill="none" stroke={`url(#${foil})`} strokeWidth="2" />
            <Circle cx="20.4" cy="17" r="6.2" fill="none" stroke={`url(#${foil})`} strokeWidth="2" opacity={0.85} />
          </Svg>
        </View>
        <Text style={[styles.word, { color: t.colors.heading }]} maxFontSizeMultiplier={1.1}>
          Bandhan<Text style={{ color: t.colors.gold, fontFamily: fonts.display }}>Tak</Text>
        </Text>
      </View>

      <View
        style={styles.progress}
        accessibilityRole="progressbar"
        accessibilityLabel="Profile progress"
        accessibilityValue={{ min: 0, max: total, now: done }}
      >
        <Text variant="smallStrong" style={{ color: t.colors.text, fontVariant: ["tabular-nums"] }} maxFontSizeMultiplier={1.1}>
          {done}/{total}
        </Text>
        <View style={styles.beads}>
          {Array.from({ length: total }, (_, i) => (
            <Bead key={i} on={i < done} />
          ))}
        </View>
      </View>
    </View>
  );
});

/** One bead: the ivory hairline off, the room's gold on — with a small pop the moment it lights. */
const Bead = memo(function Bead({ on }: { on: boolean }) {
  const t = useTheme();
  const scale = useSharedValue(1);
  useEffect(() => {
    if (on) scale.value = withSequence(withTiming(1.6, { duration: 140 }), withSpring(1, { damping: 9, stiffness: 220 }));
  }, [on, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const paper = t.material.kind === "paper";
  return (
    <Animated.View
      style={[
        styles.bead,
        style,
        on
          ? { backgroundColor: t.colors.gold, boxShadow: paper ? undefined : `0px 0px 8px ${t.colors.gold}` }
          : { backgroundColor: paper ? "rgba(122,31,43,0.16)" : "rgba(255,244,226,0.26)" },
      ]}
    />
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 8, paddingRight: 4 },
  brand: { flexDirection: "row", alignItems: "center", gap: 11, flex: 1 },
  tile: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#5a0b18",
    boxShadow: "inset 0px 1px 0px rgba(255,206,190,0.22), 0px 0px 0px 1px rgba(238,178,150,0.4), 0px 6px 16px -10px rgba(0,0,0,0.9)",
  },
  tilePaper: { backgroundColor: "#6d0c1c", boxShadow: "0px 0px 0px 1px rgba(201,169,110,0.6), 0px 6px 14px -10px rgba(74,17,25,0.5)" },
  word: { fontFamily: fonts.display, fontSize: 18.5, lineHeight: 22, letterSpacing: -0.3 },
  progress: { alignItems: "flex-end", gap: 6 },
  beads: { flexDirection: "row", gap: 5 },
  bead: { width: 7, height: 7, borderRadius: 4 },
});
