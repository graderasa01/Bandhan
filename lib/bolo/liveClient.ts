"use client";

import { BOLO_KICKOFF_TEXT, BOLO_LIVE_MODEL, boloLiveConfig, isBoloMode, type BoloMode } from "./agent";
import { MicGate, blockRms } from "./micGate";

/**
 * The browser half of Grio's live voice: one WebSocket to Gemini Live, the
 * microphone going up as 16 kHz PCM, Grio's voice coming down as 24 kHz PCM,
 * and the model's tool calls handed to whoever owns the draft.
 *
 * Deliberately a plain class with callbacks rather than a hook: the audio
 * graph, the socket and the playback queue all outlive any single render,
 * and React only needs to know the handful of facts `onEvent` reports.
 *
 * ## Auth
 *
 * A one-use ephemeral token from `/api/bolo/live-token`, connected to the
 * *constrained* endpoint. The token already carries the model, Grio's brief
 * and the tool list; the setup message repeats the same values (the server
 * ignores anything the lock forbids), so the two can never disagree.
 *
 * ## Two briefs
 *
 * The page says which brief it is showing (`mode`) and what to say first
 * (`kickoffText` — a member's opening turn lists what is already filled). The
 * token route decides the brief from the session and reports it back; a
 * mismatch fails the start (`session_changed`) instead of running a guest
 * conversation on a member's page, or the other way round.
 *
 * ## Barge-in
 *
 * Gemini's own voice-activity detection decides when the visitor is talking
 * over Grio and sends `interrupted`; everything still queued for the speaker
 * is dropped on the spot. The mic stays open throughout — half-duplex would
 * make interruption impossible. Two things keep that from turning every
 * phone into a heckler: the detector itself is tuned to need a real stretch
 * of speech (`BOLO_ACTIVITY_DETECTION` in agent.ts), and while Grio's audio
 * is playing the capture goes through `MicGate`, which lets through only
 * what is clearly louder than the room — so the browser's echo canceller
 * (`echoCancellation: true`) no longer has to be perfect for Grio to finish
 * her own sentence.
 *
 * ## Phones
 *
 * Grio's audio is scheduled with a small cushion (`PREROLL_S`) whenever the
 * queue has drained, so a late frame on a jittery mobile link plays into
 * slack instead of a gap. A screen wake lock is held for the session — a
 * two-minute conversation has no taps in it, and a phone that dims and locks
 * halfway takes the mic and the audio context down with it.
 */

const WS_ENDPOINT =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";
const INPUT_RATE = 16_000;
const OUTPUT_RATE = 24_000;
/** ~80 ms of audio per socket frame at a 48 kHz device rate. */
const CAPTURE_FRAMES = 4096;
const SETUP_TIMEOUT_MS = 10_000;
/** No word, turn or tool call for this long and the session ends itself — long enough to read an SMS and type its code. */
const IDLE_MS = 120_000;
/** Gemini caps an audio session at 15 minutes; this leaves headroom for the goodbye. */
const MAX_SESSION_MS = 12 * 60 * 1000;
/** Cushion re-established whenever playback has drained — jitter up to this much never opens a gap mid-word. */
const PREROLL_S = 0.18;
/** After Grio's last sample the mic stays shielded this long: the echo tail, and the canceller catching up. */
const SHIELD_TAIL_S = 0.25;
/** Mic level is reported in steps of this; below it the orb cannot show the difference, so the page is not re-rendered for it. */
const LEVEL_STEP = 0.05;

export type LiveStatus = "idle" | "connecting" | "listening" | "speaking" | "closed";

export type LiveEndReason = "user" | "idle" | "max_session" | "go_away" | "network" | "finished";

export type LiveFailure =
  | "not_configured"
  | "disabled"
  | "rate_limited"
  | "token"
  | "socket"
  | "mic_denied"
  | "unsupported"
  /** The token came back for a different brief than the page is showing — signed in or out in another tab. */
  | "session_changed";

export type LiveEvent =
  | { type: "status"; status: LiveStatus }
  | { type: "level"; level: number }
  | { type: "transcript"; role: "user" | "grio"; text: string; final: boolean }
  | { type: "turn_complete" }
  | { type: "interrupted" }
  | { type: "ended"; reason: LiveEndReason }
  | { type: "failed"; failure: LiveFailure };

export interface ToolCallRequest {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface LiveHandlers {
  onEvent: (event: LiveEvent) => void;
  /** Runs every tool the model asks for and returns the responses, in order. */
  onToolCalls: (calls: ToolCallRequest[]) => Promise<Array<Record<string, unknown>>>;
}

export interface LiveSessionOptions {
  /** The brief the page is showing — a visitor's, or a signed-in member's. Defaults to the visitor's. */
  mode?: BoloMode;
  /** The first thing said to the model, so Grio speaks first. Defaults to the visitor's opening. */
  kickoffText?: string;
}

type LiveToken = { token: string; model: string; voice: string; mode?: unknown };

type ServerMessage = {
  setupComplete?: unknown;
  serverContent?: {
    modelTurn?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string }; text?: string }> };
    turnComplete?: boolean;
    interrupted?: boolean;
    generationComplete?: boolean;
    inputTranscription?: { text?: string; finished?: boolean };
    outputTranscription?: { text?: string; finished?: boolean };
  };
  toolCall?: { functionCalls?: Array<{ id?: string; name?: string; args?: Record<string, unknown> }> };
  toolCallCancellation?: { ids?: string[] };
  goAway?: { timeLeft?: string };
  error?: unknown;
};

export function isLiveVoiceSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof WebSocket !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    Boolean(window.AudioContext || (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext)
  );
}

/* ------------------------------------------------------------------ */
/* PCM helpers                                                         */
/* ------------------------------------------------------------------ */

function downsampleToPcm16(input: Float32Array, sourceRate: number): Uint8Array {
  const ratio = sourceRate / INPUT_RATE;
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

function rms(input: Float32Array): number {
  return blockRms(input);
}

function scaled(input: Float32Array, gain: number): Float32Array {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) out[i] = input[i] * gain;
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

function base64ToFloat32(b64: string): Float32Array<ArrayBuffer> {
  const binary = atob(b64);
  const len = binary.length >> 1;
  const out = new Float32Array(new ArrayBuffer(len * 4));
  for (let i = 0; i < len; i++) {
    const lo = binary.charCodeAt(i * 2);
    const hi = binary.charCodeAt(i * 2 + 1);
    let sample = (hi << 8) | lo;
    if (sample >= 0x8000) sample -= 0x10000;
    out[i] = sample / 0x8000;
  }
  return out;
}

/** The capture processor, registered from a blob URL so nothing needs a public/ file. */
const WORKLET_SOURCE = `
class BtPcmCapture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor("bt-pcm-capture", BtPcmCapture);
`;

/* ------------------------------------------------------------------ */
/* The session                                                         */
/* ------------------------------------------------------------------ */

export class GrioLiveSession {
  private handlers: LiveHandlers;
  private mode: BoloMode;
  private kickoffText: string;
  private socket: WebSocket | null = null;
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private captureNode: AudioWorkletNode | ScriptProcessorNode | null = null;
  private captureSource: MediaStreamAudioSourceNode | null = null;
  private pending: Float32Array[] = [];
  private pendingFrames = 0;
  private playing = new Set<AudioBufferSourceNode>();
  private nextPlayAt = 0;
  private status: LiveStatus = "idle";
  private closed = false;
  private idleTimer: number | null = null;
  private sessionTimer: number | null = null;
  private speakingTimer: number | null = null;
  private lastLevelAt = 0;
  private lastLevel = -1;
  private muted = false;
  private gate = new MicGate();
  private wakeLock: WakeLockSentinel | null = null;
  private onVisible = () => {
    if (document.visibilityState === "visible") void this.holdWakeLock();
  };

  constructor(handlers: LiveHandlers, options: LiveSessionOptions = {}) {
    this.handlers = handlers;
    this.mode = options.mode ?? "guest";
    this.kickoffText = options.kickoffText ?? BOLO_KICKOFF_TEXT;
  }

  get currentStatus(): LiveStatus {
    return this.status;
  }

  /** Must be called from a user gesture — the AudioContext will not start otherwise. */
  async start(): Promise<void> {
    if (!isLiveVoiceSupported()) {
      this.fail("unsupported");
      return;
    }
    this.setStatus("connecting");

    // The audio context first, inside the gesture, so playback is allowed.
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.context = new Ctor();
    await this.context.resume().catch(() => {});

    // Mic permission before the token — a refused mic should not spend a mint.
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      this.fail("mic_denied");
      return;
    }

    let token: LiveToken;
    try {
      const res = await fetch("/api/bolo/live-token", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        const message = body?.message;
        this.fail(
          message === "not_configured" ? "not_configured" : message === "disabled" ? "disabled" : res.status === 429 ? "rate_limited" : "token",
        );
        return;
      }
      token = (await res.json()) as LiveToken;
    } catch {
      this.fail("token");
      return;
    }
    if (this.closed) return;

    // The server locked in a brief from the session. A page showing the other
    // one must not start: a guest brief would ask a signed-in member for their
    // number, a member brief would never create a visitor's account.
    const tokenMode: BoloMode = isBoloMode(token.mode) ? token.mode : "guest";
    if (tokenMode !== this.mode) {
      this.fail("session_changed");
      return;
    }

    try {
      await this.openSocket(token);
    } catch {
      this.fail("socket");
      return;
    }
    if (this.closed) return;

    try {
      await this.startCapture();
    } catch {
      this.fail("mic_denied");
      return;
    }

    this.setStatus("listening");
    this.armIdle();
    this.sessionTimer = window.setTimeout(() => this.end("max_session"), MAX_SESSION_MS);
    void this.holdWakeLock();
    document.addEventListener("visibilitychange", this.onVisible);
    this.send({ realtimeInput: { text: this.kickoffText } });
  }

  /**
   * Keep the screen on for the length of the conversation. Best-effort: an
   * older browser, a low-battery refusal or a hidden tab all leave things
   * exactly as they were, and a lock the OS released (tab went to the
   * background) is asked for again when the tab comes back.
   */
  private async holdWakeLock() {
    if (this.closed || this.wakeLock || !("wakeLock" in navigator)) return;
    try {
      const lock = await navigator.wakeLock.request("screen");
      if (this.closed) {
        void lock.release().catch(() => {});
        return;
      }
      this.wakeLock = lock;
      lock.addEventListener("release", () => {
        if (this.wakeLock === lock) this.wakeLock = null;
      });
    } catch {
      /* not granted — the conversation still works, the screen may just dim */
    }
  }

  /** Typed input, or a note from the page ("user typed the OTP"), into the same conversation. */
  sendText(text: string) {
    if (!text.trim()) return;
    this.send({ realtimeInput: { text } });
    this.armIdle();
  }

  /** Pause the microphone without dropping the session (a modal with the keyboard up). */
  setMuted(muted: boolean) {
    this.muted = muted;
  }

  /** The visitor is done — a deliberate close, not a failure. */
  stop(reason: LiveEndReason = "user") {
    this.end(reason);
  }

  /* ---------------------------- socket ---------------------------- */

  private openSocket(token: LiveToken): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(`${WS_ENDPOINT}?access_token=${encodeURIComponent(token.token)}`);
      this.socket = socket;
      let ready = false;
      const timeout = window.setTimeout(() => {
        if (!ready) reject(new Error("setup_timeout"));
      }, SETUP_TIMEOUT_MS);

      socket.onopen = () => {
        const config = boloLiveConfig(token.voice, this.mode);
        socket.send(
          JSON.stringify({
            setup: {
              model: `models/${token.model || BOLO_LIVE_MODEL}`,
              generationConfig: {
                responseModalities: config.responseModalities,
                temperature: config.temperature,
                speechConfig: config.speechConfig,
              },
              systemInstruction: config.systemInstruction,
              tools: config.tools,
              realtimeInputConfig: config.realtimeInputConfig,
              inputAudioTranscription: {},
              outputAudioTranscription: {},
            },
          }),
        );
      };
      socket.onmessage = async (event) => {
        const raw = typeof event.data === "string" ? event.data : await (event.data as Blob).text();
        let message: ServerMessage;
        try {
          message = JSON.parse(raw) as ServerMessage;
        } catch {
          return;
        }
        if (!ready) {
          if (message.setupComplete !== undefined) {
            ready = true;
            window.clearTimeout(timeout);
            resolve();
          }
          return;
        }
        void this.handleMessage(message);
      };
      socket.onerror = () => {
        if (!ready) {
          window.clearTimeout(timeout);
          reject(new Error("socket_error"));
        }
      };
      socket.onclose = () => {
        if (!ready) {
          window.clearTimeout(timeout);
          reject(new Error("socket_closed"));
          return;
        }
        if (!this.closed) this.end("network");
      };
    });
  }

  private send(payload: unknown) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(payload));
  }

  private async handleMessage(message: ServerMessage) {
    if (message.goAway) {
      this.end("go_away");
      return;
    }
    const content = message.serverContent;
    if (content) {
      if (content.interrupted) {
        this.flushPlayback();
        this.handlers.onEvent({ type: "interrupted" });
      }
      for (const part of content.modelTurn?.parts ?? []) {
        if (part.inlineData?.data) this.enqueueAudio(part.inlineData.data);
      }
      const heard = content.inputTranscription?.text;
      if (heard) {
        this.armIdle();
        this.handlers.onEvent({ type: "transcript", role: "user", text: heard, final: Boolean(content.inputTranscription?.finished) });
      }
      const said = content.outputTranscription?.text;
      if (said) {
        this.handlers.onEvent({ type: "transcript", role: "grio", text: said, final: Boolean(content.outputTranscription?.finished) });
      }
      if (content.turnComplete) {
        this.armIdle();
        this.handlers.onEvent({ type: "turn_complete" });
      }
    }
    if (message.toolCall?.functionCalls?.length) {
      this.armIdle();
      const calls: ToolCallRequest[] = message.toolCall.functionCalls
        .filter((c) => typeof c.name === "string")
        .map((c) => ({ id: c.id ?? "", name: c.name as string, args: (c.args ?? {}) as Record<string, unknown> }));
      let responses: Array<Record<string, unknown>>;
      try {
        responses = await this.handlers.onToolCalls(calls);
      } catch {
        responses = calls.map(() => ({ status: "error" }));
      }
      if (this.closed) return;
      this.send({
        toolResponse: {
          functionResponses: calls.map((c, i) => ({ id: c.id, name: c.name, response: responses[i] ?? { status: "ok" } })),
        },
      });
    }
  }

  /* --------------------------- capture ---------------------------- */

  private async startCapture() {
    const context = this.context;
    const stream = this.stream;
    if (!context || !stream) throw new Error("no_audio");

    const source = context.createMediaStreamSource(stream);
    this.captureSource = source;

    const onFrames = (frames: Float32Array) => {
      if (this.closed) return;
      const now = performance.now();
      if (now - this.lastLevelAt > 80) {
        this.lastLevelAt = now;
        // Quantised, and only on change: a silent room used to re-render the
        // whole page a dozen times a second for a level nobody could see.
        const level = Math.round(Math.min(1, rms(frames) * 8) / LEVEL_STEP) * LEVEL_STEP;
        if (level !== this.lastLevel) {
          this.lastLevel = level;
          this.handlers.onEvent({ type: "level", level });
        }
      }
      if (this.muted) return;
      this.pending.push(frames);
      this.pendingFrames += frames.length;
      if (this.pendingFrames >= CAPTURE_FRAMES) this.flushCapture();
    };

    if (context.audioWorklet) {
      const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "application/javascript" }));
      try {
        await context.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      const node = new AudioWorkletNode(context, "bt-pcm-capture", { numberOfInputs: 1, numberOfOutputs: 0 });
      node.port.onmessage = (e) => onFrames(e.data as Float32Array);
      source.connect(node);
      this.captureNode = node;
    } else {
      // Older WebKit: the deprecated processor still works and is the only option.
      const node = context.createScriptProcessor(2048, 1, 1);
      const silent = context.createGain();
      silent.gain.value = 0;
      node.onaudioprocess = (e) => onFrames(e.inputBuffer.getChannelData(0).slice(0));
      source.connect(node);
      node.connect(silent);
      silent.connect(context.destination);
      this.captureNode = node;
    }
  }

  private flushCapture() {
    if (!this.context || this.pendingFrames === 0) return;
    const merged = new Float32Array(this.pendingFrames);
    let offset = 0;
    for (const chunk of this.pending) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    this.pending = [];
    this.pendingFrames = 0;
    // Shielded while Grio's audio is playing or has only just stopped; the
    // gate then decides what goes out now, and at what gain (see micGate.ts).
    const shielded = this.context.currentTime < this.nextPlayAt + SHIELD_TAIL_S;
    for (const { block, gain } of this.gate.push(merged, blockRms(merged), shielded)) {
      this.sendAudio(gain === 1 ? block : scaled(block, gain));
    }
  }

  private sendAudio(block: Float32Array) {
    if (!this.context) return;
    const pcm = downsampleToPcm16(block, this.context.sampleRate);
    this.send({ realtimeInput: { audio: { data: bytesToBase64(pcm), mimeType: `audio/pcm;rate=${INPUT_RATE}` } } });
  }

  /* --------------------------- playback --------------------------- */

  private enqueueAudio(b64: string) {
    const context = this.context;
    if (!context || this.closed) return;
    const samples = base64ToFloat32(b64);
    if (samples.length === 0) return;
    const buffer = context.createBuffer(1, samples.length, OUTPUT_RATE);
    buffer.copyToChannel(samples, 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    // Chain onto what is already queued; a drained queue (start of a line, or
    // an underrun) restarts with a cushion rather than the next late frame
    // opening another gap.
    const now = context.currentTime;
    const startAt = this.nextPlayAt > now ? this.nextPlayAt : now + PREROLL_S;
    source.start(startAt);
    this.nextPlayAt = startAt + buffer.duration;
    this.playing.add(source);
    source.onended = () => {
      this.playing.delete(source);
      if (this.playing.size === 0) this.setStatus("listening");
    };
    this.setStatus("speaking");
    if (this.speakingTimer !== null) window.clearTimeout(this.speakingTimer);
    // Belt and braces: `onended` can be skipped when a source is stopped early.
    this.speakingTimer = window.setTimeout(
      () => {
        if (this.playing.size === 0) this.setStatus("listening");
      },
      Math.ceil((this.nextPlayAt - context.currentTime) * 1000) + 150,
    );
  }

  private flushPlayback() {
    for (const source of this.playing) {
      try {
        source.onended = null;
        source.stop();
      } catch {
        /* already ended */
      }
    }
    this.playing.clear();
    this.nextPlayAt = 0;
    this.setStatus("listening");
  }

  /* ---------------------------- state ----------------------------- */

  private setStatus(status: LiveStatus) {
    if (this.closed && status !== "closed") return;
    if (this.status === status) return;
    this.status = status;
    this.handlers.onEvent({ type: "status", status });
  }

  private armIdle() {
    if (this.idleTimer !== null) window.clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => this.end("idle"), IDLE_MS);
  }

  private fail(failure: LiveFailure) {
    this.teardown();
    this.handlers.onEvent({ type: "failed", failure });
  }

  private end(reason: LiveEndReason) {
    if (this.closed) return;
    this.teardown();
    this.handlers.onEvent({ type: "ended", reason });
  }

  private teardown() {
    if (this.closed) return;
    this.closed = true;
    if (this.idleTimer !== null) window.clearTimeout(this.idleTimer);
    if (this.sessionTimer !== null) window.clearTimeout(this.sessionTimer);
    if (this.speakingTimer !== null) window.clearTimeout(this.speakingTimer);
    for (const source of this.playing) {
      try {
        source.onended = null;
        source.stop();
      } catch {
        /* already ended */
      }
    }
    this.playing.clear();
    this.gate.reset();
    document.removeEventListener("visibilitychange", this.onVisible);
    if (this.wakeLock) {
      void this.wakeLock.release().catch(() => {});
      this.wakeLock = null;
    }
    if (this.captureNode) {
      if ("port" in this.captureNode) this.captureNode.port.onmessage = null;
      else (this.captureNode as ScriptProcessorNode).onaudioprocess = null;
      this.captureNode.disconnect();
    }
    this.captureSource?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    void this.context?.close().catch(() => {});
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;
      if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) this.socket.close();
    }
    this.socket = null;
    this.captureNode = null;
    this.captureSource = null;
    this.stream = null;
    this.context = null;
    this.status = "closed";
    this.handlers.onEvent({ type: "status", status: "closed" });
  }
}
