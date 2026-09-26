import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import type { LucideIcon } from "lucide-react-native";
import { memo } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { radius, useTheme } from "~/theme";
import { haptics } from "~/utils/haptics";
import { Icon } from "./Icon";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

type Size = "lg" | "md" | "sm";

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  /** Tactile tick on press — on for decisions, off for plain navigation. */
  haptic?: boolean;
}

const HEIGHT: Record<Size, number> = { lg: 54, md: 46, sm: 38 };

/**
 * The one filled action on a screen — the room's accent (wine on the glass
 * rooms, a gold plate on Classic, champagne at Night). Labels are short plain
 * English ("Send Interest", "Continue"), as the rest of the product.
 */
export const PrimaryButton = memo(function PrimaryButton({
  label,
  onPress,
  icon,
  iconRight,
  size = "lg",
  loading,
  disabled,
  fullWidth = true,
  style,
  accessibilityHint,
  haptic = true,
}: ButtonProps) {
  const t = useTheme();
  const inactive = disabled || loading;
  return (
    <PressableScale
      disabled={!!inactive}
      onPress={() => {
        if (haptic) haptics.tap();
        onPress?.();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      style={[
        styles.base,
        { height: HEIGHT[size], borderRadius: size === "sm" ? radius.sm : radius.md },
        fullWidth && styles.full,
        { opacity: disabled ? 0.5 : 1 },
        {
          shadowColor: t.colors.accentDeep,
          shadowOpacity: t.dark ? 0.45 : 0.25,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 3,
        },
        style,
      ]}
    >
      <LinearGradient
        colors={t.gradients.accent}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: size === "sm" ? radius.sm : radius.md }]}
      />
      <View style={[styles.rim, { borderRadius: size === "sm" ? radius.sm : radius.md, borderColor: t.dark ? "rgba(255,236,200,0.35)" : "rgba(128,102,52,0.35)" }]} />
      {loading ? (
        <ActivityIndicator color={t.colors.accentFg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon icon={icon} size={size === "sm" ? 16 : 19} color={t.colors.accentFg} /> : null}
          <Text variant={size === "sm" ? "buttonSmall" : "button"} style={{ color: t.colors.accentFg }} numberOfLines={1}>
            {label}
          </Text>
          {iconRight ? <Icon icon={iconRight} size={size === "sm" ? 16 : 19} color={t.colors.accentFg} /> : null}
        </View>
      )}
    </PressableScale>
  );
});

/** The quieter action — a glass control on the dark rooms, a wine outline on Classic. */
export const SecondaryButton = memo(function SecondaryButton({
  label,
  onPress,
  icon,
  iconRight,
  size = "lg",
  loading,
  disabled,
  fullWidth = true,
  style,
  accessibilityHint,
  haptic = false,
}: ButtonProps) {
  const t = useTheme();
  const inactive = disabled || loading;
  const r = size === "sm" ? radius.sm : radius.md;
  const blur = Platform.OS === "ios" && t.glass.blurIntensity > 0;
  return (
    <PressableScale
      disabled={!!inactive}
      onPress={() => {
        if (haptic) haptics.tap();
        onPress?.();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      style={[
        styles.base,
        { height: HEIGHT[size], borderRadius: r, overflow: "hidden" },
        fullWidth && styles.full,
        { opacity: disabled ? 0.5 : 1 },
        style,
      ]}
    >
      {blur ? <BlurView intensity={t.glass.blurIntensity} tint={t.glass.blurTint} style={StyleSheet.absoluteFill} /> : null}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: r,
            backgroundColor: t.dark ? (Platform.OS === "android" ? t.glass.android.glassSoft : t.colors.glassSoft) : "transparent",
            borderWidth: 1.2,
            borderColor: t.dark ? t.colors.rim : t.colors.heading,
          },
        ]}
      />
      {loading ? (
        <ActivityIndicator color={t.dark ? t.colors.text : t.colors.heading} />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon icon={icon} size={size === "sm" ? 16 : 19} tone="heading" /> : null}
          <Text variant={size === "sm" ? "buttonSmall" : "button"} tone="heading" numberOfLines={1}>
            {label}
          </Text>
          {iconRight ? <Icon icon={iconRight} size={size === "sm" ? 16 : 19} tone="heading" /> : null}
        </View>
      )}
    </PressableScale>
  );
});

/** A text-only action (links, "Skip for now"). */
export const GhostButton = memo(function GhostButton({ label, onPress, icon, disabled, style, size = "md" }: ButtonProps) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [styles.ghost, { minHeight: size === "sm" ? 32 : 44, opacity: disabled ? 0.5 : pressed ? 0.6 : 1 }, style]}
    >
      <View style={styles.row}>
        {icon ? <Icon icon={icon} size={16} tone="gold" /> : null}
        <Text variant={size === "sm" ? "smallStrong" : "bodyStrong"} tone="gold">
          {label}
        </Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  base: { alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  full: { alignSelf: "stretch" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  rim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderWidth: 1 },
  ghost: { alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
});
