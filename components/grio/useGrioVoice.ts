"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSpeechProvider } from "@/lib/speech/webSpeech";
import { createSpeechOutputProvider } from "@/lib/speech/webSpeechOutput";
import { parseGrioSegments } from "@/lib/contracts/grio";
import { useT } from "@/components/i18n/LanguageProvider";
import type { SpeechFailure, SpeechProvider } from "@/lib/speech/SpeechProvider";
import type { SpeechOutputProvider } from "@/lib/speech/SpeechOutputProvider";

/**
 * Grio's ears and voice, pulled out of `GrioChatCore` so the chat keeps
 * reading as a chat.
 *
 * Both providers come from the existing factories, which already resolve
 * Sarvam-when-the-key-is-set and fall back to the browser's own engines on
 * their own (see `createSpeechProvider`). Nothing here should ever branch on
 * which one is running — that is the whole point of `SpeechProvider.ts`.
 *
 * Grio speaks Hinglish, so `hi-IN` is the fixed locale. The profile interview
 * needs a language *picker* because it is transcribing answers that get stored
 * as profile fields, where mishearing Marathi as Hindi produces plausible
 * nonsense. A concierge question is read once by a model that handles
 * code-mixing natively, so the same picker here would be a setting with no
 * consequence.
 */

const LOCALE = "hi-IN";

/** How many silent listens live mode tolerates before ending itself. */
const MAX_SILENT_LISTENS = 3;

const MIC_ERROR: Record<SpeechFailure, { key: string; label: string }> = {
  not_supported: {
    key: "voice.micNotSupported",
    label: "Is browser me mic support nahi hai — likh kar poochiye.",
  },
  permission_denied: {
    key: "voice.micDenied",
    label: "Mic ki permission nahi mili. Browser settings me allow karke dobara try karein.",
  },
  no_speech: { key: "voice.micNoSpeech", label: "Kuch sunayi nahi diya — dobara boliye." },
  network: { key: "voice.micNetwork", label: "Network dikkat ke wajah se sunayi nahi diya." },
  unknown: { key: "voice.micUnknown", label: "Mic nahi chal paya — likh kar poochiye." },
};

/**
 * A finished utterance, handed over exactly once.
 *
 * An object with an incrementing `id` rather than a bare string because two
 * identical answers in a row ("haan", "haan") are a normal thing to say, and a
 * plain string would compare equal and silently drop the second one.
 */
export interface GrioVoiceTurn {
  id: number;
  text: string;
}

export interface GrioVoice {
  /** False when neither Sarvam nor the browser can run speech at all. */
  supported: boolean;
  listening: boolean;
  /** What has been heard so far this recording, interim included. */
  heard: string;
  micError: string | null;
  startListening: () => void;
  stopListening: () => void;
  /** Whether replies should be read aloud. Persisted for the session only. */
  speakReplies: boolean;
  toggleSpeakReplies: () => void;
  speaking: boolean;
  /** Reads an assistant reply aloud, markers stripped. No-op when the toggle is off. */
  speak: (raw: string) => void;
  cancelSpeech: () => void;

  // ── live mode ────────────────────────────────────────────────────────────
  /** Hands-free: Grio reads every reply, then reopens the mic on its own. */
  live: boolean;
  startLive: () => void;
  stopLive: () => void;
  /** Set when a live utterance completes; the caller sends it and clears it. */
  finalTurn: GrioVoiceTurn | null;
  clearFinalTurn: () => void;
}

/**
 * Markers must never reach the speech engine.
 *
 * A raw reply can carry `<<<SEND>>>…` and `<<<ACT:openReel>>>`, and a
 * synthesiser handed those says "less less less ACT colon open reel" out loud.
 * `parseGrioSegments` already splits exactly this — reusing it also means a
 * future marker type is silently excluded here the day it is added, instead of
 * being read aloud until somebody notices.
 */
export function speakableText(raw: string): string {
  return parseGrioSegments(raw)
    .filter((s): s is Extract<typeof s, { type: "text" }> => s.type === "text")
    .map((s) => s.value.trim())
    .join(" ")
    .trim();
}

/**
 * How much of a reply is worth *hearing*.
 *
 * A read reply and a heard reply are not the same message, and sizing them the
 * same is what makes voice assistants tiring. Reading is skimmable — the eye
 * skips a paragraph in a second. Listening is not: it runs at roughly 2.5 words
 * a second and cannot be skipped, so a reply that reads as "a bit long" plays
 * as most of a minute with no way out but to stop it.
 *
 * The numbers this route actually produces make that concrete. A DeepSeek turn
 * here measures 786-900 output tokens; read aloud that is several minutes of
 * uninterruptible speech for an answer the user can see in full on the screen
 * in front of them.
 *
 * Prompting for shorter replies was tried first and abandoned — measured across
 * runs it moved length in both directions and once cut a reply so short the
 * action marker was dropped. So the split happens here instead, where it is
 * arithmetic rather than persuasion: **the screen keeps everything, the ear gets
 * the opening.** Nothing is lost, and the part that is cut is the part the user
 * is already looking at.
 */
const SPOKEN_MAX_SENTENCES = 2;
const SPOKEN_MAX_CHARS = 260;
/** Said only when something was actually held back, so it never becomes noise. */
const SPOKEN_TAIL = " Baaki screen par likha hai.";

export function spokenSummary(raw: string): string {
  const full = speakableText(raw);
  if (full.length <= SPOKEN_MAX_CHARS) return full;

  // Devanagari danda included: a Hindi reply ends its sentences with "।", and
  // splitting only on "." would treat the whole answer as one sentence and fall
  // through to the character cut every time.
  const sentences = full.match(/[^.!?।]+[.!?।]*/g) ?? [full];

  let out = "";
  for (const s of sentences.slice(0, SPOKEN_MAX_SENTENCES)) {
    if (out && (out + s).trim().length > SPOKEN_MAX_CHARS) break;
    out += s;
  }
  out = out.trim();

  // One sentence longer than the whole budget — cut at the last word boundary
  // rather than mid-word, which a synthesiser pronounces as a fragment.
  if (!out) {
    const clipped = full.slice(0, SPOKEN_MAX_CHARS);
    const lastSpace = clipped.lastIndexOf(" ");
    out = (lastSpace > 40 ? clipped.slice(0, lastSpace) : clipped).trim();
  }

  return out.length < full.length ? out + SPOKEN_TAIL : out;
}

export function useGrioVoice(enabled: boolean): GrioVoice {
  const t = useT();
  const sttRef = useRef<SpeechProvider | null>(null);
  const ttsRef = useRef<SpeechOutputProvider | null>(null);
  const finalRef = useRef("");

  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [micError, setMicError] = useState<string | null>(null);
  const [speakReplies, setSpeakReplies] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [live, setLive] = useState(false);
  const [finalTurn, setFinalTurn] = useState<GrioVoiceTurn | null>(null);
  /**
   * Live state read from inside speech callbacks, which are registered once per
   * utterance and would otherwise close over a stale `live`. The ref is what
   * makes "stop" actually stop: a callback holding the old value would reopen
   * the mic one more time after the user had already ended the session.
   */
  const liveRef = useRef(false);
  const turnIdRef = useRef(0);
  /**
   * Consecutive silent listens. Live mode reopens the mic after silence — the
   * user pausing to think must not end the session — but a mic that returns
   * nothing forever (muted input, a device that reports no error) would spin
   * that retry into a tight loop, so it gives up after a few.
   */
  const silentRef = useRef(0);
  /** Set by `startLive`; read inside callbacks that must not close over stale state. */
  const restartRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!enabled) return;
    const stt = createSpeechProvider();
    const tts = createSpeechOutputProvider();
    sttRef.current = stt;
    ttsRef.current = tts;
    setSupported(stt.isAvailable());
    return () => {
      stt.stop();
      tts.cancel();
    };
  }, [enabled]);

  const cancelSpeech = useCallback(() => {
    ttsRef.current?.cancel();
    setSpeaking(false);
  }, []);

  const startListening = useCallback(() => {
    if (!enabled || listening) return;
    // Barge-in: the mic opening always wins over whatever Grio is saying. A
    // user who reaches for the mic mid-answer has already decided they have
    // heard enough, and leaving the reply playing over their question is both
    // rude and a guaranteed transcription failure.
    cancelSpeech();
    setMicError(null);
    finalRef.current = "";
    setHeard("");
    setListening(true);
    void sttRef.current?.start({
      onResult: (r) => {
        if (r.isFinal) finalRef.current = `${finalRef.current} ${r.transcript}`.trim();
        setHeard(r.isFinal ? finalRef.current : `${finalRef.current} ${r.transcript}`.trim());
      },
      onError: (e) => {
        setMicError(t(MIC_ERROR[e].key, MIC_ERROR[e].label));
        setListening(false);
        sttRef.current?.stop();
        if (!liveRef.current) return;
        // In live mode an error is either something the next attempt can get
        // past, or something no number of attempts will. Retrying a denied
        // permission just produces a browser prompt storm; not retrying a
        // dropped network packet ends the session over a hiccup.
        if (e === "no_speech" || e === "network") restartRef.current();
        else liveRef.current = false;
      },
      onEnd: () => {
        // Sarvam only knows what was said once the upload returns, so the final
        // text is read here rather than in `onResult` — the same reason
        // `AnswerInput` submits from `onEnd`.
        setListening(false);
        const text = finalRef.current.trim();
        setHeard(text);
        if (!liveRef.current) return;
        // Hands-free hands the utterance straight on; push-to-talk leaves it in
        // the composer for the user to check. That difference is the whole
        // safety margin of the manual mode and must not be collapsed: in live
        // mode the user has chosen to let a mishearing through, everywhere else
        // they have not.
        if (text) {
          silentRef.current = 0;
          turnIdRef.current += 1;
          setFinalTurn({ id: turnIdRef.current, text });
          return;
        }
        // Heard nothing. Reopening the mic is what makes the session survive a
        // pause; without it the first silence ended live mode with no error and
        // no way back except pressing Stop and starting again.
        silentRef.current += 1;
        if (silentRef.current >= MAX_SILENT_LISTENS) {
          liveRef.current = false;
          setLive(false);
          return;
        }
        restartRef.current();
      },
      locale: LOCALE,
      // The thing that makes hands-free actually hands-free. Push-to-talk ends
      // when the user taps Stop; live mode has no tap, so without this the
      // recorder ran until the page closed — no transcript, no reply, and the
      // whole "Go live" mode looked dead.
      autoStop: liveRef.current,
    });
  }, [enabled, listening, cancelSpeech, t]);

  const stopListening = useCallback(() => {
    sttRef.current?.stop();
    setListening(false);
  }, []);

  const speak = useCallback(
    (raw: string) => {
      if (!enabled || (!speakReplies && !live)) return;
      const text = spokenSummary(raw);
      // A reply that is only markers has nothing to read aloud — but in live
      // mode "nothing to say" must still hand the turn back, or the loop ends
      // on a reply that happened to be a single action chip.
      if (!text) {
        if (liveRef.current) startListening();
        return;
      }
      ttsRef.current?.speak(text, {
        locale: LOCALE,
        onStart: () => setSpeaking(true),
        onEnd: () => {
          setSpeaking(false);
          // The turn-taking rule of the whole live mode: Grio finishes, then
          // listens. Reopening the mic any earlier would feed its own voice
          // back into the recogniser, and any later would need a "your turn"
          // cue the user has to learn.
          if (liveRef.current) startListening();
        },
        onError: () => {
          setSpeaking(false);
          // A synthesiser that fails is a reason to stop talking, not a reason
          // to stop listening.
          if (liveRef.current) startListening();
        },
      });
    },
    [enabled, speakReplies, live, startListening],
  );

  // Kept current so the speech callbacks — registered once per utterance — can
  // reopen the mic without capturing a stale `startListening`.
  restartRef.current = startListening;

  const startLive = useCallback(() => {
    if (!enabled) return;
    liveRef.current = true;
    silentRef.current = 0;
    setLive(true);
    // Opening with the mic rather than with speech: the user pressed a button
    // to talk, so the first move is theirs.
    startListening();
  }, [enabled, startListening]);

  const stopLive = useCallback(() => {
    liveRef.current = false;
    setLive(false);
    setFinalTurn(null);
    stopListening();
    cancelSpeech();
  }, [stopListening, cancelSpeech]);

  const clearFinalTurn = useCallback(() => setFinalTurn(null), []);

  // Losing the panel must end the session — a mic that stays open behind a
  // closed overlay is the worst possible failure mode for this feature.
  useEffect(() => {
    if (!enabled && liveRef.current) stopLive();
  }, [enabled, stopLive]);

  const toggleSpeakReplies = useCallback(() => {
    setSpeakReplies((on) => {
      // Turning it off must silence what is playing right now, not just the
      // next reply — otherwise the switch appears not to work.
      if (on) cancelSpeech();
      return !on;
    });
  }, [cancelSpeech]);

  return {
    supported,
    listening,
    heard,
    micError,
    startListening,
    stopListening,
    speakReplies,
    toggleSpeakReplies,
    speaking,
    speak,
    cancelSpeech,
    live,
    startLive,
    stopLive,
    finalTurn,
    clearFinalTurn,
  };
}
