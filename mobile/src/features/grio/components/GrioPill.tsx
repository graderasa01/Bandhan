import type { LucideIcon } from "lucide-react-native";
import { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Icon, Text } from "~/components";
import { radius, useTheme } from "~/theme";
import { haptics } from "~/utils/haptics";

/**
 * Grio's tappable pill — a catalog action, a profile door, a follow-up
 * question, a rail shortcut. Three looks, all from the room's tokens:
 *
 *   action    the gold-rimmed "do something" pill (the web's gold chip)
 *   question  the quiet glass pill that asks Grio something
 *   primary   the one filled pill on a rail ("Show these profiles")
 *
 * A button, never a checkbox — it does one thing when pressed.
 */
export const GrioPill = memo(function GrioPill({
  label,
  onPress,
  icon,
  trailingIcon,
  tone = "question",
  disabled,
  done,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  icon?: LucideIcon;
  trailingIcon?: LucideIcon;
  tone?: "action" | "question" | "primary";
  disabled?: boolean;
  /** Carried out — shown settled, no longer pressable. */
  done?: boolean;
  accessibilityHint?: string;
}) {
  const t = useTheme();
  const c = t.colors;
  const paper = t.material.kind === "paper";
  const look =
    tone === "primary"
      ? { bg: c.accent, border: c.accent, fg: c.accentFg }
      : tone === "action"
        ? {
            bg: paper ? "rgba(201,169,110,0.12)" : t.dark ? "rgba(255,228,135,0.12)" : "rgba(201,169,110,0.14)",
            border: paper ? "rgba(128,102,52,0.45)" : "rgba(255,228,135,0.5)",
            fg: c.gold,
          }
        : { bg: c.chip, border: c.rim, fg: c.chipText };
  const inactive = disabled || done;
  return (
    <Pressable
      onPress={() => {
        if (inactive) return;
        haptics.select();
        onPress();
      }}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={done ? `${label}, done` : label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive }}
      hitSlop={4}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: look.bg, borderColor: look.border, opacity: disabled ? 0.5 : pressed ? 0.78 : done ? 0.7 : 1 },
      ]}
    >
      <View style={styles.row}>
        {icon ? <Icon icon={icon} size={15} color={look.fg} strokeWidth={2.1} /> : null}
        <Text variant="smallStrong" style={{ color: look.fg, flexShrink: 1 }} numberOfLines={2} maxFontSizeMultiplier={1.3}>
          {label}
        </Text>
        {trailingIcon ? <Icon icon={trailingIcon} size={14} color={look.fg} strokeWidth={2.1} /> : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  pill: {
    minHeight: 38,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: "center",
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
});
