"use client";

import type { SpeechFailure, SpeechProvider, SpeechResult } from "./SpeechProvider";
import { SarvamSpeechProvider } from "./sarvamSpeech";

/**
 * Browser-native STT. Chrome and Edge only — Firefox and iOS Safari have no
 * implementation, which is why `isAvailable()` exists and why typing must
 * always stay reachable as an equal path rather than a fallback.
 */

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<
    ArrayLike<{ transcript: string }> & { isFinal: boolean }
  >;
};

type RecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERROR_MAP: Record<string, SpeechFailure> = {
  "not-allowed": "permission_denied",
  "service-not-allowed": "permission_denied",
  "no-speech": "no_speech",
  network: "network",
  aborted: "unknown",
};

export class WebSpeechProvider implements SpeechProvider {
  readonly id = "web-speech";
  private recognition: SpeechRecognitionLike | null = null;
  private stopped = false;

  isAvailable() {
    return getCtor() !== null;
  }

  async start(handlers: {
    onResult: (r: SpeechResult) => void;
    onError: (e: SpeechFailure) => void;
    onEnd: () => void;
    locale?: string;
  }) {
    const Ctor = getCtor();
    if (!Ctor) {
      handlers.onError("not_supported");
      return;
    }

    this.stopped = false;
    const recognition = new Ctor();
    this.recognition = recognition;

    // hi-IN handles Hinglish noticeably better than en-IN: Devanagari-trained
    // acoustic models still transcribe embedded English words, while en-IN
    // mangles the Hindi half. It is only the default, though — a Marathi or
    // Telugu speaker recognised as hi-IN produces confident nonsense.
    recognition.lang = handlers.locale ?? "hi-IN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) final += text;
        else interim += text;
      }
      if (final) handlers.onResult({ transcript: final, isFinal: true });
      else if (interim) handlers.onResult({ transcript: interim, isFinal: false });
    };

    recognition.onerror = (e) => {
      // A no-speech timeout while the user is still thinking is not a failure
      // worth surfacing — the engine restarts itself on the next utterance.
      if (e.error === "no-speech") return;
      handlers.onError(ERROR_MAP[e.error] ?? "unknown");
    };

    recognition.onend = () => {
      // Chrome ends the session on its own after a pause. If the user hasn't
      // pressed stop, resume so a thinking pause doesn't end their answer.
      if (!this.stopped) {
        try {
          recognition.start();
          return;
        } catch {
          /* already restarted — fall through to onEnd */
        }
      }
      handlers.onEnd();
    };

    try {
      recognition.start();
    } catch {
      handlers.onError("unknown");
    }
  }

  stop() {
    this.stopped = true;
    try {
      this.recognition?.stop();
    } catch {
      /* nothing to stop */
    }
    this.recognition = null;
  }
}

export function createSpeechProvider(): SpeechProvider {
  // Sarvam when SARVAM_API_KEY is set server-side, Web Speech otherwise —
  // SarvamSpeechProvider checks and falls back on its own (before ever
  // touching the mic), so this stays a one-line swap.
  return new SarvamSpeechProvider();
}
