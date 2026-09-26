import { LinearGradient } from "expo-linear-gradient";
import { BadgeCheck, Heart, MapPin, Send, Sparkles } from "lucide-react-native";
import { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { radius, useTheme } from "~/theme";
import type { PhotoLock } from "~/types/api";
import { haptics } from "~/utils/haptics";
import { Icon } from "./Icon";
import { Pill } from "./Pill";
import { PressableScale, usePressScale } from "./PressableScale";
import { SmartImage } from "./SmartImage";
import { Text } from "./Text";
import { firstNameOf } from "~/utils/names";

export interface ProfileCardData {
  profileId: string;
  name: string;
  age: number | null;
  city: string | null;
  education: string | null;
  profession: string | null;
  photoUrl: string | null;
  photoLock: PhotoLock;
  photoFocalY?: number | null;
  verified: boolean;
  /** 0..100 — shown only when the server says it is a real comparison. */
  matchPercent?: number | null;
  badge?: "new" | "nearby" | "spotlight" | null;
  interestSent?: boolean;
  matched?: boolean;
}

export interface ProfileCardProps {
  data: ProfileCardData;
  width: number;
  onOpen: (profileId: string) => void;
  onInterest?: (profileId: string) => void;
}

const BADGE_LABEL = { new: "New", nearby: "Nearby", spotlight: "Spotlight" } as const;

const EDGE = 12;
const INTEREST_HEIGHT = 34;

/**
 * The portrait card on Home's rails and in grids: photo first, then name ·
 * age, city, and one line of education/work — enough to decide whether to
 * open, never so much the card turns into a form. Interest is one tap on the
 * card itself.
 *
 * The body (open the profile) and Interest are two separate buttons side by
 * side in the tree, never one inside the other: nested, a screen reader
 * announces the card as one button and cannot reach Interest at all, and the
 * web renders an invalid <button> in a <button>. The whole card still sinks
 * under the finger.
 */
export const ProfileCard = memo(function ProfileCard({ data, width, onOpen, onInterest }: ProfileCardProps) {
  const t = useTheme();
  const press = usePressScale(0.975);
  const height = Math.round(width * 1.32);
  const line = [data.education, data.profession].filter(Boolean).join(" · ");
  const canInterest = onInterest && !data.interestSent && !data.matched;
  const infoBottom = onInterest ? EDGE + INTEREST_HEIGHT + 8 : EDGE;

  return (
    <Animated.View style={[styles.card, { width, height, borderColor: t.colors.rim }, press.style]}>
      <Pressable
        onPress={() => onOpen(data.profileId)}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole="button"
        accessibilityLabel={`${data.name}${data.age ? `, ${data.age}` : ""}${data.city ? `, ${data.city}` : ""}. Open profile`}
        style={StyleSheet.absoluteFill}
      >
        <SmartImage
          uri={data.photoUrl}
          name={data.name}
          lock={data.photoLock}
          focalY={data.photoFocalY}
          style={StyleSheet.absoluteFill}
          showLockLine={false}
          placeholderInsetBottom={infoBottom + 56}
        />
        <LinearGradient colors={t.gradients.photoFade} locations={[0.35, 0.62, 1]} style={StyleSheet.absoluteFill} />

        <View style={styles.top}>
          {data.badge ? <Pill label={BADGE_LABEL[data.badge]} tone={data.badge === "spotlight" ? "gold" : "photo"} icon={data.badge === "spotlight" ? Sparkles : undefined} /> : <View />}
          {data.matchPercent != null ? (
            <View style={[styles.match, { borderColor: "rgba(255,228,135,0.55)" }]}>
              <Text variant="caption" style={{ color: "#ffe487" }} maxFontSizeMultiplier={1}>
                {data.matchPercent}% match
              </Text>
            </View>
          ) : null}
        </View>

        <View style={[styles.info, { bottom: infoBottom }]}>
          <View style={styles.nameRow}>
            <Text variant="title" tone="onPhoto" numberOfLines={1} style={styles.flex}>
              {firstNameOf(data.name)}
              {data.age ? `, ${data.age}` : ""}
            </Text>
            {data.verified ? <Icon icon={BadgeCheck} size={16} color="#37db96" strokeWidth={2.3} /> : null}
          </View>
          {data.city ? (
            <View style={styles.meta}>
              <Icon icon={MapPin} size={12} color="rgba(255,253,248,0.8)" />
              <Text variant="caption" tone="onPhotoMuted" numberOfLines={1}>
                {data.city}
              </Text>
            </View>
          ) : null}
          {line ? (
            <Text variant="caption" tone="onPhotoMuted" numberOfLines={1}>
              {line}
            </Text>
          ) : null}
        </View>
      </Pressable>

      {onInterest ? (
        <PressableScale
          disabled={!canInterest}
          onPress={() => {
            haptics.tap();
            onInterest(data.profileId);
          }}
          accessibilityRole="button"
          accessibilityLabel={data.matched ? "Matched" : data.interestSent ? "Interest sent" : `Send interest to ${data.name}`}
          accessibilityState={{ disabled: !canInterest }}
          style={[styles.interest, { backgroundColor: canInterest ? t.colors.accent : "rgba(255,255,255,0.14)" }]}
        >
          <Icon icon={data.matched ? Heart : Send} size={14} color={canInterest ? t.colors.accentFg : "#fffdf8"} />
          <Text variant="caption" style={{ color: canInterest ? t.colors.accentFg : "#fffdf8" }} maxFontSizeMultiplier={1.1}>
            {data.matched ? "Matched" : data.interestSent ? "Sent" : "Interest"}
          </Text>
        </PressableScale>
      ) : null}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, backgroundColor: "#2a0710" },
  top: { position: "absolute", top: 10, left: 10, right: 10, flexDirection: "row", justifyContent: "space-between" },
  match: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1, backgroundColor: "rgba(20,10,12,0.5)" },
  info: { position: "absolute", left: EDGE, right: EDGE, gap: 3 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  flex: { flexShrink: 1 },
  meta: { flexDirection: "row", alignItems: "center", gap: 4 },
  interest: {
    position: "absolute",
    left: EDGE,
    right: EDGE,
    bottom: EDGE,
    height: INTEREST_HEIGHT,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
});
