/**
 * Interview / extraction contract — mirrors 07_advanced_ai_spec §2.3.
 *
 * The field names are the spec's, camelCased. Keeping the shape identical
 * matters: the same contract has to survive the swap from this route to the
 * real M05 pipeline without the UI changing.
 */

/** Who is filling the profile. Changes pronouns, and seeds Family Circle. */
export type FillingFor = "self" | "son" | "daughter";

export type ExtractedField = {
  field: string;
  /** null is a valid answer — the model must never guess (spec hard rule 1). */
  value: string | null;
  /** 0–100. */
  confidence: number;
  /** The words the value came from, so the user can ask "ye kahan se aaya?" */
  sourceSpan: string | null;
  needsConfirmation: boolean;
  reason?: string;
};

/**
 * Derived rather than heard — kept in its own bucket (spec hard rule 2) so the
 * UI can never present an inference as something the user said.
 */
export type InferredField = {
  field: string;
  value: string;
  inferredFrom: string;
  confidence: number;
  /** Always true: an inference is confirmed by a human, every time. */
  needsConfirmation: true;
};

/**
 * BCP-47-ish tag for the language the user is actually speaking. Field values
 * stay in the catalog's own vocabulary regardless — this only decides what
 * language we *ask* the next question in.
 */
export type SpokenLanguage =
  | "hi" | "en" | "mr" | "te" | "ta" | "bn" | "gu" | "kn" | "ml" | "pa" | "or";

/** Speech-recognition locale per language, and the name to show the user. */
export const LANGUAGE_META: Record<SpokenLanguage, { locale: string; native: string }> = {
  hi: { locale: "hi-IN", native: "हिंदी" },
  en: { locale: "en-IN", native: "English" },
  mr: { locale: "mr-IN", native: "मराठी" },
  te: { locale: "te-IN", native: "తెలుగు" },
  ta: { locale: "ta-IN", native: "தமிழ்" },
  bn: { locale: "bn-IN", native: "বাংলা" },
  gu: { locale: "gu-IN", native: "ગુજરાતી" },
  kn: { locale: "kn-IN", native: "ಕನ್ನಡ" },
  ml: { locale: "ml-IN", native: "മലയാളം" },
  pa: { locale: "pa-IN", native: "ਪੰਜਾਬੀ" },
  or: { locale: "or-IN", native: "ଓଡ଼ିଆ" },
};

export type InterviewTurnResult = {
  extractedFields: ExtractedField[];
  inferredFields: InferredField[];
  /** Field keys the model could not fill from this turn. */
  unresolved: string[];
  /**
   * What language the user answered in. Hinglish counts as "hi" — the point is
   * to catch a Marathi or Telugu speaker so the next question can switch.
   */
  detectedLanguage: SpokenLanguage;
  /**
   * True when the user said some version of "I don't know" / "skip this" about
   * the field we asked. Distinguishing this from silence is what lets the UI
   * move on gracefully instead of re-asking.
   */
  userDeclined: boolean;
  /**
   * A natural follow-up question, filled only when `askedField` came back in
   * `unresolved` this turn — the user tried to answer but it wasn't clear
   * enough to extract. Null the rest of the time. Spoken aloud (TTS) and shown
   * in place of the catalog's static question for one round.
   */
  clarification: string | null;
};

export type InterviewRequest = {
  /** What the user just said or typed. */
  transcript: string;
  /** Field keys already answered — the model must not re-ask or overwrite. */
  knownFields: Record<string, string>;
  /** The question that was on screen, if any. */
  askedField?: string;
  /**
   * The batched-voice equivalent of `askedField` — two or three questions
   * asked together in one breath rather than one at a time. When present this
   * takes priority over `askedField`; both exist because the one-at-a-time
   * flow still only ever asks a single field.
   */
  askedFields?: string[];
  fillingFor: FillingFor;
};

export type InterviewErrorCode = "not_configured" | "upstream_error" | "bad_request";

export type InterviewResponse =
  | { ok: true; result: InterviewTurnResult }
  | { ok: false; code: InterviewErrorCode; message: string };

/* ------------------------------------------------------------------ */
/* Asking the next question in the user's language                     */
/* ------------------------------------------------------------------ */

/**
 * Translating one already-chosen question. `fieldKey` is picked by the gap
 * engine in code — this request cannot influence *which* field is asked, only
 * how it is worded. That split is D-32.
 */
export type AskRequest = {
  fieldKey: string;
  language: SpokenLanguage;
  fillingFor: FillingFor;
};

/**
 * The two controls that sit inside the conversation rather than in the chrome.
 * Leaving these in Hinglish would mean a Marathi speaker can read the question
 * but not the way out of it, which is worse than not translating at all.
 */
export type ActionLabels = {
  /** "Type karke bataunga" */
  type: string;
  /** "Ye chhod dijiye" */
  skip: string;
};

/** The Hinglish originals, and the fallback whenever translation is unavailable. */
export const HI_ACTIONS: ActionLabels = {
  type: "Type karke bataunga",
  skip: "Ye chhod dijiye",
};

export type AskResponse =
  | {
      ok: true;
      question: string;
      optionLabels?: Record<string, string>;
      actionLabels?: ActionLabels;
    }
  | { ok: false; code: InterviewErrorCode; message: string };

/* ------------------------------------------------------------------ */
/* Biodata upload                                                      */
/* ------------------------------------------------------------------ */

export type BiodataSourceType = "pdf" | "image";

export type BiodataErrorCode =
  | InterviewErrorCode
  | "too_large"
  | "unsupported_type"
  | "unreadable";

/**
 * Same field shapes as a spoken turn on purpose. A biodata is just another
 * source of the same claims, so the review UI, the confirm rule and the gap
 * engine all work on it unchanged — there is no second pipeline to keep honest.
 */
export type BiodataResult = {
  extractedFields: ExtractedField[];
  inferredFields: InferredField[];
  unresolved: string[];
  /**
   * Fields the document appeared to mention but that are not in our catalog —
   * shown to the user so a biodata's own headings don't silently vanish.
   */
  ignoredMentions: string[];
  /** Set when the file was opened but nothing profile-shaped was found. */
  looksLikeBiodata: boolean;
};

export type BiodataResponse =
  | { ok: true; result: BiodataResult }
  | { ok: false; code: BiodataErrorCode; message: string };
