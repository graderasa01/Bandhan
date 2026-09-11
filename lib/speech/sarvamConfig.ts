"use client";

/**
 * One cached check for whether the server has a Sarvam key configured at
 * all, so `SarvamSpeechProvider` can skip straight to the Web Speech
 * fallback before ever touching the microphone, rather than discovering
 * "not configured" only after the user has already recorded an answer.
 * `SarvamSpeechOutputProvider` (TTS) uses it too, purely to skip a doomed
 * fetch — falling back mid-utterance there costs nothing since it's the
 * AI's own voice waiting on the round trip, not the user's.
 */
export type SpeechRouteStatus = { stt: boolean; tts: boolean; streaming: boolean };

let cached: Promise<SpeechRouteStatus> | null = null;

export function sarvamVoiceStatus(): Promise<SpeechRouteStatus> {
  if (!cached) {
    cached = fetch("/api/speech/config")
      .then((res) => (res.ok ? res.json() : { stt: false, tts: false, streaming: false }))
      .catch(() => ({ stt: false, tts: false, streaming: false }));
  }
  return cached;
}
