import { router } from "expo-router";
import { Bell, Bookmark, Clapperboard, Mic, Search, Send, Sparkles } from "lucide-react-native";
import { useMemo } from "react";
import { Pressable, RefreshControl, StyleSheet, View } from "react-native";
import {
  AIInsightCard,
  Avatar,
  EmptyState,
  ErrorState,
  GlassCard,
  Icon,
  IconButton,
  PrimaryButton,
  ProgressRing,
  Screen,
  Text,
} from "~/components";
import { GrioDashboardCard } from "~/features/grio/GrioDashboardCard";
import { useLauncherScroll } from "~/features/grio/launcherScroll";
import { ProfileRail, RailSkeleton } from "~/features/home/ProfileRail";
import { useInterestAction } from "~/features/interests/useInterestAction";
import { useCounts, useMyProfile, useReel } from "~/hooks/queries";
import { useResponsive } from "~/hooks/useResponsive";
import { useSession } from "~/store/session";
import { layout, radius, useTheme } from "~/theme";
import { appTargetFor } from "~/utils/webRoutes";
import { firstNameOf } from "~/utils/names";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Suprabhat";
  if (h < 17) return "Namaste";
  return "Shubh sandhya";
}

/**
 * The primary discovery screen: who the member is (avatar → profile &
 * settings), how complete their profile is, and today's people — recommended,
 * new to them, and nearby — straight from today's reel deck, so Home and the
 * Reel never disagree about who is on offer.
 */
export default function Home() {
  const t = useTheme();
  const { column } = useResponsive();
  const user = useSession((s) => s.user);
  const me = useMyProfile();
  const reel = useReel();
  const counts = useCounts();
  const { sendInterest } = useInterestAction();
  const onScroll = useLauncherScroll();
  const cardWidth = Math.round(Math.min(190, (column - layout.gutter * 2) * 0.46));

  const firstName = firstNameOf(me.data?.values.fullName ?? user?.full_name);
  const cards = useMemo(() => reel.data?.cards ?? [], [reel.data?.cards]);

  const sections = useMemo(() => {
    const undecided = cards.filter((c) => !c.lastDecision && !c.matchId);
    const recommended = [...undecided].sort((a, b) => (b.rankScore ?? 0) - (a.rankScore ?? 0)).slice(0, 10);
    const fresh = undecided.filter((c) => !c.seenBefore).slice(0, 10);
    const nearby = cards.filter((c) => c.nearby && !c.matchId).slice(0, 10);
    return { recommended, fresh, nearby };
  }, [cards]);

  const open = (id: string) => router.push(`/profile/${id}`);
  const interest = (id: string) => void sendInterest(id, cards.find((c) => c.id === id)?.displayName);
  const completion = me.data?.completionPercent ?? 0;
  const notice = reel.data?.preferenceNotice;

  return (
    <Screen
      tabBar
      onScroll={onScroll}
      refreshControl={
        <RefreshControl
          refreshing={reel.isRefetching || me.isRefetching}
          onRefresh={() => {
            void reel.refetch();
            void me.refetch();
            void counts.refetch();
          }}
          tintColor={t.colors.gold}
        />
      }
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.push("/me")} accessibilityRole="button" accessibilityLabel="My profile and settings" style={styles.who}>
          <Avatar uri={reel.data?.viewer.photoUrl ?? me.data?.photos.find((p) => p.isPrimary)?.fileUrl} name={firstName || "Aap"} size={46} ring />
          <View style={{ flex: 1 }}>
            <Text variant="small" tone="secondary">
              {greeting()},
            </Text>
            <Text variant="h2" numberOfLines={1}>
              {firstName || "Aap"}
            </Text>
          </View>
        </Pressable>
        <IconButton icon={Bell} label="Notifications" badge={counts.data?.inbox} onPress={() => router.push("/notifications")} />
      </View>

      {completion < 100 && me.data ? (
        <GlassCard padding={16} onPress={() => router.push("/setup")} accessibilityLabel={`Profile ${completion}% complete. Complete profile`}>
          <View style={styles.completion}>
            <ProgressRing percent={completion} size={64} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text variant="bodyStrong">Profile {completion}% complete</Text>
              <Text variant="small" tone="secondary" numberOfLines={2}>
                {me.data.photos.length === 0
                  ? "Ek photo lagaiye — photo wali profiles ko kahin zyada jawab milte hain."
                  : "Thodi aur jaankari se sahi rishte aap tak jaldi pahunchenge."}
              </Text>
            </View>
          </View>
        </GlassCard>
      ) : null}

      <View style={styles.quick}>
        {[
          { icon: Clapperboard, label: "Reels", onPress: () => router.navigate("/reels") },
          { icon: Search, label: "Search", onPress: () => router.navigate("/search") },
          { icon: Bookmark, label: "Shortlist", onPress: () => router.navigate("/interests?tab=shortlist") },
          { icon: Mic, label: "Voice Fill", onPress: () => router.push("/assistant/voice") },
        ].map((q) => (
          <Pressable key={q.label} onPress={q.onPress} accessibilityRole="button" accessibilityLabel={q.label} style={({ pressed }) => [styles.quickItem, pressed && { opacity: 0.75 }]}>
            <View style={[styles.quickSeal, { backgroundColor: t.colors.glassSoft, borderColor: t.colors.rim }]}>
              <Icon icon={q.icon} size={22} tone="gold" />
            </View>
            <Text variant="caption" tone="secondary">
              {q.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {counts.data?.interests ? (
        <GlassCard active padding={14} onPress={() => router.navigate("/interests")}>
          <View style={styles.completion}>
            <Icon icon={Send} size={22} tone="gold" />
            <Text variant="bodyStrong" style={{ flex: 1 }}>
              {counts.data.interests} {counts.data.interests === 1 ? "interest aapka intezaar kar raha hai" : "interests aapka intezaar kar rahe hain"}
            </Text>
            <Text variant="smallStrong" tone="gold">
              View
            </Text>
          </View>
        </GlassCard>
      ) : null}

      {notice ? (
        <AIInsightCard
          eyebrow="Behtar matches ke liye"
          title={notice.title}
          body={notice.body}
          actionLabel="Add Preferences"
          onAction={() => {
            const target = appTargetFor(notice.ctaHref);
            router.push(target?.kind === "app" ? target.route : "/setup/preferences");
          }}
        />
      ) : null}

      <View style={styles.sections}>
        {reel.isPending ? (
          <>
            <RailSkeleton cardWidth={cardWidth} />
            <RailSkeleton cardWidth={cardWidth} />
          </>
        ) : reel.isError ? (
          <ErrorState error={reel.error} onRetry={() => void reel.refetch()} />
        ) : reel.data?.emptyState ? (
          <EmptyState
            icon={Sparkles}
            title={reel.data.emptyState.title}
            description={reel.data.emptyState.description}
            actionLabel="Complete Profile"
            onAction={() => router.push("/setup")}
          />
        ) : (
          <>
            <ProfileRail
              eyebrow="Aaj ke liye"
              title="Recommended"
              cards={sections.recommended}
              cardWidth={cardWidth}
              onOpen={open}
              onInterest={interest}
              onSeeAll={() => router.navigate("/reels")}
            />
            <ProfileRail eyebrow="Pehli baar" title="New Profiles" cards={sections.fresh} cardWidth={cardWidth} onOpen={open} onInterest={interest} badge="new" />
            <ProfileRail eyebrow="Aapke sheher me" title="Nearby" cards={sections.nearby} cardWidth={cardWidth} onOpen={open} onInterest={interest} badge="nearby" />
            {sections.recommended.length === 0 && sections.fresh.length === 0 ? (
              <EmptyState
                icon={Clapperboard}
                title="Aaj ke sab rishte dekh liye"
                description="Search se apni pasand ke hisaab se aur dhoondhiye, ya kal naye rishte aayenge."
                actionLabel="Search Profiles"
                onAction={() => router.navigate("/search")}
              />
            ) : null}
          </>
        )}
      </View>

      <GrioDashboardCard unread={counts.data?.messages ?? 0} pendingInterests={counts.data?.interests ?? 0} profileComplete={completion >= 100} />

      {me.data && !me.data.isLive ? (
        <PrimaryButton label="Complete Profile" onPress={() => router.push("/setup")} style={{ marginTop: 16 }} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  who: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  completion: { flexDirection: "row", alignItems: "center", gap: 14 },
  quick: { flexDirection: "row", justifyContent: "space-between", marginVertical: 18 },
  quickItem: { alignItems: "center", gap: 6, flex: 1 },
  quickSeal: { width: 54, height: 54, borderRadius: radius.lg, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  sections: { gap: 26, marginVertical: 20 },
});
