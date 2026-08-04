/**
 * Text-to-speech behind one interface — the output-side mirror of
 * `SpeechProvider.ts`.
 *
 * Web Speech Synthesis is the MVP: free, in-browser, no backend, same reason
 * `SpeechProvider` started with Web Speech for input. If Hindi/Hinglish voice
 * quality ever becomes the complaint, a paid provider (Sarvam, Google Cloud
 * TTS) slots in behind this same interface — nothing above it may know which
 * one is running.
 */

export interface SpeechOutputProvider {
  readonly id: string;
  /** False when the browser or environment can't run this provider at all. */
  isAvailable(): boolean;
  /**
   * Speaks `text`. Callers don't need to `cancel()` first — implementations
   * own not letting two utterances overlap.
   */
  speak(
    text: string,
    opts?: {
      /** BCP-47 locale to speak in — same tag STT listens in. Defaults to hi-IN. */
      locale?: string;
      onStart?: () => void;
      onEnd?: () => void;
      onError?: () => void;
    },
  ): void;
  /** Stops whatever is currently being spoken, if anything. */
  cancel(): void;
}
