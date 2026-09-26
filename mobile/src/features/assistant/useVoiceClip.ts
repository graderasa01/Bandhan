import {
  AudioQuality,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from "expo-audio";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { Platform } from "react-native";
import type { AudioClip } from "~/services/ai";

/**
 * Speech-friendly recording: 16 kHz mono — what speech-to-text wants, and a
 * fraction of the upload a music preset would send over a slow connection.
 * iOS records WAV (the format the web client also sends); Android's recorder
 * has no WAV, so it records AAC and the server passes that through to the
 * vendor (`/api/speech/stt`).
 */
const SPEECH: RecordingOptions = {
  extension: ".wav",
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 256000,
  android: { extension: ".aac", outputFormat: "aac_adts", audioEncoder: "aac", sampleRate: 16000 },
  ios: {
    extension: ".wav",
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.HIGH,
    sampleRate: 16000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: "audio/webm", bitsPerSecond: 64000 },
};

export type VoiceState = "idle" | "recording" | "denied";

export function useVoiceClip(maxMs = 45_000, onAutoStop?: (clip: AudioClip) => void) {
  const recorder = useAudioRecorder(SPEECH);
  const status = useAudioRecorderState(recorder, 250);
  const [state, setState] = useState<VoiceState>("idle");
  const stopping = useRef(false);

  const start = useCallback(async (): Promise<boolean> => {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      setState("denied");
      return false;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    stopping.current = false;
    setState("recording");
    return true;
  }, [recorder]);

  const stop = useCallback(async (): Promise<AudioClip | null> => {
    if (stopping.current) return null;
    stopping.current = true;
    const durationMs = status.durationMillis;
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    setState("idle");
    const uri = recorder.uri;
    if (!uri) return null;
    return { uri, mimeType: Platform.OS === "android" ? "audio/aac" : Platform.OS === "web" ? "audio/webm" : "audio/wav", durationMs };
  }, [recorder, status.durationMillis]);

  // A clip longer than the vendor's sync limit is cut, never sent to fail —
  // and handed straight to the screen, which treats it as if Stop was pressed.
  const autoStopped = useEffectEvent((clip: AudioClip) => onAutoStop?.(clip));
  useEffect(() => {
    if (state === "recording" && status.durationMillis >= maxMs) {
      void stop().then((clip) => {
        if (clip) autoStopped(clip);
      });
    }
  }, [maxMs, state, status.durationMillis, stop]);

  return { state, durationMs: status.durationMillis, start, stop };
}
