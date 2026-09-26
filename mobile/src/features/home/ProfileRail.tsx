import { memo } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { ProfileCard, SectionHeader, Skeleton, type ProfileCardData } from "~/components";
import type { ReelCard } from "~/types/api";

export function toCardData(c: ReelCard, badge?: ProfileCardData["badge"]): ProfileCardData {
  const comparable = c.preference.state === "COMPARABLE" && c.preference.score != null;
  return {
    profileId: c.id,
    name: c.displayName,
    age: c.age,
    city: c.city,
    education: c.education,
    profession: c.profession,
    photoUrl: c.photoUnlocked ? c.photoUrl : null,
    photoLock: c.photoUnlocked ? "open" : c.photoLock,
    photoFocalY: c.photoFocalY,
    verified: c.verified,
    // Only a real comparison earns a percentage — never a placeholder (preferenceEvidence.ts).
    matchPercent: comparable ? c.preference.score : null,
    badge: c.spotlight ? "spotlight" : (badge ?? null),
    interestSent: c.interestSent,
    matched: Boolean(c.matchId),
  };
}

/** A titled horizontal rail of profile cards — virtualized, fixed-width cards, stable keys. */
export const ProfileRail = memo(function ProfileRail({
  title,
  eyebrow,
  cards,
  cardWidth,
  onOpen,
  onInterest,
  onSeeAll,
  badge,
}: {
  title: string;
  eyebrow?: string;
  cards: ReelCard[];
  cardWidth: number;
  onOpen: (id: string) => void;
  onInterest: (id: string) => void;
  onSeeAll?: () => void;
  badge?: ProfileCardData["badge"];
}) {
  if (cards.length === 0) return null;
  return (
    <View>
      <SectionHeader title={title} eyebrow={eyebrow} actionLabel={onSeeAll ? "See all" : undefined} onAction={onSeeAll} />
      <FlatList
        horizontal
        data={cards}
        keyExtractor={(c) => c.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
        ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
        initialNumToRender={3}
        windowSize={5}
        getItemLayout={(_, i) => ({ length: cardWidth + 12, offset: (cardWidth + 12) * i, index: i })}
        renderItem={({ item }) => <ProfileCard data={toCardData(item, badge)} width={cardWidth} onOpen={onOpen} onInterest={onInterest} />}
      />
    </View>
  );
});

export function RailSkeleton({ cardWidth }: { cardWidth: number }) {
  return (
    <View style={{ gap: 12 }}>
      <Skeleton width={180} height={22} />
      <View style={{ flexDirection: "row", gap: 12 }}>
        {[0, 1].map((i) => (
          <Skeleton key={i} width={cardWidth} height={Math.round(cardWidth * 1.32)} radius={20} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { paddingRight: 16 },
});
