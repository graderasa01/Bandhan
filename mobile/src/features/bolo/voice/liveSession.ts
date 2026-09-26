import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { Platform } from "react-native";
import { ApiError, api } from "~/services/api/client";
import { BOLO_LIVE_MODEL, boloLiveConfig, isBoloMode, type BoloMode } from "~/shared/bolo/agent";
import { MicGate, blockRms } from "~/shared/bolo/micGate";
import { createVoiceIO, voiceIOSupported, type VoiceIO } from "./io";
import { INPUT_RATE, base64ToBytes, bytesToBase64, downsampleToPcm16, scaled } from "./pcm";
import type { LiveEndReason, LiveFailure, LiveHandlers, LiveSession, LiveSessionOptions, LiveStatus, ToolCallRequest } from "./types";

/**
 * Grio's live voice in the app — the web's `lib/bolo/liveClient.ts`, line for
 * line where it can be: the same constrained Gemini Live endpoint, the same
 * one-use token from `/api/bolo/live-token` (whose brief the server picks from
 * the session and reports back as `mode`), the same setup message built from
 * the shared `boloLiveConfig`, the same tool-call round trip, the same
 * barge-in and the same idle and session limits. Only the audio is different
 * (`./io`: `expo-audio` on a phone, Web Audio in the web preview).
 *
 * ## Echo, without a platform echo canceller
 *
 * A browser cancels most of Grio's own voice out of the mic; the phone's
 * stream here offers no such switch. So while her audio plays, the mic gate
 * (the web's own `MicGate`) is shown the capture at a third of its loudness:
 * her voice leaking back from the loudspeaker stays under the gate, while a
 * person talking straight into the phone still opens it and interrupts her.
 */

const WS_ENDPOINT =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";
const SETUP_TIMEOUT_MS = 10_000;
/** No word, turn or tool call for this long and the session ends itself. */
const IDLE_MS = 120_000;
/** Gemini caps an audio session at 15 minutes; this leaves headroom for the goodbye. */
const MAX_SESSION_MS = 12 * 60 * 1000;
/** After Grio's last sample the mic stays shielded this long. */
const SHIELD_TAIL_MS = 250;
/** The gate reasons in ~85 ms blocks (MIC_GATE's tuning). */
const BLOCK_SECONDS = 0.085;
const LEVEL_STEP = 0.05;
/** See "Echo, without a platform echo canceller". The web keeps 1 — its browser cancels echo. */
const NATIVE_SHIELD_SCALE = Platform.OS === "web" ? 1 : 0.33;
const KEEP_AWAKE_TAG = "grio-live";

type LiveToken = { ok?: boolean; token: string; model: string; voice: string; mode?: unknown };

type ServerMessage = {
  setupComplete?: unknown;
  serverContent?: {
    modelTurn?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string }; text?: string }> };
    turnComplete?: boolean;
    interrupted?: boolean;
    inputTranscription?: { text?: string; finished?: boolean };
    outputTranscription?: { text?: string; finished?: boolean };
  };
  toolCall?: { functionCalls?: Array<{ id?: string; name?: string; args?: Record<string, unknown> }> };
  goAway?: unknown;
};

export function isLiveVoiceSupported(): boolean {
  return voiceIOSupported();
}

export function createLiveSession(handlers: LiveHandlers, options: LiveSessionOptions): LiveSession {
  return new GrioLiveSession(handlers, options);
}

/** UTF-8 for a binary socket frame — `TextDecoder` where the runtime has it. */
function utf8(bytes: ArrayBuffer): string {
  if (typeof TextDecoder !== "undefined") return new TextDecoder().decode(bytes);
  const b = new Uint8Array(bytes);
  let out = "";
  for (let i = 0; i < b.length; ) {
    const c = b[i++]!;
    if (c < 0x80) out += String.fromCharCode(c);
    else if (c < 0xe0) out += String.fromCharCode(((c & 0x1f) << 6) | (b[i++]! & 0x3f));
    else if (c < 0xf0) out += String.fromCharCode(((c & 0x0f) << 12) | ((b[i++]! & 0x3f) << 6) | (b[i++]! & 0x3f));
    else {
      const cp = (((c & 0x07) << 18) | ((b[i++]! & 0x3f) << 12) | ((b[i++]! & 0x3f) << 6) | (b[i++]! & 0x3f)) - 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    }
  }
  return out;
}

class GrioLiveSession implements LiveSession {
  private handlers: LiveHandlers;
  private mode: BoloMode;
  private kickoffText: string;
  private socket: WebSocket | null = null;
  private io: VoiceIO | null = null;
  private status: LiveStatus = "idle";
  private closed = false;
  private muted = false;
  private gate = new MicGate();
  private pending: Float32Array[] = [];
  private pendingFrames = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionTimer: ReturnType<typeof setTimeout> | null = null;
  private lastLevelAt = 0;
  private lastLevel = -1;
  private awake = false;

  constructor(handlers: LiveHandlers, options: LiveSessionOptions) {
    this.handlers = handlers;
    this.mode = options.mode;
    this.kickoffText = options.kickoffText;
  }

  get currentStatus(): LiveStatus {
    return this.status;
  }

  /** Called from the tap that asked for it — the audio session and the mic come first. */
  async start(): Promise<void> {
    if (!voiceIOSupported()) {
      this.fail("unsupported");
      return;
    }
    this.setStatus("connecting");
    const io = createVoiceIO();
    this.io = io;
    // Mic permission before the token — a refused mic should not spend a mint.
    try {
      await io.prepare();
    } catch {
      this.fail("mic_denied");
      return;
    }
    if (this.closed) return;

    let token: LiveToken;
    try {
      token = await api<LiveToken>("/api/bolo/live-token", { method: "POST", timeoutMs: 20_000 });
    } catch (err) {
      const message = err instanceof ApiError && err.body && typeof err.body === "object" ? (err.body as { message?: unknown }).message : null;
      this.fail(
        message === "not_configured"
          ? "not_configured"
          : message === "disabled"
            ? "disabled"
            : err instanceof ApiError && err.status === 429
              ? "rate_limited"
              : "token",
      );
      return;
    }
    if (this.closed) return;

    // The server locked in a brief from the session; a screen showing the
    // other one must not start (a guest brief would ask a member for their number).
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

    io.onIdle(() => {
      if (!this.closed && this.status === "speaking") this.setStatus("listening");
    });
    try {
      await io.startCapture((frames, rate) => this.onFrames(frames, rate));
    } catch {
      this.fail("mic_denied");
      return;
    }

    this.setStatus("listening");
    this.armIdle();
    this.sessionTimer = setTimeout(() => this.end("max_session"), MAX_SESSION_MS);
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG)
      .then(() => {
        // Stopped while the lock was being taken: teardown has already run
        // and will not come back for it, so it is let go here.
        if (this.closed) void deactivateKeepAwake(KEEP_AWAKE_TAG);
        else this.awake = true;
      })
      .catch(() => {});
    this.send({ realtimeInput: { text: this.kickoffText } });
  }

  sendText(text: string) {
    if (!text.trim()) return;
    this.send({ realtimeInput: { text } });
    this.armIdle();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
  }

  stop(reason: LiveEndReason = "user") {
    this.end(reason);
  }

  /* ---------------------------- socket ---------------------------- */

  private openSocket(token: LiveToken): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(`${WS_ENDPOINT}?access_token=${encodeURIComponent(token.token)}`);
      socket.binaryType = "arraybuffer";
      this.socket = socket;
      let ready = false;
      const timeout = setTimeout(() => {
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
      socket.onmessage = (event: MessageEvent) => {
        const raw = typeof event.data === "string" ? event.data : event.data instanceof ArrayBuffer ? utf8(event.data) : "";
        let message: ServerMessage;
        try {
          message = JSON.parse(raw) as ServerMessage;
        } catch {
          return;
        }
        if (!ready) {
          if (message.setupComplete !== undefined) {
            ready = true;
            clearTimeout(timeout);
            resolve();
          }
          return;
        }
        void this.handleMessage(message);
      };
      socket.onerror = () => {
        if (!ready) {
          clearTimeout(timeout);
          reject(new Error("socket_error"));
        }
      };
      socket.onclose = () => {
        if (!ready) {
          clearTimeout(timeout);
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
        this.io?.flush();
        this.setStatus("listening");
        this.handlers.onEvent({ type: "interrupted" });
      }
      for (const part of content.modelTurn?.parts ?? []) {
        if (part.inlineData?.data) {
          this.io?.play(base64ToBytes(part.inlineData.data));
          this.setStatus("speaking");
        }
      }
      const heard = content.inputTranscription?.text;
      if (heard) {
        this.armIdle();
        this.handlers.onEvent({ type: "transcript", role: "user", text: heard, final: Boolean(content.inputTranscription?.finished) });
      }
      const said = content.outputTranscription?.text;
      if (said) this.handlers.onEvent({ type: "transcript", role: "grio", text: said, final: Boolean(content.outputTranscription?.finished) });
      if (content.turnComplete) {
        this.armIdle();
        this.handlers.onEvent({ type: "turn_complete" });
      }
    }
    if (message.toolCall?.functionCalls?.length) {
      this.armIdle();
      const calls: ToolCallRequest[] = message.toolCall.functionCalls
        .filter((c) => typeof c.name === "string")
        .map((c) => ({ id: c.id ?? "", name: c.name as string, args: c.args ?? {} }));
      let responses: Array<Record<string, unknown>>;
      try {
        responses = await this.handlers.onToolCalls(calls);
      } catch {
        responses = calls.map(() => ({ status: "error" }));
      }
      if (this.closed) return;
      this.send({
        toolResponse: { functionResponses: calls.map((c, i) => ({ id: c.id, name: c.name, response: responses[i] ?? { status: "ok" } })) },
      });
    }
  }

  /* --------------------------- capture ---------------------------- */

  private onFrames(frames: Float32Array, rate: number) {
    if (this.closed) return;
    const now = Date.now();
    if (now - this.lastLevelAt > 80) {
      this.lastLevelAt = now;
      // Quantised, and only on change: a silent room must not re-render the screen a dozen times a second.
      const level = Math.round(Math.min(1, blockRms(frames) * 8) / LEVEL_STEP) * LEVEL_STEP;
      if (level !== this.lastLevel) {
        this.lastLevel = level;
        this.handlers.onEvent({ type: "level", level });
      }
    }
    if (this.muted) return;
    this.pending.push(frames);
    this.pendingFrames += frames.length;
    if (this.pendingFrames >= Math.round(rate * BLOCK_SECONDS)) this.flushCapture(rate);
  }

  private flushCapture(rate: number) {
    if (this.pendingFrames === 0) return;
    const merged = new Float32Array(this.pendingFrames);
    let offset = 0;
    for (const chunk of this.pending) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    this.pending = [];
    this.pendingFrames = 0;
    const endsAt = this.io?.playbackEndsAt() ?? 0;
    const shielded = endsAt > 0 && Date.now() < endsAt + SHIELD_TAIL_MS;
    const rms = blockRms(merged);
    for (const { block, gain } of this.gate.push(merged, shielded ? rms * NATIVE_SHIELD_SCALE : rms, shielded)) {
      const pcm = downsampleToPcm16(gain === 1 ? block : scaled(block, gain), rate);
      this.send({ realtimeInput: { audio: { data: bytesToBase64(pcm), mimeType: `audio/pcm;rate=${INPUT_RATE}` } } });
    }
  }

  /* ---------------------------- state ----------------------------- */

  private setStatus(status: LiveStatus) {
    if (this.closed && status !== "closed") return;
    if (this.status === status) return;
    this.status = status;
    this.handlers.onEvent({ type: "status", status });
  }

  private armIdle() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.end("idle"), IDLE_MS);
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
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.sessionTimer) clearTimeout(this.sessionTimer);
    this.gate.reset();
    this.io?.release();
    this.io = null;
    if (this.awake) deactivateKeepAwake(KEEP_AWAKE_TAG);
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;
      if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) this.socket.close();
    }
    this.socket = null;
    this.status = "closed";
    this.handlers.onEvent({ type: "status", status: "closed" });
  }
}
