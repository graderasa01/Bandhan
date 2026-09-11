"use client";

import type { SpeechFailure, SpeechProvider, SpeechResult } from "./SpeechProvider";

/**
 * Gemini Live's dedicated streaming transcription model.
 *
 * The permanent Gemini key never reaches the browser. A signed-in user asks
 * `/api/speech/live-token` for a one-use, short-lived token constrained to
 * this model and text-only transcription, then the microphone connects
 * directly to Google's WebSocket. That keeps latency low without turning the
 * deployed API key into a view-source secret.
 *
 * This provider is intentionally only the *ears*. The existing profile flow
 * still owns the questions, confirmation and database writes, so a live model
 * can never invent a field or save an answer without the same extractor and
 * review screen every other input method uses.
 */

const MODEL = "gemini-3.5-transcribe-live";
// Ephemeral tokens only open the *constrained* endpoint — the plain
// `BidiGenerateContent` one wants a real API key.
const WS_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";
const SETUP_TIMEOUT_MS = 8_000;
const FINAL_TIMEOUT_MS = 4_000;

type Handlers = {
  onResult: (r: SpeechResult) => void;
  onError: (e: SpeechFailure) => void;
  onEnd: () => void;
  locale?: string;
  autoStop?: boolean;
};

type LiveMessage = {
  setupComplete?: unknown;
  serverContent?: {
    interimInputTranscription?: { text?: string };
    inputTranscription?: { text?: string };
    generationComplete?: boolean;
    turnComplete?: boolean;
  };
};

/** Cheap mono downsample plus float -> signed 16-bit little-endian PCM. */
function pcm16(input: Float32Array, sourceRate: number): Uint8Array {
  const ratio = sourceRate / 16_000;
  const frames = Math.max(1, Math.floor(input.length / ratio));
  const out = new Uint8Array(frames * 2);
  const view = new DataView(out.buffer);

  for (let i = 0; i < frames; i++) {
    const from = Math.floor(i * ratio);
    const to = Math.max(from + 1, Math.min(input.length, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let j = from; j < to; j++) sum += input[j];
    const sample = Math.max(-1, Math.min(1, sum / (to - from)));
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export class GeminiLiveSpeechProvider implements SpeechProvider {
  readonly id = "gemini-live-stt";

  private socket: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private silentGain: GainNode | null = null;
  private handlers: Handlers | null = null;
  private finalTimer: number | null = null;
  private stopping = false;
  private finished = false;
  private sawText = false;

  isAvailable() {
    return (
      typeof window !== "undefined" &&
      typeof WebSocket !== "undefined" &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      Boolean(window.AudioContext)
    );
  }

  async start(handlers: Handlers): Promise<void> {
    if (!this.isAvailable()) throw new Error("gemini_live_not_supported");
    this.dispose(false);
    this.handlers = handlers;
    this.stopping = false;
    this.finished = false;
    this.sawText = false;

    const tokenRes = await fetch("/api/speech/live-token", {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    if (!tokenRes.ok) throw new Error(`gemini_live_token_${tokenRes.status}`);
    const tokenBody = (await tokenRes.json()) as { token?: string; model?: string };
    if (!tokenBody.token) throw new Error("gemini_live_token_missing");

    const socket = new WebSocket(`${WS_URL}?access_token=${encodeURIComponent(tokenBody.token)}`);
    this.socket = socket;

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("gemini_live_setup_timeout")), SETUP_TIMEOUT_MS);
      let ready = false;

      socket.onopen = () => {
        socket.send(
          JSON.stringify({
            setup: {
              model: `models/${tokenBody.model ?? MODEL}`,
              generationConfig: { responseModalities: ["TEXT"] },
              inputAudioTranscription: { languageCodes: [], mode: "SMART" },
            },
          }),
        );
      };
      socket.onmessage = (event) => {
        const message = this.readMessage(event.data);
        if (!message) return;
        if (!ready && message.setupComplete !== undefined) {
          ready = true;
          window.clearTimeout(timeout);
          resolve();
          return;
        }
        if (ready) this.handleMessage(message);
      };
      socket.onerror = () => {
        if (!ready) {
          window.clearTimeout(timeout);
          reject(new Error("gemini_live_socket_error"));
        } else {
          this.fail("network");
        }
      };
      socket.onclose = () => {
        if (!ready || this.finished || this.stopping) return;
        this.fail("network");
      };
    }).catch((error) => {
      this.dispose(false);
      throw error;
    });

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      this.fail("permission_denied");
      return;
    }

    const context = new AudioContext();
    this.context = context;
    await context.resume();
    const source = context.createMediaStreamSource(this.stream);
    // 2048 frames at a typical 48kHz input is ~43ms, inside Gemini Live's
    // recommended small-chunk range while still being gentle on older phones.
    const processor = context.createScriptProcessor(2048, 1, 1);
    const silentGain = context.createGain();
    silentGain.gain.value = 0;

    this.source = source;
    this.processor = processor;
    this.silentGain = silentGain;
    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(context.destination);

    processor.onaudioprocess = (event) => {
      if (this.stopping || this.socket?.readyState !== WebSocket.OPEN) return;
      const bytes = pcm16(event.inputBuffer.getChannelData(0), context.sampleRate);
      this.socket.send(
        JSON.stringify({
          realtimeInput: {
            audio: { data: toBase64(bytes), mimeType: "audio/pcm;rate=16000" },
          },
        }),
      );
    };
  }

  stop() {
    if (this.finished || this.stopping) return;
    this.stopping = true;
    this.stopCapture();

    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
    }

    // A final transcript normally arrives almost immediately after
    // audioStreamEnd. The timeout keeps a dropped final packet from leaving the
    // UI in its "samajh raha hoon" state forever.
    this.finalTimer = window.setTimeout(() => this.finish(), this.sawText ? 250 : FINAL_TIMEOUT_MS);
  }

  private readMessage(data: unknown): LiveMessage | null {
    try {
      if (typeof data === "string") return JSON.parse(data) as LiveMessage;
      return null;
    } catch {
      return null;
    }
  }

  private handleMessage(message: LiveMessage) {
    const content = message.serverContent;
    if (!content) return;

    const interim = content.interimInputTranscription?.text?.trim();
    if (interim) {
      this.sawText = true;
      this.handlers?.onResult({ transcript: interim, isFinal: false });
    }

    const final = content.inputTranscription?.text?.trim();
    if (final) {
      this.sawText = true;
      this.handlers?.onResult({ transcript: final, isFinal: true });

      if (this.handlers?.autoStop && !this.stopping) {
        this.stopping = true;
        this.stopCapture();
        if (this.socket?.readyState === WebSocket.OPEN) {
          this.socket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
        }
      }
      if (this.stopping) {
        if (this.finalTimer !== null) window.clearTimeout(this.finalTimer);
        this.finalTimer = window.setTimeout(() => this.finish(), 120);
      }
    }

    if (this.stopping && (content.generationComplete || content.turnComplete)) this.finish();
  }

  private fail(reason: SpeechFailure) {
    if (this.finished) return;
    const handlers = this.handlers;
    this.dispose(false);
    this.finished = true;
    handlers?.onError(reason);
  }

  private finish() {
    if (this.finished) return;
    const handlers = this.handlers;
    const heardAnything = this.sawText;
    this.dispose(false);
    this.finished = true;
    if (!heardAnything) handlers?.onError("no_speech");
    handlers?.onEnd();
  }

  private stopCapture() {
    if (this.processor) {
      this.processor.onaudioprocess = null;
      this.processor.disconnect();
    }
    this.source?.disconnect();
    this.silentGain?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    void this.context?.close().catch(() => {});
    this.processor = null;
    this.source = null;
    this.silentGain = null;
    this.stream = null;
    this.context = null;
  }

  private dispose(callEnd: boolean) {
    if (this.finalTimer !== null) window.clearTimeout(this.finalTimer);
    this.finalTimer = null;
    this.stopCapture();
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;
      if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
        this.socket.close();
      }
    }
    this.socket = null;
    const handlers = this.handlers;
    this.handlers = null;
    if (callEnd) handlers?.onEnd();
  }
}
