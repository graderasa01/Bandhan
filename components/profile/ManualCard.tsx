"use client";

import { useEffect, useRef, useState } from "react";
import { animate as animateValue, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type ManualCardDirection = "LEFT" | "RIGHT";

export interface ManualCardProps {
  children: React.ReactNode;
  /** Only the top card (depth 0) drags — cards behind it just peek. */
  draggable: boolean;
  depth: number;
  onDismiss: (direction: ManualCardDirection) => void;
}

/**
 * Horizontal travel (px) that commits a swipe on release. Roughly 15% of the
 * card's ~343px width — low, because `COMMIT_VELOCITY` below already catches
 * the fast flicks and this only needs to catch slow deliberate drags.
 */
const COMMIT_DISTANCE = 52;
/**
 * ...or this release speed (px/s). A quick flick that only travelled 20px
 * still reads as "next", which is what a finger actually does when someone
 * swipes casually — distance alone made those feel ignored.
 */
const COMMIT_VELOCITY = 200;
/**
 * ...but velocity alone only counts once the finger has actually travelled
 * this far. A tap that slips a few px in its last frame is arithmetically a
 * 400px/s "flick" (7px in 18ms), and that was enough to throw the card away
 * — which from the user's side is the card swiping on its own. Still well
 * under `COMMIT_DISTANCE`, so a real quick flick (which covers far more than
 * 24px before the finger lifts) commits exactly as before.
 */
const COMMIT_VELOCITY_MIN_DISTANCE = 24;
/**
 * How far the finger must move before we commit to "this is a horizontal
 * swipe" vs "this is a vertical scroll". Deliberately tiny: the direction is
 * already unambiguous after a few px, and waiting longer is exactly what made
 * the gesture feel like it needed a deliberate press-and-hold before it woke
 * up.
 */
const INTENT_SLOP = 5;
/**
 * How much more vertical than horizontal the movement has to be before we
 * call it a scroll and hand it to `scrollBy` below. Biased well past 1 on
 * purpose: fingers swipe in arcs, not straight lines, so a swipe that starts
 * with a downward curl would otherwise be misread as a scroll in its first
 * few px and never recover. Only applies where `findScroller` finds
 * something to actually scroll.
 */
const SCROLL_BIAS = 1.6;
/** Release velocity is measured over the last samples inside this window. */
const VELOCITY_WINDOW_MS = 120;

const STACK_OPACITY = [1, 1, 0.85];

/**
 * Walks from the touched node up to (not past) the card, looking for an
 * ancestor that is genuinely scrolled — overflow set *and* content taller
 * than the box. Most field pages fit their frame and have nothing to scroll,
 * so on those every gesture is unambiguously a swipe; only the tall ones
 * (the photo uploader, a long option list) need to share the finger with a
 * scroll — and that scroll is driven by hand (see `scrollBy` in
 * `handlePointerMove`), not the browser's own touch-action pan, since
 * `touch-action: none` below turns that off entirely.
 */
function findScroller(from: EventTarget | null, stopAt: HTMLElement | null): HTMLElement | null {
  let node = from instanceof Element ? from : null;
  while (node) {
    if (node instanceof HTMLElement) {
      const overflowY = getComputedStyle(node).overflowY;
      if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight + 1) {
        return node;
      }
    }
    if (node === stopAt) break;
    node = node.parentElement;
  }
  return null;
}

/**
 * Whether this scroller has anywhere left to go in the direction the finger
 * is travelling. `dy > 0` is a finger moving *down*, which pulls the content
 * down — i.e. `scrollTop` decreasing — so it needs room above.
 *
 * This is the difference between "the card can scroll" and "the card can
 * scroll *right now*", and only the second one should take a gesture away
 * from the swipe. Without it, a card already parked at the bottom of its
 * content ate every slightly-downward swipe: the gesture was handed to a
 * scroller with nothing left to scroll, so the card sat still and the swipe
 * read as simply not working. That case became common the day the footer
 * strip moved inside the card and more pages started overflowing.
 */
function canScrollFurther(el: HTMLElement, dy: number): boolean {
  if (dy > 0) return el.scrollTop > 0.5;
  return el.scrollTop + el.clientHeight < el.scrollHeight - 0.5;
}

/**
 * Tinder/Reel-style card physics for the manual profile-fill deck.
 *
 * The gesture is hand-rolled on raw pointer events rather than Framer's
 * `drag` prop, and — as of the second pass, still 2026-08-03 — the vertical
 * scroll inside a tall card (the photo uploader) is hand-rolled too, driven
 * off the same pointer events rather than the browser's own touch scrolling.
 * Two real-phone failures got us here, in order:
 *
 * 1. Framer's `drag` writes its own inline `touch-action` (`pan-y` for
 *    `drag="x"`), which silently beats any Tailwind class, and its
 *    drag-intent detection inside a scrollable subtree needed a
 *    near-stationary press before it would start tracking — a normal quick
 *    or curved flick got dropped, the card only moved after a deliberate
 *    hold-then-drag.
 * 2. Dropping Framer's `drag` for our own pointer handlers, we still set
 *    `touch-action: pan-y` on the card (to let the browser keep handling
 *    vertical scroll for us) — but `touch-action` is a *permission*, not a
 *    handoff: the instant a touch's early movement has enough of a vertical
 *    component, the browser can decide unilaterally to start its own native
 *    scroll and cancel our gesture (a `pointercancel`) — before our own
 *    `handlePointerMove` ever gets to weigh in with "no, this is a
 *    horizontal swipe". On the tall photo card this showed up as the card
 *    visibly tracking the finger for a few px and then going dead — the
 *    browser had already grabbed it and (since the deck's own scroll is
 *    disabled) had nowhere to actually take it, so nothing happened either
 *    way.
 *
 * `touch-action: none` closes that permission entirely — the browser can
 * never intercept, full stop, so every event is guaranteed to reach us. The
 * card decides swipe-vs-scroll itself off the first few px of travel
 * (`INTENT_SLOP`, comparing |dx| to |dy|) and, if it decides "scroll", drives
 * `scroller.scrollTop` by hand for the rest of that gesture (see
 * `handlePointerMove`) instead of asking the browser to take over.
 *
 * What none of this can fix: Android's system back-gesture owns a strip
 * along the screen's outer edge below the browser, so a swipe *starting* in
 * that strip never reaches any web page. `ManualProfileFormMobile`'s deck
 * padding keeps the card clear of it; nothing in web code can do more.
 *
 * This component only reports which way the finger went (`"LEFT"`/`"RIGHT"`);
 * which of those means *next* is the parent's call — see `handleDismiss` in
 * `ManualProfileFormMobile`. As of 2026-08-06 that mapping is the Reels/
 * Stories one: left = forward, right = back (it used to be the other way
 * round). The entry/exit choreography below is the visual half of the same
 * decision and has to mirror it, so if that mapping ever flips again, the
 * two signs here flip with it.
 *
 * Choreography is derived entirely from `depth`, not a separate direction
 * prop: a card only ever mounts fresh at depth 0 when the user swiped
 * *backward* (forward navigation's new tail card always mounts at the back
 * of the stack, depth 2) — so `depth === 0` at mount alone is enough to know
 * it should slide in dramatically from the right, i.e. back in from where a
 * forward swipe threw it. Symmetrically, a card only ever exits the window
 * entirely from depth 0 (dismissed forward, flies off left) or from the tail
 * depth (fell off the back on a backward swipe, just fades — it was barely
 * visible anyway) — so the depth it was rendered at right before removal is
 * enough to pick the right exit, no extra state.
 *
 * Drag stays enabled under `prefers-reduced-motion` — with the floating
 * Peeche/Aage buttons gone, drag is the *only* navigation method, so
 * disabling it here (the way ReelCard disables its own drag under reduced
 * motion) would strand those users. Only the decorative tilt/spring bounce
 * is suppressed.
 */
export default function ManualCard({ children, draggable, depth, onDismiss }: ManualCardProps) {
  const reduced = useReducedMotion();
  const [enteredAtDepthZero] = useState(depth === 0);

  // `x` is ours alone — never a target in `animate` below. A live gesture and
  // an `animate={{ x: 0 }}` target fight over the same value, and any render
  // mid-drag (the photo card re-renders constantly as thumbnails load) lets
  // the animation win and snaps the card back under the finger. Resting
  // positions are driven imperatively instead, in the effect below.
  const x = useMotionValue(enteredAtDepthZero ? 420 : 0);
  const tilt = useTransform(x, [-200, 200], [-14, 14]);

  /**
   * The peek offsets fan the stack to the *right* — one direction, not the
   * alternating left/right shuffle this used to do. A stack that leans one
   * way reads as "there are more of these behind"; one that zigzags reads as
   * cards that failed to line up.
   *
   * The three numbers are one system, and the scale is the one that fights
   * the other two: shrinking a card pulls its bottom edge *up* by half the
   * height it loses (~10px at the old 0.035), which is why an earlier
   * `peekY` of 6 made the rear cards vanish behind the front one entirely
   * instead of peeking below it. So the shrink is small and the offsets have
   * to clear it — `peekY` beats it by roughly 8px per layer, `peekX` by
   * ~13px — and the deck's bottom padding and `px-8` gutter are what those
   * offsets fan into without reaching the screen edge at 320px.
   */
  const peekScale = 1 - depth * 0.018;
  const peekY = depth * 14;
  const peekX = depth * 14;
  const peekOpacity = STACK_OPACITY[Math.min(depth, STACK_OPACITY.length - 1)];

  const restX = draggable ? 0 : peekX;
  const restTransition = reduced ? { duration: 0.15 } : spring.soft;

  const cardRef = useRef<HTMLDivElement | null>(null);
  const gesture = useRef<{
    id: number;
    startX: number;
    startY: number;
    /** `y` at the last processed move — scrolling applies the *delta* since
     *  then, not the total, so it composes with the element's own clamping
     *  at either end instead of jumping. */
    lastY: number;
    /** "undecided" (`mode === null`) until the finger has moved past
     *  `INTENT_SLOP` and we've picked a direction to commit to. */
    mode: "swipe" | "scroll" | null;
    /** Found once, at pointerdown, from whatever was actually touched. */
    scroller: HTMLElement | null;
    samples: { x: number; t: number }[];
  } | null>(null);
  /** Set on release, once a gesture has travelled far enough to be a real
   *  swipe, so the click it synthesises doesn't also fire whatever button it
   *  ended over. Deliberately decided at release, not the moment the mode
   *  flipped — see `handlePointerUp`. */
  const swallowClick = useRef(false);

  // Settles the card at its resting x: 0 on top, a small peek offset behind.
  // Also plays the backward-swipe entrance, since `x` starts off-screen at
  // +420 in that case and this is what pulls it in.
  useEffect(() => {
    if (gesture.current?.mode === "swipe") return;
    const controls = animateValue(x, restX, restTransition);
    return () => controls.stop();
    // `restTransition` is a fresh object each render; `reduced` is what
    // actually changes it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restX, reduced, x]);

  function settle(direction: ManualCardDirection | null) {
    gesture.current = null;
    if (direction) {
      onDismiss(direction);
      return;
    }
    animateValue(x, restX, restTransition);
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggable) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    swallowClick.current = false;
    gesture.current = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastY: e.clientY,
      mode: null,
      scroller: findScroller(e.target, cardRef.current),
      samples: [{ x: e.clientX, t: performance.now() }],
    };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;

    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;

    if (g.mode === null) {
      if (Math.abs(dx) < INTENT_SLOP && Math.abs(dy) < INTENT_SLOP) return;
      const isScroll =
        g.scroller !== null &&
        Math.abs(dy) > Math.abs(dx) * SCROLL_BIAS &&
        canScrollFurther(g.scroller, dy);
      if (isScroll) {
        g.mode = "scroll";
      } else {
        g.mode = "swipe";
        // Keeps the rest of the gesture coming to us even once the finger
        // leaves this element (or a re-render swaps the node under it).
        e.currentTarget.setPointerCapture(e.pointerId);
      }
    }

    if (g.mode === "scroll") {
      // Hand-rolled, not the browser's own touch-pan — `touch-action: none`
      // below means there's no native scroll left to hand this to.
      g.scroller!.scrollTop -= e.clientY - g.lastY;
      g.lastY = e.clientY;
      return;
    }

    g.samples.push({ x: e.clientX, t: performance.now() });
    if (g.samples.length > 8) g.samples.shift();
    x.set(dx);
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    if (g.mode !== "swipe") {
      gesture.current = null;
      return;
    }

    const now = performance.now();
    const dx = e.clientX - g.startX;
    const oldest = g.samples.find((s) => now - s.t <= VELOCITY_WINDOW_MS) ?? g.samples[0];
    const dt = now - oldest.t;
    const velocity = dt > 0 ? ((e.clientX - oldest.x) / dt) * 1000 : 0;

    const flicked = Math.abs(dx) >= COMMIT_VELOCITY_MIN_DISTANCE;

    // Only a gesture that got far enough to commit should eat the click it
    // synthesises. Setting this the moment the mode flipped to "swipe" (5px
    // of travel) meant a chip tap with the smallest finger roll navigated
    // nowhere *and* never registered as a tap either.
    swallowClick.current = flicked;

    if (dx < -COMMIT_DISTANCE || (flicked && velocity < -COMMIT_VELOCITY)) {
      settle("LEFT");
      return;
    }
    if (dx > COMMIT_DISTANCE || (flicked && velocity > COMMIT_VELOCITY)) {
      settle("RIGHT");
      return;
    }
    settle(null);
  }

  function handlePointerCancel(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    settle(null);
  }

  function handleClickCapture(e: React.MouseEvent<HTMLDivElement>) {
    if (!swallowClick.current) return;
    swallowClick.current = false;
    e.preventDefault();
    e.stopPropagation();
  }

  /**
   * Rotation is bound to `tilt` (i.e. to `x`) for the card's whole life,
   * never handed between `style` and `animate` — which is what fixed a card
   * that arrived from the back of the stack resting visibly crooked. It used
   * to carry a static `peekRotate` in `animate`; when it reached depth 0 that
   * key simply stopped being sent, and framer left the last value written
   * rather than handing rotation back to `style`. The card sat at ~2.4° with
   * `x` at 0 and nothing to pull it straight.
   *
   * Deriving it from `x` instead means the peek cards get a fan proportional
   * to their own offset (a fraction of a degree) and the top card is exactly
   * straight, because its `x` is exactly 0.
   */
  const showTilt = !reduced;

  return (
    <motion.div
      ref={cardRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onClickCapture={handleClickCapture}
      style={showTilt ? { x, rotate: tilt } : { x }}
      initial={enteredAtDepthZero ? { opacity: 0 } : false}
      // Deliberately no `x` here — see the `useMotionValue` comment above.
      animate={{
        y: peekY,
        scale: peekScale,
        opacity: peekOpacity,
      }}
      exit={
        depth === 0
          ? { x: -480, rotate: reduced ? 0 : -16, opacity: 0, transition: spring.snappy }
          : { opacity: 0, transition: spring.soft }
      }
      transition={restTransition}
      inert={depth > 0}
      // `none`, not `pan-y` — see the docstring above. Nothing writes an
      // inline `touch-action` over this anymore now that Framer's `drag` is
      // gone, so a plain class (no `!important` needed) is enough.
      className={cn("absolute inset-0", draggable && "touch-none select-none")}
    >
      {children}
    </motion.div>
  );
}
