import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { EmptyState, ErrorState, GhostButton, ProfileCard, Screen, ScreenHeader, Skeleton, Text } from "~/components";
import { toCardData } from "~/features/home/ProfileRail";
import { useInterestAction } from "~/features/interests/useInterestAction";
import { LANE_HINT, LANE_ICON, LANE_LABEL, isLane } from "~/features/reels/lanes";
import { useLanePages } from "~/hooks/queries";
import { useResponsive } from "~/hooks/useResponsive";
import { layout, useTheme } from "~/theme";
import type { ReelLane, ReelLibraryCard } from "~/types/api";

/**
 * One Meri List lane, whole — the server's page cursor, its own `total`, and
 * each card's one provable line (`laneNote`: "Viewed · aaj", "Interest
 * sent"…). A person opens as their profile on top of this screen, so Back
 * returns to the same lane at the same scroll, and Back again to the reel
 * card the list was opened from.
 */
export default function LaneScreen() {
  const params = useLocalSearchParams<{ lane: string }>();
  const lane: ReelLane | null = isLane(params.lane) ? params.lane : null;
  return lane ? <Lane lane={lane} /> : <MissingLane />;
}

function MissingLane() {
  return (
    <Screen header={<ScreenHeader title="Meri List" />}>
      <EmptyState title="Ye list nahi mili" description="Reel se Meri List dobara kholiye." />
    </Screen>
  );
}

function Lane({ lane }: { lane: ReelLane }) {
  const t = useTheme();
  const { gridCard } = useResponsive();
  const pages = useLanePages(lane);
  const { sendInterest } = useInterestAction();
  const cards: ReelLibraryCard[] = pages.data?.pages.flatMap((p) => p.cards) ?? [];
  const total = pages.data?.pages[0]?.total;
  // Interest from a lane card only where it is still possible — never on Messages or a match.
  const canInterest = lane === "VIEWED" || lane === "LIKED" || lane === "SHORTLIST";

  let empty: React.ReactNode = null;
  if (pages.isPending) {
    empty = (
      <View style={styles.skeletons}>
        {[0, 1].map((i) => (
          <Skeleton key={i} width={gridCard} height={Math.round(gridCard * 1.32)} radius={20} />
        ))}
      </View>
    );
  } else if (pages.isError) {
    empty = <ErrorState error={pages.error} onRetry={() => void pages.refetch()} />;
  } else {
    empty = <EmptyState icon={LANE_ICON[lane]} title={`${LANE_LABEL[lane]} me abhi koi nahi`} description={LANE_HINT[lane]} actionLabel="Open Reels" onAction={() => router.navigate("/reels")} />;
  }

  return (
    <Screen
      scroll={false}
      padded={false}
      header={<ScreenHeader title={`${LANE_LABEL[lane]}${total !== undefined ? ` · ${total}` : ""}`} subtitle={LANE_HINT[lane]} />}
    >
      <FlatList
        data={pages.isPending || pages.isError ? [] : cards}
        keyExtractor={(c) => c.id}
        numColumns={2}
        columnWrapperStyle={styles.column}
        contentContainerStyle={styles.content}
        ListEmptyComponent={<View>{empty}</View>}
        refreshControl={<RefreshControl refreshing={pages.isRefetching && !pages.isFetchingNextPage} onRefresh={() => void pages.refetch()} tintColor={t.colors.gold} />}
        onEndReached={() => {
          if (pages.hasNextPage && !pages.isFetchingNextPage && !pages.isFetchNextPageError) void pages.fetchNextPage();
        }}
        onEndReachedThreshold={0.6}
        renderItem={({ item }) => (
          <View style={{ width: gridCard, gap: 6 }}>
            <ProfileCard
              data={toCardData(item)}
              width={gridCard}
              onOpen={(id) => router.push(`/profile/${id}`)}
              onInterest={canInterest ? (id) => void sendInterest(id, item.displayName) : undefined}
            />
            <Text variant="caption" tone="muted" numberOfLines={1} style={styles.note}>
              {item.laneNote}
            </Text>
          </View>
        )}
        ListFooterComponent={
          pages.isFetchingNextPage ? (
            <ActivityIndicator color={t.colors.gold} style={styles.more} />
          ) : pages.isFetchNextPageError ? (
            <View style={styles.more}>
              <Text variant="small" tone="danger" center>
                Aur profiles load nahi hui.
              </Text>
              <GhostButton label="Try Again" size="sm" onPress={() => void pages.fetchNextPage()} />
            </View>
          ) : cards.length > 0 && !pages.hasNextPage ? (
            <Text variant="caption" tone="muted" center style={styles.more}>
              Bas itne hi — list poori ho gayi.
            </Text>
          ) : null
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.gutter, paddingTop: 8, paddingBottom: 40, gap: 14 },
  column: { gap: 12 },
  skeletons: { flexDirection: "row", gap: 12 },
  note: { paddingHorizontal: 4 },
  more: { marginVertical: 18, alignItems: "center", gap: 6 },
});
