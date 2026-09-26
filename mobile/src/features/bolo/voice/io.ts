import { AudioModule, createAudioPlayer, requestRecordingPermissionsAsync, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { File, Paths } from "expo-file-system";
import { OUTPUT_RATE, int16ToFloat32, pcm16ToWav } from "./pcm";

/**
 * The phone's half of Grio's live voice: the microphone in, Grio's voice out.
 *
 * ## In: `expo-audio`'s AudioStream
 *
 * Mono PCM16 straight from the hardware at 16 kHz where it can (the session
 * resamples whatever rate actually arrives). There is no switch here for the
 * platform echo canceller, so the session's mic gate judges shielded audio
 * more strictly on a phone than the web does (see `NATIVE_SHIELD_SCALE`).
 *
 * ## Out: short WAV segments, two players in turn
 *
 * `expo-audio` plays files, not a live PCM stream, so Grio's audio is cut
 * into segments as it arrives: a short first one so she starts talking at
 * once, longer ones after (there is time to gather them while the first
 * plays), each written to the cache and preloaded into whichever of two
 * players is idle — so the next segment is already loaded when the current
 * one ends, and the seam is a few milliseconds rather than a load.
 */

export interface VoiceIO {
  /** Inside the user's tap: the audio session and the microphone permission. Throws "mic_denied". */
  prepare(): Promise<void>;
  startCapture(onFrames: (frames: Float32Array, sampleRate: number) => void): Promise<void>;
  /** Grio's 24 kHz mono PCM16, as it arrives. */
  play(pcm: Uint8Array): void;
  /** Barge-in: everything queued or playing stops now. */
  flush(): void;
  /** Epoch ms at which everything queued will have played (0 when nothing is). */
  playbackEndsAt(): number;
  /** Called whenever the last queued audio has finished playing. */
  onIdle(listener: () => void): void;
  release(): void;
}

export function voiceIOSupported(): boolean {
  return true;
}

export function createVoiceIO(): VoiceIO {
  return new NativeVoiceIO();
}

const SEGMENT_PREFIX = "grio-";

/**
 * Segments a session never got to delete — the app was killed mid-sentence.
 * Every live session deletes its own as they play, so anything left with the
 * prefix when a new one starts belongs to none of them.
 */
function sweepStaleSegments() {
  try {
    for (const entry of Paths.cache.list()) {
      if (entry instanceof File && entry.name.startsWith(SEGMENT_PREFIX) && entry.name.endsWith(".wav")) entry.delete();
    }
  } catch {
    // The cache is the OS's to clear as well; a sweep that cannot run changes nothing.
  }
}

/** Interleaved multi-channel samples → one channel, averaged. */
function downmix(samples: Float32Array, channels: number): Float32Array {
  const out = new Float32Array(Math.floor(samples.length / channels));
  for (let i = 0; i < out.length; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += samples[i * channels + c]!;
    out[i] = sum / channels;
  }
  return out;
}

const BYTES_PER_SECOND = OUTPUT_RATE * 2;
/** The first segment of a line: enough to start without a stutter. */
const FIRST_SEGMENT_S = 0.35;
/** Later segments: gathered while the previous one plays. */
const NEXT_SEGMENT_S = 1.2;
/** A line that stops arriving is played as it is after this long. */
const GATHER_MS = 160;

type Segment = { file: File; seconds: number };

class NativeVoiceIO implements VoiceIO {
  private stream: InstanceType<typeof AudioModule.AudioStream> | null = null;
  private streamSub: { remove(): void } | null = null;
  private players: AudioPlayer[] = [];
  private playerSubs: Array<{ remove(): void }> = [];
  /** Index into `players` of the one playing now, or -1. */
  private active = -1;
  /** Segment loaded into each player. */
  private loaded: Array<Segment | null> = [null, null];
  private queue: Segment[] = [];
  private pending: Uint8Array[] = [];
  private pendingBytes = 0;
  private gatherTimer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;
  private startedAt = 0;
  private idleListeners: Array<() => void> = [];
  private released = false;

  async prepare() {
    sweepStaleSegments();
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) throw new Error("mic_denied");
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      interruptionMode: "doNotMix",
      shouldRouteThroughEarpiece: false,
    });
  }

  async startCapture(onFrames: (frames: Float32Array, sampleRate: number) => void) {
    // `AudioModule` is the native module object, not a namespace of ES exports:
    // its `AudioStream` class is exactly what expo-audio's own `useAudioStream`
    // constructs (a hook is no use to this plain class). The import plugin
    // reads it as a namespace and cannot see the class.
    // eslint-disable-next-line import/namespace
    const stream = new AudioModule.AudioStream({ sampleRate: 16_000, channels: 1, encoding: "int16" });
    this.stream = stream;
    this.streamSub = stream.addListener("audioStreamBuffer", (buffer) => {
      if (this.released) return;
      // Mono is asked for, not promised (the buffer says what the hardware
      // gave): interleaved channels read as mono would be twice the rate.
      const samples = int16ToFloat32(buffer.data);
      onFrames(buffer.channels > 1 ? downmix(samples, buffer.channels) : samples, buffer.sampleRate);
    });
    await stream.start();
  }

  play(pcm: Uint8Array) {
    if (this.released || pcm.length === 0) return;
    this.pending.push(pcm);
    this.pendingBytes += pcm.length;
    const playing = this.active !== -1;
    const threshold = (playing ? NEXT_SEGMENT_S : FIRST_SEGMENT_S) * BYTES_PER_SECOND;
    if (this.pendingBytes >= threshold) {
      this.cutSegment();
      return;
    }
    if (!this.gatherTimer) this.gatherTimer = setTimeout(() => this.cutSegment(), GATHER_MS);
  }

  flush() {
    this.clearGather();
    this.pending = [];
    this.pendingBytes = 0;
    for (const segment of this.queue) this.discard(segment);
    this.queue = [];
    this.players.forEach((player, i) => {
      try {
        player.pause();
      } catch {
        // already stopped
      }
      const segment = this.loaded[i];
      if (segment) this.discard(segment);
      this.loaded[i] = null;
    });
    const wasPlaying = this.active !== -1;
    this.active = -1;
    if (wasPlaying) this.emitIdle();
  }

  playbackEndsAt(): number {
    if (this.active === -1 && this.queue.length === 0 && this.pendingBytes === 0) return 0;
    let seconds = this.pendingBytes / BYTES_PER_SECOND;
    for (const segment of this.queue) seconds += segment.seconds;
    const other = this.active === -1 ? null : this.loaded[1 - this.active];
    if (other) seconds += other.seconds;
    if (this.active !== -1) {
      const current = this.loaded[this.active];
      const elapsed = (Date.now() - this.startedAt) / 1000;
      seconds += Math.max(0, (current?.seconds ?? 0) - elapsed);
    }
    return Date.now() + seconds * 1000;
  }

  onIdle(listener: () => void) {
    this.idleListeners.push(listener);
  }

  release() {
    if (this.released) return;
    this.flush();
    this.released = true;
    this.streamSub?.remove();
    this.streamSub = null;
    try {
      this.stream?.stop();
      this.stream?.release();
    } catch {
      // already released
    }
    this.stream = null;
    this.playerSubs.forEach((sub) => sub.remove());
    this.playerSubs = [];
    this.players.forEach((player) => {
      try {
        player.remove();
      } catch {
        // already removed
      }
    });
    this.players = [];
    this.idleListeners = [];
    void setAudioModeAsync({ allowsRecording: false }).catch(() => {});
  }

  /* ---------------------------- segments ---------------------------- */

  private clearGather() {
    if (this.gatherTimer) {
      clearTimeout(this.gatherTimer);
      this.gatherTimer = null;
    }
  }

  private cutSegment() {
    this.clearGather();
    if (this.pendingBytes === 0 || this.released) return;
    const pcm = new Uint8Array(this.pendingBytes);
    let offset = 0;
    for (const chunk of this.pending) {
      pcm.set(chunk, offset);
      offset += chunk.length;
    }
    this.pending = [];
    this.pendingBytes = 0;
    let file: File;
    try {
      file = new File(Paths.cache, `${SEGMENT_PREFIX}${Date.now()}-${this.seq++}.wav`);
      file.create({ overwrite: true });
      file.write(pcm16ToWav(pcm, OUTPUT_RATE));
    } catch {
      return; // A segment that cannot be written is a skipped word, not a broken session.
    }
    this.queue.push({ file, seconds: pcm.length / BYTES_PER_SECOND });
    this.pump();
  }

  private ensurePlayers() {
    if (this.players.length > 0) return;
    for (let i = 0; i < 2; i++) {
      // By default an iOS player deactivates the audio session when it
      // pauses or finishes — which would take the live microphone stream
      // down with it at the end of Grio's first line. The session is the
      // conversation's; `release()` hands it back.
      const player = createAudioPlayer(null, { updateInterval: 100, keepAudioSessionActive: true });
      this.players.push(player);
      this.playerSubs.push(
        player.addListener("playbackStatusUpdate", (status) => {
          if (status.didJustFinish && this.active === i) this.onFinished(i);
        }),
      );
    }
  }

  /** Keep the idle player loaded with the next segment, and start playing if nothing is. */
  private pump() {
    if (this.released) return;
    this.ensurePlayers();
    if (this.active === -1) {
      const next = this.queue.shift();
      if (!next) return;
      this.startOn(0, next);
    }
    const idle = 1 - this.active;
    if (!this.loaded[idle] && this.queue.length > 0) {
      const next = this.queue.shift()!;
      this.loaded[idle] = next;
      this.players[idle]!.replace({ uri: next.file.uri });
    }
  }

  private startOn(index: number, segment: Segment) {
    const player = this.players[index]!;
    if (this.loaded[index] !== segment) {
      this.loaded[index] = segment;
      player.replace({ uri: segment.file.uri });
    }
    this.active = index;
    this.startedAt = Date.now();
    player.play();
  }

  private onFinished(index: number) {
    const finished = this.loaded[index];
    this.loaded[index] = null;
    if (finished) this.discard(finished);
    const other = 1 - index;
    const preloaded = this.loaded[other];
    if (preloaded) {
      this.startOn(other, preloaded);
      this.pump();
      return;
    }
    if (this.pendingBytes > 0) {
      this.active = -1;
      this.cutSegment();
      return;
    }
    const queued = this.queue.shift();
    if (queued) {
      this.startOn(other, queued);
      this.pump();
      return;
    }
    this.active = -1;
    this.emitIdle();
  }

  private discard(segment: Segment) {
    try {
      segment.file.delete();
    } catch {
      // the cache will be cleared by the OS anyway
    }
  }

  private emitIdle() {
    for (const listener of this.idleListeners) listener();
  }
}
