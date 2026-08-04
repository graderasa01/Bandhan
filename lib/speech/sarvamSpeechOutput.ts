"use client";

import type { SpeechOutputProvider } from "./SpeechOutputProvider";
import { WebSpeechOutputProvider } from "./webSpeechOutput";
import { sarvamVoiceStatus } from "./sarvamConfig";

/**
 * Real TTS via Sarvam's Bulbul API — the server-side proxy at
 * `/api/speech/tts` keeps the key off the client — with the free browser
 * voice as an automatic fallback. Not configured, out of quota, or a
 * network blip all land on the same Web Speech utterance instead;
 * `speak()` has no return value for a caller to branch on (see
 * `SpeechOutputProvider`'s own doc), so nothing above this ever learns
 * which one actually spoke.
 */
export class SarvamSpeechOutputProvider implements SpeechOutputProvider {
  readonly id = "sarvam-tts";
  private web = new WebSpeechOutputProvider();
  private audio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  // Bumped on every speak()/cancel() so a slow in-flight request from a
  // superseded utterance can never play over (or fall back on top of) a
  // fresher one.
  private token = 0;

  isAvailable() {
    return typeof window !== "undefined";
  }

  speak(
    text: string,
    opts?: { locale?: string; onStart?: () => void; onEnd?: () => void; onError?: () => void },
  ) {
    this.cancel();
    const myToken = ++this.token;
    const fallback = () => {
      if (myToken !== this.token) return;
      this.web.speak(text, opts);
    };

    void (async () => {
      try {
        const status = await sarvamVoiceStatus();
        if (myToken !== this.token) return;
        if (!status.tts) {
          fallback();
          return;
        }

        const res = await fetch("/api/speech/tts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text, locale: opts?.locale ?? "hi-IN" }),
        });
        if (myToken !== this.token) return;
        if (!res.ok) {
          fallback();
          return;
        }

        const blob = await res.blob();
        if (myToken !== this.token) return;

        const url = URL.createObjectURL(blob);
        this.objectUrl = url;
        const audio = new Audio(url);
        this.audio = audio;
        audio.onplay = () => opts?.onStart?.();
        audio.onended = () => opts?.onEnd?.();
        audio.onerror = () => fallback();
        await audio.play();
      } catch {
        fallback();
      }
    })();
  }

  cancel() {
    this.token++;
    if (this.audio) {
      this.audio.pause();
      this.audio.src = "";
      this.audio = null;
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.web.cancel();
  }
}
