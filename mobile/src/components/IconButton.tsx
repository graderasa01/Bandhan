import { BlurView } from "expo-blur";
import type { LucideIcon } from "lucide-react-native";
import { memo } from "react";
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "~/theme";
import { haptics } from "~/utils/haptics";
import { Icon } from "./Icon";
import { Text } from "./Text";

export interface IconButtonProps {
  icon: LucideIcon;
  onPress?: () => void;
  /** Required — an icon alone says nothing to a screen reader. */
  label: string;
  size?: number;
  /** "glass" (default), "accent" (filled), "photo" (smoked, over pictures). */
  variant?: "glass" | "accent" | "photo" | "plain";
  badge?: number;
  active?: boolean;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}

/** A round icon control with a 44pt+ target, optional count badge. */
export const IconButton = memo(function IconButton({
  icon,
  onPress,
  label,
  size = 44,
  variant = "glass",
  badge,
  active,
  style,
  disabled,
}: IconButtonProps) {
  const t = useTheme();
  const glassBody = Platform.OS === "android" ? t.glass.android.glassSoft : t.colors.glassSoft;
  const bg =
    variant === "accent" ? t.colors.accent
    : variant === "photo" ? "rgba(20,10,12,0.42)"
    : variant === "plain" ? "transparent"
    : active ? t.colors.accentSoft : glassBody;
  const iconColor =
    variant === "accent" ? t.colors.accentFg
    : variant === "photo" ? t.colors.onPhoto
    : active ? (t.dark ? t.colors.gold : t.colors.heading)
    : t.colors.text;
  const blur = Platform.OS === "ios" && variant !== "accent" && variant !== "plain" && (t.glass.blurIntensity > 0 || variant === "photo");

  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        haptics.select();
        onPress?.();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected: !!active }}
      hitSlop={6}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: size / 2, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 },
        style,
      ]}
    >
      <View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: variant === "plain" ? "transparent" : variant === "photo" ? "rgba(255,255,255,0.35)" : active ? t.colors.gold : t.colors.rim,
          },
        ]}
      >
        {/* The layers sit *under* the glyph (zIndex -1 in the circle's own
            stacking context): on the web a positioned layer otherwise paints
            over an unpositioned icon — invisible wherever the body is opaque,
            as on Classic's paper. The same rule GlassSurface follows. */}
        {blur ? <BlurView intensity={variant === "photo" ? 30 : t.glass.blurIntensity} tint="dark" style={[StyleSheet.absoluteFill, styles.under]} /> : null}
        <View style={[StyleSheet.absoluteFill, styles.under, { backgroundColor: bg }]} />
        <Icon icon={icon} size={Math.round(size * 0.46)} color={iconColor} />
      </View>
      {badge ? (
        <View style={[styles.badge, { backgroundColor: t.colors.accent, borderColor: t.colors.sheet }]}>
          <Text variant="caption" style={{ color: t.colors.accentFg, fontSize: 10.5 }} maxFontSizeMultiplier={1}>
            {badge > 99 ? "99+" : badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  circle: { alignItems: "center", justifyContent: "center", overflow: "hidden", borderWidth: 1, zIndex: 0 },
  under: { zIndex: -1 },
  badge: {
    position: "absolute",
    top: -3,
    right: -3,
    minWidth: 19,
    height: 19,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
});
