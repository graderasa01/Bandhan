"use client";

import type { SpeechOutputProvider } from "./SpeechOutputProvider";
import { SarvamSpeechOutputProvider } from "./sarvamSpeechOutput";

/**
 * Browser-native TTS via `SpeechSynthesis`. Wider support than
 * `SpeechRecognition` (webSpeech.ts) — Safari/iOS has this even though it
 * lacks the input side — so `isAvailable()` is mostly a safety net, not a
 * routine fallback path the way it is for STT.
 */
export class WebSpeechOutputProvider implements SpeechOutputProvider {
  readonly id = "web-speech-output";

  isAvailable() {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  speak(
    text: string,
    opts?: { locale?: string; onStart?: () => void; onEnd?: () => void; onError?: () => void },
  ) {
    if (!this.isAvailable()) return;

    // Never let two questions talk over each other — a fresh one always
    // interrupts whatever was still playing.
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = opts?.locale ?? "hi-IN";
    if (opts?.onStart) utterance.onstart = () => opts.onStart!();
    if (opts?.onEnd) utterance.onend = () => opts.onEnd!();
    if (opts?.onError) utterance.onerror = () => opts.onError!();

    window.speechSynthesis.speak(utterance);
  }

  cancel() {
    if (!this.isAvailable()) return;
    window.speechSynthesis.cancel();
  }
}

export function createSpeechOutputProvider(): SpeechOutputProvider {
  // Sarvam when SARVAM_API_KEY is set server-side, Web Speech otherwise —
  // SarvamSpeechOutputProvider checks and falls back on its own, so this
  // stays a one-line swap exactly like SpeechOutputProvider.ts promises.
  return new SarvamSpeechOutputProvider();
}
