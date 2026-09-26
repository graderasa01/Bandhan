import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { SearchX, Sparkles } from "lucide-react-native";
import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Chip,
  EmptyState,
  ErrorState,
  GlassCard,
  Icon,
  ProfileCard,
  RoomBackground,
  SearchBar,
  SegmentedTabs,
  Skeleton,
  Text,
  toast,
} from "~/components";
import { useInterestAction } from "~/features/interests/useInterestAction";
import { useGrioScreenContext } from "~/features/grio/GrioProvider";
import { useLauncherScroll } from "~/features/grio/launcherScroll";
import { FilterSheet } from "~/features/search/FilterSheet";
import { activeChips, clean, countActive, removeChip } from "~/features/search/filters";
import { useMyProfile, useSearch } from "~/hooks/queries";
import { useResponsive } from "~/hooks/useResponsive";
import { ApiError, errorMessage } from "~/services/api/client";
import { WEB_ORIGIN } from "~/services/config";
import { searchService } from "~/services/search";
import { layout, useTheme } from "~/theme";
import type { DiscoverFilters, DiscoverResultCard, DiscoverSort } from "~/types/api";

const SORTS: Array<{ key: DiscoverSort; label: string }> = [
  { key: "newest", label: "Newest" },
  { key: "trust", label: "Most Trusted" },
];

/**
 * Search — type what you want in plain words ("Jaipur me 26-30, MBA, veg")
 * and Grio turns it into filters (`/api/discover/intent`, shown back as a
 * summary you can edit), or open the filter sheet. Results come from the
 * web's discovery search with its plan gate, consent-gated sensitive filters
 * and photo gate all enforced server-side.
 */
export default function SearchScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { gridCard } = useResponsive();
  const me = useMyProfile();
  const myGender = me.data?.values.gender;
  const defaultLooking = myGender === "Ladka" ? "Ladki" : myGender === "Ladki" ? "Ladka" : undefined;

  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<DiscoverFilters | null>(null);
  const [sort, setSort] = useState<DiscoverSort>("newest");
  const [sheet, setSheet] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const { sendInterest } = useInterestAction();
  const onScroll = useLauncherScroll();

  const applied = useMemo<DiscoverFilters>(() => filters ?? (defaultLooking ? { lookingForGender: defaultLooking } : {}), [filters, defaultLooking]);
  const search = useSearch({ filters: applied, sort }, me.isSuccess);
  const results = useMemo(() => search.data?.pages.flatMap((p) => p.results) ?? [], [search.data]);
  const first = search.data?.pages[0];
  const chips = activeChips(applied);

  // Grio opened from here knows the member's own search — the filters on
  // screen right now, named by their own chips — and can show exactly these.
  const filterCount = countActive(applied);
  useGrioScreenContext(
    filterCount > 0
      ? {
          kind: "discovery",
          summary: chips.filter((c) => c.key !== "lookingForGender").map((c) => c.label).join(" · "),
          filters: applied,
        }
      : null,
  );
  const planLocked = search.error instanceof ApiError && search.error.status === 403;

  async function smartSearch() {
    const q = query.trim();
    if (!q) return;
    setAiBusy(true);
    try {
      const res = await searchService.intent(q, applied);
      setFilters(clean({ ...(defaultLooking ? { lookingForGender: defaultLooking } : {}), ...res.filters }));
      setAiSummary(res.summary || null);
      if (res.clarificationQuestion) toast.info(res.clarificationQuestion);
      else if (res.unresolvedRequests.length) toast.info(`Ye filter nahi ban paya: ${res.unresolvedRequests.join(", ")}`);
    } catch (err) {
      toast.error(errorMessage(err, "Is baat se filter nahi ban paya — filter button se chuniye."));
    } finally {
      setAiBusy(false);
    }
  }

  const header = (
    <View style={styles.head}>
      <Text variant="h1">Search</Text>
      <SearchBar
        value={query}
        onChangeText={setQuery}
        onSubmit={smartSearch}
        placeholder="Jaise: Jaipur me 26-30, MBA, veg"
        onFilterPress={() => setSheet(true)}
        filterCount={countActive(applied)}
      />
      {aiBusy ? (
        <View style={styles.ai}>
          <ActivityIndicator color={t.colors.gold} size="small" />
          <Text variant="small" tone="secondary">
            Grio aapki baat ko filters me badal raha hai…
          </Text>
        </View>
      ) : aiSummary ? (
        <View style={styles.ai}>
          <Icon icon={Sparkles} size={15} tone="gold" />
          <Text variant="small" tone="secondary" style={{ flex: 1 }}>
            Grio samjha: {aiSummary}
          </Text>
        </View>
      ) : null}
      {chips.length ? (
        <FlatList
          horizontal
          data={chips}
          keyExtractor={(c) => c.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => (
            <Chip
              label={item.label}
              size="sm"
              removable={item.key !== "lookingForGender"}
              selected={item.key === "lookingForGender"}
              onPress={item.key === "lookingForGender" ? () => setSheet(true) : () => setFilters(removeChip(applied, item))}
            />
          )}
        />
      ) : null}
      <View style={styles.sortRow}>
        <Text variant="small" tone="secondary" style={{ flex: 1 }}>
          {first ? first.countLabel : " "}
        </Text>
        <SegmentedTabs fit tabs={SORTS} value={sort} onChange={setSort} />
      </View>
    </View>
  );

  const renderCard = ({ item }: { item: DiscoverResultCard }) => (
    <ProfileCard
      width={gridCard}
      data={{
        profileId: item.profileId,
        name: item.displayName,
        age: item.age,
        city: item.city,
        education: item.education,
        profession: item.profession,
        photoUrl: item.photoUnlocked ? item.photoUrl : null,
        photoLock: item.photoUnlocked ? "open" : item.photoLock,
        verified: item.verified,
      }}
      onOpen={(id) => router.push(`/profile/${id}`)}
      onInterest={(id) => void sendInterest(id, item.displayName)}
    />
  );

  return (
    <View style={[styles.root, { backgroundColor: t.colors.background }]}>
      <RoomBackground />
      <FlatList
        data={planLocked || search.isError ? [] : results}
        keyExtractor={(r) => r.profileId}
        onScroll={onScroll}
        scrollEventThrottle={32}
        numColumns={2}
        columnWrapperStyle={styles.column}
        renderItem={renderCard}
        ListHeaderComponent={header}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 8, paddingBottom: layout.tabBarClearance + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onEndReached={() => search.hasNextPage && !search.isFetchingNextPage && void search.fetchNextPage()}
        onEndReachedThreshold={0.6}
        initialNumToRender={6}
        windowSize={7}
        refreshControl={<RefreshControl refreshing={search.isRefetching} onRefresh={() => void search.refetch()} tintColor={t.colors.gold} />}
        ListEmptyComponent={
          search.isPending || !me.isSuccess ? (
            <View style={styles.skeletons}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} width={gridCard} height={Math.round(gridCard * 1.32)} radius={20} />
              ))}
            </View>
          ) : planLocked ? (
            <EmptyState
              title="Advanced search aapke plan me nahi hai"
              description={errorMessage(search.error)}
              actionLabel="See Plans"
              onAction={() => void WebBrowser.openBrowserAsync(`${WEB_ORIGIN}/pricing`)}
            />
          ) : search.isError ? (
            <ErrorState error={search.error} onRetry={() => void search.refetch()} />
          ) : (
            <View style={{ gap: 12 }}>
              <EmptyState
                icon={SearchX}
                title="In filters se koi profile nahi mila"
                description="Kuch filters hata kar dekhiye — ya neeche diye sujhav try kijiye."
                actionLabel="Clear Filters"
                onAction={() => {
                  setFilters(null);
                  setAiSummary(null);
                }}
              />
              {first?.suggestions.map((s) => (
                <GlassCard key={s.id} padding={14} onPress={() => setFilters(clean(s.filters))}>
                  <Text variant="bodyStrong" tone="gold">
                    {s.label}
                  </Text>
                </GlassCard>
              ))}
            </View>
          )
        }
        ListFooterComponent={search.isFetchingNextPage ? <ActivityIndicator color={t.colors.gold} style={{ marginVertical: 20 }} /> : null}
      />
      <FilterSheet
        visible={sheet}
        initial={applied}
        onClose={() => setSheet(false)}
        onApply={(f) => {
          setFilters(f);
          setAiSummary(null);
          setSheet(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: layout.gutter, width: "100%", maxWidth: layout.maxContentWidth, alignSelf: "center" },
  head: { gap: 12, marginBottom: 14 },
  ai: { flexDirection: "row", alignItems: "center", gap: 8 },
  sortRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  column: { justifyContent: "space-between", marginBottom: 12 },
  skeletons: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 },
});
