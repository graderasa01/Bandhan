"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSpeechProvider } from "@/lib/speech/webSpeech";
import { createSpeechOutputProvider } from "@/lib/speech/webSpeechOutput";
import { parseGrioSegments } from "@/lib/contracts/grio";
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

const MIC_ERROR: Record<SpeechFailure, string> = {
  not_supported: "Is browser me mic support nahi hai — likh kar poochiye.",
  permission_denied: "Mic ki permission nahi mili. Browser settings me allow karke dobara try karein.",
  no_speech: "Kuch sunayi nahi diya — dobara boliye.",
  network: "Network dikkat ke wajah se sunayi nahi diya.",
  unknown: "Mic nahi chal paya — likh kar poochiye.",
};

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

export function useGrioVoice(enabled: boolean): GrioVoice {
  const sttRef = useRef<SpeechProvider | null>(null);
  const ttsRef = useRef<SpeechOutputProvider | null>(null);
  const finalRef = useRef("");

  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [micError, setMicError] = useState<string | null>(null);
  const [speakReplies, setSpeakReplies] = useState(false);
  const [speaking, setSpeaking] = useState(false);

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
        setMicError(MIC_ERROR[e]);
        setListening(false);
        sttRef.current?.stop();
      },
      onEnd: () => {
        // Sarvam only knows what was said once the upload returns, so the final
        // text is read here rather than in `onResult` — the same reason
        // `AnswerInput` submits from `onEnd`.
        setListening(false);
        setHeard(finalRef.current.trim());
      },
      locale: LOCALE,
    });
  }, [enabled, listening, cancelSpeech]);

  const stopListening = useCallback(() => {
    sttRef.current?.stop();
    setListening(false);
  }, []);

  const speak = useCallback(
    (raw: string) => {
      if (!enabled || !speakReplies) return;
      const text = speakableText(raw);
      if (!text) return;
      ttsRef.current?.speak(text, {
        locale: LOCALE,
        onStart: () => setSpeaking(true),
        onEnd: () => setSpeaking(false),
        onError: () => setSpeaking(false),
      });
    },
    [enabled, speakReplies],
  );

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
  };
}
