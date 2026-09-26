import { ChevronRight } from "lucide-react-native";
import { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Icon } from "./Icon";
import { Text } from "./Text";

/** A section's heading: an optional gold micro-label, a title, and a "See all" link. */
export const SectionHeader = memo(function SectionHeader({
  title,
  eyebrow,
  actionLabel,
  onAction,
}: {
  title: string;
  eyebrow?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.titles}>
        {eyebrow ? (
          <Text variant="label" tone="gold">
            {eyebrow}
          </Text>
        ) : null}
        <Text variant="h2" numberOfLines={1}>
          {title}
        </Text>
      </View>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button" accessibilityLabel={actionLabel} style={styles.action}>
          <Text variant="smallStrong" tone="gold">
            {actionLabel}
          </Text>
          <Icon icon={ChevronRight} size={16} tone="gold" />
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 12, gap: 12 },
  titles: { flex: 1, gap: 2 },
  action: { flexDirection: "row", alignItems: "center", gap: 2, paddingVertical: 4 },
});
