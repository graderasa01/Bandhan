"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMotionValue } from "framer-motion";
import { Loader2, Users } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import ReelCard from "./ReelCard";
import ReelFeed, { type FeedPage, type ReelFeedControl } from "./ReelFeed";
import ReelFrame from "./ReelFrame";
import ReelTopBar from "./ReelTopBar";
import ReelToast, { type ReelToastState } from "./ReelToast";
import ReelShortlistSheet from "./ReelShortlistSheet";
import ReelDetailsSheet, { type ReelDetailsSection } from "./ReelDetailsSheet";
import ReelMoreSheet from "./ReelMoreSheet";
import ReelInsightSheet from "./ReelInsightSheet";
import ReelListSheet from "./ReelListSheet";
import ReelQuickMessageSheet from "./ReelQuickMessageSheet";
import ReelAISheet from "./ReelAISheet";
import ReelVoiceSheet from "./ReelVoiceSheet";
import ReelPhotoGate from "./ReelPhotoGate";
import ReelEndDiscovery from "./ReelEndDiscovery";
import ReelSearchSheet from "./ReelSearchSheet";
import ReelKundliSheet from "./ReelKundliSheet";
import ReelQuestionPage from "./ReelQuestionPage";
import IcebreakerSheet from "./IcebreakerSheet";
import { useReelAffinity } from "./useReelAffinity";
import type { InterestUi } from "./ProfileActionRail";
import type { PhotoDeckControl } from "@/components/profile/PhotoSlideDeck";
import AskQuestionSheet from "@/components/askBridge/AskQuestionSheet";
import ReportSheet from "@/components/safety/ReportSheet";
import Sheet from "@/components/ui/Sheet";
import Button from "@/components/ui/Button";
import Celebrate from "@/components/ui/Celebrate";
import CelebrationHost, { type Celebration } from "@/components/ui/CelebrationHost";
import { useGrio } from "@/components/grio/GrioProvider";
import { ProfileProvider } from "@/lib/profile/profileState";
import { cn } from "@/lib/utils";
import { feedQuestionDue } from "@/lib/reel/feedQuestions";
import {
  REEL_LENSES,
  type ReelCardViewModel,
  type ReelLens,
  type ReelMoreResponse,
  type ReelRefineQuestion,
  type ReelTab,
  type ReelViewModel,
  type ReelSwipeDirection,
} from "@/lib/contracts/reel";
import { REEL_LANES, type ReelLane, type ReelLaneCounts, type ReelLibraryCard, type ReelLibraryPage } from "@/lib/contracts/reelLibrary";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * The member's own profile deck, loaded only if the feed actually runs out.
 * A big client component that the overwhelming majority of sessions never
 * reach — not worth a byte of the reel's own bundle until it is needed.
 */
const SmartProfileDeck = dynamic(() => import("@/components/profile/SmartProfileDeck"), { ssr: false });

/** Is this tab one of the history lanes (as opposed to a lens over the feed)? */
function isReelLane(tab: ReelTab): tab is ReelLane {
  return (REEL_LANES as string[]).includes(tab);
}

/**
 * How long an interest waits before it leaves the phone — the undo window.
 *
 * The Interest button now sits on the side rail, where a thumb scrolling the
 * feed also travels, and an interest is not a like: it tells another family
 * about you and spends one of the month's sends. So the tap answers
 * instantly ("Sent", with a ring running out around the button) and the
 * request goes a few seconds later unless the member says "Undo". Nothing is
 * shown as pending that the other side has already seen: until the window
 * closes, nothing has been sent at all.
 */
const INTEREST_UNDO_MS = 3500;

/** How long a confirmation line stays when it offers no action. */
const TOAST_MS = 2600;

/**
 * "Don't ask me again today" for the photo gate — per calendar day, stored
 * client-side because it is a nudge, not a permission.
 */
const PHOTO_GATE_KEY = "reel-photo-gate-dismissed";

function photoGateDismissedToday(): boolean {
  try {
    return window.localStorage.getItem(PHOTO_GATE_KEY) === new Date().toISOString().slice(0, 10);
  } catch {
    return false; // storage blocked — showing it again is the safe miss
  }
}

/**
 * Does this card belong to the lens? FOR_YOU claims everybody the screen holds
 * — new rishtey and the ones already seen, mixed by the server (D-92). The
 * other two are filters over that same pile.
 */
function inLens(card: ReelCardViewModel, lens: ReelLens): boolean {
  switch (lens) {
    case "NEARBY":
      return card.nearby;
    case "NEW":
      return !card.seenBefore;
    default:
      return true;
  }
}

/**
 * How few cards may be left before the next batch is fetched. The next two
 * people are already mounted (the pager keeps them painted), so the top-up
 * starts early enough to land before the member reaches the end.
 */
const PREFETCH_AT = 3;

/** How many times an *empty* lens may silently ask for another batch before offering the button. */
const MAX_EMPTY_TOPUPS = 3;

/** What a swipe row write came back as — normalised, because a refused interest is a 403 with no `ok` field. */
type SwipeResult = { ok: true; matched: boolean; matchId: string | null } | { ok: false; retryable: boolean; message?: string };

type InterestEntry = { phase: "pending" | "syncing" | "sent" | "failed"; key: number };

/** A sheet's target outlives its close, so the sheet animates out with its content still in it. */
function useSheetTarget<T>() {
  const [state, setState] = useState<{ target: T | null; open: boolean }>({ target: null, open: false });
  const show = useCallback((target: T) => setState({ target, open: true }), []);
  const hide = useCallback(() => setState((s) => ({ ...s, open: false })), []);
  return { target: state.target, open: state.open, show, hide };
}

/**
 * The reel screen — a profile-first workspace.
 *
 * ## The shape of it
 *
 *   ReelFrame (desktop: a phone; mobile: the screen)
 *   ├─ ReelFeed — a vertical pager; previous, current and next are mounted
 *   │    └─ ReelCard — the person, their name block, and the action rail
 *   ├─ ReelTopBar — My List · For You · Nearby · New · Search
 *   └─ ReelToast — one confirmation line
 *   …and every sheet, rendered here because a `fixed` layer inside a moving
 *   card would be positioned against the card.
 *
 * ## Position is a set, not an index
 *
 * `decided` holds the ids the deck has moved past this session and the live
 * queue is derived from it, so a lens is just a different filter over the same
 * set and "back" is one `delete`. A lane keeps its own set (`laneDecided`),
 * because every lane is defined by something the member already did and a
 * shared set would hide exactly the people they just scrolled past.
 *
 * ## Only the vertical axis moves anybody, and it decides nothing (D-92)
 *
 * Up is the next person, down the previous one; scrolling past writes an UP
 * row ("dekha", never a decision). Sideways walks the current person's photos.
 * Every decision — Interest, Save, Not now — is a labelled button, because a
 * label is consent and a drag has no words. Horizontal *used* to send an
 * interest; it was the accident this screen kept producing (a member dragging
 * right to look at a previous photo, or to go back, and telling a family they
 * were interested).
 *
 * ## An interest never moves the screen
 *
 * It used to throw the card off, wait for the server, then open a sheet about
 * the person who had just left. Now the button answers in the same frame,
 * the person stays where they are, the request leaves after the undo window,
 * and only a real failure is ever shown — see `INTEREST_UNDO_MS` and
 * `InterestUi`.
 *
 * ## The deck is not the day (D-91)
 *
 * `cards` grows: the first batch comes with the page and the screen asks for
 * more as the queue thins. `exhausted` is set only when the server says there
 * is genuinely nobody left, and that is the one state allowed to say so.
 */
export default function ReelStack({ data, initialTab }: { data: ReelViewModel; initialTab?: ReelTab }) {
  const t = useT();
  const router = useRouter();
  const { open: openGrio, setPageProfile, registerPageActions } = useGrio();
  const { emphasis, record, seen: recordSeen } = useReelAffinity();

  /** What an empty lane says — each one names what would fill it. */
  const LANE_EMPTY: Record<ReelLane, string> = {
    VIEWED: t("reel.library.empty.viewed", "Abhi aisi koi profile nahi jise aapne sirf dekha ho."),
    LIKED: t("reel.library.empty.liked", "Aapne abhi kisi ko like nahi kiya. Like sirf aapko dikhta hai."),
    SHORTLIST: t(
      "reel.library.empty.shortlist",
      "Abhi koi profile shortlist nahi ki. Shortlist private hai — ghar me baat karne ke liye saath rakhiye.",
    ),
    INTEREST: t("reel.library.empty.interest", "Aapne abhi tak kisi ko interest nahi bheja."),
    MESSAGE: t("reel.library.empty.message", "Abhi koi baat-cheet shuru nahi hui."),
  };
  const LANE_LABELS: Record<ReelLane, string> = {
    VIEWED: t("reel.tabs.viewed", "Viewed"),
    LIKED: t("reel.tabs.liked", "Liked"),
    SHORTLIST: t("reel.tabs.shortlist", "Shortlist"),
    INTEREST: t("reel.tabs.interest", "Interest"),
    MESSAGE: t("reel.tabs.message", "Messages"),
  };

  // One tab state for the whole screen. `lane` is non-null exactly when the
  // member is looking backwards through their own history. `?tab=` only picks
  // the starting place; after that the screen owns it.
  const [tab, setTab] = useState<ReelTab>(initialTab ?? "FOR_YOU");
  const lane: ReelLane | null = isReelLane(tab) ? tab : null;
  const lens: ReelLens = isReelLane(tab) ? "FOR_YOU" : tab;

  const [decided, setDecided] = useState<Set<string>>(new Set());
  const [laneDecided, setLaneDecided] = useState<Set<string>>(new Set());
  /** The ids each surface has moved past, in order, so "back" has somewhere to go. */
  const [deckBack, setDeckBack] = useState<string[]>([]);
  const [laneBack, setLaneBack] = useState<string[]>([]);
  /**
   * The latest decision per person this session — Interest, Save, Not now.
   * Read by the closing card's observations, which only name a pattern the
   * member's own picks genuinely repeat.
   */
  const [decisions, setDecisions] = useState<Record<string, ReelSwipeDirection>>({});
  /** Confirmed this session — the closing card's "aaj" numbers add these to the server's. */
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  /*
   * Optimistic state lives in overrides keyed by profile id, over the truth
   * each card arrived with (`card.liked`, `card.shortlisted`,
   * `card.interestSent`, `card.matchId`). A card unmounts the moment it is
   * scrolled past, and a lane card is a different object from the feed card
   * for the same person — the override is what makes one tap true on both.
   */
  const [likeOverride, setLikeOverride] = useState<Record<string, boolean>>({});
  const [saveOverride, setSaveOverride] = useState<Record<string, boolean>>({});
  const [interestMap, setInterestMap] = useState<Record<string, InterestEntry>>({});
  const [matchOverride, setMatchOverride] = useState<Record<string, string>>({});
  const interestTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  /** Interests still inside their undo window — flushed if the member leaves the screen. */
  const pendingInterest = useRef(new Map<string, ReelCardViewModel>());
  /** Resolves when an interest reaches the server, so a note can wait for its row. */
  const interestLanding = useRef(new Map<string, { promise: Promise<boolean>; resolve: (ok: boolean) => void }>());
  const interestKey = useRef(0);
  /** Cards that already wrote their own row on the way past ("Not now"), so the view row is skipped. */
  const skipViewRow = useRef(new Set<string>());

  const [laneCounts, setLaneCounts] = useState(data.laneCounts);
  const [laneCards, setLaneCards] = useState<ReelLibraryCard[]>([]);
  const [laneCursor, setLaneCursor] = useState<string | null>(null);
  const [laneBusy, setLaneBusy] = useState(false);
  const [laneError, setLaneError] = useState<string | null>(null);
  const laneRunId = useRef(0);

  const [cards, setCards] = useState<ReelCardViewModel[]>(data.cards);
  const [seenCursor, setSeenCursor] = useState<string | null>(data.seenCursor);
  const [exhausted, setExhausted] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const emptyTopUps = useRef(0);

  // Sheets — one per door on the card, plus the screen's own.
  const details = useSheetTarget<{ card: ReelCardViewModel; section: ReelDetailsSection | null }>();
  const more = useSheetTarget<ReelCardViewModel>();
  const insight = useSheetTarget<ReelCardViewModel>();
  const kundli = useSheetTarget<ReelCardViewModel>();
  const message = useSheetTarget<{ matchId: string; name: string }>();
  const note = useSheetTarget<{ card: ReelCardViewModel; ready: Promise<boolean> | null }>();
  const voice = useSheetTarget<ReelCardViewModel>();
  const report = useSheetTarget<ReelCardViewModel>();
  const ask = useSheetTarget<ReelCardViewModel>();
  const ai = useSheetTarget<ReelCardViewModel>();
  const family = useSheetTarget<ReelCardViewModel>();
  const [listOpen, setListOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [photoGateOpen, setPhotoGateOpen] = useState(false);
  const [gapDeckOpen, setGapDeckOpen] = useState(false);
  /*
   * "Reel dekhte-dekhte profile" — the member's own one-tap questions, dealt
   * between two people (`lib/reel/feedQuestions.ts`). `feedAsk` is the one on
   * screen. A question leaves the queue the moment it is shown, answered or
   * not, so a skip is never asked again in the same visit.
   */
  const [feedAskQueue, setFeedAskQueue] = useState<ReelRefineQuestion[]>(data.feedQuestions);
  const [feedAsk, setFeedAsk] = useState<{ key: string; question: ReelRefineQuestion } | null>(null);
  const [feedAskShown, setFeedAskShown] = useState(0);
  const [feedAskLastAt, setFeedAskLastAt] = useState(0);
  /** Own-profile fields answered in the feed this visit — the end of the feed does not ask them again. */
  const [answeredOwn, setAnsweredOwn] = useState<Set<string>>(new Set());
  const [askedIds, setAskedIds] = useState<Set<string>>(new Set());
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [matched, setMatched] = useState<{ card: ReelCardViewModel; matchId: string | null } | null>(null);

  const [toast, setToast] = useState<ReelToastState | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((next: Omit<ReelToastState, "id">, ms = TOAST_MS) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    const id = Date.now() + Math.random();
    setToast({ ...next, id });
    toastTimer.current = setTimeout(() => setToast((cur) => (cur?.id === id ? null : cur)), ms);
  }, []);
  const hideToast = useCallback(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
  }, []);

  const feedRef = useRef<ReelFeedControl | null>(null);
  const photoControl = useRef<PhotoDeckControl | null>(null);
  const mediaX = useMotionValue(0);

  /* ---------------- lanes ---------------- */

  const loadLane = useCallback(
    async (activeLane: ReelLane, cursor: string | null) => {
      const id = ++laneRunId.current;
      setLaneBusy(true);
      setLaneError(null);
      try {
        const res = await fetch("/api/reel/library", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lane: activeLane, filters: {}, cursor }),
        });
        const body = (await res.json()) as ReelLibraryPage;
        if (id !== laneRunId.current) return;
        if (!body.ok) {
          setLaneError(body.message ?? t("reel.library.failed", "List nahi khul paayi — dobara try karein."));
          return;
        }
        setLaneCards((prev) => {
          if (!cursor) return body.cards;
          const have = new Set(prev.map((c) => c.id));
          return [...prev, ...body.cards.filter((c) => !have.has(c.id))];
        });
        setLaneCursor(body.nextCursor);
        setLaneCounts((c: ReelLaneCounts) => ({ ...c, [activeLane]: body.total }));
      } catch {
        if (id === laneRunId.current) setLaneError(t("reel.library.failed", "List nahi khul paayi — dobara try karein."));
      } finally {
        if (id === laneRunId.current) setLaneBusy(false);
      }
    },
    [t],
  );

  // Opening a lane is a fresh question — and a fresh question starts at the top.
  useEffect(() => {
    if (!lane) return;
    setLaneCards([]);
    setLaneCursor(null);
    setLaneDecided(new Set());
    setLaneBack([]);
    void loadLane(lane, null);
  }, [lane, loadLane]);

  /* ---------------- the queue ---------------- */

  const queue = useMemo(
    () =>
      lane ? laneCards.filter((c) => !laneDecided.has(c.id)) : cards.filter((c) => !decided.has(c.id) && inLens(c, lens)),
    [lane, laneCards, laneDecided, cards, decided, lens],
  );
  const current = queue[0] ?? null;
  const upNext = queue[1] ?? null;
  const currentLaneCard = lane && current ? laneCards.find((c) => c.id === current.id) ?? null : null;
  const backStack = lane ? laneBack : deckBack;
  const prevId = backStack[backStack.length - 1] ?? null;
  const prevCard = prevId ? ((lane ? laneCards : cards).find((c) => c.id === prevId) ?? null) : null;
  const currentId = useRef<string | null>(null);
  currentId.current = current?.id ?? null;

  /**
   * The person on screen — null while a question page is. While one is up,
   * `current` is the person *after* it, already mounted below; Grio, the
   * backdrop and the keyboard must not act on somebody the member cannot see.
   */
  const onScreen = feedAsk ? null : current;

  /**
   * Is the page after this person one of the member's own questions? Only in
   * the feed (a lane is their history, not a place to be asked things), only
   * between two people, and only as often as `feedQuestionDue` allows.
   */
  const feedAskDue =
    !lane &&
    !feedAsk &&
    Boolean(current) &&
    Boolean(upNext) &&
    feedQuestionDue({
      passed: deckBack.length + 1,
      lastAt: feedAskLastAt,
      shown: feedAskShown,
      left: feedAskQueue.length,
    });

  // Changing tab is a fresh place — a question page does not follow the member into it.
  useEffect(() => setFeedAsk(null), [tab]);

  /*
   * Grio knows who is on screen.
   *
   * The card's id — nothing else — goes to GrioProvider, and the server reads
   * the person from the database at this viewer's level (`loadProfileTurn`).
   * So "is profile me mere liye kya khaas hai?" is about the face in front of
   * the member without them naming anyone, and a swipe moves a reel-scoped
   * conversation to the next person instead of leaving it on the last one.
   * Nothing is fetched here: registering an id is free, and Grio loads its
   * context only when it is opened — browsing never waits on it.
   */
  const currentName = onScreen?.displayName ?? null;
  useEffect(() => {
    setPageProfile(onScreen ? { profileId: onScreen.id, name: currentName ?? "", surface: "reel" } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onScreen?.id, currentName, setPageProfile]);
  useEffect(() => () => setPageProfile(null), [setPageProfile]);

  /** People new to this member who went past this session — the honest addition to "aaj kitni dekhi". */
  const sessionSeen = useMemo(() => cards.filter((c) => !c.seenBefore && decided.has(c.id)).length, [cards, decided]);

  const lensCounts = useMemo(() => {
    const out: Record<ReelLens, number> = { FOR_YOU: 0, NEARBY: 0, NEW: 0 };
    for (const c of cards) {
      if (decided.has(c.id)) continue;
      for (const l of REEL_LENSES) if (inLens(c, l)) out[l] += 1;
    }
    return out;
  }, [cards, decided]);

  /** Ask the server for the next batch — appended by id, so a repeated batch cannot duplicate a person. */
  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    setMoreError(null);
    try {
      const res = await fetch("/api/reel/more", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seenCursor }),
      });
      const body = (await res.json()) as ReelMoreResponse;
      if (!body.ok) {
        setMoreError(body.message ?? t("reel.more.failed", "Aur rishtey laane me dikkat aayi — dobara try karein."));
        return;
      }
      if (body.exhausted) {
        setExhausted(true);
        return;
      }
      setSeenCursor(body.seenCursor ?? null);
      setCards((prev) => {
        const have = new Set(prev.map((c) => c.id));
        const fresh = body.cards.filter((c) => !have.has(c.id));
        // A batch made entirely of people the screen already holds is the end
        // of the feed, whatever the server called it (D-92c) — without this a
        // member taps "Aur dikhaiye" forever.
        if (fresh.length === 0) setExhausted(true);
        return [...prev, ...fresh];
      });
    } catch {
      setMoreError(t("reel.more.failed", "Aur rishtey laane me dikkat aayi — dobara try karein."));
    } finally {
      setLoadingMore(false);
    }
  }, [t, seenCursor]);

  // A lens change is a new question; "back" goes with it, because the card it
  // would return to may not belong to this lens.
  useEffect(() => {
    emptyTopUps.current = 0;
    setDeckBack([]);
  }, [lens]);

  useEffect(() => {
    if (!lane || laneBusy || !laneCursor) return;
    if (queue.length > PREFETCH_AT) return;
    void loadLane(lane, laneCursor);
  }, [lane, laneBusy, laneCursor, queue.length, loadLane]);

  useEffect(() => {
    if (lane) return;
    if (exhausted || loadingMore || moreError) return;
    if (queue.length > PREFETCH_AT) {
      emptyTopUps.current = 0;
      return;
    }
    if (queue.length === 0 && emptyTopUps.current >= MAX_EMPTY_TOPUPS) return;
    emptyTopUps.current += 1;
    void loadMore();
  }, [lane, queue.length, exhausted, loadingMore, moreError, loadMore]);

  // The person after next: their first photo, and the current person's other
  // photos, start downloading now — so the next swipe and the next sideways
  // swipe both land on a picture that is already there.
  const afterNext = queue[2] ?? null;
  useEffect(() => {
    const urls = [
      ...(current?.photoUnlocked ? current.slides.slice(1).map((s) => s.url) : []),
      afterNext?.photoUnlocked ? afterNext.photoUrl : null,
    ].filter((u): u is string => Boolean(u));
    for (const url of urls) {
      const img = new window.Image();
      img.decoding = "async";
      img.src = url;
    }
  }, [current, afterNext]);

  /* ---------------- writes ---------------- */

  async function postSwipe(
    profileId: string,
    direction: ReelSwipeDirection,
    meta: { decisionMs: number; wasButton: boolean },
    keepalive = false,
  ): Promise<SwipeResult | null> {
    try {
      const res = await fetch("/api/reel/swipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, direction, reelId: data.reelId, ...meta }),
        // An interest leaving as the member navigates away must still arrive.
        keepalive,
      });
      const body = (await res.json().catch(() => ({}))) as { matched?: boolean; matchId?: string | null; message?: string };
      // The route refuses an interest with a 403 and no `ok` field — so the
      // status is the answer, not the body. (Reading `body.ok === false`
      // here is how a spent monthly quota used to be shown as a sent interest.)
      if (!res.ok) return { ok: false, retryable: res.status >= 500, message: body.message };
      return { ok: true, matched: Boolean(body.matched), matchId: body.matchId ?? null };
    } catch {
      return null;
    }
  }

  const matchIdFor = useCallback((card: ReelCardViewModel) => matchOverride[card.id] ?? card.matchId, [matchOverride]);
  const isSaved = (card: ReelCardViewModel) => saveOverride[card.id] ?? card.shortlisted;
  const isLiked = (card: ReelCardViewModel) => likeOverride[card.id] ?? card.liked;

  function interestUi(card: ReelCardViewModel): InterestUi {
    if (matchIdFor(card)) return "matched";
    const entry = interestMap[card.id];
    if (entry) return entry.phase;
    return card.interestSent ? "sent" : "idle";
  }

  function settleLanding(id: string, ok: boolean) {
    const landing = interestLanding.current.get(id);
    if (!landing) return;
    landing.resolve(ok);
    interestLanding.current.delete(id);
  }

  function dropInterest(id: string) {
    setInterestMap((m) => {
      const next = { ...m };
      delete next[id];
      return next;
    });
    setDecisions((d) => {
      if (d[id] !== "RIGHT") return d;
      const next = { ...d };
      delete next[id];
      return next;
    });
  }

  /** The request itself — after the undo window, or at once for a retry or a note. */
  async function syncInterest(card: ReelCardViewModel, keepalive = false) {
    const timer = interestTimers.current.get(card.id);
    if (timer) clearTimeout(timer);
    interestTimers.current.delete(card.id);
    pendingInterest.current.delete(card.id);
    setInterestMap((m) => ({ ...m, [card.id]: { phase: "syncing", key: m[card.id]?.key ?? ++interestKey.current } }));

    const result = await postSwipe(card.id, "RIGHT", { decisionMs: 0, wasButton: true }, keepalive);
    if (!result || (!result.ok && result.retryable)) {
      setInterestMap((m) => ({ ...m, [card.id]: { phase: "failed", key: m[card.id]?.key ?? ++interestKey.current } }));
      settleLanding(card.id, false);
      showToast(
        {
          tone: "error",
          text: t("reel.toast.interestFailed", "{name} ko interest nahi gaya").replace("{name}", card.displayName),
          action: { label: t("reel.toast.retry", "Retry"), onClick: () => void syncRef.current(card) },
        },
        7000,
      );
      return;
    }
    if (!result.ok) {
      // Refused — the month's sends are spent. Nothing was written (the
      // route checks before it writes), so the button goes back to how it was.
      dropInterest(card.id);
      settleLanding(card.id, false);
      showToast(
        { tone: "error", text: result.message ?? t("reel.stack.interestLimitDefault", "Is mahine ke interest khatam ho gaye hain.") },
        7000,
      );
      return;
    }

    setInterestMap((m) => ({ ...m, [card.id]: { phase: "sent", key: m[card.id]?.key ?? ++interestKey.current } }));
    settleLanding(card.id, true);
    setSentIds((s) => new Set(s).add(card.id));
    // The lane counts are counts of rows — an interest adds one to Interest
    // and takes the person out of "Viewed" (which means nothing happened).
    setLaneCounts((c: ReelLaneCounts) => ({ ...c, INTEREST: c.INTEREST + 1, VIEWED: Math.max(0, c.VIEWED - 1) }));

    if (result.matched) {
      const matchId = result.matchId;
      if (matchId) setMatchOverride((m) => ({ ...m, [card.id]: matchId }));
      // The bigger moment: celebrated in place if they are still on screen,
      // announced (with the way to the chat) if the member has moved on.
      if (currentId.current === card.id) {
        setMatched({ card, matchId });
      } else {
        showToast(
          {
            tone: "celebrate",
            text: t("reel.toast.matched", "{name} ke saath rishta jud gaya").replace("{name}", card.displayName),
            action: matchId
              ? { label: t("reel.toast.chat", "Chat"), onClick: () => router.push(`/user/messages/${matchId}`) }
              : undefined,
          },
          7000,
        );
      }
    }
  }
  const syncRef = useRef(syncInterest);
  syncRef.current = syncInterest;

  function undoInterest(card: ReelCardViewModel) {
    const timer = interestTimers.current.get(card.id);
    if (timer) clearTimeout(timer);
    interestTimers.current.delete(card.id);
    pendingInterest.current.delete(card.id);
    settleLanding(card.id, false);
    dropInterest(card.id);
    showToast({ tone: "info", text: t("reel.toast.interestUndone", "Interest cancel — kuch nahi bheja gaya") });
  }

  /**
   * The Interest button.
   *
   *   idle / failed → sent, now (the request follows after the undo window)
   *   pending       → undone — a second tap inside the window takes it back
   *   sent          → says so, and offers a note
   *   matched       → the chat, in a composer right here
   */
  function onInterest(card: ReelCardViewModel) {
    const ui = interestUi(card);
    if (ui === "matched") {
      openMessage(card);
      return;
    }
    if (ui === "pending") {
      undoInterest(card);
      return;
    }
    if (ui === "sent" || ui === "syncing") {
      showToast({
        tone: "info",
        text: t("reel.toast.interestAlready", "{name} ko interest pehle hi bheja hua hai").replace("{name}", card.displayName),
        action: { label: t("reel.toast.addNote", "Add Note"), onClick: () => openNote(card) },
      });
      return;
    }
    if (ui === "failed") {
      void syncInterest(card);
      return;
    }

    const key = ++interestKey.current;
    setInterestMap((m) => ({ ...m, [card.id]: { phase: "pending", key } }));
    setDecisions((d) => ({ ...d, [card.id]: "RIGHT" }));
    record("interest");
    pendingInterest.current.set(card.id, card);
    let resolve!: (ok: boolean) => void;
    const promise = new Promise<boolean>((r) => (resolve = r));
    interestLanding.current.set(card.id, { promise, resolve });
    interestTimers.current.set(
      card.id,
      setTimeout(() => void syncRef.current(card), INTEREST_UNDO_MS),
    );
    showToast(
      {
        tone: "done",
        text: t("reel.toast.interestSent", "{name} ko interest bheja").replace("{name}", card.displayName),
        action: { label: t("reel.toast.undo", "Undo"), onClick: () => undoInterest(card) },
      },
      INTEREST_UNDO_MS,
    );
  }

  // An interest still inside its window when the member leaves — another
  // page, another app, a closed tab — goes now, with `keepalive`, so a tap
  // that said "Sent" is never quietly dropped.
  useEffect(() => {
    function flush() {
      for (const card of [...pendingInterest.current.values()]) void syncRef.current(card, true);
    }
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, []);

  /** A note on an interest — the honest pre-match message. Sends a waiting interest at once. */
  function openNote(card: ReelCardViewModel) {
    hideToast();
    if (pendingInterest.current.has(card.id)) void syncRef.current(card);
    note.show({ card, ready: interestLanding.current.get(card.id)?.promise ?? null });
  }

  function openMessage(card: ReelCardViewModel) {
    const matchId = matchIdFor(card);
    if (!matchId) return;
    record("message");
    message.show({ matchId, name: card.displayName });
  }

  /** Save — the shortlist, as a toggle, optimistic both ways. */
  async function onSave(card: ReelCardViewModel) {
    if (!isSaved(card)) {
      setSaveOverride((m) => ({ ...m, [card.id]: true }));
      setDecisions((d) => ({ ...d, [card.id]: "DOWN" }));
      record("save");
      // The family angle is the optional next step, offered — never a sheet
      // that interrupts the feed on every save.
      showToast({
        tone: "done",
        text: t("reel.toast.saved", "Shortlist me save ho gaya"),
        action: { label: t("reel.toast.family", "Family Circle"), onClick: () => family.show(card) },
      });
      // Through the swipe route on purpose: DOWN is also the taste signal the
      // ranking learns from, and the route writes the shortlist row with it.
      const result = await postSwipe(card.id, "DOWN", { decisionMs: 0, wasButton: true });
      if (!result?.ok) {
        setSaveOverride((m) => ({ ...m, [card.id]: false }));
        setDecisions((d) => {
          const next = { ...d };
          delete next[card.id];
          return next;
        });
        showToast({
          tone: "error",
          text: t("reel.toast.saveFailed", "Save nahi hua"),
          action: { label: t("reel.toast.retry", "Retry"), onClick: () => void onSaveRef.current(card) },
        }, 6000);
        return;
      }
      setSavedIds((s) => new Set(s).add(card.id));
      setLaneCounts((c: ReelLaneCounts) => ({ ...c, SHORTLIST: c.SHORTLIST + 1, VIEWED: Math.max(0, c.VIEWED - 1) }));
      return;
    }

    setSaveOverride((m) => ({ ...m, [card.id]: false }));
    showToast({
      tone: "info",
      text: t("reel.toast.unsaved", "Shortlist se hataya"),
      action: { label: t("reel.toast.undo", "Undo"), onClick: () => void onSaveRef.current(card) },
    });
    try {
      const res = await fetch(`/api/shortlist/${card.id}`, { method: "DELETE" });
      // 404 is "already not there" — the state the member asked for.
      if (!res.ok && res.status !== 404) throw new Error("unsave failed");
      setSavedIds((s) => {
        const next = new Set(s);
        next.delete(card.id);
        return next;
      });
      setLaneCounts((c: ReelLaneCounts) => ({ ...c, SHORTLIST: Math.max(0, c.SHORTLIST - 1) }));
    } catch {
      setSaveOverride((m) => ({ ...m, [card.id]: true }));
      showToast({ tone: "error", text: t("reel.toast.unsaveFailed", "Shortlist se hata nahi paaye") }, 6000);
    }
  }
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  /** The private like (D-91b) — optimistic, and not a decision: nothing moves, nobody is told. */
  async function toggleLike(card: ReelCardViewModel) {
    const next = !isLiked(card);
    setLikeOverride((m) => ({ ...m, [card.id]: next }));
    setLaneCounts((c: ReelLaneCounts) => ({
      ...c,
      LIKED: Math.max(0, c.LIKED + (next ? 1 : -1)),
      VIEWED: Math.max(0, c.VIEWED + (next ? -1 : 1)),
    }));
    if (next) showToast({ tone: "done", text: t("reel.toast.liked", "Like kiya — ye sirf aapko dikhta hai") });
    try {
      const res = await fetch(`/api/like/${card.id}`, { method: next ? "PUT" : "DELETE" });
      if (!res.ok) throw new Error("like failed");
    } catch {
      setLikeOverride((m) => ({ ...m, [card.id]: !next }));
      setLaneCounts((c: ReelLaneCounts) => ({ ...c, LIKED: Math.max(0, c.LIKED + (next ? -1 : 1)) }));
      showToast({ tone: "error", text: t("reel.toast.likeFailed", "Like save nahi hua") }, 5000);
    }
  }

  /* ---------------- moving through the feed ---------------- */

  /** "This card is behind me now" — recorded against the surface it was on. */
  function markPast(id: string) {
    if (lane) {
      setLaneDecided((s) => new Set(s).add(id));
      setLaneBack((b) => [...b, id]);
    } else {
      setDecided((s) => new Set(s).add(id));
      setDeckBack((b) => [...b, id]);
    }
  }

  /**
   * The feed moved on. In the deck it records a *view* — an UP row, which is
   * what "kisne dekha" and the Viewed lane are built from and what tells
   * tomorrow's pool this person has been met. A lane writes nothing:
   * everybody in it has been seen by definition.
   */
  function onAdvance() {
    // Past a question page: nobody was on screen, so there is no view row to
    // write — and a scroll past it is a skip, which writes nothing either.
    if (feedAsk) {
      setFeedAsk(null);
      return;
    }
    const id = currentId.current;
    if (!id) return;
    markPast(id);
    recordSeen();
    mediaX.set(0);
    // The page the member just moved onto was a question (it was rendered as
    // "next" because `feedAskDue` said so) — it becomes the page on screen.
    if (feedAskDue && feedAskQueue[0]) {
      setFeedAsk({ key: `feed-ask-${feedAskShown}`, question: feedAskQueue[0] });
      setFeedAskQueue((q) => q.slice(1));
      setFeedAskShown((n) => n + 1);
      setFeedAskLastAt(deckBack.length + 1);
    }
    if (lane) return;
    if (skipViewRow.current.delete(id)) return;
    void postSwipe(id, "UP", { decisionMs: 0, wasButton: false });
  }

  /** One card back — navigation, never an un-send, and never a network call. */
  function onBack() {
    // Back from a question page lands on the person before it; the question
    // was a stop between two people, not a place, so it simply goes.
    if (feedAsk) setFeedAsk(null);
    const stack = lane ? laneBack : deckBack;
    const id = stack[stack.length - 1];
    if (!id) return;
    mediaX.set(0);
    const without = (s: Set<string>) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    };
    if (lane) {
      setLaneBack((b) => b.slice(0, -1));
      setLaneDecided(without);
    } else {
      setDeckBack((b) => b.slice(0, -1));
      setDecided(without);
    }
  }

  /**
   * "Not now" — the one labelled *negative* decision (§4.5). It writes the LEFT
   * row the ranking reads as a weak "not this kind", and then the feed moves
   * on exactly as a scroll would.
   */
  function notNow(card: ReelCardViewModel) {
    details.hide();
    more.hide();
    // The same answer twice — the member went back, looked again and said "not
    // now" again. The row is already there; a second one would count a
    // decision made once twice in what the ranking learns. (The view row is
    // still skipped: the first LEFT row already says they were seen.)
    const repeat = decisions[card.id] === "LEFT";
    setDecisions((d) => ({ ...d, [card.id]: "LEFT" }));
    skipViewRow.current.add(card.id);
    if (!repeat) void postSwipe(card.id, "LEFT", { decisionMs: 0, wasButton: true });
    if (upNext || !lane) feedRef.current?.next();
    showToast({ tone: "info", text: t("reel.toast.notNow", "Theek hai — aisi profiles thodi kam dikhengi") });
  }

  /* ---------------- sheets that are one line each ---------------- */

  // Stable, because the details sheet's read-tracking observer re-arms whenever
  // this changes — and it must survive the re-renders a toast causes.
  const onSectionSeen = useCallback(
    (section: ReelDetailsSection) => {
      if (section === "family") record("family");
    },
    [record],
  );

  function openDetails(card: ReelCardViewModel, section: ReelDetailsSection | null = null) {
    record("details");
    details.show({ card, section });
  }
  function openKundli(card: ReelCardViewModel) {
    record("kundli");
    kundli.show(card);
  }
  /**
   * Grio, about this card — optionally with the question already asked (a chip
   * in the insight sheet). `source: "reel"` is what lets the conversation's
   * subject follow the next swipe.
   */
  function askGrioAbout(card: ReelCardViewModel, ask?: string) {
    record("grio");
    insight.hide();
    details.hide();
    openGrio({ kind: "candidate", profileId: card.id, name: card.displayName, source: "reel" }, ask ? { ask } : undefined);
  }

  /*
   * The reel's own sheets, lent to Grio: "Open Kundli" / "See family details"
   * under a Grio answer open the same kundli and details sheets the card's
   * buttons open, over the same card — not a page the member has to come back
   * from. Re-registered every render so the lookup always sees the live deck.
   */
  useEffect(() => {
    const find = (id: string) =>
      (current?.id === id ? current : null) ?? cards.find((c) => c.id === id) ?? laneCards.find((c) => c.id === id) ?? null;
    return registerPageActions({
      openKundli: (id) => {
        const card = find(id);
        if (!card) return false;
        openKundli(card);
        return true;
      },
      openSection: (id, section) => {
        const card = find(id);
        if (!card) return false;
        openDetails(card, section);
        return true;
      },
    });
  });

  // The one ask, before the deck — not rendered on the server, because "have
  // they dismissed it today" only exists in this browser.
  useEffect(() => {
    if (!data.viewer.needsOwnPhoto || cards.length === 0) return;
    if (photoGateDismissedToday()) return;
    const timer = setTimeout(() => setPhotoGateOpen(true), 600);
    return () => clearTimeout(timer);
  }, [data.viewer.needsOwnPhoto, cards.length]);

  function closePhotoGate() {
    try {
      window.localStorage.setItem(PHOTO_GATE_KEY, new Date().toISOString().slice(0, 10));
    } catch {
      /* it'll simply be offered again next time */
    }
    setPhotoGateOpen(false);
  }

  const sheetOpen =
    details.open ||
    more.open ||
    insight.open ||
    kundli.open ||
    message.open ||
    note.open ||
    voice.open ||
    report.open ||
    ask.open ||
    ai.open ||
    family.open ||
    listOpen ||
    searchOpen ||
    photoGateOpen ||
    gapDeckOpen ||
    matched !== null;

  // Keys: the feed's two moves, the photos, and one letter for each of the
  // two things a member does most. Never while a sheet is up or a field has
  // the caret — a key must not decide the card underneath what you are reading.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (sheetOpen) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          feedRef.current?.next();
          return;
        case "ArrowDown":
        case "Backspace":
          e.preventDefault();
          feedRef.current?.prev();
          return;
        case "ArrowLeft":
          e.preventDefault();
          if (onScreen) photoControl.current?.step(-1);
          return;
        case "ArrowRight":
          e.preventDefault();
          if (onScreen) photoControl.current?.step(1);
          return;
        case "i":
        case "I":
          if (onScreen) onInterest(onScreen);
          return;
        case "s":
        case "S":
          if (onScreen) void onSave(onScreen);
          return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ---------------- what the feed shows ---------------- */

  const emptyPool = !lane && cards.length === 0 && exhausted && data.emptyState !== null;
  /** Nothing on screen, the pool not finished — still looking, or waiting to be asked. Never "khatam". */
  const stillLooking = !lane && !current && !emptyPool && !exhausted;
  const feedOver = !lane && !current && !emptyPool && !stillLooking;

  /**
   * What is still missing from the member's own profile — the server's list,
   * less whatever they answered on a question page this visit. The closing
   * card counts these out loud, so an answer given two minutes ago must not
   * still be "baaki".
   */
  const ownGaps = useMemo(() => data.profileGaps.filter((k) => !answeredOwn.has(k)), [data.profileGaps, answeredOwn]);
  const refineQuestions = useMemo(
    () => data.refineQuestions.filter((q) => !answeredOwn.has(q.key)),
    [data.refineQuestions, answeredOwn],
  );

  /**
   * The end of the feed opens the member's own profile deck (D-92b) — once a
   * visit, and only when something is genuinely missing.
   */
  const gapOffered = useRef(false);
  useEffect(() => {
    if (!feedOver || gapOffered.current || ownGaps.length === 0) return;
    gapOffered.current = true;
    setGapDeckOpen(true);
  }, [feedOver, ownGaps.length]);

  function cardPage(card: ReelCardViewModel): FeedPage {
    return {
      key: card.id,
      render: (active) => {
        const shown = askedIds.has(card.id) && card.askedStatus === "NONE" ? { ...card, askedStatus: "PENDING" as const } : card;
        const withMatch = matchOverride[card.id] ? { ...shown, matchId: matchOverride[card.id] } : shown;
        const lastDecision = decisions[card.id] ?? card.lastDecision;
        const historyNote = withMatch.matchId
          ? null
          : lastDecision === "LEFT"
            ? t("reel.card.decisionNotNow", "Not now kaha tha")
            : !lastDecision && card.seenBefore
              ? t("reel.card.seenBefore", "Pehle dekha tha")
              : null;
        const entry = interestMap[card.id];
        return (
          <ReelCard
            card={withMatch}
            active={active}
            photoControlRef={active ? photoControl : undefined}
            mediaX={active ? mediaX : undefined}
            actions={{
              interest: interestUi(card),
              pendingMs: INTEREST_UNDO_MS,
              pendingKey: entry?.phase === "pending" ? entry.key : null,
              saved: isSaved(card),
              kundliBadge: emphasis.kundliBadge && card.kundli.milan ? String(card.kundli.milan.total) : null,
              grioLit: emphasis.grioLit,
              historyNote,
              onInterest: () => onInterest(card),
              onSave: () => void onSave(card),
              onKundli: () => openKundli(card),
              onGrio: () => insight.show(card),
              onMore: () => more.show(card),
              onDetails: (section) => openDetails(card, section ?? null),
              onReasons: () => insight.show(card),
              onVoice: card.voiceNote ? () => voice.show(card) : undefined,
              onAddPhoto: data.viewer.needsOwnPhoto ? () => setPhotoGateOpen(true) : undefined,
            }}
          />
        );
      },
    };
  }

  /** The page that is not a person — loading, a lane's end, the end of the feed. */
  function statusNode(): React.ReactNode {
    if (lane) {
      return (
        <StatusShell>
          {laneBusy || laneCursor ? (
            <>
              <Loader2 className="size-6 animate-spin text-white/80" aria-hidden />
              <p className="text-[0.9375rem] font-semibold text-white">{t("reel.library.loading", "Khol rahe hain…")}</p>
            </>
          ) : laneError ? (
            <p role="alert" className="text-[0.9375rem] font-semibold text-white">
              {laneError}
            </p>
          ) : laneCards.length === 0 ? (
            <p className="text-[0.9375rem] leading-relaxed text-white">{LANE_EMPTY[lane]}</p>
          ) : (
            <p className="text-[0.9375rem] leading-relaxed text-white">
              {t("reel.library.end", "Is list me bas itne hi the.")}
            </p>
          )}
          {!laneBusy && !laneCursor && (
            <Button variant="secondary" size="md" onClick={() => setTab("FOR_YOU")}>
              {t("reel.top.backToFeed", "Back to For You")}
            </Button>
          )}
        </StatusShell>
      );
    }
    if (emptyPool) {
      return (
        <StatusShell>
          <p className="text-lg font-semibold text-white">{data.emptyState?.title}</p>
          <p className="text-[0.875rem] leading-relaxed text-white/75">{data.emptyState?.description}</p>
        </StatusShell>
      );
    }
    if (!exhausted) {
      return (
        <StatusShell>
          {loadingMore ? (
            <>
              <Loader2 className="size-6 animate-spin text-white/80" aria-hidden />
              <p className="text-[0.9375rem] font-semibold text-white">{t("reel.more.loading", "Aur rishtey laa rahe hain…")}</p>
            </>
          ) : (
            <>
              <p className="text-[0.9375rem] font-semibold text-white">
                {moreError
                  ? moreError
                  : lens === "FOR_YOU"
                    ? t("reel.more.paused", "Aur rishtey dekhne ke liye tap karein.")
                    : t("reel.lensEmpty.title", "Is lens me abhi koi profile nahi mili.")}
              </p>
              {!moreError && lens !== "FOR_YOU" && (
                <p className="text-[0.875rem] leading-relaxed text-white/75">
                  {t("reel.lensEmpty.body", "Baaki rishtey “For You” me hain — ya yahin aur dhoondte rahein.")}
                </p>
              )}
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => {
                    emptyTopUps.current = 0;
                    void loadMore();
                  }}
                >
                  {t("reel.more.cta", "Aur dikhaiye")}
                </Button>
                {lens !== "FOR_YOU" && (
                  <Button variant="secondary" size="md" onClick={() => setTab("FOR_YOU")}>
                    {t("reel.tabs.forYou", "For You")}
                  </Button>
                )}
              </div>
            </>
          )}
        </StatusShell>
      );
    }
    return (
      <div className="flex h-full flex-col overflow-y-auto bg-gradient-to-b from-wine-700 via-wine-900 to-sand-900 pt-[calc(3.75rem+env(safe-area-inset-top,0px))]">
        <ReelEndDiscovery
          cards={cards}
          decisions={decisions}
          // Today's totals: the server's, plus what this session added.
          seenCount={data.todayDecisions.seen + sessionSeen}
          sentCount={data.todayDecisions.sent + sentIds.size}
          shortlistCount={data.todayDecisions.shortlisted + savedIds.size}
          questions={refineQuestions}
          preferenceNotice={data.preferenceNotice}
          laneCounts={laneCounts}
          gapCount={ownGaps.length}
          onCompleteProfile={ownGaps.length > 0 ? () => setGapDeckOpen(true) : undefined}
          onOpenLane={setTab}
          onSearch={() => setSearchOpen(true)}
          onReplay={() => {
            setDecided(new Set());
            setDeckBack([]);
            setTab("FOR_YOU");
          }}
        />
      </div>
    );
  }

  /**
   * One of the member's own questions as a page of the feed. The key is fixed
   * when the page is first dealt as "next" and kept when it becomes current —
   * the pager's rule that a page is the same instance in both roles.
   */
  function questionPage(key: string, question: ReelRefineQuestion): FeedPage {
    return {
      key,
      render: (active) => (
        <ReelQuestionPage
          question={question}
          active={active}
          onSaved={(k) => setAnsweredOwn((s) => new Set(s).add(k))}
          onNext={() => feedRef.current?.next()}
        />
      ),
    };
  }

  // The page after the last card exists only where there is something true to
  // say there: the lane's end, the loading line, or the closing card.
  const statusPage: FeedPage = { key: "status", render: () => statusNode() };
  // While a question is on screen, `current` is the person waiting below it
  // and `prevCard` the one the member just left above it.
  const feedCurrent: FeedPage | null = feedAsk
    ? questionPage(feedAsk.key, feedAsk.question)
    : current
      ? cardPage(current)
      : statusPage;
  const feedNext: FeedPage | null = feedAsk
    ? current
      ? cardPage(current)
      : statusPage
    : current
      ? feedAskDue
        ? questionPage(`feed-ask-${feedAskShown}`, feedAskQueue[0])
        : upNext
          ? cardPage(upNext)
          : statusPage
      : null;
  const feedPrev: FeedPage | null = prevCard ? cardPage(prevCard) : null;

  const laneNote = currentLaneCard?.laneNote ?? null;

  return (
    <>
      <ReelFrame
        backdropUrl={onScreen?.photoUnlocked ? onScreen.photoUrl : null}
        onPrev={() => feedRef.current?.prev()}
        onNext={() => feedRef.current?.next()}
        canPrev={Boolean(feedPrev)}
        canNext={Boolean(feedNext)}
      >
        <div className="relative h-full w-full overflow-hidden bg-grad-photo">
          <ReelFeed
            prev={feedPrev}
            current={feedCurrent}
            next={feedNext}
            onAdvance={onAdvance}
            onBack={onBack}
            onPhotoStep={(dir) => (onScreen ? (photoControl.current?.step(dir) ?? false) : false)}
            mediaX={mediaX}
            controlRef={feedRef}
            disabled={sheetOpen}
            label={t("reel.feed.label", "Rishta reel")}
            nextLabel={t("reel.frame.nextAria", "Next profile")}
            prevLabel={t("reel.frame.prevAria", "Previous profile")}
          />

          {/* A lane's one provable line — "Interest sent · 2 din pehle" — as
              a quiet caption under the bar, not a strip over the face. */}
          {lane && laneNote && current && (
            <div className="pointer-events-none absolute inset-x-0 top-[calc(3.75rem+env(safe-area-inset-top,0px))] z-30 flex justify-center px-4">
              <span className="max-w-full truncate rounded-full bg-black/45 px-3 py-1 text-[0.75rem] font-medium text-white/90 backdrop-blur-md">
                {laneNote}
              </span>
            </div>
          )}

          {/* The top bar. The 1rem band above it is where the story bars ride
              (see `ReelCard`'s CHROME_CLEAR_TOP — these two numbers are a pair). */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-40 pt-[calc(1rem+env(safe-area-inset-top,0px))]">
            <div>
              <ReelTopBar
                lens={lens}
                lane={lane}
                laneLabel={lane ? LANE_LABELS[lane] : ""}
                laneCount={lane ? laneCounts[lane] : 0}
                lensCounts={lensCounts}
                unreadMessages={data.unreadMessages}
                onLens={(l) => setTab(l)}
                onOpenList={() => setListOpen(true)}
                onExitLane={() => setTab("FOR_YOU")}
                onSearch={() => setSearchOpen(true)}
              />
            </div>
          </div>

          <ReelToast toast={toast} />
        </div>
      </ReelFrame>

      {/* Sheets live outside the frame: they are screen-level surfaces and must
          cover the whole viewport on desktop, not just the phone window. */}
      <ReelDetailsSheet
        open={details.open}
        onClose={details.hide}
        card={details.target?.card ?? null}
        section={details.target?.section ?? null}
        emphasis={emphasis}
        interest={details.target ? interestUi(details.target.card) : "idle"}
        onInterest={() => details.target && onInterest(details.target.card)}
        onNotNow={
          details.target && !lane && !matchIdFor(details.target.card) ? () => details.target && notNow(details.target.card) : undefined
        }
        onKundli={() => details.target && openKundli(details.target.card)}
        onAskGrio={() => details.target && askGrioAbout(details.target.card)}
        onAskAi={details.target ? () => details.target && ai.show(details.target.card) : undefined}
        onAskPerson={data.askBridgeEnabled && details.target ? () => details.target && ask.show(details.target.card) : undefined}
        onAddNote={details.target && !matchIdFor(details.target.card) ? () => details.target && openNote(details.target.card) : undefined}
        onSectionSeen={onSectionSeen}
      />
      <ReelMoreSheet
        open={more.open}
        onClose={more.hide}
        card={more.target}
        liked={more.target ? isLiked(more.target) : false}
        interestOut={more.target ? ["pending", "syncing", "sent"].includes(interestUi(more.target)) : false}
        onDetails={() => {
          if (!more.target) return;
          more.hide();
          openDetails(more.target);
        }}
        onWhy={() => {
          if (!more.target) return;
          more.hide();
          insight.show(more.target);
        }}
        onLike={() => more.target && void toggleLike(more.target)}
        onVoice={
          more.target?.voiceNote
            ? () => {
                if (!more.target) return;
                more.hide();
                voice.show(more.target);
              }
            : undefined
        }
        onAskPerson={
          data.askBridgeEnabled
            ? () => {
                if (!more.target) return;
                more.hide();
                ask.show(more.target);
              }
            : undefined
        }
        onAddNote={() => {
          if (!more.target) return;
          more.hide();
          openNote(more.target);
        }}
        // Inside a lane there is nothing left to say "not now" to — everybody
        // there was already met, and the lane's own move is a scroll.
        onNotNow={!lane ? () => more.target && notNow(more.target) : undefined}
        onReport={() => {
          if (!more.target) return;
          more.hide();
          report.show(more.target);
        }}
      />
      <ReelInsightSheet
        open={insight.open}
        onClose={insight.hide}
        card={insight.target}
        emphasis={emphasis}
        onAskGrio={(ask) => insight.target && askGrioAbout(insight.target, ask)}
        onAskAi={() => {
          if (!insight.target) return;
          insight.hide();
          ai.show(insight.target);
        }}
        onKundli={() => {
          if (!insight.target) return;
          insight.hide();
          openKundli(insight.target);
        }}
      />
      <ReelListSheet
        open={listOpen}
        onClose={() => setListOpen(false)}
        counts={laneCounts}
        active={lane}
        unreadMessages={data.unreadMessages}
        onPick={(l) => {
          setListOpen(false);
          setTab(l);
        }}
      />
      <ReelKundliSheet
        profileId={kundli.open ? (kundli.target?.id ?? null) : null}
        name={kundli.target?.displayName ?? ""}
        onClose={kundli.hide}
      />
      <ReelQuickMessageSheet
        matchId={message.open ? (message.target?.matchId ?? null) : null}
        name={message.target?.name ?? ""}
        onClose={message.hide}
        onSent={() => {
          message.hide();
          showToast({ tone: "done", text: t("reel.toast.messageSent", "Message bhej diya") });
        }}
      />
      <ReelShortlistSheet open={family.open} onClose={family.hide} displayName={family.target?.displayName ?? ""} />
      <ReelAISheet open={ai.open} onClose={ai.hide} profileId={ai.target?.id ?? null} displayName={ai.target?.displayName ?? ""} />
      <ReelPhotoGate
        viewer={data.viewer}
        open={photoGateOpen}
        onClose={closePhotoGate}
        // The cards already in memory had their `photoUrl` withheld on the
        // server; a refresh is what actually opens them.
        onUploaded={() => router.refresh()}
      />
      <ReelSearchSheet open={searchOpen} onClose={() => setSearchOpen(false)} viewerCity={data.viewer.city} />
      <ReelVoiceSheet open={voice.open} onClose={voice.hide} displayName={voice.target?.displayName ?? ""} voice={voice.target?.voiceNote ?? null} />
      <ReportSheet
        open={report.open}
        onClose={report.hide}
        targetProfileId={report.target?.id}
        targetLabel={report.target?.displayName ?? ""}
      />
      <IcebreakerSheet
        open={note.open}
        onClose={note.hide}
        profileId={note.target?.card.id ?? null}
        displayName={note.target?.card.displayName ?? ""}
        voiceEnabled={data.voiceEnabled}
        mission={note.target?.card.mission ?? null}
        voiceQuest={data.voiceQuest}
        onCelebration={setCelebration}
        ready={note.target?.ready ?? null}
      />
      <AskQuestionSheet
        open={ask.open}
        onClose={ask.hide}
        profileId={ask.target?.id ?? null}
        displayName={ask.target?.displayName ?? ""}
        onAsked={() => {
          if (ask.target) setAskedIds((ids) => new Set(ids).add(ask.target!.id));
        }}
      />

      {/* The end of the feed, as something to do (D-92b). */}
      {gapDeckOpen && (
        <ProfileProvider>
          <SmartProfileDeck
            only={ownGaps}
            scopeLabel={t("reel.end.gapsDeckTitle", "Aapki profile")}
            onBack={() => {
              setGapDeckOpen(false);
              router.refresh();
            }}
          />
        </ProfileProvider>
      )}

      <CelebrationHost celebration={celebration} onDone={() => setCelebration(null)} />

      <Sheet open={matched !== null} onClose={() => setMatched(null)} variant="center">
        <div className="on-deep relative overflow-hidden rounded-lg bg-gradient-to-br from-wine-800 via-wine-700 to-wine-900 px-6 py-8 text-center">
          <Celebrate trigger={matched !== null} origin="top" />
          <span className="relative mx-auto grid size-16 place-items-center rounded-full bg-gradient-to-b from-gold-400 to-gold-600 text-primary-fg shadow-gold">
            <Users className="size-7" />
          </span>
          <h3 className="relative mt-4 font-[family-name:var(--font-display)] text-xl font-bold text-white">
            {t("reel.stack.matchedTitle", "Aapka aur {name} ka rishta jud gaya").replace("{name}", matched?.card.displayName ?? "")}
          </h3>
          <p className="relative mx-auto mt-2 max-w-[26rem] text-[0.875rem] leading-relaxed text-gold-100/90">
            {t(
              "reel.stack.matchedDescription",
              "Dono taraf se interest confirm ho gaya hai — ab photo aur baaki details dikhengi, aur aap baat shuru kar sakte hain.",
            )}
          </p>
          <div className="relative mt-5 flex justify-center gap-2">
            <Button variant="secondary" size="md" onClick={() => setMatched(null)}>
              {t("reel.stack.later", "Later")}
            </Button>
            <Link href={matched?.matchId ? `/user/messages/${matched.matchId}` : "/user/messages"}>
              <Button variant="primary" size="md">
                {t("reel.stack.startChat", "Start Chat")}
              </Button>
            </Link>
          </div>
        </div>
      </Sheet>
    </>
  );
}

/** The deep warm ground a status page stands on — white type, centred, never a second header. */
function StatusShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex h-full flex-col items-center justify-center gap-3 bg-gradient-to-b from-wine-700 via-wine-900 to-sand-900 px-6 text-center",
      )}
    >
      <div className="mx-auto flex max-w-sm flex-col items-center gap-3">{children}</div>
    </div>
  );
}
