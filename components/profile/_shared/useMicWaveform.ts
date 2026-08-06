"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Bar count shared by every voice control's waveform — VoiceRecorder and
 *  VoiceCapture both rendered their own copy of this before. */
export const WAVEFORM_BAR_COUNT = 28;

const restingLevels = () => Array(WAVEFORM_BAR_COUNT).fill(0.15);

interface UseMicWaveformOptions {
  /** Called every animation frame with the raw byte-frequency data, in
   *  addition to the bar levels this hook already derives from it — lets a
   *  caller layer its own analysis (e.g. VoiceCapture's silence detection)
   *  on the same samples without opening a second audio pipeline. */
  onFrame?: (data: Uint8Array) => void;
}

/**
 * Shared mic-permission + live-amplitude plumbing behind every voice
 * control's waveform bars (VoiceRecorder, VoiceCapture). Owns the
 * MediaStream/AudioContext/analyser/rAF loop and answers only "how loud is
 * the mic right now" — recording to a file, transcription and upload stay
 * with the caller, since VoiceRecorder needs a MediaRecorder writing to
 * disk and VoiceCapture doesn't.
 */
export function useMicWaveform(options: UseMicWaveformOptions = {}) {
  const [levels, setLevels] = useState<number[]>(restingLevels);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  // Ref, not a dependency — so a caller passing a fresh `onFrame` closure
  // every render (VoiceCapture does, to close over its own state) never
  // has to restart the mic/analyser to pick it up.
  const onFrameRef = useRef(options.onFrame);
  onFrameRef.current = options.onFrame;

  const teardown = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setLevels(restingLevels());
  }, []);

  useEffect(() => teardown, [teardown]);

  /** Requests mic permission and starts the waveform loop, returning the
   *  live stream (VoiceRecorder hands it straight to a MediaRecorder).
   *  Throws if permission is denied or no device is available — callers
   *  decide how to surface that. */
  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    ctx.createMediaStreamSource(stream).connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const step = Math.floor(data.length / WAVEFORM_BAR_COUNT) || 1;
      setLevels(
        Array.from({ length: WAVEFORM_BAR_COUNT }, (_, i) =>
          Math.max(0.15, Math.min(1, data[i * step] / 180)),
        ),
      );
      onFrameRef.current?.(data);
      // A caller's onFrame may itself trigger teardown synchronously — e.g.
      // VoiceCapture's silence auto-stop calling `stop()` mid-frame. Bail
      // instead of scheduling another frame against an audio graph that's
      // already been torn down, otherwise this becomes a runaway rAF loop
      // that keeps re-invoking onFrame (and whatever it calls) forever.
      if (audioCtxRef.current !== ctx) return;
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();

    return stream;
  }, []);

  return { levels, start, teardown };
}
