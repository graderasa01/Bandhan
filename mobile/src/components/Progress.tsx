import { LinearGradient } from "expo-linear-gradient";
import { memo, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient as SvgLinear, Stop } from "react-native-svg";
import { useSvgId } from "~/hooks/useSvgId";
import { radius, useTheme } from "~/theme";
import { Text } from "./Text";

/** Profile completion, match ring — a gold arc on a hairline track. */
export const ProgressRing = memo(function ProgressRing({
  percent,
  size = 64,
  stroke = 6,
  children,
  label,
}: {
  percent: number;
  size?: number;
  stroke?: number;
  children?: ReactNode;
  label?: string;
}) {
  const t = useTheme();
  const foil = useSvgId("ring-foil");
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  return (
    <View
      style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: clamped }}
      accessibilityLabel={label}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgLinear id={foil} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#f3dd8f" />
            <Stop offset="0.5" stopColor="#d4af37" />
            <Stop offset="1" stopColor="#a8822c" />
          </SvgLinear>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={t.colors.hairline} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={`url(#${foil})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children ?? (
        <Text variant="smallStrong" tone="heading" maxFontSizeMultiplier={1}>
          {clamped}%
        </Text>
      )}
    </View>
  );
});

export const ProgressBar = memo(function ProgressBar({ percent, height = 6 }: { percent: number; height?: number }) {
  const t = useTheme();
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <View
      style={[styles.track, { height, backgroundColor: t.colors.hairline }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
    >
      <LinearGradient
        colors={t.gradients.foil}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ width: `${clamped}%`, height, borderRadius: radius.pill }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  track: { width: "100%", borderRadius: radius.pill, overflow: "hidden" },
});
