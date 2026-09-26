import type { LucideIcon } from "lucide-react-native";
import { ChevronRight } from "lucide-react-native";
import { memo, type ReactNode } from "react";
import { Pressable, StyleSheet, Switch, View } from "react-native";
import { useTheme } from "~/theme";
import { Icon } from "./Icon";
import { Text } from "./Text";

export interface ListRowProps {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  /** A short value on the right ("Satin", "On"). */
  value?: string;
  onPress?: () => void;
  /** Renders a switch instead of a chevron. */
  toggle?: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean };
  danger?: boolean;
  right?: ReactNode;
  last?: boolean;
}

/** A settings / menu row inside a GlassCard: icon seal, title, detail, chevron or switch. */
export const ListRow = memo(function ListRow({ icon, title, subtitle, value, onPress, toggle, danger, right, last }: ListRowProps) {
  const t = useTheme();
  const body = (
    <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.colors.divider }]}>
      {icon ? (
        <View style={[styles.seal, { backgroundColor: danger ? t.colors.dangerBg : t.colors.accentSoft }]}>
          <Icon icon={icon} size={18} tone={danger ? "danger" : "gold"} />
        </View>
      ) : null}
      <View style={styles.text}>
        <Text variant="bodyStrong" tone={danger ? "danger" : "primary"} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" tone="muted" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="small" tone="secondary" numberOfLines={1} style={styles.value}>
          {value}
        </Text>
      ) : null}
      {right}
      {toggle ? (
        <Switch
          value={toggle.value}
          onValueChange={toggle.onChange}
          disabled={toggle.disabled}
          trackColor={{ false: t.colors.hairline, true: t.colors.accent }}
          thumbColor={toggle.value ? t.colors.accentFg : t.dark ? "#e7dfd5" : "#ffffff"}
          accessibilityLabel={title}
        />
      ) : onPress ? (
        <Icon icon={ChevronRight} size={18} tone="muted" />
      ) : null}
    </View>
  );

  if (!onPress || toggle) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={({ pressed }) => pressed && { opacity: 0.7 }}>
      {body}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, minHeight: 56 },
  seal: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  text: { flex: 1, gap: 2 },
  value: { maxWidth: 120 },
});
