import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { BadgeCheck, Bookmark, BookmarkCheck, Check, Heart, MessageCircle, Sparkles } from "lucide-react-native";
import { memo, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { GlassSurface, Icon, IconButton, SecondaryButton, Skeleton, SmartImage, Text } from "~/components";
import { qk } from "~/hooks/queries";
import type { GrioProfileCard } from "~/shared/grio/grioCards";
import { radius, useTheme } from "~/theme";
import { firstNameOf } from "~/utils/names";
import { useGrio, useGrioState } from "../GrioProvider";

const CARD_WIDTH = 164;
const PHOTO_HEIGHT = 188;

/**
 * People inside Grio's conversation — the faces behind a `<<<SHOW:>>>`, a
 * focus hop or a search. The ids come from code (the roster this turn
 * returned, or the Discovery engine); the cards are fetched from
 * `/api/grio/cards`, which re-checks every id, so a card never shows more than
 * the profile screen would, and none of it is ever in a prompt.
 *
 * Every button is an existing door: the profile, the chat, the shortlist, and
 * Send Interest through the same confirm sheet Grio's own chips use. A tap on
 * a card is the member choosing the person — no picker needed.
 */
export const GrioPeople = memo(function GrioPeople({ messageId, profileIds }: { messageId: string; profileIds: string[] }) {
  const engine = useGrio();
  const cards = useQuery({
    queryKey: qk.grioCards(profileIds),
    queryFn: () => engine.transport.cards(profileIds),
    staleTime: 60_000,
  });

  if (cards.isPending) {
    return (
      <View style={styles.row} accessibilityLabel="Profiles load ho rahi hain">
        {profileIds.slice(0, 2).map((id) => (
          <Skeleton key={id} width={CARD_WIDTH} height={PHOTO_HEIGHT + 96} radius={radius.lg} />
        ))}
      </View>
    );
  }
  if (cards.isError) {
    return (
      <View style={{ gap: 8, alignItems: "flex-start" }}>
        <Text variant="small" tone="secondary">
          Profiles load nahi ho payin.
        </Text>
        <SecondaryButton size="sm" fullWidth={false} label="Try Again" onPress={() => void cards.refetch()} />
      </View>
    );
  }
  if (cards.data.length === 0) {
    return (
      <Text variant="small" tone="secondary">
        Ye profiles abhi dikh nahi sakti.
      </Text>
    );
  }
  return (
    <FlatList
      horizontal
      data={cards.data}
      keyExtractor={(c) => c.profileId}
      renderItem={({ item }) => <PersonCard messageId={messageId} card={item} />}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.list}
      accessibilityRole="list"
    />
  );
});

const PersonCard = memo(function PersonCard({ messageId, card }: { messageId: string; card: GrioProfileCard }) {
  const engine = useGrio();
  const t = useTheme();
  const running = useGrioState((s) => s.running);
  // The server's flags, kept current by the refresh every Grio action triggers;
  // the local copy only answers the moment between tap and refetch.
  const [saved, setSaved] = useState(card.shortlisted);
  const [prevSaved, setPrevSaved] = useState(card.shortlisted);
  if (card.shortlisted !== prevSaved) {
    setPrevSaved(card.shortlisted);
    setSaved(card.shortlisted);
  }
  const first = firstNameOf(card.name);
  const facts = [card.age != null ? String(card.age) : null, card.city].filter(Boolean).join(" · ");

  async function toggleSave() {
    const next = !saved;
    setSaved(next);
    const ok = await engine.cardShortlist(messageId, card, next);
    if (!ok) setSaved(!next);
  }

  return (
    <GlassSurface level="default" radius={radius.lg} style={styles.card} accessibilityLabel={`${card.name}${facts ? `, ${facts}` : ""}`}>
      <View style={[styles.photo, { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }]}>
        <Pressable onPress={() => engine.openProfile(card.profileId)} accessibilityRole="button" accessibilityLabel={`Open ${first}'s profile`}>
          <SmartImage
            uri={card.photoUrl}
            name={card.name}
            lock={card.photoLock}
            style={{ width: CARD_WIDTH, height: PHOTO_HEIGHT }}
            placeholderSize="md"
          />
          <LinearGradient colors={t.gradients.photoFade} style={styles.nameplate} pointerEvents="none">
            <View style={styles.nameRow}>
              <Text variant="bodyStrong" tone="onPhoto" numberOfLines={1} style={{ flexShrink: 1 }}>
                {first}
              </Text>
              {card.verified ? <Icon icon={BadgeCheck} size={15} color="#37db96" /> : null}
            </View>
            {facts ? (
              <Text variant="caption" tone="onPhotoMuted" numberOfLines={1}>
                {facts}
              </Text>
            ) : null}
          </LinearGradient>
        </Pressable>
        {/* The shortlist is the photo's own corner, as on the reel card. */}
        <IconButton
          icon={saved ? BookmarkCheck : Bookmark}
          label={saved ? `Remove ${first} from shortlist` : `Save ${first} to shortlist`}
          variant="photo"
          active={saved}
          size={36}
          disabled={running}
          onPress={() => void toggleSave()}
          style={styles.save}
        />
      </View>
      <View style={styles.body}>
        {card.profession ? (
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {card.profession}
          </Text>
        ) : null}
        {card.matchId ? (
          <CardButton icon={MessageCircle} label={card.chatOpen ? "Message" : "Open Chat"} filled onPress={() => engine.openChat(card.matchId!)} />
        ) : card.interestSent ? (
          <CardButton icon={Check} label="Interest Sent" disabled />
        ) : (
          <CardButton icon={Heart} label="Send Interest" filled disabled={running} onPress={() => engine.cardInterest(messageId, card)} />
        )}
        <CardButton small icon={Sparkles} label="Ask Grio" tint={t.colors.gold} onPress={() => engine.askAbout({ profileId: card.profileId, name: card.name })} />
      </View>
    </GlassSurface>
  );
});

function CardButton({
  icon,
  label,
  onPress,
  filled,
  small,
  disabled,
  tint,
}: {
  icon: typeof Heart;
  label: string;
  onPress?: () => void;
  filled?: boolean;
  small?: boolean;
  disabled?: boolean;
  tint?: string;
}) {
  const t = useTheme();
  const fg = filled ? t.colors.accentFg : (tint ?? t.colors.text);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled || !onPress }}
      style={({ pressed }) => [
        styles.btn,
        small ? styles.btnSmall : null,
        {
          backgroundColor: filled ? t.colors.accent : t.colors.chip,
          borderColor: filled ? t.colors.accent : t.colors.rim,
          opacity: disabled ? 0.55 : pressed ? 0.8 : 1,
        },
      ]}
    >
      <Icon icon={icon} size={small ? 13 : 15} color={fg} strokeWidth={2.1} />
      <Text variant={small ? "caption" : "smallStrong"} style={{ color: fg }} numberOfLines={1} maxFontSizeMultiplier={1.15}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { marginHorizontal: -4 },
  row: { flexDirection: "row", gap: 10, paddingHorizontal: 4, paddingVertical: 2 },
  card: { width: CARD_WIDTH, overflow: "hidden" },
  photo: { width: CARD_WIDTH, height: PHOTO_HEIGHT, overflow: "hidden" },
  nameplate: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 10, paddingBottom: 8, paddingTop: 30 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  save: { position: "absolute", top: 8, right: 8 },
  body: { padding: 9, gap: 7 },
  btn: {
    minHeight: 38,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 8,
  },
  btnSmall: { minHeight: 34, paddingHorizontal: 6 },
});
