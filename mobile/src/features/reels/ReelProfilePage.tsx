import { LinearGradient } from "expo-linear-gradient";
import type { LucideIcon } from "lucide-react-native";
import { BadgeCheck, Bookmark, BookmarkCheck, Check, Ellipsis, MapPin, MessageCircle, Orbit, Send, Sparkles, X } from "lucide-react-native";
import { memo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Icon, Pill, SmartImage, Text } from "~/components";
import { layout, radius, usePhotoChrome, useTheme, type PhotoChrome } from "~/theme";
import type { ReelCard } from "~/types/api";
import { haptics } from "~/utils/haptics";

export interface ReelPageActions {
  onSkip: (card: ReelCard) => void;
  onInterest: (card: ReelCard) => void;
  onMessage: (card: ReelCard) => void;
  onShortlist: (card: ReelCard) => void;
  onKundli: (card: ReelCard) => void;
  onGrio: (card: ReelCard) => void;
  onMore: (card: ReelCard) => void;
  onOpen: (card: ReelCard) => void;
}

function SideAction({
  icon,
  label,
  active,
  busy,
  chrome,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  busy?: boolean;
  chrome: PhotoChrome;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        if (busy) return;
        haptics.select();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={active !== undefined ? { selected: active, busy: !!busy } : { busy: !!busy }}
      hitSlop={6}
      style={({ pressed }) => [styles.side, pressed && { transform: [{ scale: 0.92 }] }]}
    >
      <View
        style={[
          styles.sideCircle,
          {
            backgroundColor: active ? chrome.activeBody : chrome.body,
            borderColor: active ? chrome.activeRim : chrome.rim,
            borderWidth: chrome.rimWidth,
          },
        ]}
      >
        {busy ? <ActivityIndicator size="small" color={chrome.text} /> : <Icon icon={icon} size={22} color={active ? chrome.activeRim : chrome.text} strokeWidth={2} />}
      </View>
      <Text variant="caption" tone="onPhoto" maxFontSizeMultiplier={1.1}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * One person, full-bleed — the phone form of the web reel (D-92): up/down is
 * the next person, sideways their photos, every decision a labelled button.
 *
 * The card stays uncluttered on purpose. The rail carries four things in a
 * fixed order — Save, Kundli, Grio, More — and the foot the one decision that
 * matters (Skip / Send Interest, or Message once there is a rishta). Like,
 * Why Match, notes, Meri List, Report and Block are one tap away in More.
 * What a card says is only what the server put on it: the gated photo, the
 * honest match line, the reasons code computed.
 */
export const ReelProfilePage = memo(function ReelProfilePage({
  card,
  height,
  bottomInset,
  topInset,
  actions,
  interestBusy = false,
  saveBusy = false,
}: {
  card: ReelCard;
  height: number;
  bottomInset: number;
  topInset: number;
  actions: ReelPageActions;
  /** The interest request is in flight — the button waits for the server's answer. */
  interestBusy?: boolean;
  /** A save toggle is in flight. */
  saveBusy?: boolean;
}) {
  const t = useTheme();
  const chrome = usePhotoChrome();
  const { width } = useWindowDimensions();
  const [slide, setSlide] = useState(0);
  const photos = card.photoUnlocked
    ? card.slides.length
      ? card.slides.map((s) => ({ id: s.id, url: s.url, focalY: s.focalY }))
      : [{ id: "primary", url: card.photoUrl, focalY: card.photoFocalY }]
    : [{ id: "locked", url: null, focalY: null }];
  const lock = card.photoUnlocked ? "open" : card.photoLock;
  const comparable = card.preference.state === "COMPARABLE" && card.preference.score != null;
  const reason = card.whyThisMatch.reasons[0]?.text ?? card.sharedTags[0] ?? null;
  const line = [card.education, card.profession].filter(Boolean).join(" · ");
  const matched = Boolean(card.matchId);

  return (
    <View style={{ height, width }}>
      <FlatList
        data={photos}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(p) => p.id}
        onMomentumScrollEnd={(e) => setSlide(Math.round(e.nativeEvent.contentOffset.x / width))}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item }) => (
          <SmartImage uri={item.url} name={card.displayName} lock={lock} focalY={item.focalY} style={{ width, height }} placeholderSize="lg" priority="high" />
        )}
      />

      <LinearGradient colors={["rgba(12,4,6,0.55)", "rgba(12,4,6,0)"]} style={[styles.topFade, { height: topInset + 110 }]} pointerEvents="none" />
      <LinearGradient
        colors={["rgba(12,4,6,0)", "rgba(12,4,6,0.55)", "rgba(12,4,6,0.94)"]}
        locations={[0, 0.35, 1]}
        style={[styles.bottomFade, { height: height * 0.62 }]}
        pointerEvents="none"
      />

      {photos.length > 1 ? (
        <View style={[styles.dots, { top: topInset + 58 }]} pointerEvents="none">
          {photos.map((p, i) => (
            <View key={p.id} style={[styles.dot, { backgroundColor: i === slide ? chrome.dot : chrome.dotDim, flex: 1 }]} />
          ))}
        </View>
      ) : null}

      <View style={[styles.sideColumn, { bottom: bottomInset + 150 }]}>
        <SideAction
          icon={card.shortlisted ? BookmarkCheck : Bookmark}
          label={card.shortlisted ? "Saved" : "Save"}
          active={card.shortlisted}
          busy={saveBusy}
          chrome={chrome}
          onPress={() => actions.onShortlist(card)}
        />
        <SideAction icon={Orbit} label="Kundli" chrome={chrome} onPress={() => actions.onKundli(card)} />
        <SideAction icon={Sparkles} label="Grio" chrome={chrome} onPress={() => actions.onGrio(card)} />
        <SideAction icon={Ellipsis} label="More" chrome={chrome} onPress={() => actions.onMore(card)} />
      </View>

      <View style={[styles.info, { bottom: bottomInset + 84 }]}>
        <View style={styles.pills}>
          {card.spotlight ? <Pill label="Spotlight" tone="gold" icon={Sparkles} /> : null}
          {!card.seenBefore ? <Pill label="New" tone="photo" /> : null}
          {card.nearby ? <Pill label="Nearby" tone="photo" icon={MapPin} /> : null}
          {comparable ? <Pill label={`${card.preference.score}% preference match`} tone="gold" /> : null}
        </View>
        <Pressable onPress={() => actions.onOpen(card)} accessibilityRole="button" accessibilityLabel={`Open ${card.displayName}'s profile`}>
          <View style={styles.nameRow}>
            <Text variant="h1" tone="onPhoto" numberOfLines={1} style={{ flexShrink: 1 }}>
              {card.displayName}
              {card.age ? `, ${card.age}` : ""}
            </Text>
            {card.verified ? <Icon icon={BadgeCheck} size={22} color="#37db96" strokeWidth={2.2} /> : null}
          </View>
          {card.city ? (
            <View style={styles.meta}>
              <Icon icon={MapPin} size={14} color={chrome.textMuted} />
              <Text variant="body" tone="onPhotoMuted">
                {card.city}
              </Text>
            </View>
          ) : null}
          {line ? (
            <Text variant="body" tone="onPhotoMuted" numberOfLines={1}>
              {line}
            </Text>
          ) : null}
        </Pressable>
        {reason ? (
          <View style={[styles.reason, { backgroundColor: chrome.body, borderColor: chrome.highlightRim }]}>
            <Icon icon={Sparkles} size={14} color={chrome.highlight} />
            <Text variant="small" tone="onPhoto" numberOfLines={2} style={{ flex: 1 }}>
              {reason}
            </Text>
          </View>
        ) : null}
        {card.preference.note ? (
          <Text variant="caption" tone="onPhotoMuted" numberOfLines={2}>
            {card.preference.note}
          </Text>
        ) : null}
      </View>

      <View style={[styles.actions, { bottom: bottomInset + 14 }]}>
        <Pressable
          onPress={() => actions.onSkip(card)}
          accessibilityRole="button"
          accessibilityLabel="Skip"
          style={({ pressed }) => [styles.skip, { backgroundColor: chrome.bodyStrong, borderColor: chrome.rim, opacity: pressed ? 0.8 : 1 }]}
        >
          <Icon icon={X} size={20} color={chrome.text} strokeWidth={2.3} />
          <Text variant="button" tone="onPhoto">
            Skip
          </Text>
        </Pressable>
        {matched ? (
          <Pressable
            onPress={() => actions.onMessage(card)}
            accessibilityRole="button"
            accessibilityLabel={`Message ${card.displayName}`}
            style={({ pressed }) => [styles.primary, { backgroundColor: t.colors.accent, opacity: pressed ? 0.88 : 1 }]}
          >
            <Icon icon={MessageCircle} size={20} color={t.colors.accentFg} />
            <Text variant="button" style={{ color: t.colors.accentFg }}>
              Message
            </Text>
          </Pressable>
        ) : card.interestSent ? (
          <View style={[styles.primary, { backgroundColor: chrome.bodyStrong, borderColor: chrome.rim, borderWidth: 1 }]} accessible accessibilityLabel="Interest sent — waiting for their answer">
            <Icon icon={Check} size={20} color={chrome.text} />
            <Text variant="button" tone="onPhoto">
              Interest Sent
            </Text>
          </View>
        ) : (
          <Pressable
            onPress={() => {
              if (!interestBusy) actions.onInterest(card);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Send interest to ${card.displayName}`}
            accessibilityState={{ busy: interestBusy, disabled: interestBusy }}
            style={({ pressed }) => [styles.primary, { backgroundColor: t.colors.accent, opacity: interestBusy ? 0.75 : pressed ? 0.88 : 1 }]}
          >
            {interestBusy ? <ActivityIndicator size="small" color={t.colors.accentFg} /> : <Icon icon={Send} size={19} color={t.colors.accentFg} />}
            <Text variant="button" style={{ color: t.colors.accentFg }}>
              {interestBusy ? "Sending…" : "Send Interest"}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  topFade: { position: "absolute", left: 0, right: 0, top: 0 },
  bottomFade: { position: "absolute", left: 0, right: 0, bottom: 0 },
  dots: { position: "absolute", left: 16, right: 16, flexDirection: "row", gap: 4 },
  dot: { height: 3, borderRadius: 2 },
  sideColumn: { position: "absolute", right: 12, gap: 16, alignItems: "center" },
  side: { alignItems: "center", gap: 4, minWidth: 56 },
  sideCircle: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  info: { position: "absolute", left: layout.gutter, right: 84, gap: 6 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 2 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  meta: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  reason: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  actions: { position: "absolute", left: layout.gutter, right: layout.gutter, flexDirection: "row", gap: 12 },
  skip: {
    flex: 1,
    height: 54,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
  },
  primary: { flex: 1.6, height: 54, borderRadius: radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
});
