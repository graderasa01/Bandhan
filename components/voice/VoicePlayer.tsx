"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Lock, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Plays a gated clip from `/api/media/[id]`.
 *
 * A plain `<audio controls>` would work, but it would also show a download
 * affordance and a scrub bar for a ten-second clip whose whole value is that
 * it was heard, not filed. This is a play/pause button and a progress bar.
 *
 * The bars are a fixed decorative pattern, not the real waveform: computing an
 * actual one means decoding the audio client-side, and doing that would give a
 * *locked* note's shape away in the same breath. A locked note shows the same
 * bars at rest, so the visual carries no information the lock is withholding.
 */
const BAR_PATTERN = [0.3, 0.6, 0.4, 0.85, 0.5, 0.95, 0.35, 0.7, 0.45, 0.9, 0.55, 0.75, 0.3, 0.6, 0.4, 0.8];

export default function VoicePlayer({
  src,
  seconds,
  locked = false,
  className,
  onFirstPlay,
}: {
  /** Null while locked — a locked note must not carry a URL at all. */
  src: string | null;
  seconds: number;
  locked?: boolean;
  className?: string;
  /**
   * Called once per clip, the first time it actually starts playing. Exists so
   * a caller can record "heard" rather than "opened" — the two are different
   * events and only this one happens inside the player.
   */
  onFirstPlay?: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);
  /** Pause/resume fires `onPlay` again; the caller asked for *first* play. */
  const firstPlaySent = useRef(false);

  useEffect(() => {
    setPlaying(false);
    setProgress(0);
    setFailed(false);
    firstPlaySent.current = false;
  }, [src]);

  function toggle() {
    const el = audioRef.current;
    if (!el || locked || !src) return;
    if (playing) {
      el.pause();
      return;
    }
    setLoading(true);
    el.play()
      .then(() => setLoading(false))
      .catch(() => {
        setLoading(false);
        setFailed(true);
      });
  }

  const filledBars = Math.round(progress * BAR_PATTERN.length);

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <button
        type="button"
        onClick={toggle}
        disabled={locked || !src}
        aria-label={locked ? "Locked" : playing ? "Pause" : "Play"}
        className={cn(
          "grid size-12 shrink-0 place-items-center rounded-full transition-colors",
          locked
            ? "border border-gold-300/60 bg-gold-50 text-gold-700 dark:border-gold-700/40 dark:bg-gold-900/20 dark:text-gold-300"
            : !src
              ? "border border-line bg-bg-subtle text-subtle"
              : "bg-gradient-to-b from-gold-400 to-gold-600 text-primary-fg shadow-gold",
        )}
      >
        {loading ? (
          <Loader2 className="size-5 animate-spin" />
        ) : locked ? (
          <Lock className="size-5" />
        ) : playing ? (
          <Pause className="size-5 fill-current" />
        ) : (
          <Play className="size-5 translate-x-0.5 fill-current" />
        )}
      </button>

      <div className="flex h-8 min-w-0 flex-1 items-center gap-[3px]" aria-hidden>
        {BAR_PATTERN.map((h, i) => (
          <span
            key={i}
            className={cn(
              "w-[3px] flex-1 rounded-full transition-colors",
              locked
                ? "bg-gold-300/70 dark:bg-gold-700/40"
                : i < filledBars
                  ? "bg-gold-600"
                  : "bg-line-strong",
            )}
            style={{ height: `${h * 100}%` }}
          />
        ))}
      </div>

      <span className="shrink-0 text-[0.75rem] tabular-nums text-muted">{seconds}s</span>

      {src && !locked && (
        <audio
          ref={audioRef}
          src={src}
          preload="none"
          onPlay={() => {
            setPlaying(true);
            if (!firstPlaySent.current) {
              firstPlaySent.current = true;
              onFirstPlay?.();
            }
          }}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setProgress(0);
          }}
          onError={() => setFailed(true)}
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            if (el.duration > 0) setProgress(el.currentTime / el.duration);
          }}
        />
      )}

      {failed && (
        <span role="alert" className="text-[0.75rem] text-danger">
          Chal nahi payi
        </span>
      )}
    </div>
  );
}
