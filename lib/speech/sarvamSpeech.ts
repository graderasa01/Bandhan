"use client";

import type { SpeechFailure, SpeechProvider, SpeechResult } from "./SpeechProvider";
import { WebSpeechProvider } from "./webSpeech";
import { toWav16kMono } from "./audioEncode";
import { sarvamVoiceStatus } from "./sarvamConfig";

/**
 * Real STT via Sarvam's Saaras API. No interim results — the REST endpoint
 * is upload-a-whole-clip-get-a-transcript, not a live stream, so unlike Web
 * Speech there is nothing to show while the user is still talking. The
 * waveform (`VoiceCapture`) already carries the "I'm hearing you" signal on
 * its own, and `AnswerInput`'s `processing` state covers the wait after —
 * losing the live caption costs less than it would look like on paper.
 *
 * Falls back to Web Speech transparently — before ever touching the
 * microphone — when Sarvam isn't configured server-side (see
 * `sarvamVoiceStatus`), and on any recording/upload failure once already
 * running.
 */
/**
 * End-of-utterance detection, used only when the caller asks for `autoStop`.
 *
 * `SILENCE_MS` is the pause that counts as "finished speaking". Too short and
 * it cuts people off mid-thought; too long and hands-free feels unresponsive.
 * `LEAD_IN_MS` stops the very first frames — always quiet, before the speaker
 * has begun — from being read as a finished sentence.
 *
 * `MAX_MS` is not a UX choice: Sarvam's STT endpoint rejects clips over 30
 * seconds outright (`Audio duration exceeds the maximum limit of 30 seconds`),
 * so a recording that ran past it would upload only to fail. Stopping early
 * turns "the whole turn is lost" into "a long sentence is transcribed".
 */
const SILENCE_MS = 1500;
const LEAD_IN_MS = 700;
const MAX_MS = 25_000;
/** RMS below this counts as silence — set above typical room noise. */
const SILENCE_RMS = 0.012;

export class SarvamSpeechProvider implements SpeechProvider {
  readonly id = "sarvam-stt";
  private web = new WebSpeechProvider();
  private usingWeb = false;
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private locale = "hi-IN";
  /** Set only while an auto-stopping recording is live; cleared by `teardownAutoStop`. */
  private audioCtx: AudioContext | null = null;
  private silenceTimer: number | null = null;
  private capTimer: number | null = null;

  isAvailable() {
    return (
      typeof window !== "undefined" &&
      (Boolean(navigator.mediaDevices?.getUserMedia) || this.web.isAvailable())
    );
  }

  async start(handlers: {
    onResult: (r: SpeechResult) => void;
    onError: (e: SpeechFailure) => void;
    onEnd: () => void;
    locale?: string;
    autoStop?: boolean;
  }) {
    this.locale = handlers.locale ?? "hi-IN";

    const status = await sarvamVoiceStatus();
    if (!status.stt || !navigator.mediaDevices?.getUserMedia) {
      this.usingWeb = true;
      return this.web.start(handlers);
    }
    this.usingWeb = false;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      handlers.onError("permission_denied");
      return;
    }

    this.chunks = [];
    const recorder = new MediaRecorder(this.stream);
    this.recorder = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };

    recorder.onstop = () => {
      void (async () => {
        this.teardownAutoStop();
        this.stream?.getTracks().forEach((t) => t.stop());
        this.stream = null;

        if (this.chunks.length === 0) {
          handlers.onError("no_speech");
          handlers.onEnd();
          return;
        }

        try {
          const raw = new Blob(this.chunks, { type: recorder.mimeType || "audio/webm" });
          const wav = await toWav16kMono(raw);

          const form = new FormData();
          form.append("file", wav, "answer.wav");
          form.append("locale", this.locale);

          const res = await fetch("/api/speech/stt", { method: "POST", body: form });
          if (!res.ok) throw new Error(`stt ${res.status}`);
          const data = (await res.json()) as { ok: boolean; transcript?: string };

          if (!data.ok || !data.transcript) {
            handlers.onError("no_speech");
          } else {
            handlers.onResult({ transcript: data.transcript, isFinal: true });
          }
        } catch {
          handlers.onError("network");
        } finally {
          handlers.onEnd();
        }
      })();
    };

    recorder.start();
    if (handlers.autoStop) this.armAutoStop();
  }

  /**
   * Watches the live mic level and stops the recorder at the end of the
   * sentence, so a hands-free turn ends without anyone tapping anything.
   *
   * Reads the stream directly rather than the encoded chunks: `MediaRecorder`
   * emits compressed blobs whose size says little about loudness, while an
   * `AnalyserNode` on the same stream gives amplitude for free and costs one
   * timer.
   *
   * Best-effort by design — a browser without Web Audio, or one that refuses
   * the context, simply keeps the old behaviour (runs until `stop()`), and the
   * caller's own guards still apply. Failing to arm must never fail the
   * recording that is already running.
   */
  private armAutoStop() {
    const stream = this.stream;
    if (!stream || typeof window === "undefined") return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;

    try {
      const ctx = new Ctx();
      this.audioCtx = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      const startedAt = Date.now();
      let spoke = false;
      let quietSince: number | null = null;

      const tick = () => {
        if (!this.recorder || this.recorder.state === "inactive") return;
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += v * v;
        const rms = Math.sqrt(sum / buf.length);

        if (rms >= SILENCE_RMS) {
          spoke = true;
          quietSince = null;
        } else if (Date.now() - startedAt > LEAD_IN_MS) {
          quietSince ??= Date.now();
          // Only a pause *after* speech ends the turn. Silence before the user
          // has said anything is them deciding what to say, not a finished
          // sentence — ending there would make live mode unusable for anyone
          // who thinks before speaking.
          if (spoke && Date.now() - quietSince >= SILENCE_MS) {
            this.stop();
            return;
          }
        }
        this.silenceTimer = window.setTimeout(tick, 100);
      };
      this.silenceTimer = window.setTimeout(tick, 100);

      this.capTimer = window.setTimeout(() => this.stop(), MAX_MS);
    } catch {
      this.teardownAutoStop();
    }
  }

  private teardownAutoStop() {
    if (this.silenceTimer !== null) window.clearTimeout(this.silenceTimer);
    if (this.capTimer !== null) window.clearTimeout(this.capTimer);
    this.silenceTimer = null;
    this.capTimer = null;
    void this.audioCtx?.close().catch(() => {});
    this.audioCtx = null;
  }

  stop() {
    if (this.usingWeb) {
      this.web.stop();
      return;
    }
    if (this.recorder && this.recorder.state !== "inactive") {
      // `onstop` tears the watcher down — cancelling the timers here as well
      // would be harmless but redundant.
      this.recorder.stop();
    } else {
      this.teardownAutoStop();
      this.stream?.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
  }
}
