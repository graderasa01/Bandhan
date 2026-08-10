/**
 * Who can be Grio's ears and mouth, and in which voice.
 *
 * Shared by the admin screen (client) and the speech routes (server), so the
 * dropdown can never offer a speaker the route would reject. That mattered
 * enough to move Sarvam's list out of `app/api/speech/tts/route.ts`, where it
 * lived as a private `Set` and a hard-coded default: two vendors with two
 * unrelated voice catalogs need one place that knows both.
 *
 * ## Why speech is not in `lib/ai/models.ts`
 *
 * That file routes *chat-completions* calls through `callAi`, and its
 * `AiProviderName` has no room for Sarvam, who sells no text model. Speech is
 * bought from a different set of vendors through endpoints with a different
 * shape (audio in / audio out, no tokens, no JSON schema). Widening the text
 * catalog to fit them would have made SARVAM selectable for `bioWriter` — a
 * dropdown entry that could only ever produce a 404.
 *
 * ## Model IDs
 *
 * Same caveat `AI_PROVIDER_MODELS` carries, and it bites harder here: the
 * `-preview-` in Gemini's TTS id is not decoration, and preview ids get retired.
 * Re-verify against ai.google.dev/gemini-api/docs/speech-generation before the
 * first funded call.
 */

export type VoiceProviderName = "SARVAM" | "GEMINI";

export const VOICE_PROVIDERS: readonly VoiceProviderName[] = ["SARVAM", "GEMINI"] as const;

export function isVoiceProvider(value: string): value is VoiceProviderName {
  return (VOICE_PROVIDERS as readonly string[]).includes(value);
}

export const VOICE_PROVIDER_META: Record<
  VoiceProviderName,
  { label: string; credential: "SARVAM" | "GEMINI"; blurb: string }
> = {
  SARVAM: {
    label: "Sarvam AI",
    credential: "SARVAM",
    blurb:
      "Bharat ke liye banaya gaya — Hinglish code-mixing aur Indian accent isi par sabse sahi baithte hain. Audio India me hi rehta hai.",
  },
  GEMINI: {
    label: "Google Gemini",
    credential: "GEMINI",
    blurb:
      "Ek hi key text aur voice dono ke liye. Jawab aksar tez aata hai, par Hinglish par Sarvam se behtar hai ya nahi — ye khud sun kar hi tay karein.",
  },
};

/**
 * Sarvam's Bulbul speakers. Checked against rather than passed through, so a
 * typo can never turn into a paid call with an invalid speaker — it falls back
 * to the default instead.
 */
export const SARVAM_VOICES = [
  "shubh", "aditya", "ritu", "priya", "neha", "rahul", "pooja", "rohan", "simran", "kavya",
  "amit", "dev", "ishita", "shreya", "ratan", "varun", "manan", "sumit", "roopa", "kabir",
  "aayan", "ashutosh", "advait", "amelia", "sophia", "anand", "tanya", "tarun", "sunny",
  "mani", "gokul", "vijay", "shruti", "suhani", "mohit", "kavitha", "rehan", "soham", "rupali",
] as const;

/**
 * One consistent assistant voice regardless of who is being asked about.
 * Devesh picked "shreya" after listening to samples of priya/neha/kavya/shreya
 * on 2026-08-04; it stays the default the DB column seeds to.
 */
export const SARVAM_DEFAULT_VOICE = "shreya";

/**
 * A curated slice of Gemini's prebuilt voices rather than all thirty — this is
 * a dropdown a human picks from by listening, and thirty names with no samples
 * is a list nobody reads to the end. The descriptors are Google's own.
 */
export const GEMINI_VOICES = [
  { id: "Kore", label: "Kore — firm (default)" },
  { id: "Aoede", label: "Aoede — breezy" },
  { id: "Leda", label: "Leda — youthful" },
  { id: "Callirrhoe", label: "Callirrhoe — easy-going" },
  { id: "Despina", label: "Despina — smooth" },
  { id: "Sulafat", label: "Sulafat — warm" },
  { id: "Achernar", label: "Achernar — soft" },
  { id: "Charon", label: "Charon — informative" },
  { id: "Puck", label: "Puck — upbeat" },
] as const;

export const GEMINI_DEFAULT_VOICE = "Kore";

export function isSarvamVoice(value: string): boolean {
  return (SARVAM_VOICES as readonly string[]).includes(value);
}

export function isGeminiVoice(value: string): boolean {
  return GEMINI_VOICES.some((v) => v.id === value);
}

/**
 * Gemini's audio-understanding model, used for STT.
 *
 * Flash rather than Pro: this call sits in front of somebody who has just
 * stopped speaking and is watching a spinner, and transcription is the one job
 * where a bigger model mostly buys reasoning nobody asked for. It also has to
 * stay cheap — every spoken turn is one of these.
 */
export const GEMINI_STT_MODEL = "gemini-2.5-flash";

/** Gemini's speech-generation model. See the `-preview-` caveat above. */
export const GEMINI_TTS_MODEL = "gemini-2.5-flash-preview-tts";
