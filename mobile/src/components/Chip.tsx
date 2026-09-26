import { LinearGradient } from "expo-linear-gradient";
import type { LucideIcon } from "lucide-react-native";
import { memo } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Check, X } from "lucide-react-native";
import { radius, useTheme } from "~/theme";
import { haptics } from "~/utils/haptics";
import { Icon } from "./Icon";
import { Text } from "./Text";

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: LucideIcon;
  /** Shows a small ✕ — for removable filter chips. */
  removable?: boolean;
  size?: "md" | "sm";
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  /** Stretch to fill its grid cell (two-column answer grids). */
  block?: boolean;
}

/**
 * The web's `.glass-chip`: a pill that is an answer, a filter or a toggle.
 * Selected = the room's chosen-chip colour (wine gradient on the glass rooms,
 * wine ink on Classic, champagne at Night) with a check — never colour alone.
 */
export const Chip = memo(function Chip({ label, selected, onPress, icon, removable, size = "md", style, disabled, block }: ChipProps) {
  const t = useTheme();
  const h = size === "sm" ? 34 : 44;
  const fg = selected ? t.colors.chipSelectedText : t.colors.chipText;
  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        haptics.select();
        onPress?.();
      }}
      disabled={!onPress || disabled}
      accessibilityRole={removable ? "button" : "checkbox"}
      accessibilityState={{ checked: !!selected, disabled: !!disabled }}
      accessibilityLabel={removable ? `Remove ${label}` : label}
      style={({ pressed }) => [
        styles.chip,
        { minHeight: h, borderRadius: radius.pill, paddingHorizontal: size === "sm" ? 12 : 16 },
        block && styles.block,
        { opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {selected ? (
        <LinearGradient
          colors={t.room === "paper" ? [t.colors.chipSelected, t.colors.chipSelected] : [t.colors.accentLit, t.colors.chipSelected, t.colors.accentDeep]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: radius.pill }]}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { borderRadius: radius.pill, backgroundColor: t.colors.chip }]} />
      )}
      <View
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: radius.pill, borderWidth: 1, borderColor: selected ? (t.dark ? "rgba(255,236,200,0.5)" : t.colors.chipSelected) : t.colors.rim },
        ]}
      />
      <View style={styles.row}>
        {selected && !removable ? <Icon icon={Check} size={15} color={fg} strokeWidth={2.4} /> : icon ? <Icon icon={icon} size={16} color={fg} /> : null}
        <Text variant={size === "sm" ? "smallStrong" : "bodyStrong"} style={{ color: fg, flexShrink: 1 }} numberOfLines={2}>
          {label}
        </Text>
        {removable ? <Icon icon={X} size={14} color={fg} strokeWidth={2.2} /> : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  chip: { alignItems: "center", justifyContent: "center", paddingVertical: 6 },
  block: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
});
