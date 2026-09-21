"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from "framer-motion";
import { Bookmark, Camera, Check, ImageOff, Lock, Megaphone, Sparkles, Users, X } from "lucide-react";
import PhotoSlideDeck from "@/components/profile/PhotoSlideDeck";
import PhotoUnlockCta, { PhotoLockHint } from "@/components/subscription/PhotoUnlockCta";
import ReelProfileOverlay from "./ReelProfileOverlay";
import ReelUtilityRail from "./ReelUtilityRail";
import ReelVerificationPills from "./ReelVerificationPills";
import ReelWhyMatchCard from "./ReelWhyMatchCard";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/motion";
import type { ReelCardViewModel, ReelSwipeDirection } from "@/lib/contracts/reel";
import { useT } from "@/components/i18n/LanguageProvider";

export interface ReelCardProps {
  card: ReelCardViewModel;
  /** Only the top card of the stack drags — cards behind it just peek. */
  draggable: boolean;
  depth: number;
  /** Fired the instant the finger lifts on a committed swipe — before any network call. */
  onDismiss: (direction: ReelSwipeDirection, meta: { decisionMs: number; wasButton: boolean }) => void;
  /** Set by the stack once a decision is taken; the card flies off this way. Also
   *  set for button-driven decisions, so a tap and a swipe leave identically. */
  departing?: ReelSwipeDirection | null;
  /** Fly-off finished — the stack can drop this card from the DOM. */
  onExited?: () => void;
  /** Shared 0..1 "how committed is the top card's gesture". Cards behind read it
   *  and rise toward their next depth in step with the finger. */
  swipeProgress?: MotionValue<number>;
  /**
   * Opens the details sheet (ReelDetailsSheet) — owned by the stack, because a
   * `fixed` sheet rendered inside this transformed card would be positioned
   * relative to the card, not the viewport. Omitted on cards that can't open it.
   */
  onDetails?: () => void;
  /** Plays the Verified Parent Blessing. Omitted when the card carries no clip. */
  onVoice?: () => void;
  /** Opens the safety sheet for this profile. */
  onReport?: () => void;
  /** This viewer's private like on this card — owned by the stack, so it survives the card unmounting. */
  liked?: boolean;
  /** Toggles that like. Never dismisses the card: a like is a bookmark, not a decision. */
  onLike?: () => void;
  /** Opens Grio already scoped to this candidate (GrioProvider's `candidate` scope). */
  onAskGrio?: () => void;
  /**
   * The way out of a locked photo, handled on this screen rather than by
   * navigating to the profile editor. Present only when the lock is
   * `add_own_photo` — a `match_only` photo has no way in, and offering one
   * would be a lie (see `PhotoUnlockCta`).
   */
  onAddPhoto?: () => void;
  /** The owner previewing their own card — there is no one to match against, so
   *  every pair-level surface (Why, rail, chips-from-overlap) is suppressed
   *  rather than shown empty or, worse, filled with a fake number. */
  selfPreview?: boolean;
  /** Set only on a replay pass — the decision already recorded for this card earlier today. */
  previousDecision?: ReelSwipeDirection | null;
  /**
   * Directions that do **not** dismiss this card: it springs back like a
   * near-miss, and `onDismiss` still fires so the screen can act on the
   * gesture.
   *
   * UP has always been one — Ask Grio opens over a card that stays put. The
   * prop exists because a Meri List lane needs the horizontal axis to join it:
   * there a drag walks the list rather than deciding anybody, so the card the
   * finger let go of has to come back rather than fly away (see `ReelStack`).
   */
  staysPut?: readonly ReelSwipeDirection[];
}

/** UP alone, in the deck: the only direction there that decides nothing. */
const STAYS_PUT_DEFAULT: readonly ReelSwipeDirection[] = ["UP"];

/* ---------- Gesture tuning ----------
 *
 * The card tracks the finger 1:1. There is no elasticity and no drag
 * constraint: an earlier version rubber-banded every axis (`dragElastic`
 * 0.45 on the right), which meant the card travelled 45% of the finger's
 * distance and a right-swipe needed ~267px of movement on a 360px phone.
 * That reads as "the swipe isn't working", not as resistance.
 *
 * Commitment is decided by *projection*, the way a native fling is: where
 * the card would come to rest given where it is and how fast it is moving,
 * not by raw offset alone. A slow, deliberate drag past the threshold and a
 * short sharp flick both commit; a fast correction back toward centre does
 * not, even if the offset was briefly large.
 *
 * ## One finger is now enough
 *
 * This card used to hand single-finger vertical movement to the browser
 * wherever its details pane could still scroll, which on a real phone read as
 * "ek ungli se card hilta hi nahi" and needed a one-time two-finger coach to
 * explain. The details pane is gone — the biodata lives in the sheet behind
 * "More details" — so nothing inside the card scrolls, nothing competes for
 * the finger, and every direction works with one. The coach went with it: an
 * instruction that is no longer true is worse than no instruction.
 */
const INTENT_PX = 10;
/** Horizontal wins ties. Real thumbs arc; a "straight right" swipe on a phone
 *  routinely carries 30-60px of vertical drift, and without this bias that
 *  drift turns interest into an accidental "Shortlist". */
const AXIS_BIAS = 1.15;
/** The locked axis owns the gesture, but the other one still follows a little
 *  — a hard rail feels mechanical. */
const CROSS_AXIS_FOLLOW = 0.12;
const MAX_ROTATE = 12;
/** Fractions of the card's own size, not fixed px — a 320px phone and a
 *  448px card should ask for the same *proportional* effort. */
const THRESHOLD_X = 0.28;
const THRESHOLD_Y = 0.22;
/** Seconds of travel to project from release velocity. ~0.15s is the window
 *  a flick "feels" like it should carry. */
const PROJECTION_S = 0.14;
/** Velocity is measured over a trailing window, not the last two events —
 *  a single stray pointermove otherwise dominates the reading. */
const VELOCITY_WINDOW_MS = 90;
const EXIT_S = 0.3;
const EXIT_EASE = [0.25, 0.6, 0.3, 1] as const;
const SPRING_BACK = { type: "spring", stiffness: 520, damping: 36, restDelta: 0.4 } as const;
/** If the stack somehow never answers a commit with `departing`, un-stick the
 *  card rather than leaving it frozen mid-screen. */
const COMMIT_TIMEOUT_MS = 500;

const STACK_OPACITY = [1, 1, 0.85, 0.6];

/* ---------- Clearances for the floating chrome ----------
 *
 * The photo now runs edge to edge, with the header, the lens pills and the
 * action bar floating on top of it (see `ReelStack`). Nothing inside the card
 * may be laid out as if those did not exist, so the four offsets they need
 * live here as named constants rather than as four magic numbers scattered
 * through the JSX — change the header's height and this is the one place that
 * has to follow.
 *
 * Written out in full rather than composed from a shared base value: Tailwind
 * finds utilities by scanning source text, so a class assembled from a template
 * literal is a class that never gets generated. The numbers are the header
 * (3.25rem) plus the lens row (~4.25rem), and the action bar's own ~6.5rem.
 */
/**
 * Story bars ride in a band of their own at the very top of the screen, above
 * the header — the reel's chrome starts 1rem lower to leave it (`ReelStack`).
 * They used to start *under* the tab row, a third of the way down a phone,
 * where "photo 2 of 4" is something you find rather than something you see.
 */
const CHROME_CLEAR_TOP = "top-[calc(0.5rem_+_env(safe-area-inset-top,0px))]";
/** The photo's own note clears the whole chrome stack: band + header + lens row. */
const CHROME_NOTE_TOP = "top-[calc(7.25rem_+_env(safe-area-inset-top,0px))]";
/** Spotlight / mission / replay chips — same band as the note, a little lower. */
const CHROME_CHIP_TOP = "top-[calc(7.5rem_+_env(safe-area-inset-top,0px))]";
/** Name, pills and the Why card stop above the action bar. */
const ACTIONS_CLEAR_BOTTOM = "pb-[7.75rem]";

type Sample = { t: number; x: number; y: number };

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Average velocity (px/s) across the trailing sample window. */
function velocityFrom(samples: Sample[]) {
  if (samples.length < 2) return { x: 0, y: 0 };
  const first = samples[0];
  const last = samples[samples.length - 1];
  const dt = (last.t - first.t) / 1000;
  if (dt <= 0) return { x: 0, y: 0 };
  return { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt };
}

/** Opacity of a stack layer at a fractional depth — the pile dims continuously
 *  as it rises rather than stepping between discrete values. */
function stackOpacityAt(d: number) {
  const max = STACK_OPACITY.length - 1;
  if (d >= max) return STACK_OPACITY[max];
  const i = Math.floor(d);
  return STACK_OPACITY[i] + (STACK_OPACITY[i + 1] - STACK_OPACITY[i]) * (d - i);
}

/**
 * One reel: a person, full bleed, with everything else floating over them.
 *
 * The media is the card. There is no white panel of biodata under the photo
 * any more — the fields that used to live there are in the details sheet, one
 * tap away, and what stays on the face of the card is the short answer to
 * "who is this and why am I looking at them": name, where they are, what they
 * do, their own line about themselves, what we can actually verify, and the
 * deterministic "why this match".
 */
export default function ReelCard({
  card,
  draggable,
  depth,
  onDismiss,
  departing = null,
  onExited,
  swipeProgress,
  onDetails,
  onVoice,
  onReport,
  onAskGrio,
  onAddPhoto,
  liked = false,
  onLike,
  selfPreview = false,
  previousDecision = null,
  staysPut = STAYS_PUT_DEFAULT,
}: ReelCardProps) {
  const t = useT();
  const reduced = useReducedMotion();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const mountedAt = useRef(Date.now());
  const [whyExpanded, setWhyExpanded] = useState(false);

  const PREVIOUS_DECISION_LABEL: Record<ReelSwipeDirection, string> = {
    RIGHT: t("reel.card.decisionInterest", "Interest bheja"),
    LEFT: t("reel.card.decisionNotNow", "Not now kaha"),
    DOWN: t("reel.card.decisionShortlist", "Shortlist kiya"),
    UP: "",
  };

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const exitOpacity = useMotionValue(1);
  /** 0 = no axis claimed, 1 = horizontal, 2 = vertical. A motion value rather
   *  than state so the direction overlays can read it without re-rendering the
   *  whole card on every frame of the drag. */
  const axis = useMotionValue(0);

  const fallbackProgress = useMotionValue(0);
  const progress = swipeProgress ?? fallbackProgress;

  const gesture = useRef<{
    id: number;
    startX: number;
    startY: number;
    width: number;
    height: number;
    axis: 0 | 1 | 2;
    /** +1 when grabbed above the card's middle, -1 below. Fixed for the whole
     *  gesture: a card pulled from the top pivots the opposite way to one
     *  pulled from the bottom, which is what makes the tilt read as a physical
     *  object rather than a CSS transform. */
    lever: 1 | -1;
    samples: Sample[];
    crossed: boolean;
  } | null>(null);
  /** Kept past the gesture so the fly-off can inherit the flick's speed. */
  const releaseVelocity = useRef({ x: 0, y: 0 });
  const leverRef = useRef<1 | -1>(1);
  const flewRef = useRef(false);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rotate = useTransform(() => {
    if (reduced) return 0;
    const w = rootRef.current?.offsetWidth || 340;
    const raw = (x.get() / w) * MAX_ROTATE * 2 * leverRef.current;
    return Math.max(-MAX_ROTATE * 1.4, Math.min(MAX_ROTATE * 1.4, raw));
  });

  // Overlays are gated on the *locked* axis, so a right-swipe that drifts
  // downward can never light "Shortlist" at the same time as "Interest".
  //
  // Every one of these reads *both* motion values before branching, and that
  // is load-bearing: `useTransform(fn)` collects its dependencies from the
  // values the callback actually reads when it runs. Gating with an early
  // `axis.get() === 1 ? … : 0` means the first run (axis still 0) never reads
  // `x`, so `x` is never registered and the badge then freezes at whatever it
  // computed on that first pass.
  const badgeAt = (travel: number) => clamp01((travel - 24) / 88);
  const rightBadge = useTransform(() => {
    const a = axis.get();
    const v = x.get();
    return a === 1 ? badgeAt(v) : 0;
  });
  const leftBadge = useTransform(() => {
    const a = axis.get();
    const v = x.get();
    return a === 1 ? badgeAt(-v) : 0;
  });
  const upBadge = useTransform(() => {
    const a = axis.get();
    const v = y.get();
    return a === 2 ? badgeAt(-v) : 0;
  });
  const downBadge = useTransform(() => {
    const a = axis.get();
    const v = y.get();
    return a === 2 ? badgeAt(v) : 0;
  });
  const rightBadgeScale = useTransform(rightBadge, [0, 1], [0.82, 1]);

  // The stack behind. `depth - progress` means a card literally rises toward
  // its next layer in step with the finger, and the whole pile settles back
  // down if the swipe is abandoned. When the top card does leave, the stack
  // resets progress to 0 in the same commit that decrements every depth, so
  // `depth - progress` is unchanged across that frame — the rise is continuous,
  // with no snap at the hand-off.
  const eDepth = useTransform(() => Math.max(0, depth - progress.get()));
  const lean = card.id.charCodeAt(card.id.length - 1) % 2 === 0 ? 1 : -1;
  const peekScale = useTransform(eDepth, (d) => 1 - d * 0.03);
  const peekY = useTransform(eDepth, (d) => d * 10);
  const peekX = useTransform(eDepth, (d) => lean * d * 3);
  const peekRotate = useTransform(eDepth, (d) => lean * d * 0.9);
  const peekOpacity = useTransform(eDepth, stackOpacityAt);

  function springBack() {
    animate(x, 0, SPRING_BACK);
    animate(y, 0, SPRING_BACK);
    animate(progress, 0, SPRING_BACK);
    axis.set(0);
  }

  function endGesture(el: HTMLElement, id: number) {
    gesture.current = null;
    if (el.hasPointerCapture?.(id)) {
      try {
        el.releasePointerCapture(id);
      } catch {
        /* pointer already gone */
      }
    }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggable || departing) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    leverRef.current = e.clientY - rect.top < rect.height / 2 ? 1 : -1;
    gesture.current = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      width: rect.width,
      height: rect.height,
      axis: 0,
      lever: leverRef.current,
      samples: [{ t: performance.now(), x: e.clientX, y: e.clientY }],
      crossed: false,
    };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;

    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    const now = performance.now();
    g.samples.push({ t: now, x: e.clientX, y: e.clientY });
    while (g.samples.length > 2 && now - g.samples[0].t > VELOCITY_WINDOW_MS) g.samples.shift();

    if (g.axis === 0) {
      if (Math.hypot(dx, dy) < INTENT_PX) return;
      g.axis = Math.abs(dx) > Math.abs(dy) * AXIS_BIAS ? 1 : 2;
      axis.set(g.axis);
      try {
        // Throws NotFoundError if the pointer ended between this move and here.
        e.currentTarget.setPointerCapture(g.id);
      } catch {
        /* uncaptured is survivable — the handlers still see the events */
      }
      haptic("select");
    }

    if (g.axis === 1) {
      x.set(dx);
      y.set(dy * CROSS_AXIS_FOLLOW);
    } else {
      y.set(dy);
      x.set(dx * CROSS_AXIS_FOLLOW);
    }

    const travelled = g.axis === 1 ? Math.abs(dx) : Math.abs(dy);
    const threshold = g.axis === 1 ? g.width * THRESHOLD_X : g.height * THRESHOLD_Y;
    const p = clamp01(travelled / threshold);
    progress.set(p);
    // One tick as the card crosses into "let go now and it goes" — the whole
    // point of a threshold is that you can feel it without looking.
    if (p >= 1 && !g.crossed) {
      g.crossed = true;
      haptic("tap");
    } else if (p < 0.9 && g.crossed) {
      g.crossed = false;
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;
    endGesture(e.currentTarget, g.id);
    if (g.axis === 0) return; // a tap — PhotoSlideDeck's zones own it

    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    const v = velocityFrom(g.samples);
    const projectedX = dx + v.x * PROJECTION_S;
    const projectedY = dy + v.y * PROJECTION_S;

    let direction: ReelSwipeDirection | null = null;
    if (g.axis === 1) {
      if (projectedX > g.width * THRESHOLD_X) direction = "RIGHT";
      else if (projectedX < -g.width * THRESHOLD_X) direction = "LEFT";
    } else {
      if (projectedY < -g.height * THRESHOLD_Y) direction = "UP";
      else if (projectedY > g.height * THRESHOLD_Y) direction = "DOWN";
    }

    if (!direction) {
      springBack();
      return;
    }

    releaseVelocity.current = v;
    axis.set(0);

    // A direction this card does not leave on: it springs back like a
    // near-miss and still reports, so the screen can do whatever the gesture
    // meant there. In the deck that is UP alone (Ask Grio opens over the card);
    // in a lane it is the whole horizontal axis, where a drag is navigation.
    if (staysPut.includes(direction)) {
      springBack();
      onDismiss(direction, { decisionMs: Date.now() - mountedAt.current, wasButton: false });
      return;
    }

    haptic(direction === "RIGHT" ? "success" : "tap");
    // Deliberately no spring-back and no reset: the card holds exactly where
    // the finger left it, and the stack answers in this same React batch with
    // `departing`, which picks the motion up from here. The fly-off therefore
    // continues the finger's own throw instead of restarting from centre.
    onDismiss(direction, { decisionMs: Date.now() - mountedAt.current, wasButton: false });
    commitTimer.current = setTimeout(() => {
      if (!flewRef.current) springBack();
    }, COMMIT_TIMEOUT_MS);
  }

  function handlePointerCancel(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;
    endGesture(e.currentTarget, g.id);
    springBack();
  }

  useEffect(() => {
    if (departing && departing !== "UP") {
      flewRef.current = true;
      if (commitTimer.current) clearTimeout(commitTimer.current);
      if (reduced) {
        onExited?.();
        return;
      }
      const w = rootRef.current?.offsetWidth ?? 340;
      const vw = typeof window === "undefined" ? 420 : window.innerWidth;
      const vh = typeof window === "undefined" ? 800 : window.innerHeight;
      const v = releaseVelocity.current;
      // Off past the viewport edge, carrying the release velocity on the other
      // axis so a thrown card keeps its arc instead of snapping to a straight line.
      const to =
        departing === "RIGHT"
          ? { x: vw + w, y: y.get() + v.y * 0.15 }
          : departing === "LEFT"
            ? { x: -(vw + w), y: y.get() + v.y * 0.15 }
            : { x: x.get() + v.x * 0.15, y: vh };
      const tr = { duration: EXIT_S, ease: EXIT_EASE };
      const ax = animate(x, to.x, { ...tr, onComplete: () => onExited?.() });
      const ay = animate(y, to.y, tr);
      const ao = animate(exitOpacity, 0, { duration: EXIT_S, ease: "linear" as const });
      return () => {
        ax.stop();
        ay.stop();
        ao.stop();
      };
    }

    // Rolled back — the swipe was recorded optimistically but the server said
    // no (the month's interest quota). The card flying back in is the honest
    // picture of what happened; blinking into place is not.
    if (!departing && flewRef.current) {
      flewRef.current = false;
      exitOpacity.set(1);
      animate(x, 0, SPRING_BACK);
      animate(y, 0, SPRING_BACK);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departing, reduced]);

  useEffect(() => {
    return () => {
      if (commitTimer.current) clearTimeout(commitTimer.current);
    };
  }, []);

  // A new person on screen starts folded again — an expansion belongs to the
  // card it was opened on, not to the position in the deck.
  useEffect(() => setWhyExpanded(false), [card.id]);

  const isTop = depth === 0;
  const interactive = draggable && !departing;
  const showPhoto = card.photoUnlocked && card.photoUrl;

  return (
    <motion.div
      ref={rootRef}
      onPointerDown={interactive ? handlePointerDown : undefined}
      onPointerMove={interactive ? handlePointerMove : undefined}
      onPointerUp={interactive ? handlePointerUp : undefined}
      onPointerCancel={interactive ? handlePointerCancel : undefined}
      // The cards behind, and any card mid-fly-off, are scenery: `inert` takes
      // them out of the tab order and the accessibility tree in one attribute.
      // Without it the screen offered a keyboard user three "Ask Grio" buttons
      // and three "More details" — for two people they cannot even see.
      inert={!isTop || Boolean(departing)}
      style={
        isTop
          ? { x, y, rotate, opacity: exitOpacity, scale: 1 }
          : { x: peekX, y: peekY, rotate: peekRotate, scale: peekScale, opacity: peekOpacity }
      }
      className={cn(
        "absolute inset-0 overflow-hidden bg-grad-photo",
        // `touch-none`, and it can be now: nothing inside this card scrolls any
        // more, so there is no region that needs vertical handed back to the
        // browser. That is what makes a single finger work in all four
        // directions again — see the gesture note at the top of this file.
        interactive && "cursor-grab touch-none select-none active:cursor-grabbing",
      )}
    >
      {/* ── The person ─────────────────────────────────────────────────── */}
      {showPhoto ? (
        // `bioNote` is deliberately not passed as a trailing text slide here:
        // it is already permanently on the card, in the overlay below, so a
        // slide repeating it would show the same sentence twice on one screen.
        // The profile header still gets the text slide — there the bio has no
        // other home.
        <PhotoSlideDeck
          slides={card.slides}
          bioNote={null}
          fallbackPhotoUrl={card.photoUrl}
          fallbackFocalY={card.photoFocalY}
          displayName={card.displayName}
          priority={isTop}
          // Same reason as the scrim below: the self-preview has no floating
          // header to clear, so the story bars keep their own default place.
          progressTopClassName={selfPreview ? undefined : CHROME_CLEAR_TOP}
          noteTopClassName={selfPreview ? undefined : CHROME_NOTE_TOP}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center gap-2 px-8 pb-40 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-surface/85 backdrop-blur-sm">
              {card.photoUnlocked ? (
                <ImageOff className="size-5 text-muted" />
              ) : (
                <Lock className="size-5 text-muted" />
              )}
            </span>
            {/* Two different absences, and this panel used to conflate them:
                when the gate is already open the profile simply has no photo,
                and blaming the gate there invents a restriction that isn't
                there. The locked line says the card's own reason (D-90). */}
            <p className="max-w-[15rem] text-[0.8125rem] leading-snug text-white/95 [text-shadow:0_1px_8px_rgb(0_0_0_/_0.4)]">
              {card.photoUnlocked ? (
                `${card.displayName} ${t("reel.card.noPhotoYet", "ne abhi tak photo nahi daali")}`
              ) : (
                <PhotoLockHint lock={card.photoLock} />
              )}
            </p>
            {/* Same offer `PhotoUnlockCta` makes everywhere else, but kept on
                this screen: the reel can open the upload sheet in place, and
                sending someone to the profile editor to fix the reel is what
                made this ask easy to abandon halfway. Falls back to the shared
                link whenever the host does not handle it. */}
            {!card.photoUnlocked &&
              (onAddPhoto && card.photoLock === "add_own_photo" ? (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddPhoto();
                  }}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-surface/90 px-3.5 text-[0.8125rem] font-semibold text-primary-text backdrop-blur-sm transition-colors hover:bg-surface"
                >
                  <Camera className="size-3.5 shrink-0" aria-hidden />
                  {t("subscription.photoUnlockCta.addYourPhoto", "Add Your Photo")}
                </button>
              ) : (
                <PhotoUnlockCta
                  lock={card.photoLock}
                  className="rounded-full bg-surface/90 px-3.5 text-[0.8125rem] backdrop-blur-sm hover:bg-surface hover:no-underline"
                />
              ))}
          </div>
        </div>
      )}

      {/* Legibility scrims. Two, not one: the bottom carries the overlay and
          the Why card, the top keeps the Spotlight/mission chips readable over
          a bright sky. Neither is a decorative gradient — remove them and white
          text lands on whatever the photograph happens to be. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/50 via-black/18 to-transparent",
          // Tall enough to carry the reel's floating header and lens row; the
          // self-preview has neither, and a 184px wash over the owner's own
          // face for no reason is just a dirty photo.
          selfPreview ? "h-20" : "h-[11.5rem]",
        )}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[62%] bg-[linear-gradient(to_top,rgb(0_0_0/0.80)_0%,rgb(0_0_0/0.58)_22%,rgb(0_0_0/0.24)_55%,transparent_100%)]"
      />

      {/* Spotlight — a paid card, labelled on the card itself (D-90 Phase 6).
          The label belongs to this one delivery, not to the person. */}
      {card.spotlight && (
        <span className={cn(CHROME_CHIP_TOP, "absolute left-4 inline-flex items-center gap-1 rounded-full border border-gold-400/60 bg-surface/92 px-2.5 py-1 text-[0.6875rem] font-semibold text-gold-700 shadow-sm backdrop-blur-sm")}>
          <Megaphone className="size-3" aria-hidden />
          {t("reel.card.spotlight", "Spotlight")}
          <span className="sr-only">
            {" — "}
            {t("reel.card.spotlightNote", "Ye member ne apni profile aage rakhi hai.")}
          </span>
        </span>
      )}

      {/* Mission — server-decided, at most twice a day, and only above the
          score floor. See ReelCardViewModel.mission for why the scarcity is the
          point rather than a tuning knob. */}
      {/* Capped at ~70% of the width, not full-bleed: the utility rail can ride
          up this far on a card with a lot to say, and a banner across the whole
          top would then sit under it. */}
      {card.mission && !card.spotlight && (
        <div className={cn(CHROME_CHIP_TOP, "absolute left-4 flex max-w-[70%] items-start gap-1.5 rounded-full border border-gold-400/60 bg-surface/92 py-1.5 pl-2.5 pr-3 shadow-sm backdrop-blur-sm")}>
          <Sparkles className="mt-px size-3.5 shrink-0 text-gold-700" aria-hidden />
          <p className="min-w-0 truncate text-[0.75rem] font-medium leading-snug text-gold-700">
            {card.mission.headline}
          </p>
        </div>
      )}

      {/* Replay pass — this card already got a decision earlier today. */}
      {previousDecision && previousDecision !== "UP" && (
        <div
          className={cn(
            CHROME_CHIP_TOP,
            "absolute right-4 flex items-center gap-1 rounded-full border bg-surface/92 px-2.5 py-1 text-[0.6875rem] font-medium shadow-sm backdrop-blur-sm",
            previousDecision === "RIGHT" && "border-gold-400/60 text-gold-700",
            previousDecision === "LEFT" && "border-line-strong text-muted",
            previousDecision === "DOWN" && "border-trust/50 text-trust",
          )}
        >
          {previousDecision === "RIGHT" && <Check className="size-3" aria-hidden />}
          {previousDecision === "LEFT" && <X className="size-3" aria-hidden />}
          {previousDecision === "DOWN" && <Bookmark className="size-3" aria-hidden />}
          {PREVIOUS_DECISION_LABEL[previousDecision]}
        </div>
      )}

      {/* ── Everything that floats over the person ─────────────────────── */}
      {/* One bottom-anchored column, and the rail hangs off the *name block's*
          own top-right corner rather than sitting above the whole column.
          That is deliberate: the rail is allowed to share the name's vertical
          band (it is on the other side of the card, and the overlay is width-
          capped to leave it room), which is what keeps a four-item rail from
          running off the top of the photograph on a short phone. Anchoring it
          above the Why card instead cost it ~140px of headroom for nothing. */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2.5 px-3.5",
          // The owner's own preview (app/user/profile/preview) renders this card
          // with no action bar under it, so reserving room for one would leave a
          // band of empty photo below their name.
          selfPreview ? "pb-4" : ACTIONS_CLEAR_BOTTOM,
        )}
      >
        <div className="relative">
          {!selfPreview && isTop && !departing && (
            <div className="pointer-events-none absolute -right-1.5 bottom-0 flex justify-end">
              <ReelUtilityRail
                hasVoice={Boolean(card.voiceNote && onVoice)}
                whyOpen={whyExpanded}
                liked={liked}
                onVoice={() => onVoice?.()}
                onWhy={() => setWhyExpanded((v) => !v)}
                onLike={() => onLike?.()}
                onDetails={() => onDetails?.()}
                onReport={() => onReport?.()}
              />
            </div>
          )}
          <ReelProfileOverlay card={card} />
        </div>

        <ReelVerificationPills photoVerified={card.verified} mobileVerified={card.mobileVerified} />
        {/* Asked for, not always there.
            This panel used to render under every profile, folded to a line or
            two — and folded it still ate a fifth of the screen. The reel is a
            photograph first: the person is what the screen is for, and the
            reasons are something you ask to see. The rail's "Why Match" is the
            only way in now, and it comes up from under the card so the tap and
            the answer read as one movement. */}
        {!selfPreview && (
          <AnimatePresence initial={false}>
            {whyExpanded && (
              <motion.div
                key="why"
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, y: 14 }}
                transition={reduced ? { duration: 0.14 } : { type: "spring", stiffness: 420, damping: 34 }}
              >
                <ReelWhyMatchCard
                  card={card}
                  onClose={() => setWhyExpanded(false)}
                  onDetails={() => onDetails?.()}
                  onAskGrio={() => onAskGrio?.()}
                />
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      {/* Direction overlays */}
      {draggable && (
        <>
          <motion.div
            aria-hidden
            style={{ opacity: rightBadge, scale: rightBadgeScale }}
            className="absolute right-5 top-16 z-20 inline-flex -rotate-12 items-center gap-1.5 rounded-full border-2 border-gold-400 bg-accent px-3.5 py-1.5 text-sm font-bold uppercase tracking-wide text-gold-200"
          >
            <Users className="size-4" />
            {t("reel.card.badgeInterest", "Interest")}
          </motion.div>
          <motion.div
            aria-hidden
            style={{ opacity: leftBadge }}
            className="absolute left-5 top-16 z-20 rotate-12 rounded-full border-2 border-line-strong bg-surface/95 px-3.5 py-1.5 text-sm font-bold uppercase tracking-wide text-muted"
          >
            {t("reel.card.badgeNotNow", "Not now")}
          </motion.div>
          <motion.div
            aria-hidden
            style={{ opacity: upBadge }}
            className="absolute left-1/2 top-16 z-20 -translate-x-1/2 rounded-full border-2 border-wine-300 bg-wine-50 px-3.5 py-1.5 text-sm font-bold uppercase tracking-wide text-wine-700"
          >
            {t("reel.card.badgeAskGrio", "Ask Grio")}
          </motion.div>
          <motion.div
            aria-hidden
            style={{ opacity: downBadge }}
            className="absolute bottom-24 left-1/2 z-20 -translate-x-1/2 rounded-full border-2 border-trust bg-surface/95 px-3.5 py-1.5 text-sm font-bold uppercase tracking-wide text-trust"
          >
            {t("reel.card.badgeShortlist", "Shortlist")}
          </motion.div>
        </>
      )}
    </motion.div>
  );
}
