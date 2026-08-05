"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Quote } from "lucide-react";
import { cn } from "@/lib/utils";
import { ease } from "@/lib/motion";

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
}) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const pointerStart = useRef<{ x: number; t: number } | null>(null);

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
    setIndex((i) => Math.min(i + 1, total - 1)); // stops at the last slide — no loop
  }
  function goPrev() {
    setIndex((i) => Math.max(i - 1, 0));
  }

  function onPointerDown(e: ReactPointerEvent) {
    pointerStart.current = { x: e.clientX, t: Date.now() };
    setPaused(true);
  }
  function onPointerUp(e: ReactPointerEvent, direction: "prev" | "next") {
    const start = pointerStart.current;
    setPaused(false);
    pointerStart.current = null;
    if (!start) return;
    const movedPx = Math.abs(e.clientX - start.x);
    const heldMs = Date.now() - start.t;
    // A real tap: negligible movement, released quickly. A hold just resumes
    // playback; a drag (the parent card's swipe) is left alone entirely.
    if (movedPx < 10 && heldMs < 400) {
      if (direction === "next") goNext();
      else goPrev();
    }
  }
  function onPointerLeave() {
    pointerStart.current = null;
    setPaused(false);
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
                {displayName} ki apni baat
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
        <p className="absolute inset-x-3 top-8 rounded-md bg-black/45 px-3 py-2 text-[0.8125rem] leading-snug text-white backdrop-blur-sm">
          {current.note}
        </p>
      )}

      {total > 1 && (
        <div className="absolute inset-x-2 top-2 flex gap-1">
          {Array.from({ length: total }).map((_, i) => (
            <div key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/35">
              {i < clamped || reduced ? (
                <div className={cn("h-full bg-white", i > clamped && "w-0")} />
              ) : i === clamped ? (
                <div
                  key={clamped} // remounts so the fill animation restarts per slide
                  className="h-full bg-white"
                  style={{
                    animation: "var(--animate-slide-progress)",
                    animationPlayState: paused ? "paused" : "running",
                  }}
                  onAnimationEnd={goNext}
                />
              ) : null}
            </div>
          ))}
        </div>
      )}

      {total > 1 && (
        <>
          <div
            className="absolute inset-y-0 left-0 w-1/2"
            onPointerDown={onPointerDown}
            onPointerUp={(e) => onPointerUp(e, "prev")}
            onPointerLeave={onPointerLeave}
            aria-hidden
          />
          <div
            className="absolute inset-y-0 right-0 w-1/2"
            onPointerDown={onPointerDown}
            onPointerUp={(e) => onPointerUp(e, "next")}
            onPointerLeave={onPointerLeave}
            aria-hidden
          />
        </>
      )}
    </div>
  );
}
