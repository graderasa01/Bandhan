"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Loader2, Mic, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic, spring } from "@/lib/motion";
import { useMicWaveform } from "@/components/profile/_shared/useMicWaveform";

// Auto-stop on silence — turns "tap to start, tap to stop" into "just talk,
// it knows when you're done", the same shape a real phone call has. Reuses
// the analyser already running for the waveform bars, so this costs nothing
// extra: no new audio pipeline, and no Sarvam call happens any sooner or
// more often than a manual tap would have caused anyway.
/** Average byte-frequency value (0-255) below which the mic counts as quiet. */
const SILENCE_THRESHOLD = 10;
/** How long that quiet has to hold before auto-stopping. Long enough that a
 *  natural mid-sentence breath doesn't cut someone off; short enough to
 *  still feel responsive once they're actually done. */
const SILENCE_HOLD_MS = 1300;
/** Grace period after tapping "start" before silence is even measured — the
 *  half-second most people spend just getting the mic to their mouth would
 *  otherwise auto-stop the recording before a word is said. */
const MIN_SPEECH_MS = 700;

export interface VoiceCaptureProps {
  onStart?: () => void;
  onStop?: (durationMs: number) => void;
  /** Live transcript from STT, rendered under the control. */
  transcript?: string;
  /** External control — otherwise the component owns its state. */
  recording?: boolean;
  /**
   * The AI is working on what was just said. Distinct from `disabled`: a
   * greyed-out mic says "you can't", a thinking mic says "hold on, I heard you"
   * — and after speaking, that difference is the whole reassurance.
   */
  processing?: boolean;
  /** Fires the landed-it pulse once, after a turn is understood. */
  success?: boolean;
  disabled?: boolean;
  hint?: string;
  className?: string;
  /** Shrinks the button/waveform for a card that can't spare a full page's
   *  worth of height — the voice-question swipe-deck card. */
  compact?: boolean;
}

/**
 * Voice entry point for profile building.
 *
 * The waveform is driven by real mic amplitude, not a canned animation —
 * users can tell the difference immediately, and "the app is actually hearing
 * me" is the whole point of the interaction.
 *
 * Gold, not the wine/coral used for the rest of the journey's actions —
 * this is the one control that should look like an invitation rather than a
 * button to press. A continuous soft ripple runs even at rest for the same
 * reason: a still gold circle reads as decoration, a breathing one reads as
 * "tap me". Text on the gold fill stays dark per D-21 (`primary-fg`) rather
 * than the lighter gold-700 used for gold *text* elsewhere — an icon glyph
 * has no minimum contrast ratio, but readable-at-a-glance still means dark on
 * light.
 *
 * Mic permission failures degrade to a still control rather than blocking:
 * typing must always remain a route to the same outcome.
 */
export default function VoiceCapture({
  onStart,
  onStop,
  transcript,
  recording: controlledRecording,
  processing = false,
  success = false,
  disabled,
  hint = "Apne baare me bataiye — naam, sheher, kaam, family",
  className,
  compact = false,
}: VoiceCaptureProps) {
  const reduced = useReducedMotion();
  const [internalRecording, setInternalRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [micDenied, setMicDenied] = useState(false);

  const recording = controlledRecording ?? internalRecording;

  const startedAt = useRef(0);
  /** When the current unbroken quiet streak began, or null while there's
   *  still real signal — reset the instant the mic hears anything again. */
  const silenceSinceRef = useRef<number | null>(null);
  /** When this recording began — the auto-stop-on-silence grace period
   *  (`MIN_SPEECH_MS`) is measured from here, not from `startedAt`, so it
   *  keeps working unchanged regardless of what the elapsed-timer effect
   *  below does with `startedAt`. */
  const recordingStartedRef = useRef(0);

  const { levels, start: startWaveform, teardown: teardownWaveform } = useMicWaveform({
    onFrame: (data) => {
      // Same raw bytes the bars are already reading — average level below
      // the silence floor, held for a beat, means "done talking".
      const avg = data.reduce((sum, v) => sum + v, 0) / data.length;
      if (avg < SILENCE_THRESHOLD) {
        if (Date.now() - recordingStartedRef.current > MIN_SPEECH_MS) {
          if (silenceSinceRef.current === null) silenceSinceRef.current = Date.now();
          else if (Date.now() - silenceSinceRef.current > SILENCE_HOLD_MS) {
            stop();
          }
        }
      } else {
        silenceSinceRef.current = null;
      }
    },
  });

  useEffect(() => teardownWaveform, [teardownWaveform]);

  // Elapsed timer
  useEffect(() => {
    if (!recording) return;
    startedAt.current = Date.now();
    const id = setInterval(() => setElapsed(Date.now() - startedAt.current), 200);
    return () => {
      clearInterval(id);
      setElapsed(0);
    };
  }, [recording]);

  async function start() {
    haptic("tap");
    silenceSinceRef.current = null;
    recordingStartedRef.current = Date.now();
    try {
      await startWaveform();
      setMicDenied(false);
      setInternalRecording(true);
      onStart?.();
    } catch {
      // Permission denied or no device — surface it, don't crash the flow.
      setMicDenied(true);
    }
  }

  function stop() {
    haptic("success");
    teardownWaveform();
    setInternalRecording(false);
    onStop?.(Date.now() - startedAt.current);
  }

  const seconds = Math.floor(elapsed / 1000);
  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className={cn("flex flex-col items-center", compact ? "gap-2" : "gap-4", className)}>
      <div className="relative">
        {/* At rest: a slow gold breath, always on. This is what makes a static
            circle read as "tap me" instead of decoration — without it the mic
            is only inviting the instant something else already told you to
            look at it. */}
        {!recording && !processing && !success && !reduced && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full bg-gold-400/40"
            animate={{ scale: [1, 1.35], opacity: [0.55, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut" }}
          />
        )}

        {/* Listening ripple — two gold rings a half-beat apart read as
            radiating light rather than one disc blinking. */}
        {recording && !reduced && (
          <>
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-full bg-gold-400/35"
              animate={{ scale: [1, 1.65], opacity: [0.6, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
            />
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-full bg-gold-300/25"
              animate={{ scale: [1, 1.8], opacity: [0.4, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut", delay: 0.9 }}
            />
          </>
        )}

        {/* Thinking ring — slow and calm, so it reads as "heard you" not "stuck". */}
        {processing && !reduced && (
          <motion.span
            aria-hidden
            className="absolute -inset-1 rounded-full border-2 border-gold-300/60 border-t-gold-600"
            animate={{ rotate: 360 }}
            transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
          />
        )}

        {/* Landed it — one burst, never repeating. */}
        {success && !reduced && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full bg-trust/40"
            initial={{ scale: 1, opacity: 0.7 }}
            animate={{ scale: 1.8, opacity: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          />
        )}

        <motion.button
          type="button"
          disabled={disabled}
          onClick={recording ? stop : start}
          whileTap={reduced ? undefined : { scale: 0.94 }}
          transition={spring.snappy}
          aria-label={recording ? "Recording band karein" : "Bol kar profile banayein"}
          aria-pressed={recording}
          aria-busy={processing || undefined}
          className={cn(
            "relative grid place-items-center rounded-full shadow-gold transition-colors duration-300",
            compact ? "size-14" : "size-20",
            "focus-visible:ring-2 focus-visible:ring-gold-600 focus-visible:ring-offset-4 focus-visible:ring-offset-bg",
            // `recording` wins over `processing` — a fast-mode backlog
            // (earlier turns still being understood in the background) must
            // never make the button that's *actively listening right now*
            // look like it's just thinking. The waveform bars below already
            // prioritise recording this way; the button used to disagree
            // with its own waveform.
            success
              ? "bg-trust text-white"
              : recording
                // Live: the fill brightens and the glow widens — the one
                // state that should be visible from across the room.
                ? "bg-gradient-to-b from-gold-300 to-gold-500 text-primary-fg shadow-[0_0_0_12px_rgba(201,169,110,0.16)]"
                : processing
                  ? "bg-gold-100 text-gold-700 dark:bg-gold-900/60 dark:text-gold-200"
                  : "bg-gradient-to-b from-gold-400 to-gold-600 text-primary-fg hover:shadow-xl hover:-translate-y-0.5",
            disabled && !processing && "cursor-not-allowed opacity-50",
          )}
        >
          {success ? (
            <Check className={compact ? "size-6" : "size-8"} strokeWidth={3} />
          ) : recording ? (
            <Square className={cn(compact ? "size-4" : "size-6", "fill-current")} />
          ) : processing ? (
            <Loader2 className={cn(compact ? "size-5" : "size-7", "animate-spin")} />
          ) : (
            <Mic className={compact ? "size-6" : "size-8"} />
          )}
        </motion.button>
      </div>

      {/* Waveform */}
      <div className={cn("flex items-center justify-center gap-[3px]", compact ? "h-7" : "h-12")} aria-hidden>
        {levels.map((lvl, i) => (
          <motion.span
            key={i}
            className={cn(
              "w-[3px] rounded-full transition-colors",
              recording ? "bg-gold-500" : processing ? "bg-gold-200" : "bg-line-strong",
            )}
            animate={{ height: recording ? `${lvl * 100}%` : "18%" }}
            transition={{ duration: 0.08 }}
            style={{ minHeight: 4 }}
          />
        ))}
      </div>

      <div className="text-center">
        {recording ? (
          <p className={cn("font-semibold tabular-nums text-primary-text", compact ? "text-xs" : "text-sm")}>{mmss}</p>
        ) : processing ? (
          <p className={cn("font-medium text-primary-text", compact ? "text-xs" : "text-sm")}>Sun liya — samajh raha hoon…</p>
        ) : success ? (
          <p className={cn("font-medium text-trust", compact ? "text-xs" : "text-sm")}>Samajh gaya</p>
        ) : (
          // The idle hint restates whatever question is already shown above
          // the card — worth saying once on a full page, redundant clutter
          // on a card that's already tight for room.
          !compact && <p className="text-sm text-muted">{hint}</p>
        )}
      </div>

      <AnimatePresence>
        {micDenied && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            role="alert"
            className="max-w-xs rounded-md border border-warn/30 bg-warn-bg px-4 py-3 text-center text-[0.8125rem] leading-snug text-warn"
          >
            Mic ka access nahi mila. Koi baat nahi — aap type karke ya biodata
            upload karke bhi profile bana sakte hain.
          </motion.p>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {transcript && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="w-full rounded-md border border-line bg-bg-subtle px-4 py-3"
          >
            <p className="text-[0.6875rem] uppercase tracking-wider text-subtle">Aap bol rahe hain</p>
            <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink">{transcript}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
