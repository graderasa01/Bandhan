"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMotionValue } from "framer-motion";
import { ChevronLeft, Loader2, Users } from "lucide-react";
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
import ReelLaneActionBar from "./ReelLaneActionBar";
import IcebreakerSheet from "./IcebreakerSheet";
import dynamic from "next/dynamic";
import AskQuestionSheet from "@/components/askBridge/AskQuestionSheet";
import ReportSheet from "@/components/safety/ReportSheet";
import AiQuotaUpgradeCard from "./AiQuotaUpgradeCard";
import Sheet from "@/components/ui/Sheet";
import Button from "@/components/ui/Button";
import Celebrate from "@/components/ui/Celebrate";
import CelebrationHost, { type Celebration } from "@/components/ui/CelebrationHost";
import { useGrio } from "@/components/grio/GrioProvider";
import { ProfileProvider } from "@/lib/profile/profileState";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/motion";
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
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * The member's own profile deck, loaded only if the feed actually runs out.
 *
 * It is a big client component (the whole question catalog's tap UI), and the
 * overwhelming majority of reel sessions never reach the end of the feed —
 * so it is not worth a byte of the reel's own bundle until it is needed.
 * `ssr: false` because it portals to `document.body` and reads localStorage on
 * mount; there is nothing for the server to render.
 */
const SmartProfileDeck = dynamic(() => import("@/components/profile/SmartProfileDeck"), { ssr: false });

/**
 * The two decisions a keyboard can take. Up and down are missing on purpose
 * (D-92): they walk the feed now, and they are handled as navigation in the
 * key handler rather than routed through a decision.
 */
const KEY_TO_DIRECTION: Record<string, ReelSwipeDirection> = {
  ArrowLeft: "LEFT",
  ArrowRight: "RIGHT",
};

/** The "digital biodata stack" — see explain.ts §D-32 sibling doc for why AI never picks these, only explains them. */
const STACK_SIZE = 3;

/**
 * Which drags leave a card behind inside a lane — see `commit`.
 *
 * LEFT and UP are absent because they are the two that genuinely move on, so
 * they keep the deck's fly-off and continue the finger's throw. RIGHT and DOWN
 * both mean "the previous person", and there what moves is the card arriving
 * from the top, so the one being left springs back under it.
 */
const LANE_STAYS_PUT: readonly ReelSwipeDirection[] = ["RIGHT", "DOWN"];

/**
 * A card this member has already matched with ignores the whole horizontal
 * axis (D-92b).
 *
 * Neither word on it is true any more: the interest was sent *and* accepted,
 * so there is nothing to send, and "Not now" cannot un-say a rishta. The
 * vertical axis still walks the feed, and everything that card can actually do
 * — open the chat, shortlist, ask Grio — is on a labelled button.
 */
const MATCHED_STAYS_PUT: readonly ReelSwipeDirection[] = ["LEFT", "RIGHT", "DOWN"];

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

/**
 * Does this card belong to the lens? See `ReelTabs` for what each one claims.
 *
 * FOR_YOU claims everybody the screen is holding — new rishtey and the ones
 * already seen, exactly as the server mixed them (D-92). The other two are
 * filters over that same pile, which is why a new profile shows up in both
 * "New" and "For You": one of them is the feed, the other is a question about
 * it.
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
 *
 * ## Up and down are the feed; left and right are the decisions (D-92)
 *
 * The vertical axis walks the deck — up for the next person, down for the last
 * one — and writes no decision at all, which is the gesture every phone owner
 * already has for a full-screen photo feed. It used to open Grio (up) and
 * shortlist (down), and both of those now live only on the buttons that carry
 * their names. The split is `meta.wasButton`, the same line a lane has always
 * drawn: a button has a label on it, a drag has no words.
 *
 * `cards` holds both halves of that feed — people never met, and people met
 * before — mixed by the server (`mixSeenIntoFresh`). The screen does not know
 * or care which is which except to filter the "New" pill by `seenBefore`.
 */
export default function ReelStack({ data, initialTab }: { data: ReelViewModel; initialTab?: ReelTab }) {
  const t = useT();
  const { open: openGrio } = useGrio();

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

  // One tab state for the whole rail. `lane` is non-null exactly when the
  // member is looking backwards, and that is what switches the screen from a
  // swipe deck to a list — see `ReelTabs`.
  // `?tab=` only picks the starting pill. After that the rail owns it, so a
  // member who taps away from a linked lane is not snapped back by the URL.
  const [tab, setTab] = useState<ReelTab>(initialTab ?? "FOR_YOU");
  const lane: ReelLane | null = isReelLane(tab) ? tab : null;
  const lens: ReelLens = isReelLane(tab) ? "FOR_YOU" : tab;
  const setLens = (next: ReelLens) => setTab(next);
  /**
   * Where the *deck* has got to. Deliberately not where a lane has got to.
   *
   * These two used to be one set, and it broke the lanes in the one way that
   * looked like a server bug: every lane is defined by something the member
   * already did, so the twelve people they just swiped past in "For You" are
   * exactly the newest twelve rows of "Viewed" — and a single shared set hid
   * all of them. The pill kept printing the server's true count next to an
   * empty screen that said nobody had ever been viewed (reported 2026-09-21).
   *
   * A lane's own position lives in `laneDecided` and is thrown away when the
   * lane is left, because re-opening a list means starting at the top of it.
   */
  const [decided, setDecided] = useState<Set<string>>(new Set());
  const [laneDecided, setLaneDecided] = useState<Set<string>>(new Set());
  /**
   * The ids this surface has moved past, in order, so "Back" has somewhere to
   * go. Two stacks for the same reason there are two decided sets: the deck
   * and the open lane are different piles of cards.
   */
  const [deckBack, setDeckBack] = useState<string[]>([]);
  const [laneBack, setLaneBack] = useState<string[]>([]);
  const [departing, setDeparting] = useState<Departing[]>([]);
  /**
   * The card a "previous" gesture just brought back, so it can mount above the
   * screen and slide down into place. Only ever read by the card of that id on
   * *its* mount, so it needs no clearing — the next Back overwrites it.
   */
  const [restoredId, setRestoredId] = useState<string | null>(null);
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
  /** The member's own profile deck, over the closing card — see `feedOver`. */
  const [gapDeckOpen, setGapDeckOpen] = useState(false);
  const router = useRouter();

  // The growing deck — see this component's header.
  const [cards, setCards] = useState<ReelCardViewModel[]>(data.cards);
  /**
   * How far into the "already seen" half of the feed the server has got
   * (D-92). Held and handed straight back on the next top-up, so the two
   * halves keep advancing together instead of the seen one restarting from the
   * most recent face every time.
   */
  const [seenCursor, setSeenCursor] = useState<string | null>(data.seenCursor);
  const [exhausted, setExhausted] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  /** Consecutive auto top-ups that left the current lens still empty. */
  const emptyTopUps = useRef(0);

  /**
   * Which lanes still have a decision left in them.
   *
   * Viewed, Liked and Shortlist do: that is the whole point — somebody skipped
   * on Tuesday can be sent an interest today, and those three get the deck's
   * full button bar. Interest and Messages have nothing left to decide, so
   * they get `ReelLaneActionBar` instead.
   *
   * Either way no *gesture* decides anybody inside a lane — see `commit`.
   */
  const laneDecides = lane === "VIEWED" || lane === "LIKED" || lane === "SHORTLIST";

  /**
   * One page of a lane.
   *
   * No filters are sent. The lanes had a filter rail of their own — a search
   * box and six chips above the card — and it was removed at Devesh's call
   * (2026-09-21): it cost about a fifth of a phone screen, permanently, on the
   * one screen whose entire point is that the photograph is the screen. The
   * API still speaks the filter vocabulary (search uses it), so this is a rail
   * that was taken down, not a capability that was torn out.
   */
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
        // A cursor means "more of the same lane"; no cursor means this is the
        // first page of a lane just opened.
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

  // Opening a lane is a fresh question — and a fresh question starts at the
  // top, so the lane's own position goes with the cards it was a position into.
  useEffect(() => {
    if (!lane) return;
    setLaneCards([]);
    setLaneCursor(null);
    setLaneDecided(new Set());
    setLaneBack([]);
    void loadLane(lane, null);
  }, [lane, loadLane]);

  const queue = useMemo(
    () =>
      lane
        ? laneCards.filter((c) => !laneDecided.has(c.id))
        : cards.filter((c) => !decided.has(c.id) && inLens(c, lens)),
    [lane, laneCards, laneDecided, cards, decided, lens],
  );
  const current = queue[0] ?? null;
  /** The same card, with its lane context — only set while a lane is open. */
  const currentLaneCard = lane && current ? laneCards.find((c) => c.id === current.id) ?? null : null;
  const visible = queue.slice(0, STACK_SIZE);

  /**
   * People this session put behind the member who had never been on their
   * screen before — the honest addition to the server's "aaj kitni dekhi".
   * Cards from the seen half were already counted there.
   */
  const sessionSeen = useMemo(
    () => cards.filter((c) => !c.seenBefore && decided.has(c.id)).length,
    [cards, decided],
  );

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
        // A batch that is entirely people the screen already holds is the end
        // of the feed, whatever the server called it. This is a real state
        // since D-92: the seen half is built from rows this very session keeps
        // writing, so it can hand back a full page of faces that are already
        // in `cards` — and without this the member sits on "Aur dikhaiye"
        // tapping a button that can never add anything.
        if (fresh.length === 0) setExhausted(true);
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
  }, [t, seenCursor]);

  // A lens change is a new question — the previous lens running dry says
  // nothing about this one. "Back" is dropped with it: the card it would have
  // gone back to may not even belong to this lens, and a Back button that
  // visibly does nothing is worse than one that isn't there.
  useEffect(() => {
    emptyTopUps.current = 0;
    setDeckBack([]);
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
    void loadLane(lane, laneCursor);
  }, [lane, laneBusy, laneCursor, queue.length, loadLane]);

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

  /**
   * "This card is behind me now" — recorded against the surface it was on.
   *
   * A decision taken inside a lane that *writes* something (an interest, a
   * shortlist) also marks the deck: a liked person is never swiped, so they
   * can still be sitting in the loaded deck waiting to be decided, and being
   * dealt somebody you just sent an interest to from the Liked lane is the
   * same bug in the other direction.
   */
  function markPast(id: string, alsoDeck: boolean) {
    if (lane) {
      setLaneDecided((s) => new Set(s).add(id));
      setLaneBack((b) => [...b, id]);
      if (alsoDeck) setDecided((s) => new Set(s).add(id));
    } else {
      setDecided((s) => new Set(s).add(id));
      setDeckBack((b) => [...b, id]);
    }
  }

  /**
   * The exact inverse, and it takes the same `alsoDeck` flag as the call it is
   * undoing — never a guess.
   *
   * Guessing is the trap: clearing the deck's set from inside a lane would
   * resurrect a card the *deck* had legitimately finished with (a LEFT swipe
   * leaves the person in `cards`, only hidden), so a Back inside Viewed would
   * quietly re-deal them. Passing the flag through keeps "who hid this card"
   * and "who may un-hide it" the same answer.
   */
  function unmarkPast(id: string, alsoDeck: boolean) {
    // It may still be mid-flight off the screen: leaving that copy in place
    // while the queue renders the same card again would give React two
    // children with one key, and the fly-off would fight the restored card.
    setDeparting((d) => d.filter((e) => e.card.id !== id));
    inFlight.current.delete(id);
    const without = (s: Set<string>) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    };
    if (lane) {
      setLaneBack((b) => b.filter((x) => x !== id));
      setLaneDecided(without);
      if (alsoDeck) setDecided(without);
    } else {
      setDeckBack((b) => b.filter((x) => x !== id));
      setDecided(without);
    }
  }

  /**
   * One card back — navigation, never an un-send (D-91b follow-up).
   *
   * Members reported the accident this exists to remove: wanting to look again
   * at the person they had just moved past, they dragged the card back towards
   * the right, and the reel read that as the one gesture that tells somebody
   * else about it — Interest. There was no way to go back at all, so the only
   * thing to try was a swipe, and every swipe here means something.
   *
   * What this does *not* do is rewrite what already happened. A recorded swipe
   * stays recorded and a sent interest stays sent; the card simply returns,
   * wearing the badge of what was done to it, so the member can look properly
   * and then act. Calling it "Back" rather than "Undo" is the honest name for
   * that, and the reason it never needs a server call.
   */
  function goBack() {
    const stack = lane ? laneBack : deckBack;
    const id = stack[stack.length - 1];
    if (!id) return;
    haptic("tap");
    swipeProgress.set(0);
    // The card is coming back *down* from the top — see `ReelCard`'s `enter`.
    setRestoredId(id);
    // `false`: an interest sent from a lane hid the person from the deck as
    // well, and going back to look at them again does not un-send it.
    unmarkPast(id, false);
  }

  const canGoBack = (lane ? laneBack : deckBack).length > 0;

  /**
   * The next card, deciding nothing — the up-swipe's whole job, and a lane's
   * whole forward gesture.
   *
   * In the deck it still records a *view*: an UP row, which is what "kisne
   * dekha" and the Viewed tab are built from, and what tells tomorrow's pool
   * this person has already been met (`candidateWhere`). A card scrolled past
   * was looked at, and the record says exactly that much and no more — no
   * interest, no pass, nothing the other side is told.
   *
   * A lane writes nothing: everybody in it has been seen by definition, and a
   * fresh view row would only re-sort their own history under them as they
   * browsed it.
   */
  function advance(
    card: ReelCardViewModel,
    departDirection: ReelSwipeDirection,
    meta: { decisionMs: number; wasButton: boolean },
  ) {
    swipeProgress.set(0);
    setDeparting((d) => [...d, { card, direction: departDirection }]);
    markPast(card.id, false);
    if (!lane) void logSwipe(card.id, "UP", meta);
  }

  async function commit(direction: ReelSwipeDirection, meta: { decisionMs: number; wasButton: boolean }) {
    if (!current) return;
    const target = current;
    if (inFlight.current.has(target.id)) return;

    /**
     * Up and down are the feed, everywhere on this screen (D-92).
     *
     * A vertical *drag* moves through the deck and decides nothing: up for the
     * next person, down for the one before. This is the ask it came from —
     * "Instagram ki tarah upar niche se swipe ho, niche swipe karne se Grio
     * open hota hai usko hata do" (Devesh, 2026-09-22) — and it is checked
     * before anything else so no surface can quietly keep the old meaning.
     *
     * The two things the vertical axis used to do are still here, on the two
     * buttons that carry their names: "Ask Grio" and "Shortlist". That is the
     * whole difference between this branch and the ones below — `wasButton`.
     * A label is consent; a drag is not.
     */
    if (!meta.wasButton && (direction === "UP" || direction === "DOWN")) {
      if (direction === "DOWN") goBack();
      else advance(target, "UP", meta);
      return;
    }

    // Nothing left to decide about somebody you have already matched with, so
    // the two directions that decide are inert on their card — from a drag
    // (they never fly: `MATCHED_STAYS_PUT`) and from a button alike. The
    // details sheet offers Message there instead of Interest for the same
    // reason; this is the floor under that.
    if (target.matchId && (direction === "LEFT" || direction === "RIGHT")) return;

    /**
     * Inside a lane a swipe **moves through the list**; only a labelled button
     * decides (Devesh, 2026-09-21: "viewed me to wah aage aur peeche wali
     * profile me jana chahiye sahi swipe se").
     *
     * So here the horizontal axis navigates too: drag left for the next
     * person, drag right to bring the previous one back — the same pair the
     * manual profile form already teaches. It removes the accident this
     * started as: in a list of people you have already decided on, the one
     * thing a drag must never do is tell somebody about it.
     *
     * The split is `meta.wasButton`, and that is the honest line: a button
     * carries its own label ("Interest"), so a tap on it is explicit consent.
     * A drag carries no words at all.
     *
     * LEFT is navigation from either source: for somebody already in this
     * lane, "Not now" has nothing left to record — they were passed over
     * days ago — so tapping it means "next", exactly as it looks.
     */
    if (lane) {
      if (!meta.wasButton || direction === "LEFT") {
        if (direction === "RIGHT") goBack();
        else if (direction === "LEFT") advance(target, "LEFT", meta);
        return;
      }
      // Interest and Messages keep no open decision, so their bar offers none
      // — anything that reaches here is a move along.
      if (!laneDecides) {
        advance(target, "LEFT", meta);
        return;
      }
      // Viewed, Liked and Shortlist: a tapped Interest is a real decision, and
      // falls through to the deck's own path below.
    }

    // Already sent, and back on screen — because the member went back to look
    // again, or because the feed brought this person round from the seen half
    // (`card.lastDecision`, D-92). The interest stands, so this must not send a
    // second one: the server would no-op it (`sendInterest` upserts), but the
    // icebreaker sheet would open again as if something had just happened.
    if (direction === "RIGHT" && (sentIds.has(target.id) || target.lastDecision === "RIGHT")) {
      swipeProgress.set(0);
      setDeparting((d) => [...d, { card: target, direction }]);
      markPast(target.id, true);
      return;
    }

    // "Ask Grio" — the button only, now that a vertical drag walks the feed.
    // The card stays exactly where it is: a question about somebody is not a
    // decision about them.
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
    markPast(target.id, direction === "RIGHT" || direction === "DOWN");

    // The same answer twice — the member went back, looked again and decided
    // the same thing. The row is already there, so a second call would only add
    // a duplicate to their own history for a decision they made once, and move
    // the lane pills a second time for one person.
    const repeat = previousDecision === direction;
    const result = repeat ? null : await logSwipe(target.id, direction, meta);

    // The month's interest quota is out — the card was deliberately never
    // marked swiped server-side for exactly this case (see the API route), so
    // the optimistic dismissal has to be undone: the card comes back and the
    // upgrade sheet explains why.
    if (direction === "RIGHT" && result?.ok === false) {
      setDecisions((d) => {
        const next = { ...d };
        if (previousDecision === undefined) delete next[target.id];
        else next[target.id] = previousDecision;
        return next;
      });
      // By id — the set has no ordering to restore, which is the whole reason
      // the queue is derived rather than walked with a cursor. `true` mirrors
      // the `markPast` above: nothing was sent, so the card is owed back to
      // both the lane it was on and the deck.
      unmarkPast(target.id, true);
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
    // interest and watches the Interest tab keep saying 0. A repeat writes no
    // row, so it moves nothing.
    if (!repeat && (direction === "RIGHT" || direction === "DOWN")) {
      setLaneCounts((c: ReelLaneCounts) => ({
        ...c,
        // The two lanes a decision *adds* to, one each.
        INTEREST: direction === "RIGHT" ? c.INTEREST + 1 : c.INTEREST,
        SHORTLIST: direction === "DOWN" ? c.SHORTLIST + 1 : c.SHORTLIST,
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
      if (detailsTarget || voiceTarget || reportTarget || askTarget || aiTarget || photoGateOpen || searchOpen) return;
      // Backspace is the back gesture's keyboard twin, and unlike the arrows it
      // works inside a lane too — going back is navigation, and a lane is the
      // surface people most want to walk backwards through.
      if (e.key === "Backspace") {
        if (!canGoBack) return;
        // Not while somebody is typing in the lane's search box.
        const el = e.target as HTMLElement | null;
        if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
        e.preventDefault();
        goBack();
        return;
      }
      // The feed's own two keys, and they work inside a lane as well — moving
      // through a list is exactly what they do there too (D-92).
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        if (e.key === "ArrowDown" && !canGoBack) return;
        if (e.key === "ArrowUp" && !current) return;
        e.preventDefault();
        if (e.key === "ArrowDown") goBack();
        else if (current) advance(current, "UP", { decisionMs: 0, wasButton: true });
        return;
      }
      if (!current) return;
      // Reading a sheet must not decide the card underneath it — arrow keys
      // there belong to the sheet's own scroll.
      if (lane) return;
      const direction = KEY_TO_DIRECTION[e.key];
      if (!direction) return;
      e.preventDefault();
      commit(direction, { decisionMs: 0, wasButton: true });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lane, current, canGoBack, detailsTarget, voiceTarget, reportTarget, askTarget, aiTarget, photoGateOpen, searchOpen]);

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
  const feedOver = !lane && !hasCard && !emptyPool && !stillLooking;

  /**
   * The end of the feed opens the member's own profile deck (D-92b).
   *
   * "Jab reels khatm ho jaye to jo profile wale card usne fill nahi kiye, wo
   * aa jaye" (Devesh, 2026-09-22). It is the same satin `SmartProfileDeck`
   * that /profile/build uses — not a copy of it — so a tap here saves through
   * the same autosave, and what is answered at the end of a browse is a real
   * answer everywhere else in the app.
   *
   * Once per visit, and only when there is genuinely something missing: a
   * screen that re-opens a deck every time somebody closes it is a trap, and
   * `data.profileGaps` is empty for a member whose profile is full.
   */
  const gapOffered = useRef(false);
  useEffect(() => {
    if (!feedOver || gapOffered.current || data.profileGaps.length === 0) return;
    gapOffered.current = true;
    setGapDeckOpen(true);
  }, [feedOver, data.profileGaps.length]);

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
                  staysPut={lane ? LANE_STAYS_PUT : c.matchId ? MATCHED_STAYS_PUT : undefined}
                  // Only ever true for one card, and only on the mount that
                  // follows a "previous" gesture — that card slides in from
                  // the top instead of appearing under the finger.
                  enter={restoredId === c.id ? "TOP" : null}
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
                  <ReelActionBar
                    onAction={(d) => commit(d, { decisionMs: 0, wasButton: true })}
                    disabled={!current}
                    // The primary slot becomes the chat on a matched card —
                    // see `ReelActionBar` for why Interest may not stand there.
                    matchId={current?.matchId ?? null}
                  />
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
                // Today's totals, not this tab's: the server counts everybody
                // who was already on screen before this page load, and the
                // session adds the ones who were new to this member when it
                // started. `seenBefore` is what keeps those two from counting
                // the same face twice — a card from the seen half was already
                // in the server's number.
                seenCount={data.todayDecisions.seen + sessionSeen}
                sentCount={data.todayDecisions.sent + sentIds.size}
                shortlistCount={data.todayDecisions.shortlisted + shortlistedIds.size}
                questions={data.refineQuestions}
                preferenceNotice={data.preferenceNotice}
                // The way out of a finished pool: their own history, which is
                // the only real inventory left at this point.
                laneCounts={laneCounts}
                // Their own profile, as the other thing worth doing here.
                gapCount={data.profileGaps.length}
                onCompleteProfile={data.profileGaps.length > 0 ? () => setGapDeckOpen(true) : undefined}
                onOpenLane={setTab}
                onSearch={() => setSearchOpen(true)}
                onReplay={() => {
                  setDecided(new Set());
                  setDeckBack([]);
                  setLens("FOR_YOU");
                }}
              />
            </div>
          )}

          {/* Back — one card the way you came.

              Floating and absolutely placed rather than added to the action bar:
              a fifth button would shrink the four that mean something, and a
              control that appears and disappears inside a row would shove them
              sideways every time. Here it lives in the one free strip on the
              screen (the card's own content stops at 7.75rem, the action bar
              band starts around 6.5rem) and nothing else ever moves.

              Rendered outside the `hasCard` branch on purpose: going one past
              the last card of a lane is exactly when somebody wants to come
              back, and a Back button that vanishes at that moment is no use. */}
          {canGoBack && (
            // The wrapper carries the position, and it is not optional:
            // `.reel-glass` sets `position: relative` in plain, unlayered CSS,
            // which beats Tailwind's layered `absolute` utility — put the two
            // on one element and the chip silently rejoins the normal flow and
            // lands wherever the empty-state block happens to end.
            <div className="pointer-events-none absolute bottom-[5.5rem] left-3 z-40 sm:left-4">
              <button
                type="button"
                onClick={goBack}
                className="pointer-events-auto inline-flex h-9 items-center gap-1 rounded-full pl-2 pr-3 text-[0.75rem] font-semibold reel-glass"
              >
                <ChevronLeft className="size-4 shrink-0" aria-hidden />
                {t("reel.back.label", "Back")}
                <span className="sr-only">
                  {t("reel.back.aria", "— pichli profile par wapas jaayein, kuch bheja nahi jaayega")}
                </span>
              </button>
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
              <ReelTabs
                active={tab}
                counts={counts}
                // The only place a reply can announce itself on a full-bleed
                // screen — see the prop's note in `ReelTabs`.
                unreadMessages={data.unreadMessages}
                onChange={setTab}
              />
            </div>
            {/* A lane used to add a third row here — a search box and six
                filter chips. It is gone (Devesh, 2026-09-21): the header and
                the pill rail are the only chrome allowed to stand on somebody's
                photograph, and the way to look a person up is the magnifier in
                the header, which searches everybody rather than one lane. */}
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

      {/* The end of the feed, as something to do (D-92b).

          Rendered outside `ReelFrame` like every other screen-level surface —
          the deck portals to <body> and covers the viewport, and on desktop it
          must cover the whole window rather than the phone-shaped frame.

          `ProfileProvider` is mounted here rather than around the page because
          it hydrates from /api/profile/me and autosaves: a browse that never
          reaches the end should never pay for either. */}
      {gapDeckOpen && (
        <ProfileProvider>
          <SmartProfileDeck
            only={data.profileGaps}
            scopeLabel={t("reel.end.gapsDeckTitle", "Aapki profile")}
            onBack={() => {
              setGapDeckOpen(false);
              // What was answered changes the closing card's own count and the
              // next reel's ranking — both come from the server.
              router.refresh();
            }}
          />
        </ProfileProvider>
      )}

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
