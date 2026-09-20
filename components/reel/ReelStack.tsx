"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMotionValue } from "framer-motion";
import { Loader2, Users } from "lucide-react";
import Link from "next/link";
import ReelCard from "./ReelCard";
import ReelFrame from "./ReelFrame";
import ReelHeader from "./ReelHeader";
import ReelTabs, { isReelLane } from "./ReelTabs";
import ReelActionBar from "./ReelActionBar";
import ReelShortlistSheet from "./ReelShortlistSheet";
import ReelDetailsSheet from "./ReelDetailsSheet";
import ReelAISheet from "./ReelAISheet";
import ReelVoiceSheet from "./ReelVoiceSheet";
import ReelPhotoGate from "./ReelPhotoGate";
import ReelEndDiscovery from "./ReelEndDiscovery";
import ReelSearchSheet from "./ReelSearchSheet";
import ReelLaneFilterBar from "./ReelLaneFilterBar";
import ReelLaneActionBar from "./ReelLaneActionBar";
import IcebreakerSheet from "./IcebreakerSheet";
import AskQuestionSheet from "@/components/askBridge/AskQuestionSheet";
import ReportSheet from "@/components/safety/ReportSheet";
import AiQuotaUpgradeCard from "./AiQuotaUpgradeCard";
import Sheet from "@/components/ui/Sheet";
import Button from "@/components/ui/Button";
import Celebrate from "@/components/ui/Celebrate";
import CelebrationHost, { type Celebration } from "@/components/ui/CelebrationHost";
import { useGrio } from "@/components/grio/GrioProvider";
import { cn } from "@/lib/utils";
import {
  REEL_LENSES,
  type ReelCardViewModel,
  type ReelLens,
  type ReelMoreResponse,
  type ReelTab,
  type ReelViewModel,
  type ReelSwipeDirection,
} from "@/lib/contracts/reel";
import type { ReelLane, ReelLaneCounts, ReelLibraryCard, ReelLibraryPage } from "@/lib/contracts/reelLibrary";
import type { ReelSearchState } from "@/lib/reel/searchFilters";
import { buildReelSearchFilters } from "@/lib/reel/searchFilters";
import { useT } from "@/components/i18n/LanguageProvider";

const KEY_TO_DIRECTION: Record<string, ReelSwipeDirection> = {
  ArrowLeft: "LEFT",
  ArrowRight: "RIGHT",
  ArrowUp: "UP",
  ArrowDown: "DOWN",
};

/** The "digital biodata stack" — see explain.ts §D-32 sibling doc for why AI never picks these, only explains them. */
const STACK_SIZE = 3;

/** A card that has been decided and is flying off, but is still on screen. */
type Departing = { card: ReelCardViewModel; direction: ReelSwipeDirection };

/**
 * "Don't ask me again today."
 *
 * Per calendar day, not per session and not forever: the reel is a daily
 * ritual, so one ask a day is the same cadence as the thing it sits in front
 * of. Stored client-side because it is a nudge, not a permission — losing it
 * (private window, cleared storage) costs one extra dismissible sheet.
 */
const PHOTO_GATE_KEY = "reel-photo-gate-dismissed";

function photoGateDismissedToday(): boolean {
  try {
    return window.localStorage.getItem(PHOTO_GATE_KEY) === new Date().toISOString().slice(0, 10);
  } catch {
    return false; // storage blocked — showing it again is the safe miss
  }
}

/** Does this card belong to the lens? See `ReelTabs` for what each one claims. */
function inLens(card: ReelCardViewModel, lens: ReelLens): boolean {
  switch (lens) {
    case "NEARBY":
      return card.nearby;
    case "NEW":
      return card.isNew;
    default:
      return true;
  }
}

/**
 * How few cards may be left before the next batch is fetched. Three is the
 * visible stack depth — the top-up starts as the last card of the pile comes
 * into view, which on a normal connection means it has landed before the
 * member reaches it.
 */
const PREFETCH_AT = 3;

/**
 * How many times an *empty* lens may silently ask for another batch.
 *
 * "Nearby" in a city with four members can walk the entire pool without ever
 * filling, and doing that on the member's behalf is a lot of database work to
 * answer a question they can answer themselves. After three tries the screen
 * says so and offers the button instead.
 */
const MAX_EMPTY_TOPUPS = 3;

/**
 * The reel screen.
 *
 * ## Position is a set, not an index
 *
 * The deck used to be walked with a cursor into `data.cards`. That works only
 * while every card is always in play; the moment a lens can hide some of them,
 * "the next card" stops being "the next index" and every rollback has to
 * re-find its card by id anyway. So the screen keeps `decided` — the ids that
 * have had a decision this session — and derives the live queue from it. A
 * replay pass is `decided.clear()`, a rolled-back interest is one `delete`,
 * and switching lens is a different filter over the same set.
 *
 * ## The deck is not the day (D-91)
 *
 * `cards` is state rather than a prop read straight through, because the
 * server sends the *first* batch and the screen asks for more as the pile
 * thins. There is no number at which it stops: `exhausted` is set only when
 * the server says there is genuinely nobody left, and that is the one state
 * allowed to print "ab aapke liye matching rishtey baad me milenge".
 */
export default function ReelStack({ data, initialTab }: { data: ReelViewModel; initialTab?: ReelTab }) {
  const t = useT();
  const { open: openGrio } = useGrio();

  /** What an empty lane says — each one names what would fill it. */
  const LANE_EMPTY: Record<ReelLane, string> = {
    VIEWED: t("reel.library.empty.viewed", "Abhi aisi koi profile nahi jise aapne sirf dekha ho."),
    LIKED: t("reel.library.empty.liked", "Aapne abhi kisi ko like nahi kiya. Like sirf aapko dikhta hai."),
    INTEREST: t("reel.library.empty.interest", "Aapne abhi tak kisi ko interest nahi bheja."),
    MESSAGE: t("reel.library.empty.message", "Abhi koi baat-cheet shuru nahi hui."),
  };

  // One tab state for the whole rail. `lane` is non-null exactly when the
  // member is looking backwards, and that is what switches the screen from a
  // swipe deck to a list — see `ReelTabs`.
  // `?tab=` only picks the starting pill. After that the rail owns it, so a
  // member who taps away from a linked lane is not snapped back by the URL.
  const [tab, setTab] = useState<ReelTab>(initialTab ?? "FOR_YOU");
  const lane: ReelLane | null = isReelLane(tab) ? tab : null;
  const lens: ReelLens = isReelLane(tab) ? "FOR_YOU" : tab;
  const setLens = (next: ReelLens) => setTab(next);
  const [decided, setDecided] = useState<Set<string>>(new Set());
  const [departing, setDeparting] = useState<Departing[]>([]);
  /** Guards a card against being decided twice while its own commit is in
   *  flight — cleared once it has left the screen (or been rolled back). */
  const inFlight = useRef<Set<string>>(new Set());
  /** 0..1 commitment of the top card's live gesture. Owned here rather than by
   *  the card because the cards *behind* are the ones that read it: the pile
   *  rises with the finger and settles back if the swipe is abandoned. */
  const swipeProgress = useMotionValue(0);
  // Keyed by profileId rather than an incrementing counter so a replay pass
  // (View Again) can re-show the same card without inflating "kitno ko
  // interest bheja" — re-deciding the same profile just overwrites its entry.
  const [decisions, setDecisions] = useState<Record<string, ReelSwipeDirection>>({});
  // Separate from `decisions` (which keeps only the latest direction, for the
  // replay badge): an interest already sent can't be un-sent by a later DOWN
  // on the same card during a replay pass, so these only ever grow.
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [shortlistedIds, setShortlistedIds] = useState<Set<string>>(new Set());
  /**
   * Private likes — seeded from the server so a reload keeps the hearts
   * filled, then kept in one place here rather than per card (a card unmounts
   * the moment it is swiped past, and the like has to outlive it).
   * See `likeService` for who may ever see one: nobody.
   */
  const [likedIds, setLikedIds] = useState<Set<string>>(
    () => new Set(data.cards.filter((c) => c.liked).map((c) => c.id)),
  );
  /** Lane sizes from the server, corrected as a lane reports what it actually holds. */
  const [laneCounts, setLaneCounts] = useState(data.laneCounts);
  /**
   * Meri List, as a deck (D-91b). The lanes render the same card as the reel —
   * so this is just a different source for `cards`, not a different screen.
   */
  const [laneCards, setLaneCards] = useState<ReelLibraryCard[]>([]);
  const [laneCursor, setLaneCursor] = useState<string | null>(null);
  const [laneBusy, setLaneBusy] = useState(false);
  const [laneError, setLaneError] = useState<string | null>(null);
  /** Filters survive a lane change on purpose — see `ReelLaneFilterBar`. */
  const [laneFilters, setLaneFilters] = useState<ReelSearchState>({
    name: "",
    band: null,
    city: null,
    verifiedOnly: false,
  });
  const laneRunId = useRef(0);
  const [shortlistTarget, setShortlistTarget] = useState<ReelCardViewModel | null>(null);
  const [matchedTarget, setMatchedTarget] = useState<ReelCardViewModel | null>(null);
  const [matchedMatchId, setMatchedMatchId] = useState<string | null>(null);
  const [icebreakerTarget, setIcebreakerTarget] = useState<ReelCardViewModel | null>(null);
  const [askTarget, setAskTarget] = useState<ReelCardViewModel | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<ReelCardViewModel | null>(null);
  const [aiTarget, setAiTarget] = useState<ReelCardViewModel | null>(null);
  const [voiceTarget, setVoiceTarget] = useState<ReelCardViewModel | null>(null);
  const [reportTarget, setReportTarget] = useState<ReelCardViewModel | null>(null);
  const [askedIds, setAskedIds] = useState<Set<string>>(new Set());
  const [interestLimitMessage, setInterestLimitMessage] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [photoGateOpen, setPhotoGateOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const router = useRouter();

  // The growing deck — see this component's header.
  const [cards, setCards] = useState<ReelCardViewModel[]>(data.cards);
  const [exhausted, setExhausted] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  /** Consecutive auto top-ups that left the current lens still empty. */
  const emptyTopUps = useRef(0);

  /**
   * Which lanes still have a decision left in them.
   *
   * Viewed and Liked do: that is the whole point — somebody skipped on Tuesday
   * can be sent an interest today. Interest and Messages do not, so a swipe
   * there only moves along and writes nothing (see `commit`).
   */
  const laneDecides = lane === "VIEWED" || lane === "LIKED";

  const loadLane = useCallback(
    async (activeLane: ReelLane, filters: ReelSearchState, cursor: string | null) => {
      const id = ++laneRunId.current;
      setLaneBusy(true);
      setLaneError(null);
      try {
        const res = await fetch("/api/reel/library", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lane: activeLane, filters: buildReelSearchFilters(filters), cursor }),
        });
        const body = (await res.json()) as ReelLibraryPage;
        if (id !== laneRunId.current) return;
        if (!body.ok) {
          setLaneError(body.message ?? t("reel.library.failed", "List nahi khul paayi — dobara try karein."));
          return;
        }
        // A cursor means "more of the same question"; no cursor means the
        // filters changed and the old cards answered a different one.
        setLaneCards((prev) => {
          if (!cursor) return body.cards;
          const have = new Set(prev.map((c) => c.id));
          return [...prev, ...body.cards.filter((c) => !have.has(c.id))];
        });
        setLaneCursor(body.nextCursor);
        setLaneCounts((c: ReelLaneCounts) => ({ ...c, [activeLane]: body.total }));
      } catch {
        if (id === laneRunId.current) {
          setLaneError(t("reel.library.failed", "List nahi khul paayi — dobara try karein."));
        }
      } finally {
        if (id === laneRunId.current) setLaneBusy(false);
      }
    },
    [t],
  );

  // Opening a lane, or changing a filter inside one, is a fresh question.
  useEffect(() => {
    if (!lane) return;
    setLaneCards([]);
    setLaneCursor(null);
    const timer = setTimeout(() => void loadLane(lane, laneFilters, null), 300);
    return () => clearTimeout(timer);
  }, [lane, laneFilters, loadLane]);

  const queue = useMemo(
    () =>
      lane
        ? laneCards.filter((c) => !decided.has(c.id))
        : cards.filter((c) => !decided.has(c.id) && inLens(c, lens)),
    [lane, laneCards, cards, decided, lens],
  );
  const current = queue[0] ?? null;
  /** The same card, with its lane context — only set while a lane is open. */
  const currentLaneCard = lane && current ? laneCards.find((c) => c.id === current.id) ?? null : null;
  const visible = queue.slice(0, STACK_SIZE);

  const counts = useMemo(() => {
    const out = { FOR_YOU: 0, NEARBY: 0, NEW: 0, ...laneCounts } as Record<ReelTab, number>;
    for (const c of cards) {
      if (decided.has(c.id)) continue;
      for (const l of REEL_LENSES) if (inLens(c, l)) out[l] += 1;
    }
    return out;
  }, [cards, decided, laneCounts]);

  // Deepest first so the top card paints last; flying cards go after everything
  // so they stay above the stack they just left.
  const layers: { card: ReelCardViewModel; depth: number; direction: ReelSwipeDirection | null }[] = [];
  for (let i = visible.length - 1; i >= 0; i--) layers.push({ card: visible[i], depth: i, direction: null });
  for (const d of departing) layers.push({ card: d.card, depth: 0, direction: d.direction });

  /**
   * Ask the server for the next batch.
   *
   * Cards are appended by id-checked union rather than concatenated: the same
   * batch can arrive twice (two tabs, a double tap on "aur dikhaiye"), and a
   * duplicate card would be a second chance to swipe the same person.
   */
  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    setMoreError(null);
    try {
      const res = await fetch("/api/reel/more", { method: "POST" });
      const body = (await res.json()) as ReelMoreResponse;
      if (!body.ok) {
        setMoreError(body.message ?? t("reel.more.failed", "Aur rishtey laane me dikkat aayi — dobara try karein."));
        return;
      }
      if (body.exhausted) {
        setExhausted(true);
        return;
      }
      setCards((prev) => {
        const have = new Set(prev.map((c) => c.id));
        const fresh = body.cards.filter((c) => !have.has(c.id));
        // A top-up can contain somebody this member liked from a lane earlier
        // in the session, so the batch brings its own like state with it.
        const liked = fresh.filter((c) => c.liked).map((c) => c.id);
        if (liked.length) setLikedIds((s) => new Set([...s, ...liked]));
        return [...prev, ...fresh];
      });
    } catch {
      setMoreError(t("reel.more.failed", "Aur rishtey laane me dikkat aayi — dobara try karein."));
    } finally {
      setLoadingMore(false);
    }
  }, [t]);

  // A lens change is a new question — the previous lens running dry says
  // nothing about this one.
  useEffect(() => {
    emptyTopUps.current = 0;
  }, [lens]);

  // The top-up trigger. Deliberately driven by what is left *in the current
  // lens*: a member who switched to "Nearby" and sees nothing should have the
  // app keep looking, not be told the day is over while two hundred profiles
  // sit undealt.
  // A lane pages rather than generates: when the member nears the bottom of
  // what was fetched, fetch the next page of the same question.
  useEffect(() => {
    if (!lane || laneBusy || !laneCursor) return;
    if (queue.length > PREFETCH_AT) return;
    void loadLane(lane, laneFilters, laneCursor);
  }, [lane, laneBusy, laneCursor, queue.length, laneFilters, loadLane]);

  useEffect(() => {
    // The reel's own top-up never runs inside a lane — a lane has a cursor.
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

  function logSwipe(profileId: string, direction: ReelSwipeDirection, meta: { decisionMs: number; wasButton: boolean }) {
    return fetch("/api/reel/swipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId, direction, reelId: data.reelId, ...meta }),
    })
      .then((r) => r.json())
      .catch(() => null);
  }

  /**
   * The private like (D-91b) — optimistic, and deliberately *not* a decision:
   * the card stays, the person stays in the deck, and nothing is sent to them.
   */
  async function toggleLike(card: ReelCardViewModel) {
    const next = !likedIds.has(card.id);
    setLikedIds((s) => {
      const out = new Set(s);
      if (next) out.add(card.id);
      else out.delete(card.id);
      return out;
    });
    setLaneCounts((c: ReelLaneCounts) => ({
      ...c,
      LIKED: Math.max(0, c.LIKED + (next ? 1 : -1)),
      // A liked person is no longer "only viewed" — and un-liking puts them back.
      VIEWED: Math.max(0, c.VIEWED + (next ? -1 : 1)),
    }));
    try {
      const res = await fetch(`/api/like/${card.id}`, { method: next ? "PUT" : "DELETE" });
      if (!res.ok) throw new Error("like failed");
    } catch {
      setLikedIds((s) => {
        const out = new Set(s);
        if (next) out.delete(card.id);
        else out.add(card.id);
        return out;
      });
      setLaneCounts((c: ReelLaneCounts) => ({ ...c, LIKED: Math.max(0, c.LIKED + (next ? -1 : 1)) }));
    }
  }

  /** The fly-off finished — the card can leave the DOM. */
  function handleExited(id: string) {
    setDeparting((d) => d.filter((e) => e.card.id !== id));
    inFlight.current.delete(id);
  }

  /** Grio, already knowing who is on screen — the same scoped conversation the
   *  profile page's Rishta Lens opens, not a second one built for the reel. */
  function askGrioAbout(card: ReelCardViewModel) {
    openGrio({ kind: "candidate", profileId: card.id, name: card.displayName });
  }

  async function commit(direction: ReelSwipeDirection, meta: { decisionMs: number; wasButton: boolean }) {
    if (!current) return;
    const target = current;
    if (inFlight.current.has(target.id)) return;

    // Interest and Messages: the decision was taken days ago. A swipe here
    // moves to the next card and writes nothing — sending a second interest
    // would fail, and recording a second LEFT would say something about this
    // member's taste that they did not mean to say.
    if (lane && !laneDecides) {
      if (direction === "UP") {
        askGrioAbout(target);
        return;
      }
      swipeProgress.set(0);
      setDeparting((d) => [...d, { card: target, direction }]);
      setDecided((s) => new Set(s).add(target.id));
      return;
    }

    if (direction === "UP") {
      void logSwipe(target.id, direction, meta); // fire-and-forget — doesn't dismiss the card
      askGrioAbout(target);
      return;
    }

    const previousDecision = decisions[target.id];
    inFlight.current.add(target.id);

    // The decision is applied to the screen first and confirmed with the server
    // after. This used to be the other way round — `await logSwipe(...)` sat
    // between the finger lifting and the card moving — which on a real mobile
    // connection meant the card sprang back to centre, sat there for the whole
    // round trip, then vanished. A swipe has to answer in the same frame as the
    // gesture or it doesn't read as a swipe at all.
    swipeProgress.set(0);
    setDeparting((d) => [...d, { card: target, direction }]);
    setDecisions((d) => ({ ...d, [target.id]: direction }));
    setDecided((s) => new Set(s).add(target.id));

    const result = await logSwipe(target.id, direction, meta);

    // The month's interest quota is out — the card was deliberately never
    // marked swiped server-side for exactly this case (see the API route), so
    // the optimistic dismissal has to be undone: the card comes back and the
    // upgrade sheet explains why.
    if (direction === "RIGHT" && result?.ok === false) {
      inFlight.current.delete(target.id);
      setDeparting((d) => d.filter((e) => e.card.id !== target.id));
      setDecisions((d) => {
        const next = { ...d };
        if (previousDecision === undefined) delete next[target.id];
        else next[target.id] = previousDecision;
        return next;
      });
      // By id — the set has no ordering to restore, which is the whole reason
      // the queue is derived rather than walked with a cursor.
      setDecided((s) => {
        const next = new Set(s);
        next.delete(target.id);
        return next;
      });
      setInterestLimitMessage(
        result.message ?? t("reel.stack.interestLimitDefault", "Is mahine ke interest khatam ho gaye hain."),
      );
      return;
    }

    if (direction === "DOWN") {
      setShortlistedIds((s) => new Set(s).add(target.id));
      setShortlistTarget(target);
    }
    // The pills are counts of rows, so an action that writes a row moves them
    // now rather than at the next page load — otherwise a member sends an
    // interest and watches the Interest tab keep saying 0.
    if (direction === "RIGHT" || direction === "DOWN") {
      setLaneCounts((c: ReelLaneCounts) => ({
        ...c,
        // Interest is the only lane a decision *adds* to.
        INTEREST: direction === "RIGHT" ? c.INTEREST + 1 : c.INTEREST,
        // Viewed means "nothing else ever happened", so anything that happens
        // takes the person out of it.
        VIEWED: Math.max(0, c.VIEWED - 1),
      }));
    }

    if (direction === "RIGHT") {
      setSentIds((s) => new Set(s).add(target.id));
      // A mutual match is the bigger moment — the icebreaker only makes sense
      // for the common case where the other side hasn't already said yes.
      if (result?.matched) {
        setMatchedMatchId(result.matchId ?? null);
        setMatchedTarget(target);
      } else {
        setIcebreakerTarget(target);
      }
    }
  }

  // The one ask, before the deck. Deliberately not rendered on the server:
  // "have they already dismissed it today" only exists in this browser, and
  // rendering the sheet open and then closing it would flash at every returning
  // member. Same shape the app's other one-time hints use.
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
      /* nothing to do — it'll simply be offered again next time */
    }
    setPhotoGateOpen(false);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!current) return;
      // Reading a sheet must not decide the card underneath it — arrow keys
      // there belong to the sheet's own scroll.
      if (lane) return;
      if (detailsTarget || voiceTarget || reportTarget || askTarget || aiTarget || photoGateOpen || searchOpen) return;
      const direction = KEY_TO_DIRECTION[e.key];
      if (!direction) return;
      e.preventDefault();
      commit(direction, { decisionMs: 0, wasButton: true });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lane, current, detailsTarget, voiceTarget, reportTarget, askTarget, aiTarget, photoGateOpen, searchOpen]);

  // "Never had anybody" is the server's call (`data.emptyState`), not "nothing
  // on screen": a member who has worked through two hundred rishtey also has
  // nothing on screen, and must not be told to go and complete their profile.
  const hasCard = Boolean(current) || departing.length > 0;
  const emptyPool = !lane && cards.length === 0 && exhausted && data.emptyState !== null;
  /**
   * Nothing on screen, but the pool is not finished — the app is still
   * looking, or has stopped looking on its own and is waiting to be asked.
   * Deliberately distinct from "sab dekh liye": the difference is the whole
   * point of D-91, and a lens that ran dry must never be dressed up as the end
   * of the rishtey.
   */
  const stillLooking = !lane && !hasCard && !emptyPool && !exhausted;
  // Anything left over — no card, a pool that had people in it, and the server
  // saying there are no more — is the closing card below.

  return (
    <>
      {/* ReelFrame is a passthrough on mobile and a phone-shaped window on
          desktop — see its header for why desktop needed one. */}
      <ReelFrame backdropUrl={current?.photoUnlocked ? current.photoUrl : null}>
        {/* The photograph is the screen. Header, lens pills and the action bar
            all float on top of it rather than owning rows of their own — the
            layout this rebuild exists for. Anything that is *not* a card (the
            closing card, an empty lens) gets the deep warm ground below, so the
            white chrome over it stays readable without a second, light header. */}
        <div
          className={cn(
            "relative h-full w-full overflow-hidden",
            hasCard ? "bg-grad-photo" : "bg-gradient-to-b from-wine-700 via-wine-900 to-sand-900",
          )}
        >
          {hasCard ? (
            <>
              {/* Live stack and flying cards share ONE keyed array on purpose.
                  Rendered as two sibling groups, a card moving from "stack" to
                  "flying" would change position in the children list and React
                  would unmount and remount it — losing the x/y the finger just
                  put it at, so the fly-off would restart from centre. One array
                  keyed by profile id means React moves the same instance and the
                  throw continues from exactly where the finger let go. */}
              {layers.map(({ card: c, depth, direction }) => (
                <ReelCard
                  key={c.id}
                  card={askedIds.has(c.id) && c.askedStatus === "NONE" ? { ...c, askedStatus: "PENDING" } : c}
                  draggable={depth === 0 && !direction}
                  depth={depth}
                  departing={direction}
                  onExited={() => handleExited(c.id)}
                  swipeProgress={swipeProgress}
                  onDismiss={depth === 0 ? commit : () => {}}
                  onDetails={() => setDetailsTarget(c)}
                  onVoice={c.voiceNote ? () => setVoiceTarget(c) : undefined}
                  onReport={() => setReportTarget(c)}
                  onAskGrio={() => askGrioAbout(c)}
                  // A locked card's "Add Your Photo" opens the same sheet
                  // instead of navigating off the reel — leaving the screen to
                  // fix the screen is what made this ask easy to ignore.
                  onAddPhoto={data.viewer.needsOwnPhoto ? () => setPhotoGateOpen(true) : undefined}
                  liked={likedIds.has(c.id)}
                  onLike={() => void toggleLike(c)}
                  previousDecision={decisions[c.id] ?? null}
                />
              ))}

              {/* Floating, not a row: a cream strip under the photo would cost
                  the person ~100px of their own screen for four buttons that
                  read perfectly well over a blurred warm wash. */}
              <div className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-surface via-surface/92 to-surface/0 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-4">
                {lane && !laneDecides ? (
                  <ReelLaneActionBar
                    lane={lane}
                    note={currentLaneCard?.laneNote ?? ""}
                    matchId={currentLaneCard?.matchId ?? null}
                    profileId={current?.id ?? null}
                    disabled={!current}
                    onNext={() => commit("LEFT", { decisionMs: 0, wasButton: true })}
                  />
                ) : (
                  <ReelActionBar onAction={(d) => commit(d, { decisionMs: 0, wasButton: true })} disabled={!current} />
                )}
              </div>
            </>
          ) : lane ? (
            // A lane speaks for itself: still fetching, or genuinely nobody in
            // it. Neither is "ab aapke liye rishtey baad me milenge" — that
            // sentence is about the *pool*, and a lane is about what this
            // member has already done.
            <div className="mx-auto flex h-full max-w-sm flex-col items-center justify-center gap-3 px-6 pt-32 text-center">
              {laneBusy ? (
                <>
                  <Loader2 className="size-6 animate-spin text-white/80" aria-hidden />
                  <p className="text-[0.9375rem] font-semibold text-white">
                    {t("reel.library.loading", "Khol rahe hain…")}
                  </p>
                </>
              ) : laneError ? (
                <p role="alert" className="text-[0.9375rem] font-semibold text-white">
                  {laneError}
                </p>
              ) : (
                <p className="text-[0.9375rem] leading-relaxed text-white">{LANE_EMPTY[lane]}</p>
              )}
            </div>
          ) : emptyPool ? (
            // Nobody at all: the first batch was empty *and* the server has
            // since confirmed there is no one to fetch. Nothing to replay, and
            // a different sentence from "sab dekh liye" — never having had a
            // rishta is not the same news as having worked through them.
            <div className="mx-auto flex h-full max-w-sm flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="text-lg font-semibold text-white">{data.emptyState?.title}</p>
              <p className="text-[0.875rem] leading-relaxed text-white/75">{data.emptyState?.description}</p>
            </div>
          ) : stillLooking ? (
            // Between batches. Three sentences are possible here and they are
            // three different pieces of news: we are fetching, the fetch
            // failed, or this lens has been asked enough times and the member
            // should decide what to do next. None of them is "khatam".
            <div className="mx-auto flex h-full max-w-sm flex-col items-center justify-center gap-3 px-6 pt-24 text-center">
              {loadingMore ? (
                <>
                  <Loader2 className="size-6 animate-spin text-white/80" aria-hidden />
                  <p className="text-[0.9375rem] font-semibold text-white">
                    {t("reel.more.loading", "Aur rishtey laa rahe hain…")}
                  </p>
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
                      <Button variant="secondary" size="md" onClick={() => setLens("FOR_YOU")}>
                        {t("reel.tabs.forYou", "For You")}
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex h-full flex-col pt-[calc(8.5rem+env(safe-area-inset-top,0px))]">
              <ReelEndDiscovery
                cards={cards}
                decisions={decisions}
                // Today's totals, not this tab's: the server counts what was
                // already decided before this page load, and the session adds
                // what happened since. A member who reloads has not un-seen
                // anybody.
                seenCount={data.todayDecisions.seen + Object.keys(decisions).length}
                sentCount={data.todayDecisions.sent + sentIds.size}
                shortlistCount={data.todayDecisions.shortlisted + shortlistedIds.size}
                questions={data.refineQuestions}
                preferenceNotice={data.preferenceNotice}
                // The way out of a finished pool: their own history, which is
                // the only real inventory left at this point.
                laneCounts={laneCounts}
                onOpenLane={setTab}
                onSearch={() => setSearchOpen(true)}
                onReplay={() => {
                  setDecided(new Set());
                  setLens("FOR_YOU");
                }}
              />
            </div>
          )}

          {/* On top of everything, always in the same place — the chrome does
              not move or restyle between a card, an empty lens and the close of
              the day, so the screen never appears to reload underneath it. */}
          {/* The 1rem of padding is the story-bar band: the card's photo
              slides paint their progress bars up there, above the logo, and
              the chrome starts below them. See `CHROME_CLEAR_TOP` in
              `ReelCard` — these two numbers are a pair. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-40 pt-[calc(1rem+env(safe-area-inset-top,0px))]">
            <div className="pointer-events-auto">
              <ReelHeader viewer={data.viewer} onSearch={() => setSearchOpen(true)} />
            </div>
            <div className="pointer-events-auto">
              <ReelTabs active={tab} counts={counts} onChange={setTab} />
            </div>
            {lane && (
              <div className="pointer-events-auto">
                <ReelLaneFilterBar
                  state={laneFilters}
                  viewerCity={data.viewer.city}
                  onChange={setLaneFilters}
                />
              </div>
            )}
          </div>
        </div>
      </ReelFrame>

      {/* Sheets live outside the frame: they are screen-level surfaces and must
          cover the whole viewport on desktop, not just the phone window. */}
      <ReelShortlistSheet
        open={shortlistTarget !== null}
        onClose={() => setShortlistTarget(null)}
        displayName={shortlistTarget?.displayName ?? ""}
      />
      <ReelDetailsSheet
        open={detailsTarget !== null}
        onClose={() => setDetailsTarget(null)}
        card={detailsTarget}
        onAction={(direction) => {
          setDetailsTarget(null);
          commit(direction, { decisionMs: 0, wasButton: true });
        }}
        // The plan's `aiAskPerDay` product, kept alive and given a home next to
        // the facts it answers from. The card's own "Ask Grio" is the other,
        // bigger conversation — see this sheet's prop docs for the split.
        onAskAi={detailsTarget ? () => setAiTarget(detailsTarget) : undefined}
        onAskPerson={
          data.askBridgeEnabled && detailsTarget ? () => setAskTarget(detailsTarget) : undefined
        }
      />
      <ReelAISheet
        open={aiTarget !== null}
        onClose={() => setAiTarget(null)}
        profileId={aiTarget?.id ?? null}
        displayName={aiTarget?.displayName ?? ""}
      />
      <ReelPhotoGate
        viewer={data.viewer}
        open={photoGateOpen}
        onClose={closePhotoGate}
        // The gate itself has no way to re-lock the cards already in
        // memory — their `photoUrl` was withheld on the server. A refresh is
        // what actually opens them, so the upload asks for one.
        onUploaded={() => router.refresh()}
      />
      {/* Search and its filters, in one sheet over the deck — the member never
          leaves the card they were on to look somebody up (D-91). */}
      <ReelSearchSheet open={searchOpen} onClose={() => setSearchOpen(false)} viewerCity={data.viewer.city} />
      <ReelVoiceSheet
        open={voiceTarget !== null}
        onClose={() => setVoiceTarget(null)}
        displayName={voiceTarget?.displayName ?? ""}
        voice={voiceTarget?.voiceNote ?? null}
      />
      <ReportSheet
        open={reportTarget !== null}
        onClose={() => setReportTarget(null)}
        targetProfileId={reportTarget?.id}
        targetLabel={reportTarget?.displayName ?? ""}
      />
      <IcebreakerSheet
        open={icebreakerTarget !== null}
        onClose={() => setIcebreakerTarget(null)}
        profileId={icebreakerTarget?.id ?? null}
        displayName={icebreakerTarget?.displayName ?? ""}
        voiceEnabled={data.voiceEnabled}
        mission={icebreakerTarget?.mission ?? null}
        voiceQuest={data.voiceQuest}
        onCelebration={setCelebration}
      />

      <AskQuestionSheet
        open={askTarget !== null}
        onClose={() => setAskTarget(null)}
        profileId={askTarget?.id ?? null}
        displayName={askTarget?.displayName ?? ""}
        onAsked={() => {
          if (askTarget) setAskedIds((ids) => new Set(ids).add(askTarget.id));
        }}
      />

      <CelebrationHost celebration={celebration} onDone={() => setCelebration(null)} />

      <Sheet
        open={interestLimitMessage !== null}
        onClose={() => setInterestLimitMessage(null)}
        title={t("reel.stack.interestLimitTitle", "Is mahine ke interest khatam")}
      >
        {interestLimitMessage && <AiQuotaUpgradeCard message={interestLimitMessage} />}
      </Sheet>

      <Sheet open={matchedTarget !== null} onClose={() => setMatchedTarget(null)} variant="center">
        <div className="on-deep relative overflow-hidden rounded-lg bg-gradient-to-br from-wine-800 via-wine-700 to-wine-900 px-6 py-8 text-center">
          <Celebrate trigger={matchedTarget !== null} origin="top" />
          <span className="relative mx-auto grid size-16 place-items-center rounded-full bg-gradient-to-b from-gold-400 to-gold-600 text-primary-fg shadow-gold">
            <Users className="size-7" />
          </span>
          <h3 className="relative mt-4 font-[family-name:var(--font-display)] text-xl font-bold text-white">
            {t("reel.stack.matchedTitle", "Aapka aur {name} ka rishta jud gaya").replace(
              "{name}",
              matchedTarget?.displayName ?? "",
            )}
          </h3>
          <p className="relative mx-auto mt-2 max-w-[26rem] text-[0.875rem] leading-relaxed text-gold-100/90">
            {t(
              "reel.stack.matchedDescription",
              "Dono taraf se interest confirm ho gaya hai — ab photo aur baaki details dikhengi, aur aap baat shuru kar sakte hain.",
            )}
          </p>
          <div className="relative mt-5 flex justify-center gap-2">
            <Button variant="secondary" size="md" onClick={() => setMatchedTarget(null)}>
              {t("reel.stack.later", "Baad Me")}
            </Button>
            <Link href={matchedMatchId ? `/user/messages/${matchedMatchId}` : "/user/messages"}>
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
