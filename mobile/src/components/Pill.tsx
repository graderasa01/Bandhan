import type { LucideIcon } from "lucide-react-native";
import { memo } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { radius, usePhotoChrome, useTheme } from "~/theme";
import { Icon } from "./Icon";
import { Text } from "./Text";

export type PillTone = "neutral" | "gold" | "success" | "danger" | "info" | "accent" | "photo";

/** A small status label — Verified, New, Nearby, Spotlight, "Interest sent". Never a button. */
export const Pill = memo(function Pill({
  label,
  tone = "neutral",
  icon,
  style,
}: {
  label: string;
  tone?: PillTone;
  icon?: LucideIcon;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const c = t.colors;
  const chrome = usePhotoChrome();
  const map: Record<PillTone, { bg: string; fg: string; border: string }> = {
    neutral: { bg: c.chip, fg: c.textSecondary, border: c.hairline },
    gold: { bg: t.dark ? "rgba(255,228,135,0.14)" : "rgba(201,169,110,0.16)", fg: c.gold, border: t.dark ? "rgba(255,228,135,0.4)" : "rgba(128,102,52,0.3)" },
    success: { bg: c.successBg, fg: c.success, border: "transparent" },
    danger: { bg: c.dangerBg, fg: c.danger, border: "transparent" },
    info: { bg: c.infoBg, fg: c.info, border: "transparent" },
    accent: { bg: c.accent, fg: c.accentFg, border: "transparent" },
    // On somebody's photograph: the shared photo chrome (smoke + the room's rim), never a room colour.
    photo: { bg: chrome.body, fg: chrome.text, border: chrome.rim },
  };
  const s = map[tone];
  return (
    <View style={[styles.pill, { backgroundColor: s.bg, borderColor: s.border }, style]}>
      {icon ? <Icon icon={icon} size={13} color={s.fg} strokeWidth={2.2} /> : null}
      <Text variant="caption" style={{ color: s.fg }} numberOfLines={1} maxFontSizeMultiplier={1.2}>
        {label}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
