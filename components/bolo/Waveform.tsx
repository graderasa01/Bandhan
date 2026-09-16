"use client";

import { cn } from "@/lib/utils";

/** Bar heights as a share of the strip — one fixed shape, like VoicePlayer's. */
const PEAKS = [0.34, 0.58, 0.86, 0.5, 1, 0.68, 0.92, 0.46, 0.76, 0.54, 0.32];

export type WaveformMode = "speaking" | "listening" | "still" | "rest";

/**
 * Grio's small gold waveform.
 *
 *   speaking  — the bars move on their own (a CSS loop; nothing is decoded)
 *   listening — they rise and fall with the visitor's own mic level, so people
 *               see they are heard before a word comes back
 *   still     — gold and at rest: a glyph for "live" beside a line of text
 *   rest      — faded: no voice right now
 *
 * Decorative — the words beside it always say the same thing.
 */
export default function Waveform({
  mode,
  level = 0,
  bars = PEAKS.length,
  className,
}: {
  mode: WaveformMode;
  /** 0–1, the mic level `GrioLiveSession` reports; only read while listening. */
  level?: number;
  bars?: number;
  className?: string;
}) {
  const lift = mode === "listening" ? Math.min(1, 0.32 + level * 1.6) : mode === "rest" ? 0.42 : 1;

  return (
    <span aria-hidden className={cn("flex h-6 items-center gap-[2px]", className)}>
      {PEAKS.slice(0, bars).map((peak, i) => (
        <span
          key={i}
          className={cn(
            "w-[2.5px] shrink-0 rounded-full",
            mode === "rest"
              ? "bg-gold-300 dark:bg-gold-800"
              : "bg-gradient-to-b from-gold-400 to-gold-600 dark:from-gold-300 dark:to-gold-500",
            mode === "speaking" && "animate-wave",
          )}
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
