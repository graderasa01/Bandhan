"use client";

import { Mic, MicOff, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LiveStatus } from "@/lib/bolo/liveClient";

/**
 * Grio, as something to look at while talking to her.
 *
 * One circle that breathes: it swells with the visitor's own voice while
 * listening (the level comes from the mic, so people see that they are being
 * heard before a word comes back), and pulses on its own while Grio speaks.
 * No waveform, no equaliser — a family on a phone needs one clear signal:
 * "is it my turn?".
 */
export default function GrioOrb({
  status,
  level,
  className,
}: {
  status: LiveStatus;
  level: number;
  className?: string;
}) {
  const listening = status === "listening";
  const speaking = status === "speaking";
  const connecting = status === "connecting";
  const scale = listening ? 1 + Math.min(0.35, level * 0.6) : 1;

  return (
    <div className={cn("relative grid place-items-center", className)} aria-hidden>
      {/* Halo — grows with the mic level so speaking visibly "reaches" Grio. */}
      <div
        className={cn(
          "absolute size-32 rounded-full bg-gold-400/25 blur-2xl transition-transform duration-150 sm:size-40",
          speaking && "animate-pulse bg-accent/25",
        )}
        style={{ transform: `scale(${listening ? 1 + level * 1.2 : speaking ? 1.15 : 0.9})` }}
      />
      <div
        className={cn(
          "relative grid size-24 place-items-center rounded-full border border-gold-300/60 sm:size-28",
          "bg-[radial-gradient(circle_at_30%_25%,var(--color-gold-100),var(--color-surface)_60%)] shadow-xl",
          "dark:bg-[radial-gradient(circle_at_30%_25%,var(--color-gold-900),var(--color-surface)_65%)]",
          "transition-transform duration-150 ease-out",
          connecting && "animate-pulse",
        )}
        style={{ transform: `scale(${scale})` }}
      >
        {speaking ? (
          <Sparkles className="size-9 text-accent" />
        ) : status === "closed" || status === "idle" ? (
          <MicOff className="size-9 text-muted" />
        ) : (
          <Mic className={cn("size-9", listening ? "text-primary-text" : "text-muted")} />
        )}
        {speaking && (
          <span className="absolute inset-0 rounded-full border-2 border-accent/50 animate-ping [animation-duration:1.6s]" />
        )}
      </div>
    </div>
  );
}
