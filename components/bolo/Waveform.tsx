"use client";

import { cn } from "@/lib/utils";

/**
 * Bar heights as a share of the strip — one fixed shape, drawn from the
 * reference: a tall middle, two smaller crests either side of it. Nothing here
 * is decoded from the audio; the shape is a glyph.
 */
const PEAKS = [0.18, 0.32, 0.46, 0.64, 1, 0.6, 0.26, 0.42, 0.72, 0.38, 0.2];

export type WaveformMode = "speaking" | "listening" | "still" | "rest";

/**
 * Grio's gold waveform.
 *
 *   speaking  — the bars move on their own (a CSS loop; nothing is decoded)
 *   listening — they rise and fall with the visitor's own mic level, so people
 *               see they are heard before a word comes back
 *   still     — gold and at rest: a glyph for "live" beside a line of text
 *   rest      — faded: no voice right now
 *
 * The light on the bars (the gold ramp and its glow) lives in `.bolo-wave`
 * (globals.css) so the page's one palette holds it; the heights are data and
 * stay here.
 *
 * Decorative — the words beside it always say the same thing.
 */
export default function Waveform({
  mode,
  level = 0,
  bars = PEAKS.length,
  dense = false,
  className,
}: {
  mode: WaveformMode;
  /** 0–1, the mic level `GrioLiveSession` reports; only read while listening. */
  level?: number;
  bars?: number;
  /** Tighter spacing, for the small glyph beside the composer's status line. */
  dense?: boolean;
  className?: string;
}) {
  const lift = mode === "listening" ? Math.min(1, 0.32 + level * 1.6) : mode === "rest" ? 0.42 : 1;

  return (
    <span
      aria-hidden
      className={cn(
        "bolo-wave flex items-center",
        mode === "rest" && "bolo-wave--rest",
        dense ? "gap-[2.5px]" : "gap-[3.4px]",
        className,
      )}
    >
      {PEAKS.slice(0, bars).map((peak, i) => (
        <span
          key={i}
          className={cn("w-[2px] shrink-0 rounded-full", mode === "speaking" && "animate-wave")}
          style={{
            height: `${Math.round(peak * 100)}%`,
            ...(mode === "speaking"
              ? { animationDelay: `${(i * 97) % 530}ms` }
              : { transform: `scaleY(${lift})`, transition: "transform 140ms ease-out" }),
          }}
        />
      ))}
    </span>
  );
}
