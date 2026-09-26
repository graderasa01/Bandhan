import { LinearGradient } from "expo-linear-gradient";
import { Lock } from "lucide-react-native";
import { memo } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle } from "react-native-svg";
import type { PhotoLock } from "~/types/api";
import { initialsOf } from "~/utils/names";
import { Icon } from "./Icon";
import { Text } from "./Text";

/**
 * What stands in for a photo that is absent or gated — designed, not broken.
 * A warm gradient chosen from the name (stable per person), the initials in
 * the display face, and the brand's two rings as a watermark. When the photo
 * is gated, the one true reason is said underneath (D-90 wording, the same
 * sentence as the web's `photoLockLine`).
 */
const GRADIENTS: Array<readonly [string, string, string]> = [
  ["#7a1f2b", "#4a1119", "#2a0710"],
  ["#8e5a3c", "#5c3322", "#2e1a12"],
  ["#6b3a5e", "#44213c", "#221020"],
  ["#9a6b3f", "#6b4526", "#33200f"],
  ["#5e3552", "#3a2034", "#1e0f1b"],
  ["#8c2c38", "#5a1824", "#2d0b12"],
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export { initialsOf };

export const LOCK_LINE: Record<Exclude<PhotoLock, "open">, string> = {
  add_own_photo: "Apni photo lagayein — phir sabki photo dikhegi",
  match_only: "Photo mutual match hone par dikhegi",
};

export interface PhotoPlaceholderProps {
  name: string;
  lock?: PhotoLock;
  style?: StyleProp<ViewStyle>;
  /** Initials size — scales with the frame. */
  size?: "sm" | "md" | "lg";
  showLockLine?: boolean;
  /**
   * Height at the foot that text is laid over (a card's name block): the
   * initials centre in the space above it instead of disappearing under it.
   */
  insetBottom?: number;
}

export const PhotoPlaceholder = memo(function PhotoPlaceholder({
  name,
  lock = "open",
  style,
  size = "md",
  showLockLine = true,
  insetBottom = 0,
}: PhotoPlaceholderProps) {
  const colors = GRADIENTS[hash(name) % GRADIENTS.length]!;
  const fontSize = size === "lg" ? 64 : size === "md" ? 40 : 18;
  const locked = lock !== "open";
  return (
    <View style={[styles.fill, style]} accessibilityLabel={locked ? `${name}, photo locked` : `${name}, no photo yet`}>
      <LinearGradient colors={colors} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, styles.center, insetBottom > 0 && { bottom: insetBottom }]}>
        <Svg width="70%" height="70%" viewBox="0 0 40 40" style={styles.rings}>
          <Circle cx="16" cy="20" r="7.5" fill="none" stroke="#e8cf7a" strokeOpacity={0.14} strokeWidth="1.2" />
          <Circle cx="24" cy="20" r="7.5" fill="none" stroke="#e8cf7a" strokeOpacity={0.1} strokeWidth="1.2" />
        </Svg>
        <Text variant="display" style={{ fontSize, lineHeight: fontSize * 1.2, color: "rgba(255,241,211,0.88)" }} maxFontSizeMultiplier={1}>
          {initialsOf(name)}
        </Text>
        {locked && size !== "sm" ? (
          <View style={styles.lockRow}>
            <Icon icon={Lock} size={14} color="rgba(255,241,211,0.85)" />
            {showLockLine ? (
              <Text variant="small" style={styles.lockText} numberOfLines={2}>
                {LOCK_LINE[lock]}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  fill: { overflow: "hidden", backgroundColor: "#2a0710" },
  center: { alignItems: "center", justifyContent: "center" },
  rings: { position: "absolute" },
  lockRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, paddingHorizontal: 24 },
  lockText: { color: "rgba(255,241,211,0.85)", textAlign: "center", flexShrink: 1 },
});
