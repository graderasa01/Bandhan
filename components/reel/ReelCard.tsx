"use client";

import { useEffect, useRef } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from "framer-motion";
import { Bookmark, Check, HelpCircle, ImageOff, Lock, Sparkles, X } from "lucide-react";
import ProgressRing from "@/components/ui/ProgressRing";
import ReelTrustStrip from "@/components/reel/ReelTrustStrip";
import ReelInsightPanel from "@/components/reel/ReelInsightPanel";
import KundliNoteList from "@/components/profile/KundliNoteList";
import PhotoSlideDeck from "@/components/profile/PhotoSlideDeck";
import PhotoUnlockCta from "@/components/subscription/PhotoUnlockCta";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/motion";
import type { ReelCardViewModel, ReelSwipeDirection } from "@/lib/contracts/reel";

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
  /** Phase D — omitted (not just disabled) when Ask Bridge itself is off. */
  onAsk?: () => void;
  /** The owner previewing their own card — `card.compatibility`/`segments` are
   *  meaningless here (there's no one to match against), so the ring shows a
   *  plain "Aap" instead of a fake or misleading number. */
  selfPreview?: boolean;
  /** Set only on a replay pass — the decision already recorded for this card earlier today. */
  previousDecision?: ReelSwipeDirection | null;
}

const PREVIOUS_DECISION_LABEL: Record<ReelSwipeDirection, string> = {
  RIGHT: "Interest bheja",
  LEFT: "Skip kiya",
  // DOWN writes a Shortlist row and nothing else — see the naming note in
  // ReelActionBar.tsx for why this stopped claiming a family action.
  DOWN: "Shortlist kiya",
  UP: "",
};

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
 */

/** Movement before the gesture claims an axis. Matches PhotoSlideDeck's own
 *  tap tolerance (10px) so a gesture we capture is one its tap zones would
 *  have rejected anyway — the two can never both fire. */
const INTENT_PX = 10;
/** Horizontal wins ties. Real thumbs arc; a "straight right" swipe on a phone
 *  routinely carries 30-60px of vertical drift, and without this bias that
 *  drift turns interest into an accidental "Shortlist". */
const AXIS_BIAS = 1.15;
/** The locked axis owns the gesture, but the other one still follows a little
 *  — a hard rail feels mechanical. */
const CROSS_AXIS_FOLLOW = 0.12;
const MAX_ROTATE = 15;
/** Fractions of the card's own size, not fixed px — a 320px phone and a
 *  448px `max-w-md` card should ask for the same *proportional* effort. */
const THRESHOLD_X = 0.28;
const THRESHOLD_Y = 0.24;
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

export default function ReelCard({
  card,
  draggable,
  depth,
  onDismiss,
  departing = null,
  onExited,
  swipeProgress,
  onAsk,
  selfPreview = false,
  previousDecision = null,
}: ReelCardProps) {
  const reduced = useReducedMotion();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const mountedAt = useRef(Date.now());

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
    scroller: HTMLElement | null;
    samples: Sample[];
    crossed: boolean;
  } | null>(null);
  /** Kept past the gesture so the fly-off can inherit the flick's speed. */
  const releaseVelocity = useRef({ x: 0, y: 0 });
  const leverRef = useRef<1 | -1>(1);
  const flewRef = useRef(false);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // §4.4 physics — tilt with drag, direction overlays fade in, ring glows gold
  // as the drag commits toward "interest".
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
  const ringGlow = useTransform(() => {
    const a = axis.get();
    const v = x.get();
    return a === 1 ? clamp01(v / 150) : 0;
  });
  const ringScale = useTransform(ringGlow, [0, 1], [1, 1.08]);

  // The stack behind. `depth - progress` means a card literally rises toward
  // its next layer in step with the finger, and the whole pile settles back
  // down if the swipe is abandoned. When the top card does leave, the stack
  // resets progress to 0 in the same commit that decrements every depth, so
  // `depth - progress` is unchanged across that frame — the rise is continuous,
  // with no snap at the hand-off.
  const eDepth = useTransform(() => Math.max(0, depth - progress.get()));
  // Depth 1–3 form the "digital biodata stack" — a hand-set pile of papers, not
  // parallel photocopies, so each layer is nudged to one side. The side comes
  // from the card's own id rather than its depth: keyed on depth it would flip
  // sides mid-rise, which looks like a glitch rather than a pile.
  const lean = card.id.charCodeAt(card.id.length - 1) % 2 === 0 ? 1 : -1;
  const peekScale = useTransform(eDepth, (d) => 1 - d * 0.035);
  const peekY = useTransform(eDepth, (d) => d * 8);
  const peekX = useTransform(eDepth, (d) => lean * d * 4);
  const peekRotate = useTransform(eDepth, (d) => lean * d * 1.2);
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
    const target = e.target as HTMLElement;
    leverRef.current = e.clientY - rect.top < rect.height / 2 ? 1 : -1;
    gesture.current = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      width: rect.width,
      height: rect.height,
      axis: 0,
      lever: leverRef.current,
      // The details pane scrolls natively (`touch-action: pan-y`). A vertical
      // gesture that starts inside it and *can* still scroll belongs to the
      // browser, not to us.
      scroller: target.closest<HTMLElement>("[data-reel-scroll]"),
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
      const horizontal = Math.abs(dx) > Math.abs(dy) * AXIS_BIAS;
      if (!horizontal && g.scroller) {
        const s = g.scroller;
        const canScroll = s.scrollHeight > s.clientHeight + 1;
        const room = dy > 0 ? s.scrollTop > 0 : s.scrollTop < s.scrollHeight - s.clientHeight - 1;
        // Reading the details wins over swiping them away.
        if (canScroll && room) {
          gesture.current = null;
          return;
        }
      }
      g.axis = horizontal ? 1 : 2;
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

    // UP opens the AI sheet over a card that stays put — it is the one
    // direction that isn't a dismissal, so it springs back like a near-miss.
    if (direction === "UP") {
      springBack();
      onDismiss("UP", { decisionMs: Date.now() - mountedAt.current, wasButton: false });
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
      const t = { duration: EXIT_S, ease: EXIT_EASE };
      const ax = animate(x, to.x, { ...t, onComplete: () => onExited?.() });
      const ay = animate(y, to.y, t);
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

  const isTop = depth === 0;
  const interactive = draggable && !departing;

  return (
    <motion.div
      ref={rootRef}
      onPointerDown={interactive ? handlePointerDown : undefined}
      onPointerMove={interactive ? handlePointerMove : undefined}
      onPointerUp={interactive ? handlePointerUp : undefined}
      onPointerCancel={interactive ? handlePointerCancel : undefined}
      style={
        isTop
          ? { x, y, rotate, opacity: exitOpacity, scale: 1 }
          : { x: peekX, y: peekY, rotate: peekRotate, scale: peekScale, opacity: peekOpacity }
      }
      className={cn(
        "absolute inset-0 flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-xl",
        // `touch-pan-y`, not `touch-none`: the details pane below genuinely
        // scrolls, and `touch-action` intersects down the ancestor chain — a
        // `none` here would silently make that pane unscrollable by finger (it
        // was, before this). Horizontal is ours everywhere; vertical is handed
        // to the browser only in the regions that opt into it, and the photo
        // block re-claims it with its own `touch-none` so UP/DOWN swipes still
        // work over the picture.
        //
        // This card no longer uses Framer's `drag` at all — same reason
        // ManualCard.tsx dropped it: Framer sets its own inline `touch-action`
        // and its drag-intent detection can't share a finger with scrollable
        // content. Hand-rolled pointer handlers make the axis-lock, the
        // 1:1 tracking and the scroll hand-off explicit.
        interactive && "cursor-grab touch-pan-y select-none active:cursor-grabbing",
      )}
    >
      {/* Photo — consent-gated blur, §3 trust-by-design. `bg-grad-photo`
          reads the active theme pack (D-21b), light/dark already baked in. */}
      <div
        className={cn(
          "relative aspect-[4/3] shrink-0 bg-grad-photo",
          // Shorter on desktop — 4:3 eats ~42% of the frame's own height (the
          // frame's width comes from a 9:16 ratio on its height, see
          // ReelFrame.tsx), which left little room below for the details pane
          // to fit without scrolling. 16:9 gives that room back.
          "md:aspect-[16/9]",
          interactive && "touch-none",
        )}
      >
        {card.photoUnlocked && card.photoUrl ? (
          <PhotoSlideDeck
            slides={card.slides}
            bioNote={card.bioNote}
            fallbackPhotoUrl={card.photoUrl}
            fallbackFocalY={card.photoFocalY}
            displayName={card.displayName}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center">
            <div className="flex flex-col items-center gap-2 px-6 text-center">
              <span className="grid size-11 place-items-center rounded-full bg-surface/80 backdrop-blur-sm">
                {card.photoUnlocked ? (
                  <ImageOff className="size-5 text-muted" />
                ) : (
                  <Lock className="size-5 text-muted" />
                )}
              </span>
              {/* Two different absences, and this panel used to conflate them:
                  when the gate is already open the profile simply has no photo,
                  and blaming the gate there invents a restriction that isn't
                  there — and would put a "View Plans" offer in front of someone
                  whose plan is not what's missing. Same split ProfileViewHeader
                  already makes.

                  The locked line names both ways in, because since
                  `photoUnlockAll` shipped there genuinely are two. */}
              <p className="max-w-[220px] text-[0.75rem] leading-snug text-sand-700 dark:text-sand-300">
                {card.photoUnlocked
                  ? `${card.displayName} ne abhi tak photo nahi daali`
                  : "Photo mutual interest ya subscription ke baad dikhegi"}
              </p>
              {!card.photoUnlocked && (
                <PhotoUnlockCta className="rounded-full bg-surface/85 px-3 text-[0.8125rem] backdrop-blur-sm hover:no-underline hover:bg-surface" />
              )}
            </div>
          </div>
        )}

        {/* Mission badge — server-decided, at most twice a day, and only above
            the score floor. See ReelCardViewModel.mission for why the scarcity
            is the point rather than a tuning knob. */}
        {card.mission && (
          <div className="absolute left-3 right-3 top-3 flex items-start gap-2 rounded-md border border-gold-400/60 bg-surface/92 px-3 py-2 shadow-sm backdrop-blur-sm">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-gold-700" />
            <p className="min-w-0 text-[0.75rem] font-medium leading-snug text-gold-700">
              {card.mission.headline}
            </p>
          </div>
        )}

        {/* Floating shared-trait chips — deterministic overlap, never AI-generated (D-32) */}
        {card.sharedTags.length > 0 && (
          <div className="absolute bottom-3 left-3 flex flex-col items-start gap-1.5">
            {card.sharedTags.map((tag, i) => (
              <span
                key={tag}
                style={{ animationDelay: `${i * 0.4}s` }}
                className="animate-float rounded-full border border-gold-300/50 bg-surface/90 px-2.5 py-1 text-[0.6875rem] font-medium text-gold-700 shadow-sm backdrop-blur-sm dark:border-gold-700/40 dark:bg-surface/70 dark:text-gold-200"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Replay pass — this card already got a decision earlier today. Bottom-right:
            top is the mission banner's territory, bottom-left is sharedTags. */}
        {previousDecision && previousDecision !== "UP" && (
          <div
            className={cn(
              "absolute bottom-3 right-3 flex items-center gap-1 rounded-full border bg-surface/90 px-2.5 py-1 text-[0.6875rem] font-medium shadow-sm backdrop-blur-sm",
              previousDecision === "RIGHT" && "border-gold-400/60 text-gold-700",
              previousDecision === "LEFT" && "border-line-strong text-muted",
              previousDecision === "DOWN" && "border-trust/50 text-trust",
            )}
          >
            {previousDecision === "RIGHT" && <Check className="size-3" />}
            {previousDecision === "LEFT" && <X className="size-3" />}
            {previousDecision === "DOWN" && <Bookmark className="size-3" />}
            {PREVIOUS_DECISION_LABEL[previousDecision]}
          </div>
        )}

        {/* Direction overlays */}
        {draggable && (
          <>
            <motion.div
              aria-hidden
              style={{ opacity: rightBadge, scale: rightBadgeScale }}
              className="absolute right-4 top-4 -rotate-12 rounded-md border-2 border-gold-500 bg-surface/90 px-3 py-1 text-sm font-bold uppercase tracking-wide text-gold-700"
            >
              Interest
            </motion.div>
            <motion.div
              aria-hidden
              style={{ opacity: leftBadge }}
              className="absolute left-4 top-4 rotate-12 rounded-md border-2 border-line-strong bg-surface/90 px-3 py-1 text-sm font-bold uppercase tracking-wide text-muted"
            >
              Abhi Nahi
            </motion.div>
            <motion.div
              aria-hidden
              style={{ opacity: upBadge }}
              className="absolute left-1/2 top-4 -translate-x-1/2 rounded-md border-2 border-wine-500 bg-surface/90 px-3 py-1 text-sm font-bold uppercase tracking-wide text-wine-700"
            >
              AI se Poocho
            </motion.div>
            <motion.div
              aria-hidden
              style={{ opacity: downBadge }}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md border-2 border-trust bg-surface/90 px-3 py-1 text-sm font-bold uppercase tracking-wide text-trust"
            >
              Shortlist
            </motion.div>
          </>
        )}
      </div>

      {/* Not scrollable, so it hands vertical back to the card's own gesture. */}
      <div className={cn(interactive && "touch-none")}>
        <ReelTrustStrip photoVerified={card.verified} mobileVerified={card.mobileVerified} />
      </div>

      {/* Details. `data-reel-scroll` + `touch-pan-y` is the contract with the
          gesture handler above: a vertical drag that starts here and has room
          to scroll belongs to the browser. */}
      <div
        data-reel-scroll
        className={cn("flex-1 overflow-y-auto p-4 pt-2 md:p-3 md:pt-1.5", interactive && "touch-pan-y")}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-semibold leading-tight text-ink md:text-base">
              {card.displayName}
              {card.age ? `, ${card.age}` : ""}
            </p>
            <p className="text-[0.8125rem] text-muted">
              {[card.city, card.education].filter(Boolean).join(" · ")}
            </p>
            {card.profession && <p className="text-[0.8125rem] text-muted">{card.profession}</p>}
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {/* C5 — deterministic, from this candidate's own poll answers.
                  A chip, not a 5th action button (D-23: no 5th 48px target). */}
              {card.vibeBadge && (
                <span
                  title={card.vibeBadge.description}
                  className="inline-flex items-center gap-1 rounded-full border border-wine-300/50 bg-wine-50 px-2 py-0.5 text-[0.6875rem] font-medium text-wine-700 dark:border-wine-700/40 dark:bg-wine-900/20 dark:text-wine-200"
                >
                  {card.vibeBadge.label}
                </span>
              )}

              {/* Phase D — a chip too, same D-23 reasoning. `onPointerDown`
                  stops the drag gesture from ever engaging for this tap, so a
                  stationary click always reaches onAsk rather than risking a
                  half-drag on the surface underneath. */}
              {onAsk && card.askedStatus === "NONE" && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAsk();
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-line bg-surface/90 px-2 py-0.5 text-[0.6875rem] font-medium text-muted shadow-sm backdrop-blur-sm transition-colors hover:border-gold-400 hover:text-gold-700"
                >
                  <HelpCircle className="size-3" />
                  Ask Something
                </button>
              )}
              {card.askedStatus === "PENDING" && (
                <span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[0.6875rem] text-subtle">
                  <HelpCircle className="size-3" />
                  Sawaal poocha hua hai
                </span>
              )}
            </div>
          </div>

          <motion.div style={draggable ? { scale: ringScale } : undefined} className="relative shrink-0">
            {draggable && (
              <motion.span
                aria-hidden
                style={{ opacity: ringGlow }}
                className="pointer-events-none absolute -inset-1.5 rounded-full shadow-[0_0_0_4px_rgba(201,169,110,0.35)]"
              />
            )}
            <ProgressRing size={62} thickness={6} segments={selfPreview ? [] : card.segments} glow>
              <span className="font-[family-name:var(--font-display)] text-base leading-none text-ink">
                {selfPreview ? "Aap" : `${card.compatibility}%`}
              </span>
            </ProgressRing>
          </motion.div>
        </div>

        <ReelInsightPanel strengths={card.strengths} concern={card.concern} />
        <KundliNoteList notes={card.kundliNotes} />
      </div>
    </motion.div>
  );
}
