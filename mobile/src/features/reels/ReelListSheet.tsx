import { ChevronRight } from "lucide-react-native";
import { memo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { BottomSheet, Icon, Text } from "~/components";
import { useCounts, useLaneCounts } from "~/hooks/queries";
import { useTheme } from "~/theme";
import type { ReelLane, ReelLaneCounts } from "~/types/api";
import { LANES, LANE_HINT, LANE_ICON, LANE_LABEL } from "./lanes";

/**
 * Meri List — the five history lanes behind one door (the web's
 * `ReelListSheet`). The counts are asked for fresh when it opens
 * (`/api/mobile/reel/lanes`): a like or a save made since the deck arrived
 * moves people between lanes, and only the server can say where. Until that
 * answer lands, the deck's own counts show — never a number made up here.
 *
 * A lane with nobody in it is still listed, quietly, with its zero: here the
 * list is the map of what exists.
 */
export const ReelListSheet = memo(function ReelListSheet({
  visible,
  onClose,
  deckCounts,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  /** `laneCounts` from the deck load — shown until the fresh ones arrive. */
  deckCounts: ReelLaneCounts;
  onPick: (lane: ReelLane) => void;
}) {
  const t = useTheme();
  const fresh = useLaneCounts(visible);
  const unread = useCounts().data?.messages ?? 0;
  const counts = fresh.data ?? deckCounts;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Meri List"
      subtitle={fresh.isError ? "Nayi ginti nahi aa payi — deck ke waqt ki ginti dikh rahi hai." : "Jin logon par aap kuch kar chuke hain"}
    >
      <View>
        {LANES.map((lane, i) => {
          const count = counts[lane] ?? 0;
          return (
            <Pressable
              key={lane}
              onPress={() => onPick(lane)}
              accessibilityRole="button"
              accessibilityLabel={`${LANE_LABEL[lane]}, ${count}${lane === "MESSAGE" && unread ? `, ${unread} unread` : ""}`}
              style={({ pressed }) => [
                styles.row,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.colors.divider },
                pressed && { opacity: 0.75 },
              ]}
            >
              <View style={[styles.icon, { backgroundColor: t.colors.accentSoft }]}>
                <Icon icon={LANE_ICON[lane]} size={18} tone="gold" />
                {lane === "MESSAGE" && unread > 0 ? <View style={[styles.dot, { backgroundColor: t.colors.danger, borderColor: t.colors.sheet }]} /> : null}
              </View>
              <View style={styles.flex}>
                <View style={styles.titleRow}>
                  <Text variant="bodyStrong">{LANE_LABEL[lane]}</Text>
                  <Text variant="small" tone={count === 0 ? "muted" : "secondary"}>
                    {count}
                  </Text>
                  {lane === "MESSAGE" && unread > 0 ? (
                    <Text variant="caption" tone="danger">
                      {unread === 1 ? "1 naya message" : `${unread} naye message`}
                    </Text>
                  ) : null}
                  {fresh.isFetching && !fresh.data ? <ActivityIndicator size="small" color={t.colors.textMuted} /> : null}
                </View>
                <Text variant="small" tone="muted" numberOfLines={1}>
                  {LANE_HINT[lane]}
                </Text>
              </View>
              <Icon icon={ChevronRight} size={17} tone="muted" />
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, paddingVertical: 8 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  dot: { position: "absolute", top: 1, right: 1, width: 11, height: 11, borderRadius: 6, borderWidth: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
});
