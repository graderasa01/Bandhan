"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Loader2, Mic, RotateCcw, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic, spring } from "@/lib/motion";
import { createSpeechProvider } from "@/lib/speech/webSpeech";
import { VOICE_MAX_SECONDS } from "@/lib/constants/voice";
import type { SpeechProvider } from "@/lib/speech/SpeechProvider";
import { useMicWaveform } from "@/components/profile/_shared/useMicWaveform";

/** Product rule. The server accepts a little more (VOICE_MAX_MS) for the trailing chunk. */
const MAX_SECONDS = VOICE_MAX_SECONDS;

export interface RecordedVoice {
  mediaId: string;
  durationMs: number;
  playbackUrl: string;
  pendingReview: boolean;
}

/**
 * Record → hear it back → keep or redo. Upload happens on stop; sending is a
 * separate decision the parent owns.
 *
 * ## Why the transcript comes from the browser
 *
 * Web Speech runs alongside the recording and the text rides up with the file.
 * Server-side STT would cost money on every clip including the ones nobody
 * ever sends, and D-72 is still open. The transcript is not decoration —
 * moderation reads it (see contentModeration), which is why a clip with no
 * transcript is held rather than approved.
 *
 * ## The hard cap is enforced three times
 *
 * A timer stops the recorder at 10s, the UI shows the countdown, and the API
 * rejects anything longer. Belt and braces because a clip that overruns is not
 * a cosmetic problem: the whole "10-second" promise is what makes a stranger's
 * voice acceptable to receive at all.
 */
export default function VoiceRecorder({
  onRecorded,
  onCleared,
  hint = "10 second me bataiye ki inki kaunsi baat achhi lagi",
  disabled,
  uploadUrl = "/api/media/voice",
}: {
  onRecorded: (voice: RecordedVoice) => void;
  onCleared?: () => void;
  hint?: string;
  disabled?: boolean;
  /** Every recorder ends up at the same upload+moderate pipeline (see
   * voiceUpload.ts); this only changes which session authenticates the
   * request and whose account the clip is filed under. Family portal's
   * Parent Blessing recorder is the one caller that overrides it. */
  uploadUrl?: string;
}) {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<"idle" | "recording" | "uploading" | "ready">("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [preview, setPreview] = useState<string | null>(null);

  const { levels, start: startWaveform, teardown: teardownWaveform } = useMicWaveform();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const speechRef = useRef<SpeechProvider | null>(null);
  const transcriptRef = useRef("");
  const startedAt = useRef(0);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const teardown = useCallback(() => {
    if (stopTimer.current) clearTimeout(stopTimer.current);
    stopTimer.current = null;
    teardownWaveform();
    speechRef.current?.stop();
    speechRef.current = null;
  }, [teardownWaveform]);

  useEffect(() => teardown, [teardown]);

  // Revoke the object URL when it is replaced or the component goes away —
  // otherwise every re-record leaks a blob for the life of the page.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function pickMimeType(): string {
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
    for (const type of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) return type;
    }
    return "";
  }

  async function start() {
    if (disabled || phase !== "idle") return;
    setError(null);
    haptic("tap");

    // Live amplitude — a canned animation is instantly recognisable as fake,
    // and "is it actually hearing me" is the only question a recorder has to answer.
    let stream: MediaStream;
    try {
      stream = await startWaveform();
    } catch {
      setError("Mic ka access nahi mila. Browser settings me mic allow kijiye.");
      return;
    }

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      void upload(blob, Date.now() - startedAt.current);
    };

    transcriptRef.current = "";
    setTranscript("");
    const speech = createSpeechProvider();
    if (speech.isAvailable()) {
      speechRef.current = speech;
      void speech.start({
        onResult: (r) => {
          if (r.isFinal) {
            transcriptRef.current = `${transcriptRef.current} ${r.transcript}`.trim();
            setTranscript(transcriptRef.current);
          } else {
            setTranscript(`${transcriptRef.current} ${r.transcript}`.trim());
          }
        },
        onError: () => {},
        onEnd: () => {},
      });
    }

    startedAt.current = Date.now();
    recorder.start();
    setPhase("recording");
    setElapsedMs(0);
    stopTimer.current = setTimeout(stop, MAX_SECONDS * 1000);
  }

  function stop() {
    if (recorderRef.current?.state === "recording") {
      haptic("success");
      recorderRef.current.stop();
      setPhase("uploading");
    }
    teardown();
  }

  async function upload(blob: Blob, durationMs: number) {
    const form = new FormData();
    const extension = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
    form.append("file", new File([blob], `voice.${extension}`, { type: blob.type }));
    form.append("durationMs", String(Math.min(durationMs, MAX_SECONDS * 1000)));
    form.append("transcript", transcriptRef.current);

    try {
      const res = await fetch(uploadUrl, { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message ?? "Recording upload nahi ho payi.");
        setPhase("idle");
        return;
      }
      setPreview(URL.createObjectURL(blob));
      setPhase("ready");
      onRecorded({
        mediaId: json.mediaId,
        durationMs: json.durationMs,
        playbackUrl: json.playbackUrl,
        pendingReview: Boolean(json.pendingReview),
      });
    } catch {
      setError("Network problem — dobara try kijiye.");
      setPhase("idle");
    }
  }

  function reset() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setTranscript("");
    transcriptRef.current = "";
    setPhase("idle");
    setError(null);
    onCleared?.();
  }

  // Timer tick
  useEffect(() => {
    if (phase !== "recording") return;
    const id = setInterval(() => setElapsedMs(Date.now() - startedAt.current), 100);
    return () => clearInterval(id);
  }, [phase]);

  const remaining = Math.max(0, MAX_SECONDS - Math.floor(elapsedMs / 1000));
  const progress = Math.min(1, elapsedMs / (MAX_SECONDS * 1000));

  return (
    <div className="flex flex-col items-center gap-3">
      {phase === "ready" && preview ? (
        <div className="w-full space-y-3">
          <audio src={preview} controls className="w-full" aria-label="Listen to your recording" />
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-12 items-center gap-2 px-2 text-sm font-medium text-gold-700"
          >
            <RotateCcw className="size-4" />
            Record Again
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            {phase === "recording" && !reduced && (
              <motion.span
                aria-hidden
                className="absolute inset-0 rounded-full bg-gold-400/35"
                animate={{ scale: [1, 1.6], opacity: [0.6, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
              />
            )}

            <motion.button
              type="button"
              disabled={disabled || phase === "uploading"}
              onClick={phase === "recording" ? stop : start}
              whileTap={reduced ? undefined : { scale: 0.94 }}
              transition={spring.snappy}
              aria-label={phase === "recording" ? "Stop recording" : "Record voice note"}
              aria-pressed={phase === "recording"}
              className={cn(
                "relative grid size-16 place-items-center rounded-full shadow-gold transition-colors",
                "focus-visible:ring-2 focus-visible:ring-gold-600 focus-visible:ring-offset-4 focus-visible:ring-offset-bg",
                phase === "recording"
                  ? "bg-gradient-to-b from-gold-300 to-gold-500 text-primary-fg"
                  : "bg-gradient-to-b from-gold-400 to-gold-600 text-primary-fg",
                (disabled || phase === "uploading") && "opacity-50",
              )}
            >
              {phase === "uploading" ? (
                <Loader2 className="size-6 animate-spin" />
              ) : phase === "recording" ? (
                <Square className="size-5 fill-current" />
              ) : (
                <Mic className="size-7" />
              )}
            </motion.button>

            {/* Countdown ring — the cap has to be visible, not a surprise. */}
            {phase === "recording" && (
              <svg aria-hidden className="pointer-events-none absolute -inset-1.5 -rotate-90" viewBox="0 0 76 76">
                <circle cx="38" cy="38" r="36" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-line" />
                <circle
                  cx="38"
                  cy="38"
                  r="36"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  className="text-wine-700"
                  strokeDasharray={2 * Math.PI * 36}
                  strokeDashoffset={2 * Math.PI * 36 * progress}
                />
              </svg>
            )}
          </div>

          <div className="flex h-8 items-center justify-center gap-[3px]" aria-hidden>
            {levels.map((lvl, i) => (
              <motion.span
                key={i}
                className={cn("w-[3px] rounded-full", phase === "recording" ? "bg-gold-500" : "bg-line-strong")}
                animate={{ height: phase === "recording" ? `${lvl * 100}%` : "20%" }}
                transition={{ duration: 0.08 }}
                style={{ minHeight: 4 }}
              />
            ))}
          </div>

          <p className="text-center text-sm text-muted">
            {phase === "recording" ? (
              <span className="font-semibold tabular-nums text-wine-700">{remaining} second baaki</span>
            ) : phase === "uploading" ? (
              "Bhej rahe hain…"
            ) : (
              hint
            )}
          </p>
        </>
      )}

      <AnimatePresence>
        {transcript && phase !== "idle" && (
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="w-full rounded-md border border-line bg-bg-subtle px-3 py-2 text-[0.8125rem] leading-snug text-ink"
          >
            {transcript}
          </motion.p>
        )}
      </AnimatePresence>

      {error && (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-center text-[0.8125rem] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
