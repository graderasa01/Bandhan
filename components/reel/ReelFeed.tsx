"use client";

import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { animate, motion, useMotionValue, useReducedMotion, type AnimationPlaybackControls, type MotionValue } from "framer-motion";

/** One page of the feed: a person's card, or a status page (loading, the end). */
export interface FeedPage {
  /** Stable across roles — a card is the same instance as "next" and as "current". */
  key: string;
  render: (active: boolean) => ReactNode;
}

/** What the screen may ask of the feed without a finger: buttons and keys. */
export interface ReelFeedControl {
  next: () => void;
  prev: () => void;
}

/* ---------- Gesture tuning ----------
 *
 * The page tracks the finger 1:1 — no elasticity inside the feed, because a
 * page that travels less than the finger reads as "the swipe isn't working".
 * The only resistance is at the two ends, where there is genuinely nothing to
 * move to, and there it is the familiar rubber band of every feed.
 *
 * A move commits by *projection*, the way a native fling does: where the page
 * would come to rest given where it is and how fast it is travelling. A slow,
 * deliberate drag past the line and a short sharp flick both move on; a quick
 * correction back does not, even if the offset was briefly large.
 */
const INTENT_PX = 10;
/**
 * Vertical wins ties, and by a margin. This is a feed first: a thumb flicking
 * upward routinely drifts sideways, and that drift must never be read as
 * "next photo" instead of "next person". Sideways has to be clearly sideways.
 */
const HORIZONTAL_BIAS = 1.25;
/** Fraction of the page's height a projected move must cover to commit. */
const COMMIT_FRACTION = 0.12;
/** Fraction of the width a sideways projection must cover to step a photo. */
const PHOTO_FRACTION = 0.16;
/** Seconds of travel projected from release velocity. */
const PROJECTION_S = 0.14;
/** Velocity is read over a trailing window, not the last two events. */
const VELOCITY_WINDOW_MS = 90;
/** How far a page follows a finger past an end — a band, not a wall. */
const EDGE_RESISTANCE = 0.3;
/** How far the photo follows a sideways finger — a hint that it will move, not a drag. */
const PHOTO_FOLLOW = 0.32;
/**
 * Critically damped: it arrives fast and it arrives *once*. Damping ratio ≈
 * 1.04 — no overshoot, no bounce at the end of a move, which is the "no
 * excessive spring" the feed asks for. It carries the flick's own velocity in,
 * so a hard flick lands faster than a lazy one.
 */
const PAGE_SPRING = { type: "spring", stiffness: 300, damping: 36, restDelta: 0.5, restSpeed: 20 } as const;
const PHOTO_SPRING = { type: "spring", stiffness: 520, damping: 42 } as const;
/** One wheel/trackpad gesture is one move, however many events it fires. */
const WHEEL_THRESHOLD = 40;
const WHEEL_COOLDOWN_MS = 480;

type Sample = { t: number; x: number; y: number };

function velocityFrom(samples: Sample[]) {
  if (samples.length < 2) return { x: 0, y: 0 };
  const first = samples[0];
  const last = samples[samples.length - 1];
  const dt = (last.t - first.t) / 1000;
  if (dt <= 0) return { x: 0, y: 0 };
  return { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt };
}

/**
 * The reel as a vertical pager — previous, current and next are all mounted,
 * and a finger moves all three at once.
 *
 * ## Why a pager and not a stack
 *
 * The reel used to be a stack of cards: the one on top was thrown off the
 * screen and the next rose from underneath it, scaled down, tilted and dimmed.
 * That is the right picture for "decide about this person" and the wrong one
 * for "scroll the feed", which is what vertical became in D-92 — and it meant
 * the next person was a smaller, darker card until the throw had finished.
 * Here the next person is simply *below*, full size, already painted, and the
 * finger pulls them up; going back pulls the previous one down from above.
 * Nothing is thrown and nothing rises.
 *
 * ## Positions are absolute, so a hand-off has nothing to hand off
 *
 * Every page sits at `top: slot × 100%` inside one strip, and the strip moves
 * by `feed` pixels. "Current" is slot `pos`; a committed move animates the
 * strip by one page and then increments `pos`. The page that was "next" was
 * already at slot `pos + 1` — it becomes current without its own position
 * changing at all, in any frame. That is the whole trick: an earlier design
 * reset an offset at the moment roles swapped, and any frame in which React
 * and the animation disagreed painted the wrong person for one frame.
 *
 * ## Sideways is photos, never a decision
 *
 * A horizontal drag walks the current person's photos (`onPhotoStep`), with a
 * short follow so the photo visibly leans before it changes. No drag on this
 * screen decides anything about anybody: an interest, a save, a "not now" are
 * all labelled buttons (a label is consent; a drag has no words — D-92's rule,
 * now on both axes).
 *
 * ## No vibration
 *
 * Nothing here calls `haptic()`. The old card buzzed when an axis locked, when
 * a threshold was crossed and again on release — three pulses for scrolling
 * past one person, which is what made the swipe feel "strange". The page
 * moving with the finger is the feedback.
 */
export default function ReelFeed({
  prev,
  current,
  next,
  onAdvance,
  onBack,
  onPhotoStep,
  mediaX,
  controlRef,
  disabled = false,
  label,
  nextLabel,
  prevLabel,
}: {
  prev: FeedPage | null;
  current: FeedPage | null;
  next: FeedPage | null;
  /** A move to the next page committed — the screen marks the person seen. */
  onAdvance: () => void;
  /** A move to the previous page committed — navigation, never an un-send. */
  onBack: () => void;
  /** Sideways swipe on the current page. Returns false when there was no photo to move to. */
  onPhotoStep: (dir: 1 | -1) => boolean;
  mediaX: MotionValue<number>;
  controlRef?: Ref<ReelFeedControl>;
  /** A sheet is open over the feed — its gestures belong to the sheet. */
  disabled?: boolean;
  label: string;
  nextLabel: string;
  prevLabel: string;
}) {
  const reduced = useReducedMotion();
  const containerRef = useRef<HTMLDivElement | null>(null);
  /** The strip's offset in px. At rest it is exactly `-pos × height`. */
  const feed = useMotionValue(0);
  const [pos, setPos] = useState(0);
  const posRef = useRef(0);
  const heightRef = useRef(0);
  const widthRef = useRef(0);

  // The latest props, for handlers that outlive the render they came from.
  const latest = useRef({ canNext: false, canPrev: false, onAdvance, onBack, onPhotoStep, disabled });
  latest.current = { canNext: Boolean(next), canPrev: Boolean(prev), onAdvance, onBack, onPhotoStep, disabled };

  const flight = useRef<{ dir: -1 | 0 | 1; controls: AnimationPlaybackControls } | null>(null);
  const gesture = useRef<{
    id: number;
    startX: number;
    startY: number;
    base: number;
    axis: 0 | 1 | 2;
    samples: Sample[];
  } | null>(null);
  /**
   * A drag just ended — the click it fires must not open whatever was under
   * the finger. A short time window rather than a flag: the rail's buttons stop
   * their own pointerdown from reaching this container, so a flag left set by
   * one drag would silently eat the next tap on Interest.
   */
  const swallowUntil = useRef(0);
  const wheel = useRef({ acc: 0, lockedUntil: 0 });

  const restFor = (p: number) => -p * heightRef.current;

  /** A committed move has landed: the screen learns about it, and the slot counter follows. */
  const land = useCallback((dir: -1 | 1) => {
    flight.current = null;
    posRef.current += dir;
    setPos(posRef.current);
    if (dir === 1) latest.current.onAdvance();
    else latest.current.onBack();
  }, []);

  /**
   * A finger (or key) arrived while a move was still animating. The move is
   * finished *now* — the screen catches up to where the member already is —
   * and the new gesture starts from wherever the strip happens to be. A fast
   * member flicking through the feed is never made to wait for an animation.
   */
  const settle = useCallback(() => {
    const f = flight.current;
    if (!f) return;
    f.controls.stop();
    if (f.dir === 0) {
      flight.current = null;
      return;
    }
    land(f.dir as -1 | 1);
  }, [land]);

  const go = useCallback(
    (dir: -1 | 1, velocity = 0) => {
      settle();
      const { canNext, canPrev } = latest.current;
      if ((dir === 1 && !canNext) || (dir === -1 && !canPrev)) return;
      const target = restFor(posRef.current + dir);
      if (reduced || heightRef.current === 0) {
        feed.set(target);
        land(dir);
        return;
      }
      const controls = animate(feed, target, { ...PAGE_SPRING, velocity });
      flight.current = { dir, controls };
      void controls.then(() => {
        // Only if this is still the move in flight — `settle` may already have
        // landed it when a finger interrupted.
        if (flight.current?.controls === controls) land(dir);
      });
    },
    [feed, land, reduced, settle],
  );

  const springHome = useCallback(
    (velocity = 0) => {
      const target = restFor(posRef.current);
      if (reduced) {
        feed.set(target);
        return;
      }
      const controls = animate(feed, target, { ...PAGE_SPRING, velocity });
      flight.current = { dir: 0, controls };
      void controls.then(() => {
        if (flight.current?.controls === controls) flight.current = null;
      });
    },
    [feed, reduced],
  );

  useImperativeHandle(controlRef, () => ({ next: () => go(1), prev: () => go(-1) }), [go]);

  // Height is measured before paint and kept current: `100dvh` changes when a
  // phone's URL bar collapses, and a strip still offset by the old height
  // would show a sliver of the next person under the current one.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const h = el.clientHeight;
      widthRef.current = el.clientWidth;
      if (h === heightRef.current) return;
      heightRef.current = h;
      if (!gesture.current && !flight.current) feed.set(restFor(posRef.current));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [feed]);

  // A move in flight must not outlive the screen that started it.
  useEffect(() => () => flight.current?.controls.stop(), []);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (latest.current.disabled || heightRef.current === 0) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    settle();
    gesture.current = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      base: feed.get(),
      axis: 0,
      samples: [{ t: performance.now(), x: e.clientX, y: e.clientY }],
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    const now = performance.now();
    g.samples.push({ t: now, x: e.clientX, y: e.clientY });
    while (g.samples.length > 2 && now - g.samples[0].t > VELOCITY_WINDOW_MS) g.samples.shift();

    if (g.axis === 0) {
      if (Math.hypot(dx, dy) < INTENT_PX) return;
      g.axis = Math.abs(dx) > Math.abs(dy) * HORIZONTAL_BIAS ? 1 : 2;
      try {
        // Throws if the pointer ended between this move and here.
        e.currentTarget.setPointerCapture(g.id);
      } catch {
        /* uncaptured is survivable — the handlers still see the events */
      }
    }

    if (g.axis === 1) {
      mediaX.set(dx * PHOTO_FOLLOW);
      return;
    }

    const rest = restFor(posRef.current);
    let rel = g.base + dy - rest;
    const { canNext, canPrev } = latest.current;
    if ((rel < 0 && !canNext) || (rel > 0 && !canPrev)) rel *= EDGE_RESISTANCE;
    feed.set(rest + rel);
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

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;
    endGesture(e.currentTarget, g.id);
    // A tap: nothing moved, so whatever is under the finger (a photo's tap
    // zone, the name, a chip) gets its click as normal.
    if (g.axis === 0) return;
    swallowUntil.current = performance.now() + 400;

    const v = velocityFrom(g.samples);
    if (g.axis === 1) {
      const dx = e.clientX - g.startX;
      const projected = dx + v.x * PROJECTION_S;
      if (Math.abs(projected) > widthRef.current * PHOTO_FRACTION) {
        latest.current.onPhotoStep(projected < 0 ? 1 : -1);
      }
      if (reduced) mediaX.set(0);
      else animate(mediaX, 0, PHOTO_SPRING);
      return;
    }

    const rel = feed.get() - restFor(posRef.current);
    const projected = rel + v.y * PROJECTION_S;
    const line = heightRef.current * COMMIT_FRACTION;
    const { canNext, canPrev } = latest.current;
    if (projected < -line && canNext) go(1, v.y);
    else if (projected > line && canPrev) go(-1, v.y);
    else springHome(v.y);
  }

  function onPointerCancel(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;
    endGesture(e.currentTarget, g.id);
    if (g.axis === 1) animate(mediaX, 0, PHOTO_SPRING);
    else springHome();
  }

  function onWheel(e: React.WheelEvent<HTMLDivElement>) {
    if (latest.current.disabled || gesture.current) return;
    const now = performance.now();
    // Horizontal trackpad swipes are the photos' axis here too.
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    if (now < wheel.current.lockedUntil) return;
    wheel.current.acc += e.deltaY;
    if (Math.abs(wheel.current.acc) < WHEEL_THRESHOLD) return;
    const dir = wheel.current.acc > 0 ? 1 : -1;
    wheel.current = { acc: 0, lockedUntil: now + WHEEL_COOLDOWN_MS };
    go(dir);
  }

  const pages: { page: FeedPage; slot: number }[] = [];
  if (prev) pages.push({ page: prev, slot: pos - 1 });
  if (current) pages.push({ page: current, slot: pos });
  if (next) pages.push({ page: next, slot: pos + 1 });

  return (
    <div
      ref={containerRef}
      role="region"
      aria-roledescription="feed"
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onWheel={onWheel}
      onClickCapture={(e) => {
        if (performance.now() > swallowUntil.current) return;
        swallowUntil.current = 0;
        e.stopPropagation();
        e.preventDefault();
      }}
      // `touch-none`: the feed owns the finger completely — no browser scroll,
      // no pull-to-refresh, no pinch. Buttons inside still get their taps.
      className="absolute inset-0 touch-none select-none overflow-hidden"
    >
      <motion.div className="absolute inset-0" style={{ y: feed }}>
        {/* One keyed array, so a card moving from "next" to "current" is the
            same instance in the same place — its photo already decoded. */}
        {pages.map(({ page, slot }) => (
          <div key={page.key} className="absolute inset-x-0 h-full" style={{ top: `${slot * 100}%` }}>
            {page.render(slot === pos)}
          </div>
        ))}
      </motion.div>

      {/* The same two moves for anyone who cannot swipe: invisible until
          focused, so a keyboard or switch user tabs straight onto them. */}
      <div className="pointer-events-none absolute left-2 top-1/2 z-40 flex -translate-y-1/2 flex-col gap-2">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={!prev}
          className="sr-only rounded-full bg-black/70 px-3 py-2 text-[0.8125rem] font-semibold text-white focus:not-sr-only focus:pointer-events-auto"
        >
          {prevLabel}
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={!next}
          className="sr-only rounded-full bg-black/70 px-3 py-2 text-[0.8125rem] font-semibold text-white focus:not-sr-only focus:pointer-events-auto"
        >
          {nextLabel}
        </button>
      </div>
    </div>
  );
}
