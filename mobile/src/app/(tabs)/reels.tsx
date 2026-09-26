import { useQueryClient } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { router, useFocusEffect } from "expo-router";
import { Camera, ChevronsUp, Clapperboard, ListChecks, Search, SlidersHorizontal, Sparkles } from "lucide-react-native";
import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Platform, Pressable, StyleSheet, View, type LayoutChangeEvent, type ViewToken } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomSheet, EmptyState, ErrorState, GhostButton, GlassCard, Icon, PrimaryButton, RoomBackground, SecondaryButton, Text, toast } from "~/components";
import { useOpenGrio } from "~/features/grio/GrioProvider";
import { KundliMilanSheet } from "~/features/kundli/KundliMilanSheet";
import { FieldsForm, useFieldsEdit } from "~/features/profile-question/FieldsForm";
import { FeedQuestionPage } from "~/features/reels/FeedQuestionPage";
import { ReelComposeSheet, type ComposeMode } from "~/features/reels/ReelComposeSheet";
import { ReelInsightSheet } from "~/features/reels/ReelInsightSheet";
import { ReelListSheet } from "~/features/reels/ReelListSheet";
import { ReelMoreSheet, type ReelMoreActions } from "~/features/reels/ReelMoreSheet";
import { ReelProfilePage, type ReelPageActions } from "~/features/reels/ReelProfilePage";
import { applyLens, buildFeed, feedQuestionsForVisit, type FeedItem, type ReelLensKey } from "~/features/reels/buildFeed";
import { ReportSheet } from "~/features/safety/ReportSheet";
import { FIELD_BY_KEY } from "~/catalog";
import { dropReelCard, qk, useCounts, useReel, useSaveProfile, useSwipe, useToggleLike, useToggleShortlist } from "~/hooks/queries";
import { errorMessage } from "~/services/api/client";
import { reelService } from "~/services/reel";
import { safetyService } from "~/services/safety";
import { usePrefs } from "~/store/prefs";
import { layout, radius, usePhotoChrome, useTheme } from "~/theme";
import type { ReelCard, ReelRefineQuestion, ReelViewModel } from "~/types/api";
import { haptics } from "~/utils/haptics";
import { firstNameOf } from "~/utils/names";

const LENSES: Array<{ key: ReelLensKey; label: string }> = [
  { key: "FOR_YOU", label: "For You" },
  { key: "NEARBY", label: "Nearby" },
  { key: "NEW", label: "New" },
];

/** The sheet over the reel — one at a time, about one person (by id, so it always shows the card as it is now). */
type Sheet =
  | { kind: "more" | "insight" | "report"; id: string }
  | { kind: "kundli"; id: string; name: string }
  | { kind: "compose"; id: string; mode: ComposeMode }
  | { kind: "list" }
  | { kind: "prefs" }
  | null;

/**
 * Two sheets never overlap: the next one opens once the last has slid away.
 * iOS dismisses a modal together with anything presented over it, so opening
 * the next while the last is still leaving would take both down.
 */
const SHEET_SWAP_MS = 260;

/** `?fields=a,b` from a server CTA — only fields the catalog knows. */
function fieldsOf(href: string | undefined): string[] {
  const m = /[?&]fields=([^&]+)/.exec(href ?? "");
  return m ? decodeURIComponent(m[1]!).split(",").map((k) => k.trim()).filter((k) => FIELD_BY_KEY[k]) : [];
}

/**
 * Rishta Reel — full-screen, one person at a time, and the app's main door to
 * discovery. Up/down is the next person, sideways their photos; Skip and Send
 * Interest are labelled buttons (D-92). The deck is the server's
 * (`getReelData`) and tops itself up as it runs out (D-91); every person
 * scrolled past is recorded as seen, as on the web, and a few of the member's
 * own missing details are asked in between, one tap each.
 *
 * Everything else about a person opens *over* the reel — Kundli, Grio's "why",
 * More, a quick message, Meri List, report — so closing it leaves the same
 * card, the same photo, the same lens and scroll. A profile, a chat or Grio
 * push on top of the tabs, and Back lands on the same card too. A decision is
 * shown only once the server has it; a failure says so and changes nothing.
 */
export default function Reels() {
  const t = useTheme();
  const chrome = usePhotoChrome();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const reel = useReel();
  const swipe = useSwipe();
  const like = useToggleLike();
  const shortlist = useToggleShortlist();
  const saveProfile = useSaveProfile();
  const unread = useCounts().data?.messages ?? 0;
  const coachSeen = usePrefs((s) => s.reelCoachSeen);
  const setCoachSeen = usePrefs((s) => s.setReelCoachSeen);

  const [height, setHeight] = useState(0);
  const [lens, setLens] = useState<ReelLensKey>("FOR_YOU");
  const openGrio = useOpenGrio();
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [focused, setFocused] = useState(true);
  const cursor = useRef<string | null | undefined>(undefined);
  const list = useRef<FlatList<FeedItem>>(null);
  const decided = useRef(new Set<string>());
  const visibleKey = useRef<string | null>(null);
  const visibleIndex = useRef(0);

  // Requests in flight, per person and kind — a second tap waits for the
  // first answer (the ref is the guard, the state is what the buttons show).
  const inFlight = useRef(new Set<string>());
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());
  const begin = useCallback((key: string) => {
    if (inFlight.current.has(key)) return false;
    inFlight.current.add(key);
    setBusy(new Set(inFlight.current));
    return true;
  }, []);
  const end = useCallback((key: string) => {
    inFlight.current.delete(key);
    setBusy(new Set(inFlight.current));
  }, []);

  const [sheet, setSheet] = useState<Sheet>(null);
  const swapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeSheet = useCallback(() => {
    if (swapTimer.current) clearTimeout(swapTimer.current);
    setSheet(null);
  }, []);
  /** Closes whatever is open, then opens `next` — straight away when nothing was open. */
  const openSheet = useCallback((next: Sheet) => {
    if (swapTimer.current) clearTimeout(swapTimer.current);
    setSheet((current) => {
      if (!current) return next;
      swapTimer.current = setTimeout(() => setSheet(next), SHEET_SWAP_MS);
      return null;
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const cards = useMemo(() => reel.data?.cards ?? [], [reel.data?.cards]);
  const cardById = (id: string | undefined) => (id ? (cards.find((c) => c.id === id) ?? null) : null);

  /*
   * "New" as each card arrived. A Skip marks a card seen on the phone at once;
   * the New lens still counts and keeps it, so nothing moves under the thumb.
   */
  const [arrivedNew, setArrivedNew] = useState<Record<string, boolean>>({});
  const unseenArrivals = cards.filter((c) => arrivedNew[c.id] === undefined);
  if (unseenArrivals.length) {
    setArrivedNew((prev) => {
      const next = { ...prev };
      for (const c of unseenArrivals) next[c.id] = !c.seenBefore;
      return next;
    });
  }
  const lensCards = useMemo(() => applyLens(cards, lens, arrivedNew), [cards, lens, arrivedNew]);

  /*
   * "Reel dekhte-dekhte profile" for this visit. The questions are fixed when
   * the deck first arrives — a refetch or a top-up never reshuffles the pages
   * already dealt — and a question stays on its page once answered (it shows
   * "Saved"), so the feed never jumps under the thumb. One that has been on
   * screen is not dealt again this visit, answered or skipped: a new lens is
   * a fresh list without it.
   */
  const [visitQuestions, setVisitQuestions] = useState<ReelRefineQuestion[] | null>(null);
  if (visitQuestions === null && reel.data) setVisitQuestions(feedQuestionsForVisit(reel.data.feedQuestions ?? []));
  const shownQuestions = useRef(new Set<string>());
  const [retired, setRetired] = useState<ReadonlySet<string>>(() => new Set());
  const [answered, setAnswered] = useState<Record<string, string>>({});
  const questions = useMemo(() => (visitQuestions ?? []).filter((q) => !retired.has(q.key)), [visitQuestions, retired]);
  const feed = useMemo(() => buildFeed(lensCards, questions), [lensCards, questions]);
  const extraData = useMemo(() => ({ answered, busy }), [answered, busy]);

  const bottomInset = layout.tabBarHeight + Math.max(insets.bottom, 10) + 6;

  const scrollNext = useCallback(() => {
    const next = visibleIndex.current + 1;
    if (next < feed.length) list.current?.scrollToIndex({ index: next, animated: true });
  }, [feed.length]);

  const reelId = reel.data?.reelId;
  const swipeMutate = swipe.mutate;
  const swipeAsync = swipe.mutateAsync;
  const likeAsync = like.mutateAsync;
  const shortlistAsync = shortlist.mutateAsync;
  const saveProfileAsync = saveProfile.mutateAsync;

  /** Skip = the labelled "not this one" (LEFT). Said twice, it is written once. */
  const onSkip = useCallback(
    (card: ReelCard) => {
      decided.current.add(card.id);
      haptics.tap();
      if (card.lastDecision !== "LEFT") swipeMutate({ profileId: card.id, direction: "LEFT", reelId, wasButton: true, decisionMs: 0 });
      scrollNext();
    },
    [reelId, scrollNext, swipeMutate],
  );

  const onInterest = useCallback(
    async (card: ReelCard) => {
      if (card.interestSent || card.matchId || !begin(`interest:${card.id}`)) return;
      decided.current.add(card.id);
      try {
        const res = await swipeAsync({ profileId: card.id, direction: "RIGHT", reelId, wasButton: true, decisionMs: 0 });
        if (res.matched) {
          haptics.success();
          toast.success(`It's a match with ${firstNameOf(card.displayName)}! 🎉`);
        } else {
          haptics.tap();
          toast.success(`${firstNameOf(card.displayName)} ko interest bhej diya`);
          // On to the next person — only if this card is still the one on screen.
          setTimeout(() => {
            if (visibleKey.current === `p-${card.id}`) scrollNext();
          }, 450);
        }
      } catch (err) {
        decided.current.delete(card.id);
        haptics.warn();
        toast.error(errorMessage(err, "Interest nahi gaya — dobara try karein."));
      } finally {
        end(`interest:${card.id}`);
      }
    },
    [begin, end, reelId, scrollNext, swipeAsync],
  );

  const onLike = useCallback(
    async (card: ReelCard) => {
      if (!begin(`like:${card.id}`)) return;
      const next = !card.liked;
      try {
        await likeAsync({ profileId: card.id, liked: next });
        toast.info(next ? "Pasand kiya — sirf aapko pata hai" : "Like hata diya");
      } catch (err) {
        toast.error(errorMessage(err, "Like save nahi hua — dobara try karein."));
      } finally {
        end(`like:${card.id}`);
      }
    },
    [begin, end, likeAsync],
  );

  const onShortlist = useCallback(
    async (card: ReelCard) => {
      if (!begin(`save:${card.id}`)) return;
      const on = !card.shortlisted;
      try {
        await shortlistAsync({ profileId: card.id, on });
        toast.success(on ? "Shortlist me save kiya" : "Shortlist se hataya");
      } catch (err) {
        toast.error(errorMessage(err, "Shortlist save nahi hui — dobara try karein."));
      } finally {
        end(`save:${card.id}`);
      }
    },
    [begin, end, shortlistAsync],
  );

  /** Blocked: out of the deck at once, and never recorded as a view. */
  const removeBlocked = useCallback(
    (id: string) => {
      decided.current.add(id);
      dropReelCard(qc, id);
    },
    [qc],
  );

  const confirmBlock = useCallback(
    (card: ReelCard) => {
      const run = async () => {
        try {
          await safetyService.block({ profileId: card.id });
          removeBlocked(card.id);
          toast.success(`${firstNameOf(card.displayName)} ko block kar diya`);
        } catch (err) {
          toast.error(errorMessage(err, "Block nahi hua — dobara try karein."));
        }
      };
      closeSheet();
      if (Platform.OS === "web") return void run();
      Alert.alert(`Block ${firstNameOf(card.displayName)}?`, "Ye aapko na dekh payenge, na message kar payenge. Settings se kabhi bhi unblock kar sakte hain.", [
        { text: "Cancel", style: "cancel" },
        { text: "Block", style: "destructive", onPress: () => void run() },
      ]);
    },
    [closeSheet, removeBlocked],
  );

  const askGrio = useCallback(
    (card: ReelCard, ask?: string) => {
      closeSheet();
      // The card's own id, from the deck — never a name Grio has to guess from.
      openGrio({ kind: "candidate", profileId: card.id, name: card.displayName, source: "reel" }, ask ? { ask } : undefined);
    },
    [closeSheet, openGrio],
  );

  const actions: ReelPageActions = useMemo(
    () => ({
      onSkip,
      onInterest: (card) => void onInterest(card),
      onMessage: (card) => card.matchId && openSheet({ kind: "compose", id: card.id, mode: "message" }),
      onShortlist: (card) => void onShortlist(card),
      onKundli: (card) => openSheet({ kind: "kundli", id: card.id, name: card.displayName }),
      onGrio: (card) => openSheet({ kind: "insight", id: card.id }),
      onMore: (card) => openSheet({ kind: "more", id: card.id }),
      onOpen: (card) => router.push(`/profile/${card.id}`),
    }),
    [onInterest, onShortlist, onSkip, openSheet],
  );

  const moreActions: ReelMoreActions = useMemo(
    () => ({
      onProfile: (card) => {
        closeSheet();
        router.push(`/profile/${card.id}`);
      },
      onWhy: (card) => openSheet({ kind: "insight", id: card.id }),
      onLike: (card) => void onLike(card),
      onKundli: (card) => openSheet({ kind: "kundli", id: card.id, name: card.displayName }),
      onMessage: (card) => openSheet({ kind: "compose", id: card.id, mode: "message" }),
      onNote: (card) => openSheet({ kind: "compose", id: card.id, mode: "note" }),
      onList: () => openSheet({ kind: "list" }),
      onSearch: () => {
        closeSheet();
        router.navigate("/search");
      },
      onReport: (card) => openSheet({ kind: "report", id: card.id }),
      onBlock: confirmBlock,
    }),
    [closeSheet, confirmBlock, onLike, openSheet],
  );

  /** A feed question's chip: the member's own confirmed word, through the ordinary autosave. The page shows the outcome. */
  const answerQuestion = useCallback(
    async (key: string, value: string) => {
      try {
        await saveProfileAsync({ values: { [key]: value } });
        setAnswered((prev) => ({ ...prev, [key]: value }));
        haptics.success();
        return true;
      } catch {
        haptics.warn();
        return false;
      }
    },
    [saveProfileAsync],
  );

  /** Skip / Next, and the move after "Saved" — only while that question is still the page on screen. */
  const questionNext = useCallback(
    (key: string) => {
      if (visibleKey.current === `q-${key}`) scrollNext();
    },
    [scrollNext],
  );

  const loadMore = useCallback(async () => {
    if (loadingMore || exhausted || !reel.data) return;
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const res = await reelService.more(cursor.current === undefined ? reel.data.seenCursor : cursor.current);
      cursor.current = res.seenCursor ?? null;
      if (res.exhausted) setExhausted(true);
      if (res.cards.length) {
        qc.setQueryData<ReelViewModel>(qk.reel, (old) => {
          if (!old) return old;
          const have = new Set(old.cards.map((c) => c.id));
          return { ...old, cards: [...old.cards, ...res.cards.filter((c) => !have.has(c.id))] };
        });
      }
    } catch {
      // A failed top-up is not the end of the pool — the end page says so and offers a retry.
      setMoreFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }, [exhausted, loadingMore, qc, reel.data]);

  // Stable for the list's whole life (FlatList does not allow swapping it): it only touches refs.
  const onViewable = useCallback(({ viewableItems }: { viewableItems: ViewToken<FeedItem>[] }) => {
    const top = viewableItems[0];
    if (!top || top.index == null) return;
    const prev = visibleKey.current;
    visibleKey.current = top.item.key;
    visibleIndex.current = top.index;
    if (top.item.kind === "question") shownQuestions.current.add(top.item.question.key);
    // Moving past a person without deciding records a view — the web's UP row.
    if (prev && prev !== top.item.key && prev.startsWith("p-")) {
      const id = prev.slice(2);
      if (!decided.current.has(id)) {
        decided.current.add(id);
        void reelService.swipe({ profileId: id, direction: "UP", decisionMs: 0, wasButton: false }).catch(() => {});
      }
    }
  }, []);

  // One root for every state below, measured from its first frame. It used to
  // be a different root per state, and the measured one arrived only with the
  // deck: the loading root was reused, the layout listener joined a view whose
  // size never changed again, no layout event came, the height stayed 0 and a
  // first visit to Reels showed an empty screen.
  const measure = (e: LayoutChangeEvent) => setHeight(e.nativeEvent.layout.height);

  if (reel.isPending) {
    return (
      <View style={[styles.root, styles.center, { backgroundColor: t.colors.background }]} onLayout={measure}>
        <RoomBackground />
        <ActivityIndicator color={t.colors.gold} size="large" />
        <Text variant="small" tone="secondary">
          Aaj ke rishte laa rahe hain…
        </Text>
      </View>
    );
  }

  if (reel.isError || !reel.data) {
    return (
      <View style={[styles.root, styles.padded, { paddingTop: insets.top + 40, backgroundColor: t.colors.background }]} onLayout={measure}>
        <RoomBackground />
        <ErrorState error={reel.error} onRetry={() => void reel.refetch()} />
      </View>
    );
  }

  if (reel.data.emptyState) {
    return (
      <View style={[styles.root, styles.padded, { paddingTop: insets.top + 40, backgroundColor: t.colors.background }]} onLayout={measure}>
        <RoomBackground />
        <EmptyState
          icon={Clapperboard}
          title={reel.data.emptyState.title}
          description={reel.data.emptyState.description}
          actionLabel="Complete Profile"
          onAction={() => router.push("/setup")}
        />
      </View>
    );
  }

  const counts: Record<ReelLensKey, number> = {
    FOR_YOU: cards.length,
    NEARBY: cards.filter((c) => c.nearby).length,
    NEW: cards.filter((c) => arrivedNew[c.id] ?? !c.seenBefore).length,
  };

  const sheetCard = sheet && "id" in sheet ? cardById(sheet.id) : null;
  const kundliTarget = sheet?.kind === "kundli" ? { profileId: sheet.id, name: sheet.name } : null;
  const notice = reel.data.preferenceNotice;
  const noticeFields = fieldsOf(notice?.ctaHref);

  return (
    <View style={[styles.root, { backgroundColor: t.colors.background }]} onLayout={measure}>
      {focused ? <StatusBar style="light" /> : null}
      {height > 0 ? (
        <FlatList
          ref={list}
          data={feed}
          extraData={extraData}
          keyExtractor={(item) => item.key}
          pagingEnabled
          snapToInterval={height}
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, i) => ({ length: height, offset: height * i, index: i })}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          windowSize={3}
          removeClippedSubviews
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 70 }}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={2}
          renderItem={({ item }) =>
            item.kind === "profile" ? (
              <ReelProfilePage
                card={item.card}
                height={height}
                topInset={insets.top}
                bottomInset={bottomInset}
                actions={actions}
                interestBusy={busy.has(`interest:${item.card.id}`)}
                saveBusy={busy.has(`save:${item.card.id}`)}
              />
            ) : item.kind === "question" ? (
              <FeedQuestionPage
                question={item.question}
                saved={answered[item.question.key]}
                height={height}
                topInset={insets.top}
                bottomInset={bottomInset}
                onAnswer={answerQuestion}
                onNext={questionNext}
              />
            ) : (
              <EndOfFeed
                height={height}
                topInset={insets.top}
                bottomInset={bottomInset}
                loading={loadingMore}
                exhausted={exhausted}
                failed={moreFailed}
                today={reel.data?.todayDecisions}
                gaps={reel.data?.profileGaps.length ?? 0}
                notice={notice && noticeFields.length ? notice : null}
                onNotice={() => openSheet({ kind: "prefs" })}
                onList={() => openSheet({ kind: "list" })}
                onMore={() => void loadMore()}
              />
            )
          }
        />
      ) : null}

      <View style={[styles.topBar, { top: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.lenses}>
          {LENSES.map((l) => {
            const active = lens === l.key;
            return (
              <Pressable
                key={l.key}
                onPress={() => {
                  haptics.select();
                  // A fresh list: the questions already on screen this visit are not dealt into it again.
                  if (l.key !== lens) setRetired(new Set(shownQuestions.current));
                  setLens(l.key);
                  list.current?.scrollToOffset({ offset: 0, animated: false });
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={[
                  styles.lens,
                  active
                    ? { backgroundColor: chrome.selectedBody, borderColor: "transparent" }
                    : { backgroundColor: chrome.body, borderColor: chrome.rim },
                ]}
              >
                <Text variant="smallStrong" style={{ color: active ? chrome.selectedText : chrome.text }} maxFontSizeMultiplier={1.1}>
                  {l.label}
                  {counts[l.key] ? ` · ${counts[l.key]}` : ""}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.topActions}>
          <Pressable
            onPress={() => openSheet({ kind: "list" })}
            accessibilityRole="button"
            accessibilityLabel={unread ? `Meri List, ${unread} unread messages` : "Meri List"}
            style={[styles.roundBtn, { backgroundColor: chrome.body, borderColor: chrome.rim }]}
          >
            <Icon icon={ListChecks} size={19} color={chrome.text} />
            {unread > 0 ? <View style={[styles.unreadDot, { backgroundColor: t.colors.danger }]} /> : null}
          </Pressable>
          <Pressable
            onPress={() => router.navigate("/search")}
            accessibilityRole="button"
            accessibilityLabel="Search"
            style={[styles.roundBtn, { backgroundColor: chrome.body, borderColor: chrome.rim }]}
          >
            <Icon icon={Search} size={19} color={chrome.text} />
          </Pressable>
        </View>
      </View>

      {reel.data.viewer.needsOwnPhoto ? (
        <Pressable
          onPress={() => router.push("/setup/photos")}
          style={[styles.photoAsk, { top: insets.top + 60, backgroundColor: chrome.bodyStrong, borderColor: chrome.highlightRim }]}
          accessibilityRole="button"
        >
          <Icon icon={Camera} size={16} color={chrome.highlight} />
          <Text variant="smallStrong" tone="onPhoto" style={{ flex: 1 }}>
            Apni photo lagayein — phir sabki photo dikhegi
          </Text>
        </Pressable>
      ) : null}

      {!coachSeen && feed.length > 1 ? (
        <Animated.View entering={FadeIn.delay(600)} exiting={FadeOut} style={styles.coach}>
          <Pressable style={styles.coachInner} onPress={setCoachSeen} accessibilityRole="button" accessibilityLabel="Got it">
            <Icon icon={ChevronsUp} size={40} color={chrome.text} />
            <Text variant="h3" tone="onPhoto" center>
              Upar swipe karein — agla rishta
            </Text>
            <Text variant="small" tone="onPhotoMuted" center>
              Photos ke liye side me swipe. Faisla hamesha button se.
            </Text>
            <View style={[styles.coachBtn, { borderColor: chrome.highlight }]}>
              <Text variant="smallStrong" style={{ color: chrome.highlight }}>
                Got it
              </Text>
            </View>
          </Pressable>
        </Animated.View>
      ) : null}

      <ReelMoreSheet
        card={sheet?.kind === "more" ? sheetCard : null}
        likeBusy={sheetCard ? busy.has(`like:${sheetCard.id}`) : false}
        onClose={closeSheet}
        actions={moreActions}
      />
      <ReelInsightSheet
        card={sheet?.kind === "insight" ? sheetCard : null}
        onClose={closeSheet}
        onAskGrio={askGrio}
        onKundli={(card) => openSheet({ kind: "kundli", id: card.id, name: card.displayName })}
      />
      <KundliMilanSheet
        target={kundliTarget}
        onClose={closeSheet}
        onOpenProfile={(id) => {
          closeSheet();
          router.push(`/profile/${id}`);
        }}
        onOpenMyKundli={() => {
          closeSheet();
          router.push("/kundli");
        }}
      />
      <ReelComposeSheet
        target={sheet?.kind === "compose" && sheetCard ? { card: sheetCard, mode: sheet.mode } : null}
        onClose={closeSheet}
        onOpenChat={(matchId) => {
          closeSheet();
          router.push(`/chat/${matchId}`);
        }}
        onAskGrio={askGrio}
      />
      <ReelListSheet
        visible={sheet?.kind === "list"}
        onClose={closeSheet}
        deckCounts={reel.data.laneCounts}
        onPick={(lane) => {
          closeSheet();
          router.push(`/lane/${lane}`);
        }}
      />
      <ReportSheet
        visible={sheet?.kind === "report" && sheetCard !== null}
        onClose={closeSheet}
        target={{ profileId: sheetCard?.id }}
        name={sheetCard?.displayName ?? ""}
        onDone={(blocked) => {
          if (blocked && sheetCard) removeBlocked(sheetCard.id);
        }}
      />
      <PreferenceSheet visible={sheet?.kind === "prefs"} title={notice?.title ?? "Aapki pasand"} body={notice?.body ?? null} keys={noticeFields} onClose={closeSheet} />
    </View>
  );
}

/**
 * The reel's "aapki pasand abhi pata nahi" notice, answered in place — the
 * exact fields the server's CTA names (`?fields=`), in the catalog's own
 * widgets, never the whole profile form. Saving refreshes nothing under the
 * thumb: the next deck is chosen with it.
 */
function PreferenceSheet({ visible, title, body, keys, onClose }: { visible: boolean; title: string; body: string | null; keys: string[]; onClose: () => void }) {
  const form = useFieldsEdit(keys);
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
      subtitle={body ?? undefined}
      footer={
        <View style={styles.row}>
          <GhostButton label="Cancel" size="md" onPress={onClose} disabled={form.saving} />
          <View style={{ flex: 1 }}>
            <PrimaryButton
              label="Save"
              size="md"
              loading={form.saving}
              disabled={!form.canSave}
              onPress={async () => {
                if (!(await form.save())) return;
                toast.success("Save ho gaya — agle rishte isi hisaab se chune jayenge");
                onClose();
              }}
            />
          </View>
        </View>
      }
    >
      <FieldsForm state={form} />
    </BottomSheet>
  );
}

function EndOfFeed({
  height,
  topInset,
  bottomInset,
  loading,
  exhausted,
  failed,
  today,
  gaps,
  notice,
  onNotice,
  onList,
  onMore,
}: {
  height: number;
  topInset: number;
  bottomInset: number;
  loading: boolean;
  exhausted: boolean;
  failed: boolean;
  today?: { seen: number; sent: number; shortlisted: number };
  gaps: number;
  notice: { title: string; body: string } | null;
  onNotice: () => void;
  onList: () => void;
  onMore: () => void;
}) {
  return (
    <View style={{ height }}>
      <RoomBackground />
      <View style={[styles.endInner, { paddingTop: topInset + 60, paddingBottom: bottomInset + 20 }]}>
        <GlassCard padding={22}>
          <View style={{ alignItems: "center", gap: 10 }}>
            <Icon icon={Sparkles} size={30} tone="gold" />
            <Text variant="h2" center>
              {loading ? "Aur rishte aa rahe hain…" : failed ? "Aur rishte load nahi hue" : exhausted ? "Abhi ke liye itna hi" : "Aur dekhne hain?"}
            </Text>
            <Text variant="body" tone="secondary" center>
              {failed
                ? "Internet ya server me dikkat aayi — dobara try kijiye."
                : exhausted
                  ? "Aapki pasand ke naye rishte jald aayenge. Tab tak Meri List ya Search se dekhiye."
                  : "Neeche scroll karte hi naye profiles judte rahenge."}
            </Text>
            {today ? (
              <Text variant="small" tone="muted" center>
                Aaj: {today.seen} dekhe · {today.sent} interest · {today.shortlisted} shortlist
              </Text>
            ) : null}
            {loading ? <ActivityIndicator /> : null}
          </View>
        </GlassCard>
        {notice ? (
          <GlassCard padding={16} onPress={onNotice} accessibilityLabel={notice.title}>
            <View style={styles.row}>
              <Icon icon={SlidersHorizontal} size={18} tone="gold" />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{notice.title}</Text>
                <Text variant="small" tone="secondary">
                  {notice.body}
                </Text>
              </View>
            </View>
          </GlassCard>
        ) : null}
        <View style={{ gap: 10 }}>
          {!exhausted && !loading ? <PrimaryButton label={failed ? "Try Again" : "Load More"} onPress={onMore} /> : null}
          <SecondaryButton label="Meri List" icon={ListChecks} onPress={onList} />
          <SecondaryButton label="Search Profiles" icon={Search} onPress={() => router.navigate("/search")} />
          {gaps > 0 ? <SecondaryButton label="Complete Your Profile" onPress={() => router.push("/setup")} /> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center", gap: 12 },
  padded: { paddingHorizontal: layout.gutter },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  topBar: { position: "absolute", left: 12, right: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  lenses: { flexDirection: "row", gap: 6, flexShrink: 1 },
  lens: { height: 36, paddingHorizontal: 13, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  topActions: { flexDirection: "row", gap: 8 },
  roundBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  unreadDot: { position: "absolute", top: 6, right: 6, width: 9, height: 9, borderRadius: 5 },
  photoAsk: {
    position: "absolute",
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  coach: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(10,4,6,0.72)" },
  coachInner: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 40 },
  coachBtn: { marginTop: 14, paddingHorizontal: 22, paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1 },
  endInner: { flex: 1, justifyContent: "center", gap: 14, paddingHorizontal: layout.gutter, width: "100%", maxWidth: layout.maxContentWidth, alignSelf: "center" },
});
