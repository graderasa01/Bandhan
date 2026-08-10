/**
 * Speech-to-text behind one interface.
 *
 * Web Speech API is the MVP (07_advanced_ai_spec §2.2) — free, in-browser, no
 * backend. Sarvam AI's Saaras V3 is the upgrade path: it is built for
 * Hinglish code-mixing specifically and keeps audio in India, which matters
 * for the kind of data this app collects. Swapping is meant to be a config
 * change, so nothing above this interface may know which one is running.
 */

export type SpeechResult = {
  transcript: string;
  /** False while the user is mid-sentence; true once the phrase settles. */
  isFinal: boolean;
};

export type SpeechFailure =
  | "not_supported"
  | "permission_denied"
  | "no_speech"
  | "network"
  | "unknown";

export interface SpeechProvider {
  readonly id: string;
  /** False when the browser or environment can't run this provider at all. */
  isAvailable(): boolean;
  start(handlers: {
    onResult: (r: SpeechResult) => void;
    onError: (e: SpeechFailure) => void;
    onEnd: () => void;
    /**
     * BCP-47 locale to listen in. Getting this wrong is worse than it sounds:
     * a Marathi sentence recognised as hi-IN comes back as plausible Hindi
     * words that mean nothing, so extraction fails on text that was never what
     * the user said. Defaults to hi-IN.
     */
    locale?: string;
    /**
     * End the utterance without waiting for `stop()`.
     *
     * Push-to-talk doesn't need this: the user's second tap is the end of the
     * sentence. Hands-free has no second tap, and a recorder that nobody stops
     * simply runs forever — the reason Grio's live mode never answered. With
     * this set the provider listens for the pause at the end of speech and
     * closes the recording itself.
     *
     * A hint, not a contract: a provider whose engine already segments speech
     * (the browser's own recogniser does) may ignore it.
     */
    autoStop?: boolean;
  }): Promise<void>;
  stop(): void;
}
