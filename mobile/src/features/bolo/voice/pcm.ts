/**
 * PCM plumbing for Grio's live voice — the same conversions the web's
 * `lib/bolo/liveClient.ts` does, as plain functions both audio adapters share.
 *
 * Gemini Live takes 16 kHz mono PCM16 up and sends 24 kHz mono PCM16 down.
 */

export const INPUT_RATE = 16_000;
export const OUTPUT_RATE = 24_000;

/** Little-endian PCM16 → floats in [-1, 1]. */
export function int16ToFloat32(bytes: ArrayBuffer): Float32Array {
  const view = new DataView(bytes);
  const out = new Float32Array(Math.floor(bytes.byteLength / 2));
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true) / 0x8000;
  return out;
}

/** Floats at `sourceRate` → 16 kHz PCM16 bytes (box-filtered, as the web client does). */
export function downsampleToPcm16(input: Float32Array, sourceRate: number): Uint8Array {
  const ratio = sourceRate / INPUT_RATE;
  const frames = Math.max(1, Math.floor(input.length / ratio));
  const out = new Uint8Array(frames * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < frames; i++) {
    const from = Math.floor(i * ratio);
    const to = Math.max(from + 1, Math.min(input.length, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let j = from; j < to; j++) sum += input[j]!;
    const sample = Math.max(-1, Math.min(1, sum / (to - from)));
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return out;
}

export function scaled(input: Float32Array, gain: number): Float32Array {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) out[i] = input[i]! * gain;
  return out;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_INDEX = new Int16Array(128).fill(-1);
for (let i = 0; i < B64.length; i++) B64_INDEX[B64.charCodeAt(i)] = i;

/** Bytes → base64, without `btoa` (not on every native runtime). */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + B64[n & 63]!;
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i]! << 16;
    out += `${B64[(n >> 18) & 63]}${B64[(n >> 12) & 63]}==`;
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += `${B64[(n >> 18) & 63]}${B64[(n >> 12) & 63]}${B64[(n >> 6) & 63]}=`;
  }
  return out;
}

/** base64 → bytes, without `atob`. */
export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i + 1 < clean.length; i += 4) {
    const a = B64_INDEX[clean.charCodeAt(i)]!;
    const b = B64_INDEX[clean.charCodeAt(i + 1)]!;
    const c = i + 2 < clean.length ? B64_INDEX[clean.charCodeAt(i + 2)]! : -1;
    const d = i + 3 < clean.length ? B64_INDEX[clean.charCodeAt(i + 3)]! : -1;
    const n = (a << 18) | (b << 12) | ((c < 0 ? 0 : c) << 6) | (d < 0 ? 0 : d);
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (c >= 0 && o < out.length) out[o++] = (n >> 8) & 255;
    if (d >= 0 && o < out.length) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}

/** Mono PCM16 bytes → a playable WAV file. */
export function pcm16ToWav(pcm: Uint8Array, sampleRate: number): Uint8Array {
  const out = new Uint8Array(44 + pcm.length);
  const view = new DataView(out.buffer);
  const ascii = (at: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(at + i, text.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}
