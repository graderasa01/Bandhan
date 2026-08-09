"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ArrowRight, CircleAlert, Keyboard, Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { LANGUAGE_META, type ActionLabels, type SpokenLanguage } from "@/lib/contracts/interview";
import { createSpeechProvider } from "@/lib/speech/webSpeech";
import type { SpeechFailure, SpeechProvider } from "@/lib/speech/SpeechProvider";
import Button from "@/components/ui/Button";
import Textarea from "@/components/ui/Textarea";
import VoiceCapture from "@/components/profile/VoiceCapture";
import { useT } from "@/components/i18n/LanguageProvider";
import type { Translate } from "@/lib/i18n/translate";

function micErrorMessages(t: Translate): Record<SpeechFailure, string> {
  return {
    not_supported: t(
      "profile.answerInput.micError.notSupported",
      "Is browser me bol kar batane wali suvidha nahi hai. Chrome me khol lijiye, ya neeche type kar dijiye.",
    ),
    permission_denied: t(
      "profile.answerInput.micError.permissionDenied",
      "Mic ka access nahi mila. Koi baat nahi — neeche type karke bata dijiye, baat wahi hai.",
    ),
    no_speech: t("profile.answerInput.micError.noSpeech", "Kuch sunai nahi diya. Dobara koshish kijiye ya type kar dijiye."),
    network: t("profile.answerInput.micError.network", "Internet me dikkat lag rahi hai. Type karke bhi bata sakte hain."),
    unknown: t("profile.answerInput.micError.unknown", "Awaaz pakad nahi paaye. Type karke bata dijiye."),
  };
}

/* ------------------------------------------------------------------ */
/* Answer input — mic and typing are the same path, not a fallback     */
/* ------------------------------------------------------------------ */

export interface AnswerInputHandle {
  /**
   * Auto-listen after the AI finishes asking — called from the TTS `onEnd`
   * callback, not a user tap, so it no-ops rather than fights the user
   * whenever voice isn't the right move right now: already listening/typing
   * an answer, mid-turn, or they've switched to the keyboard on purpose.
   */
  startListening: () => void;
}

interface AnswerInputProps {
  hint: string;
  busy: boolean;
  onSubmit: (text: string) => void;
  /** Listen in the language the user last answered in, not always Hindi. */
  language: SpokenLanguage;
  actions: ActionLabels;
  /**
   * Fires on every partial speech result, not just the final one — lets the
   * rail run cheap tier-0 keyword detection while the user is still talking,
   * well before the turn is submitted.
   */
  onInterimChange?: (text: string) => void;
  /** Tighter spacing/sizing for the voice-question swipe-deck card. */
  compact?: boolean;
  /**
   * Fires the instant the mic starts listening — not on every render, only
   * the tap. Lets the caller cut off its own TTS mid-sentence (barge-in):
   * tapping the mic is a clear enough signal "I don't need to hear the rest"
   * that leaving the AI's voice running over the user's own answer would
   * read as the app not listening, not as politeness.
   */
  onListenStart?: () => void;
}

const AnswerInput = forwardRef<AnswerInputHandle, AnswerInputProps>(function AnswerInput({
  hint,
  busy,
  onSubmit,
  language,
  actions,
  onInterimChange,
  compact = false,
  onListenStart,
}, ref) {
  const t = useT();
  const MIC_ERROR = micErrorMessages(t);
  const [mode, setMode] = useState<"voice" | "type">("voice");
  const [listening, setListening] = useState(false);
  /**
   * True from the moment "stop" is tapped until the provider hands back a
   * final transcript. Near-instant for Web Speech (already accumulated live
   * via onResult), a real network wait for Sarvam (nothing is known until
   * the recording finishes uploading and transcribing). Feeds the same
   * "thinking" mic state `busy` does — both mean "hold on, I heard you".
   */
  const [transcribing, setTranscribing] = useState(false);
  const [heard, setHeard] = useState("");
  const [typed, setTyped] = useState("");
  const [micError, setMicError] = useState<string | null>(null);
  /** One-shot: true for a beat after `busy` falls, then clears itself. */
  const [justLanded, setJustLanded] = useState(false);
  const wasBusy = useRef(false);

  useEffect(() => {
    if (busy) {
      wasBusy.current = true;
      return;
    }
    if (!wasBusy.current) return;
    wasBusy.current = false;
    setJustLanded(true);
    const t = setTimeout(() => setJustLanded(false), 900);
    return () => clearTimeout(t);
  }, [busy]);
  const providerRef = useRef<SpeechProvider | null>(null);
  const finalRef = useRef("");

  useEffect(() => {
    const p = createSpeechProvider();
    providerRef.current = p;
    if (!p.isAvailable()) setMode("type");
    return () => p.stop();
  }, []);

  const startListening = useCallback(async () => {
    onListenStart?.();
    setMicError(null);
    finalRef.current = "";
    setHeard("");
    setTranscribing(false);
    setListening(true);
    await providerRef.current?.start({
      onResult: (r) => {
        let combined: string;
        if (r.isFinal) {
          finalRef.current = `${finalRef.current} ${r.transcript}`.trim();
          combined = finalRef.current;
        } else {
          combined = `${finalRef.current} ${r.transcript}`.trim();
        }
        setHeard(combined);
        onInterimChange?.(combined);
      },
      onError: (e) => {
        setMicError(MIC_ERROR[e]);
        setListening(false);
        setTranscribing(false);
        setMode("type");
        providerRef.current?.stop();
      },
      // The one place a turn actually submits — guaranteed to run after
      // every onResult for this recording, whether the provider finalized
      // the transcript live (Web Speech, where finalRef is already complete
      // by the time this fires) or only right here (Sarvam, which doesn't
      // know what was said until the upload comes back).
      onEnd: () => {
        setTranscribing(false);
        const text = finalRef.current.trim();
        if (text.length > 0) onSubmit(text);
        onInterimChange?.("");
      },
      locale: LANGUAGE_META[language].locale,
    });
  }, [language, onInterimChange, onSubmit, onListenStart]);

  const stopListening = useCallback(() => {
    providerRef.current?.stop();
    setListening(false);
    setTranscribing(true);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      startListening: () => {
        // `busy` is deliberately NOT checked here — fast pace asks (and
        // listens for) the next question while the previous answer is still
        // being understood in the background. Waiting for `busy` to clear
        // would silently block the mic from ever opening for that next
        // question, since it can easily still be true when the AI finishes
        // asking it.
        if (mode !== "voice" || listening || transcribing) return;
        void startListening();
      },
    }),
    [mode, listening, transcribing, startListening],
  );

  const canType = typed.trim().length > 0;

  return (
    <div className={compact ? "space-y-2.5" : "space-y-4"}>
      {mode === "voice" ? (
        <>
          <VoiceCapture
            compact={compact}
            recording={listening}
            // `processing` only paints the thinking-ring when the button is at
            // rest — the moment `listening` flips true (a new turn started
            // while an earlier one is still in flight) the button shows the
            // live waveform instead, which is exactly the point: the mic is
            // never blocked waiting for a round trip that is running in the
            // background (see the submit queue in InterviewMode).
            processing={busy || transcribing}
            success={justLanded}
            transcript={heard || undefined}
            hint={hint}
            onStart={startListening}
            onStop={stopListening}
          />
          <p className={cn("text-center text-muted", compact ? "text-[0.75rem]" : "text-[0.8125rem]")}>
            <button
              type="button"
              onClick={() => setMode("type")}
              className={cn(
                "inline-flex touch-target items-center gap-1.5 font-semibold text-primary-text underline underline-offset-4",
                compact ? "min-h-8" : "min-h-12",
              )}
            >
              <Keyboard className="size-4" />
              {actions.type}
            </button>
          </p>
        </>
      ) : (
        <>
          <Textarea
            value={typed}
            rows={compact ? 2 : 3}
            disabled={busy}
            placeholder={hint}
            onChange={(e) => setTyped(e.target.value)}
          />
          <div className="flex flex-col gap-3 sm:flex-row-reverse">
            <Button
              fullWidth
              disabled={!canType || busy}
              loading={busy}
              onClick={() => {
                const text = typed.trim();
                setTyped("");
                onSubmit(text);
              }}
            >
              {t("profile.answerInput.continue", "Continue")}
              <ArrowRight className="size-4" />
            </Button>
            {providerRef.current?.isAvailable() && (
              <Button variant="secondary" fullWidth disabled={busy} onClick={() => setMode("voice")}>
                <Mic className="size-4" />
                {t("profile.answerInput.speakInstead", "Bol kar bataunga")}
              </Button>
            )}
          </div>
        </>
      )}

      {micError && (
        <p
          role="alert"
          className="flex items-start gap-2.5 rounded-md border border-warn/30 bg-warn-bg px-4 py-3 text-[0.8125rem] leading-snug text-warn"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          {micError}
        </p>
      )}
    </div>
  );
});

export default AnswerInput;
