import { router, useLocalSearchParams } from "expo-router";
import { Bookmark, Heart, Inbox, MessageCircle, Send, Undo2 } from "lucide-react-native";
import { useState } from "react";
import { Alert, FlatList, Platform, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Avatar,
  EmptyState,
  ErrorState,
  GlassCard,
  Pill,
  PrimaryButton,
  ProfileCard,
  RoomBackground,
  SecondaryButton,
  SegmentedTabs,
  Skeleton,
  Text,
  toast,
} from "~/components";
import { toCardData } from "~/features/home/ProfileRail";
import { useInterestAction } from "~/features/interests/useInterestAction";
import { useLauncherScroll } from "~/features/grio/launcherScroll";
import { useCounts, useInterests, useLane, useRespondInterest, useWithdrawInterest } from "~/hooks/queries";
import { useResponsive } from "~/hooks/useResponsive";
import { errorMessage } from "~/services/api/client";
import { layout, useTheme } from "~/theme";
import type { InterestItem, MatchCard } from "~/types/api";
import { firstNameOf } from "~/utils/names";

type TabKey = "received" | "sent" | "matches" | "shortlist";

function isTabKey(value: unknown): value is TabKey {
  return value === "received" || value === "sent" || value === "matches" || value === "shortlist";
}

const STATUS_PILL: Record<InterestItem["status"], { label: string; tone: "info" | "success" | "danger" | "neutral" }> = {
  RECEIVED: { label: "New", tone: "info" },
  SENT: { label: "Pending", tone: "neutral" },
  ACCEPTED: { label: "Accepted", tone: "success" },
  DECLINED: { label: "Declined", tone: "danger" },
  WITHDRAWN: { label: "Withdrawn", tone: "neutral" },
};

function when(date: string): string {
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
  if (days <= 0) return "Aaj";
  if (days === 1) return "Kal";
  if (days < 7) return `${days} din pehle`;
  return new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/**
 * Interests & matches — the stages of one journey, in fixed tabs: who is
 * waiting on the member (Received), what they sent (Sent), who said yes both
 * ways (Matches), and what they saved to discuss at home (Shortlist).
 */
export default function Interests() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<TabKey>(() => (isTabKey(params.tab) ? params.tab : "received"));
  // A link that names a tab (a notification, "My Matches") picks it — also when the screen is already open.
  const [linkedTab, setLinkedTab] = useState(params.tab);
  if (params.tab !== linkedTab) {
    setLinkedTab(params.tab);
    if (isTabKey(params.tab)) setTab(params.tab);
  }
  const data = useInterests();
  const counts = useCounts();
  const shortlist = useLane("SHORTLIST", tab === "shortlist");
  const respond = useRespondInterest();
  const withdraw = useWithdrawInterest();
  const { sendInterest } = useInterestAction();
  const onScroll = useLauncherScroll();
  const { gridCard } = useResponsive();

  const received = data.data?.interests.received ?? [];
  const sent = data.data?.interests.sent ?? [];
  const matches = data.data?.matches.matches ?? [];

  async function answer(item: InterestItem, status: "ACCEPTED" | "DECLINED") {
    try {
      const res = await respond.mutateAsync({ id: item.id, status });
      if (status === "ACCEPTED") {
        toast.success(`${firstNameOf(item.fromUser.displayName)} ke saath match ho gaya! 🎉`);
        if (res.matchId) router.push(`/chat/${res.matchId}`);
      } else {
        toast.info("Interest decline kar diya");
      }
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  function confirmWithdraw(item: InterestItem) {
    const run = async () => {
      try {
        await withdraw.mutateAsync(item.id);
        toast.info("Interest wapas le liya");
      } catch (err) {
        toast.error(errorMessage(err));
      }
    };
    if (Platform.OS === "web") return void run();
    Alert.alert("Interest wapas lein?", "Unhe ab ye interest nahi dikhega.", [
      { text: "Cancel", style: "cancel" },
      { text: "Withdraw", style: "destructive", onPress: () => void run() },
    ]);
  }

  // The person row opens their profile; Accept / Decline / Withdraw sit beside
  // it, never inside it — a card that is itself a button hides the buttons in
  // it from a screen reader (and nests <button>s on the web).
  const renderInterest = ({ item }: { item: InterestItem }) => {
    const incoming = tab === "received";
    const person = incoming ? item.fromUser : item.toUser;
    const pill = STATUS_PILL[item.status];
    return (
      <GlassCard padding={14} style={styles.gap}>
        <Pressable
          onPress={item.profileId ? () => router.push(`/profile/${item.profileId}`) : undefined}
          disabled={!item.profileId}
          accessibilityRole="button"
          accessibilityLabel={`${person.displayName}${person.age ? `, ${person.age}` : ""}. Open profile`}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        >
          <Avatar uri={null} name={person.displayName} size={52} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {person.displayName}
              {person.age ? `, ${person.age}` : ""}
            </Text>
            <Text variant="small" tone="secondary" numberOfLines={1}>
              {[person.city, when(item.sentDate)].filter(Boolean).join(" · ")}
            </Text>
          </View>
          <Pill label={pill.label} tone={pill.tone} />
        </Pressable>
        {item.message ? (
          <Text variant="small" tone="secondary" style={styles.message}>
            “{item.message}”
          </Text>
        ) : null}
        {incoming && item.status === "RECEIVED" ? (
          <View style={styles.actions}>
            <SecondaryButton label="Decline" size="sm" onPress={() => void answer(item, "DECLINED")} fullWidth={false} style={styles.flex} />
            <PrimaryButton label="Accept" icon={Heart} size="sm" onPress={() => void answer(item, "ACCEPTED")} fullWidth={false} style={styles.flex} />
          </View>
        ) : null}
        {!incoming && item.canWithdraw ? (
          <View style={styles.actions}>
            <SecondaryButton label="Withdraw" icon={Undo2} size="sm" onPress={() => confirmWithdraw(item)} fullWidth={false} />
          </View>
        ) : null}
      </GlassCard>
    );
  };

  const renderMatch = ({ item }: { item: MatchCard }) => (
    <GlassCard padding={14} style={styles.gap}>
      <View style={styles.row}>
        <Avatar uri={item.photoUrl} name={item.displayName} size={56} verified={item.verified} ring />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {item.displayName}
            {item.age ? `, ${item.age}` : ""}
          </Text>
          <Text variant="small" tone="secondary" numberOfLines={1}>
            {[item.city, item.profession].filter(Boolean).join(" · ")}
          </Text>
        </View>
        <SecondaryButton label="Profile" size="sm" fullWidth={false} onPress={() => router.push(`/profile/${item.profileId}`)} />
        <PrimaryButton label="Chat" icon={MessageCircle} size="sm" fullWidth={false} onPress={() => router.push(`/chat/${item.id}`)} />
      </View>
    </GlassCard>
  );

  const loading = tab === "shortlist" ? shortlist.isPending : data.isPending;
  const error = tab === "shortlist" ? shortlist.error : data.error;

  let empty: React.ReactNode = null;
  if (loading) {
    empty = (
      <View style={{ gap: 12 }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={92} radius={20} />
        ))}
      </View>
    );
  } else if (error) {
    empty = <ErrorState error={error} onRetry={() => void (tab === "shortlist" ? shortlist.refetch() : data.refetch())} />;
  } else if (tab === "received") {
    empty = <EmptyState icon={Inbox} title={data.data?.interests.emptyReceived.title ?? "Abhi koi interest nahi aaya"} description={data.data?.interests.emptyReceived.description} actionLabel="Complete Profile" onAction={() => router.push("/setup")} />;
  } else if (tab === "sent") {
    empty = <EmptyState icon={Send} title={data.data?.interests.emptySent.title ?? "Koi interest nahi bheja"} description="Reel ya Search se pasand ke rishte ko interest bhejiye." actionLabel="Open Reels" onAction={() => router.navigate("/reels")} />;
  } else if (tab === "matches") {
    empty = <EmptyState icon={Heart} title={data.data?.matches.emptyState.title ?? "Abhi koi match nahi"} description={data.data?.matches.emptyState.description} actionLabel="Open Reels" onAction={() => router.navigate("/reels")} />;
  } else {
    empty = <EmptyState icon={Bookmark} title="Shortlist khaali hai" description="Reel me Save dabakar rishte yahan rakhiye — ghar walon se baat karne ke liye." />;
  }

  const common = {
    ListHeaderComponent: (
      <View style={styles.head}>
        <Text variant="h1">Interests</Text>
        <SegmentedTabs<TabKey>
          scrollable
          tabs={[
            { key: "received", label: "Received", count: counts.data?.interests || undefined },
            { key: "sent", label: "Sent" },
            { key: "matches", label: "Matches", count: matches.length || undefined },
            { key: "shortlist", label: "Shortlist" },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
    ),
    // A View, not a fragment: the list hands its empty element a layout listener.
    ListEmptyComponent: <View>{empty}</View>,
    contentContainerStyle: [styles.content, { paddingTop: insets.top + 8, paddingBottom: layout.tabBarClearance + insets.bottom }],
    showsVerticalScrollIndicator: false,
    onScroll,
    scrollEventThrottle: 32,
    refreshControl: (
      <RefreshControl
        refreshing={data.isRefetching || shortlist.isRefetching}
        onRefresh={() => void (tab === "shortlist" ? shortlist.refetch() : data.refetch())}
        tintColor={t.colors.gold}
      />
    ),
  };

  return (
    <View style={[styles.root, { backgroundColor: t.colors.background }]}>
      <RoomBackground />
      {tab === "shortlist" ? (
        <FlatList
          key="grid"
          {...common}
          data={loading || error ? [] : (shortlist.data?.cards ?? [])}
          keyExtractor={(c) => c.id}
          numColumns={2}
          columnWrapperStyle={styles.column}
          renderItem={({ item }) => (
            <ProfileCard data={toCardData(item)} width={gridCard} onOpen={(id) => router.push(`/profile/${id}`)} onInterest={(id) => void sendInterest(id, item.displayName)} />
          )}
        />
      ) : tab === "matches" ? (
        <FlatList key="matches" {...common} data={loading || error ? [] : matches} keyExtractor={(m) => m.id} renderItem={renderMatch} />
      ) : (
        <FlatList key={tab} {...common} data={loading || error ? [] : tab === "received" ? received : sent} keyExtractor={(i) => i.id} renderItem={renderInterest} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: layout.gutter, width: "100%", maxWidth: layout.maxContentWidth, alignSelf: "center", flexGrow: 1 },
  head: { gap: 14, marginBottom: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowPressed: { opacity: 0.7 },
  message: { marginTop: 10, fontStyle: "italic" },
  actions: { flexDirection: "row", gap: 10, marginTop: 12 },
  flex: { flex: 1 },
  gap: { marginBottom: 12 },
  column: { justifyContent: "space-between", marginBottom: 12 },
});
