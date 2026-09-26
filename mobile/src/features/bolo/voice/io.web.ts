import { OUTPUT_RATE, int16ToFloat32 } from "./pcm";

/**
 * The web preview's half of Grio's live voice — `expo-audio`'s stream has no
 * web implementation, so this is the browser's own audio graph, the same way
 * the web's `lib/bolo/liveClient.ts` does it: a capture processor on the mic,
 * and Grio's audio scheduled back to back on one AudioContext with a small
 * cushion whenever the queue has drained.
 */

export interface VoiceIO {
  prepare(): Promise<void>;
  startCapture(onFrames: (frames: Float32Array, sampleRate: number) => void): Promise<void>;
  play(pcm: Uint8Array): void;
  flush(): void;
  playbackEndsAt(): number;
  onIdle(listener: () => void): void;
  release(): void;
}

type WebAudioWindow = { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };

export function voiceIOSupported(): boolean {
  if (typeof window === "undefined" || typeof WebSocket === "undefined") return false;
  const w = window as unknown as WebAudioWindow;
  return Boolean(navigator.mediaDevices?.getUserMedia) && Boolean(w.AudioContext || w.webkitAudioContext);
}

export function createVoiceIO(): VoiceIO {
  return new WebVoiceIO();
}

const PREROLL_S = 0.18;

class WebVoiceIO implements VoiceIO {
  private context: AudioContext | null = null;
  private media: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private playing = new Set<AudioBufferSourceNode>();
  private nextPlayAt = 0;
  private idleListeners: Array<() => void> = [];

  async prepare() {
    const w = window as unknown as WebAudioWindow;
    const Ctor = (w.AudioContext || w.webkitAudioContext)!;
    // Inside the tap, so the browser allows it to make sound.
    const context = new Ctor();
    this.context = context;
    await context.resume().catch(() => {});
    try {
      this.media = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      throw new Error("mic_denied");
    }
  }

  async startCapture(onFrames: (frames: Float32Array, sampleRate: number) => void) {
    const context = this.context;
    if (!context || !this.media) throw new Error("mic_denied");
    this.source = context.createMediaStreamSource(this.media);
    const processor = context.createScriptProcessor(2048, 1, 1);
    const silent = context.createGain();
    silent.gain.value = 0;
    processor.onaudioprocess = (e) => onFrames(e.inputBuffer.getChannelData(0).slice(0), context.sampleRate);
    this.source.connect(processor);
    processor.connect(silent);
    silent.connect(context.destination);
    this.processor = processor;
  }

  play(pcm: Uint8Array) {
    const context = this.context;
    if (!context) return;
    const samples = int16ToFloat32(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength) as ArrayBuffer);
    if (samples.length === 0) return;
    const buffer = context.createBuffer(1, samples.length, OUTPUT_RATE);
    buffer.getChannelData(0).set(samples);
    const node = context.createBufferSource();
    node.buffer = buffer;
    node.connect(context.destination);
    const now = context.currentTime;
    const startAt = this.nextPlayAt > now ? this.nextPlayAt : now + PREROLL_S;
    node.start(startAt);
    this.nextPlayAt = startAt + buffer.duration;
    this.playing.add(node);
    node.onended = () => {
      this.playing.delete(node);
      if (this.playing.size === 0) this.idleListeners.forEach((listener) => listener());
    };
  }

  flush() {
    const hadAny = this.playing.size > 0;
    for (const node of this.playing) {
      try {
        node.onended = null;
        node.stop();
      } catch {
        // already ended
      }
    }
    this.playing.clear();
    this.nextPlayAt = 0;
    if (hadAny) this.idleListeners.forEach((listener) => listener());
  }

  playbackEndsAt(): number {
    const context = this.context;
    if (!context || this.playing.size === 0) return 0;
    return Date.now() + Math.max(0, this.nextPlayAt - context.currentTime) * 1000;
  }

  onIdle(listener: () => void) {
    this.idleListeners.push(listener);
  }

  release() {
    this.flush();
    this.idleListeners = [];
    if (this.processor) {
      this.processor.onaudioprocess = null;
      this.processor.disconnect();
    }
    this.source?.disconnect();
    this.media?.getTracks().forEach((track) => track.stop());
    void this.context?.close().catch(() => {});
    this.processor = null;
    this.source = null;
    this.media = null;
    this.context = null;
  }
}
