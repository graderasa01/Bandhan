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
export class SarvamSpeechProvider implements SpeechProvider {
  readonly id = "sarvam-stt";
  private web = new WebSpeechProvider();
  private usingWeb = false;
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private locale = "hi-IN";

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
  }

  stop() {
    if (this.usingWeb) {
      this.web.stop();
      return;
    }
    if (this.recorder && this.recorder.state !== "inactive") {
      this.recorder.stop();
    } else {
      this.stream?.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
  }
}
