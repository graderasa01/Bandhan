"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Pause, Play, Quote } from "lucide-react";
import { cn } from "@/lib/utils";
import { ease, haptic } from "@/lib/motion";
import { useT } from "@/components/i18n/LanguageProvider";

export interface PhotoSlide {
  id: string;
  url: string;
  note: string | null;
  focalY: number | null;
}

/**
 * The reel's own "jadu" — the owner's chosen photos, tapped through like a
 * story, each carrying a line in their own words. Not a video: nothing here
 * is generated or animated beyond a progress bar. The photos are real, the
 * words are typed by the person, and that is the entire trick.
 *
 * Tap, not drag — deliberately. The reel's card already answers a horizontal
 * drag with a LEFT/RIGHT decision (skip/interest), so a slide deck that also
 * reacted to drag would turn "let me see the next photo" into an accidental
 * swipe. Advancing here happens through plain pointer taps, which coexist
 * safely with the parent card's drag gesture: framer's `PanSession` only
 * commits a swipe once movement crosses `DRAG_THRESHOLD` (120px); a tap with
 * a few pixels of jitter never reaches that, so nothing here needs to (or
 * should) call `stopPropagation`.
 *
 * Three tap bands, not two: left goes back, right goes on, and the middle
 * starts and stops the auto-advance — which is OFF until asked for. See
 * `playing` below for why a story deck here should hold still by default.
 *
 * No loop, matching D-02's stance on infinite scroll one level down: the deck
 * stops on the last slide instead of wrapping back to the first.
 */
export default function PhotoSlideDeck({
  slides,
  bioNote,
  fallbackPhotoUrl,
  fallbackFocalY,
  displayName,
  priority,
  progressTopClassName = "top-2",
  noteTopClassName = "top-8",
}: {
  slides: PhotoSlide[];
  /** Trailing text slide content — omitted entirely when null. */
  bioNote: string | null;
  /** Used only when `slides` is empty — the old single-photo view, unchanged. */
  fallbackPhotoUrl: string | null;
  /** 0..100 vertical focal point for the fallback photo — null = center (50). */
  fallbackFocalY?: number | null;
  displayName: string;
  /** LCP hint for an above-the-fold mount (the profile header) — the reel never sets this, it renders offscreen cards ahead of time. */
  priority?: boolean;
  /**
   * Where the story bars sit, as a Tailwind position class.
   *
   * Default `top-2` is right for a photo inside a card. The reel's photo runs
   * edge to edge under a floating header and tab row, and there the bars sit
   * in a band of their own *above* that chrome — they used to be pushed below
   * it, which buried the count a third of the way down the screen. The reel
   * pays for the band by starting its header that much lower (`ReelStack`).
   */
  progressTopClassName?: string;
  /** Where the photo's own note sits — moves with the bars for the same reason. */
  noteTopClassName?: string;
}) {
  const t = useT();
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  /**
   * Auto-advance starts OFF.
   *
   * A deck that starts running decides for you how long you get to look at
   * someone — and it always gets it wrong in the same direction, because the
   * photo you actually want to study is the one it slides away from. So the
   * deck holds still, the person taps through at their own pace, and playback
   * is a thing you ask for (centre tap) rather than a thing you have to
   * interrupt.
   */
  const [playing, setPlaying] = useState(false);
  /** Pointer is held down — playback freezes for as long as it is. */
  const [held, setHeld] = useState(false);
  /**
   * The slide that currently owns a running (or frozen mid-way) fill.
   *
   * Without this, pausing would have to fall back to drawing the bar full,
   * which says "this slide finished" about a slide the viewer stopped halfway
   * through. Keeping the animated element mounted and merely paused freezes
   * the fill exactly where it was — and resuming continues from there instead
   * of restarting the slide.
   */
  const [engaged, setEngaged] = useState<number | null>(null);
  /** The play/pause glyph that flashes in the middle on a toggle, then fades. */
  const [flash, setFlash] = useState<"play" | "pause" | null>(null);
  const pointerStart = useRef<{ x: number; t: number } | null>(null);

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 700);
    return () => clearTimeout(timer);
  }, [flash]);

  const totalPhotoSlides = slides.length;

  // The owner never curated a reel — fall back to the plain single photo
  // (pre-Phase-2 behaviour), even if they happen to have a bio. A bio-only
  // "slide" nobody asked for would replace their actual photo with text,
  // which is a worse profile than the one this feature is meant to improve.
  if (totalPhotoSlides === 0) {
    return fallbackPhotoUrl ? (
      <Image
        src={fallbackPhotoUrl}
        alt={displayName}
        fill
        className="object-cover"
        unoptimized
        priority={priority}
        style={{ objectPosition: `50% ${fallbackFocalY ?? 50}%` }}
      />
    ) : null;
  }

  const hasTextSlide = Boolean(bioNote?.trim());
  const total = totalPhotoSlides + (hasTextSlide ? 1 : 0);
  const clamped = Math.min(index, total - 1);
  const isTextSlide = clamped >= totalPhotoSlides;
  const current = isTextSlide ? null : slides[clamped];

  function goNext() {
    goTo(clamped + 1);
  }
  function goPrev() {
    goTo(clamped - 1);
  }
  /**
   * One move, so the three things a slide change has to keep in step — the
   * index, whether playback survives it, and whether the new bar carries a
   * running fill — are decided together instead of in three `setState`
   * updaters that each only know about their own.
   */
  function goTo(target: number) {
    const next = Math.max(0, Math.min(target, total - 1)); // stops at the last slide — no loop
    setIndex(next);
    // Reaching the end stops playback rather than leaving a finished bar
    // running against a wall — the next centre tap starts it again.
    const stillPlaying = playing && next !== total - 1;
    if (playing && !stillPlaying) setPlaying(false);
    setEngaged(stillPlaying ? next : null);
  }
  function togglePlay() {
    const next = !playing;
    setFlash(next ? "play" : "pause");
    haptic("tap");
    if (next) {
      // Pressing play on the last slide has nowhere to go — start again from
      // the first, which is what "play" means on a deck that never loops.
      const from = clamped === total - 1 ? 0 : clamped;
      setIndex(from);
      setEngaged(from);
    }
    setPlaying(next);
  }

  function onPointerDown(e: ReactPointerEvent) {
    pointerStart.current = { x: e.clientX, t: Date.now() };
    setHeld(true);
  }
  function onPointerUp(e: ReactPointerEvent, zone: "prev" | "toggle" | "next") {
    const start = pointerStart.current;
    setHeld(false);
    pointerStart.current = null;
    if (!start) return;
    const movedPx = Math.abs(e.clientX - start.x);
    const heldMs = Date.now() - start.t;
    // A real tap: negligible movement, released quickly. A hold just resumes
    // playback; a drag (the parent card's swipe) is left alone entirely.
    if (movedPx < 10 && heldMs < 400) {
      if (zone === "next") goNext();
      else if (zone === "prev") goPrev();
      else togglePlay();
    }
  }
  function onPointerLeave() {
    pointerStart.current = null;
    setHeld(false);
  }

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* A crossfade + gentle punch-in on slide change — not a horizontal
          slide. A left/right *slide* transition here would read as "this is
          swipeable sideways" and fight the doc comment above's whole point:
          horizontal drag belongs to the parent card's skip/interest gesture,
          not this deck. `mode="sync"` (AnimatePresence's default) overlaps
          the outgoing and incoming slide so the fade genuinely crosses
          instead of leaving a blank gap. */}
      <AnimatePresence initial={false}>
        {isTextSlide ? (
          <motion.div
            key="text"
            className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-wine-700 via-wine-800 to-wine-900 px-8 text-center"
            initial={reduced ? false : { opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduced ? undefined : { opacity: 0 }}
            transition={ease.fast}
          >
            <div>
              <Quote className="mx-auto mb-3 size-6 text-gold-300/70" />
              <p className="mx-auto max-h-[70%] overflow-y-auto text-[0.9375rem] leading-relaxed text-gold-50">
                {bioNote}
              </p>
              <p className="mt-4 text-[0.6875rem] font-medium uppercase tracking-wider text-gold-300/70">
                {t("profile.slideDeck.ownWords", "{name} ki apni baat").replace("{name}", displayName)}
              </p>
            </div>
          </motion.div>
        ) : current ? (
          <motion.div
            key={current.id}
            className="absolute inset-0"
            initial={reduced ? false : { opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduced ? undefined : { opacity: 0 }}
            transition={ease.fast}
          >
            <Image
              src={current.url}
              alt={displayName}
              fill
              className="object-cover"
              unoptimized
              priority={priority && clamped === 0}
              style={{ objectPosition: `50% ${current.focalY ?? 50}%` }}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/*
        Photo's own note — separate from the trailing bio slide, sits over the
        image itself. Anchored under the progress bars (top, not bottom) on
        purpose: the reel card already floats shared-trait chips at
        bottom-left (`ReelCard.tsx`), and a full-width caption bar down there
        would sit on top of them on any card that has both.
      */}
      {current?.note && (
        <p className={cn("absolute inset-x-3 rounded-md bg-black/45 px-3 py-2 text-[0.8125rem] leading-snug text-white backdrop-blur-sm", noteTopClassName)}>
          {current.note}
        </p>
      )}

      {/*
        How many photos there are, and which one you are on.

        `z-20` is load-bearing, not decoration: the reel card paints a
        `from-black/50` legibility scrim *after* this deck in the DOM, so
        without a stacking order of their own the bars sat under half a stop of
        black and read as barely-there grey hairlines. They also went up a
        notch in weight (4px, a wider gap, a drop shadow) — on a busy photo a
        3px bar at 35% white is invisible, and these are the only thing on
        screen that answers "is there more to see".
      */}
      {total > 1 && (
        <div className={cn("absolute inset-x-3 z-20 flex gap-1.5", progressTopClassName)}>
          {Array.from({ length: total }).map((_, i) => (
            <div
              key={i}
              className="h-1 flex-1 overflow-hidden rounded-full bg-white/30 shadow-[0_1px_2px_rgb(0_0_0/0.45)]"
            >
              {i < clamped ? (
                <div className="h-full bg-white" />
              ) : i === clamped ? (
                engaged === clamped && !reduced ? (
                  <div
                    key={clamped} // remounts so the fill animation restarts per slide
                    className="h-full bg-white"
                    style={{
                      animation: "var(--animate-slide-progress)",
                      animationPlayState: playing && !held ? "running" : "paused",
                    }}
                    onAnimationEnd={goNext}
                  />
                ) : (
                  // Never started on this slide: the bar shows full rather than
                  // a fill sitting at 0%, which is indistinguishable from "not
                  // reached yet" — the one thing these bars exist to say.
                  <div className="h-full bg-white" />
                )
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* Confirms the centre tap did something. Shown only on the toggle and
          then gone — a permanent play badge over someone's face is a control
          panel on a photograph. */}
      <AnimatePresence>
        {flash && (
          <motion.span
            key={flash}
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 z-20 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm"
            initial={reduced ? false : { opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={ease.fast}
          >
            {flash === "play" ? <Play className="size-6" /> : <Pause className="size-6" />}
          </motion.span>
        )}
      </AnimatePresence>

      {total > 1 && (
        <>
          {/* Plain divs, not <button> — a real button here would put a focus
              ring and default styling over the photo for a control that is
              deliberately invisible. `data-slide-tap-zone` exists so a
              page-level "tap anywhere opens X" listener (ProfileActionBar) can
              recognise and exclude these: Next's App Router hydrates React
              onto `document` itself, so React's own delegated click listener
              and any raw `document.addEventListener('click', …)` end up on
              the very same node — calling `stopPropagation()` in the former
              cannot stop the latter, since that only blocks propagation to
              *ancestor* nodes, not sibling listeners already sitting on the
              node the event has reached. Excluding by selector, the same way
              `a`/`button` are already excluded, is the fix that actually
              works. */}
          <div
            className="absolute inset-y-0 left-0 w-[28%]"
            onPointerDown={onPointerDown}
            onPointerUp={(e) => onPointerUp(e, "prev")}
            onPointerLeave={onPointerLeave}
            data-slide-tap-zone
            aria-hidden
          />
          {/* The middle band starts and stops the deck. Narrower than the two
              it sits between: advancing is what people do dozens of times a
              session, playback is a decision they make once. */}
          <div
            className="absolute inset-y-0 left-[28%] w-[30%]"
            onPointerDown={onPointerDown}
            onPointerUp={(e) => onPointerUp(e, "toggle")}
            onPointerLeave={onPointerLeave}
            data-slide-tap-zone
            aria-hidden
          />
          <div
            className="absolute inset-y-0 right-0 w-[42%]"
            onPointerDown={onPointerDown}
            onPointerUp={(e) => onPointerUp(e, "next")}
            onPointerLeave={onPointerLeave}
            data-slide-tap-zone
            aria-hidden
          />
        </>
      )}
    </div>
  );
}
