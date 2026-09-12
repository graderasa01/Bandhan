"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSpeechProvider } from "@/lib/speech/webSpeech";
import type { SpeechFailure, SpeechProvider } from "@/lib/speech/SpeechProvider";

/**
 * One microphone for the Discover page — the search box, the confirmation
 * card's "Dobara bolun" and the first-use card all share it.
 *
 * Reuses `createSpeechProvider()` exactly as the profile interview and Grio do
 * (Sarvam/Gemini when configured, the browser's recogniser otherwise), so the
 * transcript that lands here is the same one every other voice surface would
 * produce. Hands-free by design (`autoStop`): a search sentence ends when the
 * speaker pauses, and the final transcript is handed to whoever is listening —
 * the same `/api/discover/intent` call a typed sentence makes. Nothing about
 * speech is special downstream; it is just another way to fill the box.
 */

export type DiscoverVoiceState = "idle" | "listening" | "transcribing";

export interface DiscoverVoice {
  supported: boolean;
  state: DiscoverVoiceState;
  /** Live caption while the browser recogniser is mid-sentence (Sarvam gives none). */
  interim: string;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
}

const ERROR_TEXT: Record<SpeechFailure, string> = {
  not_supported: "Is browser me bol kar search nahi ho sakti — type kar dijiye.",
  permission_denied: "Mic ka access nahi mila — type kar ke bhi search chal jaayegi.",
  no_speech: "Kuch sunai nahi diya. Dobara bolein ya type karein.",
  network: "Internet me dikkat lag rahi hai — type kar ke try karein.",
  unknown: "Awaaz pakad nahi paaye — type kar dijiye.",
};

export function useDiscoverVoice(onTranscript: (text: string) => void): DiscoverVoice {
  const providerRef = useRef<SpeechProvider | null>(null);
  const finalRef = useRef("");
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<DiscoverVoiceState>("idle");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const p = createSpeechProvider();
    providerRef.current = p;
    setSupported(p.isAvailable());
    return () => p.stop();
  }, []);

  const start = useCallback(async () => {
    const p = providerRef.current;
    if (!p) return;
    setError(null);
    finalRef.current = "";
    setInterim("");
    setState("listening");
    await p.start({
      locale: "hi-IN",
      autoStop: true,
      onResult: (r) => {
        if (r.isFinal) {
          finalRef.current = `${finalRef.current} ${r.transcript}`.trim();
          setInterim(finalRef.current);
        } else {
          setInterim(`${finalRef.current} ${r.transcript}`.trim());
        }
      },
      onError: (e) => {
        setError(ERROR_TEXT[e]);
        setState("idle");
        setInterim("");
        p.stop();
      },
      onEnd: () => {
        const text = finalRef.current.trim();
        setState("idle");
        setInterim("");
        if (text.length > 0) onTranscriptRef.current(text);
      },
    });
  }, []);

  const stop = useCallback(() => {
    providerRef.current?.stop();
    // Sarvam knows nothing until the upload returns; the browser recogniser
    // already has the words. Either way the sentence is on its way.
    setState((s) => (s === "listening" ? "transcribing" : s));
  }, []);

  return { supported, state, interim, error, start, stop };
}
