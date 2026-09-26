import type { FillingFor } from "~/types/api";

/**
 * The app's AI boundary.
 *
 * Screens talk to an `AiProvider`, never to a model or a vendor: the default
 * provider calls the BandhanTak server, which routes every request through
 * `callAi()` (Gemini / Claude / GPT / DeepSeek — the admin picks per feature on
 * /admin/ai-settings) and keeps every key server-side. Swapping the model is a
 * server setting; swapping the *transport* (on-device, a different backend)
 * is a new implementation of this interface. Either way no screen changes.
 *
 * Every structured answer is validated (zod, `schemas.ts`) before a screen
 * sees it, and "the model said so" is never enough to write a profile value —
 * extracted fields go to a review card the member confirms.
 */

export type AiErrorCode =
  | "not_configured"
  | "quota_exceeded"
  | "voice_limit"
  | "upstream_error"
  | "invalid_response"
  | "network"
  | "bad_request";

export class AiError extends Error {
  readonly code: AiErrorCode;
  constructor(code: AiErrorCode, message: string) {
    super(message);
    this.name = "AiError";
    this.code = code;
  }
}

export interface AudioClip {
  uri: string;
  mimeType: string;
  durationMs: number;
}

/** One value the AI read out of what the member said — never saved until they confirm it. */
export interface ExtractedValue {
  key: string;
  value: string;
  /** 0..1 */
  confidence: number;
  /** The words it came from — "ye kahan se aaya?" */
  sourceSpan: string | null;
  /** Derived rather than heard (e.g. a city from a college name) — always shown as a suggestion. */
  inferred: boolean;
}

export interface ProfileExtraction {
  values: ExtractedValue[];
  /** Fields the member was asked but that could not be read. */
  unresolved: string[];
  /** A follow-up question in the member's language, when an answer was unclear. */
  clarification: string | null;
  /** The member said "skip" / "pata nahi". */
  declined: boolean;
}

export interface BioDraft {
  tone: "simple" | "family" | "professional";
  text: string;
}

export interface AiProvider {
  readonly id: string;
  /** Whether spoken input can be transcribed right now (a vendor voice route is configured). */
  voiceAvailable(): Promise<boolean>;
  transcribe(clip: AudioClip, locale: string): Promise<string>;
  extractProfile(input: {
    transcript: string;
    known: Record<string, string>;
    askedFields?: string[];
    /** The one question on screen — how Bolo asks, so a short "Jaipur" is read as the city it answers. */
    askedField?: string;
    fillingFor: FillingFor;
  }): Promise<ProfileExtraction>;
  /** A photo (or PDF) of a paper biodata → the same reviewable extraction. */
  readBiodata(input: { uri: string; mimeType: string; fillingFor: FillingFor }): Promise<ProfileExtraction & { looksLikeBiodata: boolean }>;
  writeBio(input: {
    known: Record<string, string>;
    answers: Array<{ prompt: string; answer: string }>;
    fillingFor: FillingFor;
  }): Promise<BioDraft[]>;
}
