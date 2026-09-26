import type { LucideIcon } from "lucide-react-native";
import { Ban, Blend, Flag, Heart, ListChecks, MessageCircle, Orbit, PenLine, Search, UserRound } from "lucide-react-native";
import { memo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Avatar, BottomSheet, Icon, Text } from "~/components";
import { radius, useTheme } from "~/theme";
import type { ReelCard } from "~/types/api";

interface Tile {
  key: string;
  icon: LucideIcon;
  label: string;
  /** One or two words under the label, only where the label alone would mislead. */
  hint?: string;
  pressed?: boolean;
  onPress: () => void;
}

export interface ReelMoreActions {
  onProfile: (card: ReelCard) => void;
  onWhy: (card: ReelCard) => void;
  onLike: (card: ReelCard) => void;
  onKundli: (card: ReelCard) => void;
  onMessage: (card: ReelCard) => void;
  onNote: (card: ReelCard) => void;
  onList: () => void;
  onSearch: () => void;
  onReport: (card: ReelCard) => void;
  onBlock: (card: ReelCard) => void;
}

/**
 * "More" — every tool for this one person that did not earn a place on the
 * card, in one sheet, as icons and a word each (the web's `ReelMoreSheet`).
 *
 * A tile appears only when it can do something for *this* card: Message only
 * with a match, Add Note only once an interest is out and before a match.
 * Like lives here, not on the card: it is private and not a decision, and next
 * to Save two bookmarks with different rules read as one feature with a bug —
 * here it has room for its one word, "Private". Report and Block stay last and
 * quiet, the way they are everywhere.
 */
export const ReelMoreSheet = memo(function ReelMoreSheet({
  card: live,
  likeBusy = false,
  onClose,
  actions,
}: {
  /** Null while closed. */
  card: ReelCard | null;
  /** The like toggle is waiting for the server. */
  likeBusy?: boolean;
  onClose: () => void;
  actions: ReelMoreActions;
}) {
  const t = useTheme();
  // Keeps the last person on screen while the sheet slides away.
  const [card, setCard] = useState(live);
  if (live && live !== card) setCard(live);
  if (!card) return null;

  const matched = Boolean(card.matchId);
  const summary = [card.profession, card.city].filter(Boolean).join(" · ");
  const tiles: Tile[] = [
    { key: "profile", icon: UserRound, label: "Full Profile", onPress: () => actions.onProfile(card) },
    { key: "why", icon: Blend, label: "Why Match", onPress: () => actions.onWhy(card) },
    {
      key: "like",
      icon: Heart,
      label: card.liked ? "Liked" : "Like",
      hint: likeBusy ? "Saving…" : "Private",
      pressed: card.liked,
      onPress: () => {
        if (!likeBusy) actions.onLike(card);
      },
    },
    { key: "kundli", icon: Orbit, label: "Kundli", onPress: () => actions.onKundli(card) },
    ...(matched ? [{ key: "message", icon: MessageCircle, label: "Message", onPress: () => actions.onMessage(card) }] : []),
    ...(!matched && card.interestSent ? [{ key: "note", icon: PenLine, label: "Add Note", hint: "Interest ke saath", onPress: () => actions.onNote(card) }] : []),
    { key: "list", icon: ListChecks, label: "Meri List", onPress: actions.onList },
    { key: "search", icon: Search, label: "Search", onPress: actions.onSearch },
  ];

  return (
    <BottomSheet visible={live !== null} onClose={onClose}>
      <View style={styles.who}>
        <Avatar uri={card.photoUnlocked ? card.photoUrl : null} name={card.displayName} lock={card.photoUnlocked ? "open" : card.photoLock} size={46} ring />
        <View style={styles.flex}>
          <Text variant="h3" numberOfLines={1}>
            {card.displayName}
            {card.age ? `, ${card.age}` : ""}
          </Text>
          {summary ? (
            <Text variant="small" tone="secondary" numberOfLines={1}>
              {summary}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.grid}>
        {tiles.map((tile) => (
          <Pressable
            key={tile.key}
            onPress={tile.onPress}
            accessibilityRole="button"
            accessibilityLabel={tile.hint ? `${tile.label}, ${tile.hint}` : tile.label}
            accessibilityState={tile.pressed !== undefined ? { selected: tile.pressed } : undefined}
            style={({ pressed }) => [styles.tile, pressed && { opacity: 0.75 }]}
          >
            <View
              style={[
                styles.tileIcon,
                {
                  backgroundColor: tile.pressed ? t.colors.accentSoft : t.colors.chip,
                  borderColor: tile.pressed ? t.colors.gold : t.colors.hairline,
                },
              ]}
            >
              <Icon icon={tile.icon} size={21} tone={tile.pressed ? "gold" : "primary"} />
            </View>
            <Text variant="caption" center numberOfLines={1}>
              {tile.label}
            </Text>
            {tile.hint ? (
              <Text variant="caption" tone="muted" center numberOfLines={1} style={styles.hint}>
                {tile.hint}
              </Text>
            ) : null}
          </Pressable>
        ))}
      </View>

      <View style={[styles.quiet, { borderTopColor: t.colors.divider }]}>
        <Pressable onPress={() => actions.onReport(card)} accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
          <Icon icon={Flag} size={19} tone="danger" />
          <Text variant="bodyStrong" tone="danger">
            Report
          </Text>
        </Pressable>
        <Pressable
          onPress={() => actions.onBlock(card)}
          accessibilityRole="button"
          accessibilityLabel="Block"
          accessibilityHint="Ye aapko na dekh payenge, na message kar payenge"
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
        >
          <Icon icon={Ban} size={19} tone="muted" />
          <View style={styles.flex}>
            <Text variant="bodyStrong">Block</Text>
            <Text variant="caption" tone="muted">
              Ye aapko na dekh payenge, na message kar payenge
            </Text>
          </View>
        </Pressable>
      </View>
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  who: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: 14, marginTop: 18 },
  tile: { width: "25%", alignItems: "center", gap: 5, paddingHorizontal: 2 },
  tileIcon: { width: 50, height: 50, borderRadius: radius.md, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  hint: { marginTop: -3 },
  quiet: { marginTop: 18, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52 },
});
