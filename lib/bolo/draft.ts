/**
 * The guest profile draft behind `/bolo` — the spoken, typed or uploaded
 * answers a visitor gives *before* they have an account.
 *
 * Isomorphic on purpose. The browser runs `normalizeAnswer` on every value a
 * tool call or a keyboard produces, so Grio can be told "5.8 became 5'8\""
 * inside the same turn; the server runs the identical code again inside
 * `POST /api/bolo/complete`, so nothing the client accepted is trusted. Both
 * sides then defer to `isValidFieldValue` — the same rule `readiness.ts`
 * applies to every other way a profile is filled — which is what keeps
 * "the 8 minimum fields" one list rather than a second copy living here.
 *
 * Only the fields a spoken first sitting can reasonably reach are normalised
 * with any cleverness: gender words, Indian date phrasings, feet-and-inches
 * shorthands, and the education ladder. Everything else is trimmed and, for a
 * select, matched case-insensitively against the catalog.
 */

import { FIELD_BY_KEY, type ProfileFieldDef } from "@/lib/profile/fields";
import { MINIMUM_LIVE_FIELDS, MINIMUM_LIVE_KEYS, isValidFieldValue } from "@/lib/profile/readiness";
import type { FillingFor } from "@/lib/contracts/interview";

export const FILLING_FOR_VALUES: readonly FillingFor[] = ["self", "son", "daughter"];

export function isFillingFor(value: unknown): value is FillingFor {
  return typeof value === "string" && (FILLING_FOR_VALUES as readonly string[]).includes(value);
}

export type BoloValues = Record<string, string>;

/** What the browser keeps in localStorage between reloads. */
export interface BoloDraft {
  version: 1;
  fillingFor: FillingFor | null;
  values: BoloValues;
  /** The visitor looked at the review card and said it is right. */
  confirmed: boolean;
  updatedAt: number;
}

export const BOLO_DRAFT_KEY = "bt:bolo-draft:v1";

export function emptyDraft(): BoloDraft {
  return { version: 1, fillingFor: null, values: {}, confirmed: false, updatedAt: Date.now() };
}

/**
 * A signed-in member's unfinished spoken draft lives under their own key, so a
 * shared phone never pours one account's answers into another's.
 */
export function memberDraftKey(userId: string): string {
  return `${BOLO_DRAFT_KEY}:member:${userId}`;
}

/**
 * A signed-in member arriving on `/bolo` with a profile that is not live yet —
 * what the server page hands the client so Grio picks up where the profile
 * already is instead of starting over (`loadBoloMember`).
 */
export interface BoloMember {
  /** Only for the per-member localStorage key — never sent to the model. */
  userId: string;
  firstName: string;
  fullName: string;
  /** The eight minimum fields and the two preferences, in the draft's own spellings; valid values only. */
  values: BoloValues;
  /** Null when the profile has no answers yet — "who is this for?" has not really been asked. */
  fillingFor: FillingFor | null;
  /** Keys whose stored value is a model's reading no person has confirmed. */
  needsReview: string[];
  /** Whether the account can already log in with a password. */
  hasPassword: boolean;
}

/* ------------------------------------------------------------------ */
/* Normalisation                                                       */
/* ------------------------------------------------------------------ */

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, janvari: 1, "जनवरी": 1,
  feb: 2, february: 2, farvari: 2, "फरवरी": 2,
  mar: 3, march: 3, "मार्च": 3,
  apr: 4, april: 4, aprail: 4, "अप्रैल": 4,
  may: 5, mai: 5, "मई": 5,
  jun: 6, june: 6, "जून": 6,
  jul: 7, july: 7, julai: 7, "जुलाई": 7,
  aug: 8, august: 8, agast: 8, "अगस्त": 8,
  sep: 9, sept: 9, september: 9, sitambar: 9, "सितंबर": 9, "सितम्बर": 9,
  oct: 10, october: 10, aktoobar: 10, "अक्टूबर": 10,
  nov: 11, november: 11, navambar: 11, "नवंबर": 11, "नवम्बर": 11,
  dec: 12, december: 12, disambar: 12, "दिसंबर": 12, "दिसम्बर": 12,
};

const DEVANAGARI_DIGITS = "०१२३४५६७८९";

function asciiDigits(raw: string): string {
  return raw.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "12 May 1995", "12/5/95", "1995-05-12", "12-05-1995" → "12/05/1995". */
export function normalizeDate(raw: string): string {
  const s = asciiDigits(raw)
    .trim()
    .toLowerCase()
    .replace(/(\d+)(st|nd|rd|th)\b/g, "$1");
  let d: number | null = null;
  let m: number | null = null;
  let y: number | null = null;

  const iso = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  const dmy = s.match(/^(\d{1,2})[-/.\s](\d{1,2})[-/.\s](\d{2,4})$/);
  const worded = s.match(/^(\d{1,2})\s*[-,]?\s*([a-zऀ-ॿ]+)\.?\s*[-,]?\s*(\d{2,4})$/u);
  const monthFirst = s.match(/^([a-z]+)\.?\s+(\d{1,2}),?\s+(\d{2,4})$/);

  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dmy) [d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
  else if (worded && MONTHS[worded[2]] !== undefined)
    [d, m, y] = [Number(worded[1]), MONTHS[worded[2]], Number(worded[3])];
  else if (monthFirst && MONTHS[monthFirst[1]] !== undefined)
    [d, m, y] = [Number(monthFirst[2]), MONTHS[monthFirst[1]], Number(monthFirst[3])];
  else return raw.trim();

  if (d === null || m === null || y === null) return raw.trim();
  // A two-digit year on a marriage profile is a birth year in the 1900s or
  // 2000s; anything that would make the person under 18 belongs to the 1900s.
  if (y < 100) y += y + 2000 <= new Date().getFullYear() - 18 ? 2000 : 1900;
  return `${pad2(d)}/${pad2(m)}/${y}`;
}

/**
 * `5'8"`, "5 feet 8 inches", "5 ft 8", "5.8", "5 foot 8 inch", "5 फुट 8 इंच",
 * "173 cm" → the catalog's own `5'8"`. Returns the raw string when nothing
 * plausible can be read, so `isValidFieldValue` rejects it and Grio re-asks.
 */
export function normalizeHeight(raw: string): string {
  const s = asciiDigits(raw).trim().toLowerCase();
  const cm = s.match(/^(\d{2,3})\s*(?:cm|centimet\w*|सेमी|सेंटीमीटर)$/u);
  let feet: number | null = null;
  let inches = 0;

  if (cm) {
    const totalInches = Math.round(Number(cm[1]) / 2.54);
    feet = Math.floor(totalInches / 12);
    inches = totalInches % 12;
  } else {
    // "5'8", "5' 8\"", "5 ft 8 in", "5 feet 8 inches", "5 foot 8", "5 fut 8 inch"
    const ftIn = s.match(
      /^(\d)\s*(?:'|’|ft\.?|feet|foot|fut|फुट|फीट)\s*(\d{1,2})?\s*(?:"|”|''|in\.?|inch(?:es)?|इंच)?$/u,
    );
    // "5.8" / "5,8" — the shorthand every Indian biodata uses for 5'8".
    const dotted = s.match(/^(\d)[.,](\d{1,2})$/);
    if (ftIn) {
      feet = Number(ftIn[1]);
      inches = ftIn[2] ? Number(ftIn[2]) : 0;
    } else if (dotted) {
      feet = Number(dotted[1]);
      inches = Number(dotted[2]);
    }
  }

  if (feet === null || inches > 11) return raw.trim();
  return `${feet}'${inches}"`;
}

const GENDER_WORDS: Array<[RegExp, string]> = [
  [/\b(ladka|larka|male|boy|man|beta|son|groom|purush|m)\b|लड़का|बेटा|पुरुष/iu, "Ladka"],
  [/\b(ladki|larki|female|girl|woman|beti|daughter|bride|mahila|f)\b|लड़की|बेटी|महिला/iu, "Ladki"],
];

export function normalizeGender(raw: string): string {
  const s = raw.trim();
  for (const [pattern, value] of GENDER_WORDS) if (pattern.test(s)) return value;
  return s;
}

const MARITAL_WORDS: Array<[RegExp, string]> = [
  [/never|unmarried|single|kunwar|kunwara|kunwari|nahi hui|shaadi nahi|अविवाहित|कुंवार/iu, "Never Married"],
  [/divorc|talaq|separated|तलाक/iu, "Divorced"],
  [/widow|vidhwa|vidhur|विधवा|विधुर/iu, "Widowed"],
];

export function normalizeMaritalStatus(raw: string): string {
  const s = raw.trim();
  for (const [pattern, value] of MARITAL_WORDS) if (pattern.test(s)) return value;
  return s;
}

/**
 * Education as people *say* it → the catalog's ladder. "BTech", "b. tech",
 * "engineering" and "बीटेक" all mean the same rung; a spoken degree the
 * ladder has no rung for stays as said so the select rejects it and Grio can
 * offer the closest options.
 */
const EDUCATION_ALIASES: Array<[RegExp, string]> = [
  [/\b(b\.?\s?tech|btech|b\.?e\.?|engineering|बीटेक|बी\.?टेक)\b/iu, "B.Tech"],
  [/\b(m\.?\s?tech|mtech|m\.?e\.?|एमटेक)\b/iu, "M.Tech"],
  [/\b(mbbs|एमबीबीएस)\b/iu, "MBBS"],
  [/\b(bds)\b/i, "BDS"],
  [/\b(b\.?\s?pharm(?:a|acy)?)\b/i, "B.Pharm"],
  [/\b(mba|एमबीए)\b/iu, "MBA"],
  [/\b(mca|एमसीए)\b/iu, "MCA"],
  [/\b(bca|बीसीए)\b/iu, "BCA"],
  [/\b(bba|बीबीए)\b/iu, "BBA"],
  [/\b(b\.?\s?sc|bsc|बीएससी)\b/iu, "B.Sc"],
  [/\b(m\.?\s?sc|msc|एमएससी)\b/iu, "M.Sc"],
  [/\b(b\.?\s?com|bcom|बीकॉम)\b/iu, "B.Com"],
  [/\b(m\.?\s?com|mcom|एमकॉम)\b/iu, "M.Com"],
  [/\b(b\.?\s?a\.?|ba|बीए)\b/iu, "B.A."],
  [/\b(m\.?\s?a\.?|ma|एमए)\b/iu, "M.A."],
  [/\b(llb|law|एलएलबी)\b/iu, "LLB"],
  [/\b(llm)\b/i, "LLM"],
  [/\b(md)\b/i, "MD"],
  [/\b(phd|ph\.?\s?d\.?|doctorate|पीएचडी)\b/iu, "PhD"],
  [/\b(ca|chartered accountant|सीए)\b/iu, "CA"],
  [/\b(cs|company secretary)\b/i, "CS"],
  [/\b(diploma|डिप्लोमा)\b/iu, "Diploma"],
  [/\b(iti|आईटीआई)\b/iu, "ITI"],
  [/\b(post\s?graduat\w*|masters?|pg|पोस्ट ग्रेजुएट)\b/iu, "Post Graduate"],
  [/\b(graduat\w*|bachelors?|degree|ग्रेजुएट|स्नातक)\b/iu, "Graduate"],
  [/\b(12th|12|twelfth|inter(?:mediate)?|hsc|बारहवीं)\b/iu, "12th"],
  [/\b(10th|10|tenth|matric\w*|ssc|दसवीं)\b/iu, "10th"],
];

export function normalizeEducation(raw: string): string {
  const s = raw.trim();
  const exact = matchOption(FIELD_BY_KEY.education, s);
  if (exact) return exact;
  for (const [pattern, value] of EDUCATION_ALIASES) if (pattern.test(s)) return value;
  return s;
}

/** Case/spacing-insensitive match against a select's options; null when none. */
export function matchOption(field: ProfileFieldDef | undefined, raw: string): string | null {
  if (!field?.options) return null;
  const wanted = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!wanted) return null;
  for (const option of field.options) {
    if (option.toLowerCase() === wanted) return option;
  }
  return null;
}

/**
 * A multiselect as a person or a model produces it — "jaipur, delhi ncr",
 * "Jaipur aur Mumbai" — → the catalog's own spellings, comma-joined. Each
 * piece is matched like a select; a piece the catalog has no option for is
 * kept as said so `isValidFieldValue` rejects the whole value and the model
 * is read the real options. Never invents "Kahin bhi" for an empty answer.
 */
export function normalizeMultiselect(field: ProfileFieldDef | undefined, raw: string): string {
  if (!field?.options) return raw.trim();
  const pieces = raw
    .split(/,|\/|\baur\b|\band\b|&|\|/iu)
    .map((p) => p.trim())
    .filter(Boolean);
  if (pieces.length === 0) return "";
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of pieces) {
    const matched = matchOption(field, piece) ?? piece;
    if (seen.has(matched)) continue;
    seen.add(matched);
    out.push(matched);
  }
  return out.join(", ");
}

/**
 * "25-29", "25 to 29", "25 se 29 saal", "25–29" → the catalog's `25–29`
 * (en dash); "35 plus", "35 se upar", "35+" → `35+`. A model reading the
 * options aloud will type the plain hyphen far more often than the dash the
 * catalog uses, and that must not become a rejection loop on a live call.
 */
export function normalizeAgeRange(raw: string): string {
  const s = asciiDigits(raw).trim().toLowerCase();
  const plus = s.match(/^(\d{2})\s*(?:\+|plus|se upar|se zyada|aur upar|or above|and above|above)\s*(?:saal|years?)?$/u);
  if (plus) return `${plus[1]}+`;
  const range = s.match(/^(\d{2})\s*(?:-|–|—|to|se|tak|se lekar|aur)\s*(\d{2})\s*(?:saal|years?|tak|ke beech)?$/u);
  if (range) return `${range[1]}–${range[2]}`;
  return raw.trim();
}

function titleCaseWords(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) => (w === w.toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * One value, as a person or a model produced it → the catalog's own spelling.
 * Never validates; `acceptAnswers` does that right after, with the field's own
 * rule. Unknown keys pass through untouched.
 */
export function normalizeAnswer(key: string, raw: string): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  switch (key) {
    case "gender":
      return normalizeGender(value);
    case "dateOfBirth":
      return normalizeDate(value);
    case "height":
      return normalizeHeight(value);
    case "maritalStatus":
      return normalizeMaritalStatus(value);
    case "education":
      return normalizeEducation(value);
    case "fullName":
    case "currentCity":
      return titleCaseWords(value.replace(/[.,!।]+$/u, ""));
    case "partnerAgeRange":
      return normalizeAgeRange(value);
    default: {
      const def = FIELD_BY_KEY[key];
      if (def?.type === "select") return matchOption(def, value) ?? value;
      if (def?.type === "multiselect") return normalizeMultiselect(def, value);
      return value;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Accepting a batch of answers                                        */
/* ------------------------------------------------------------------ */

export interface RejectedAnswer {
  field: string;
  /** What arrived, after normalisation — so Grio can say what it heard. */
  heard: string;
  reason: "unknown_field" | "invalid";
  /** For a select: the choices the value had to be one of. */
  options?: string[];
}

export interface AcceptResult {
  values: BoloValues;
  saved: string[];
  rejected: RejectedAnswer[];
  /** Minimum fields still empty or invalid after this batch, in catalog order. */
  missing: string[];
}

/**
 * Merge a batch of raw answers into `current`. Only catalog fields the model
 * is allowed to fill get through, each normalised then validated. A value
 * that fails its field's rule is reported back rather than stored — the
 * whole point of telling the model, in the same turn, that "5.13" is not a
 * height.
 */
export function acceptAnswers(current: BoloValues, incoming: Record<string, unknown>): AcceptResult {
  const values: BoloValues = { ...current };
  const saved: string[] = [];
  const rejected: RejectedAnswer[] = [];

  for (const [key, raw] of Object.entries(incoming ?? {})) {
    const def = FIELD_BY_KEY[key];
    if (!def || def.type === "photo") {
      rejected.push({ field: key, heard: String(raw ?? ""), reason: "unknown_field" });
      continue;
    }
    if (raw === null || raw === undefined || String(raw).trim() === "") continue;
    const value = normalizeAnswer(key, String(raw));
    if (!isValidFieldValue(def, value)) {
      rejected.push({
        field: key,
        heard: value,
        reason: "invalid",
        options: def.options && def.options.length <= 40 ? def.options : undefined,
      });
      continue;
    }
    values[key] = value;
    saved.push(key);
  }

  return { values, saved, rejected, missing: missingMinimum(values) };
}

/* ------------------------------------------------------------------ */
/* The two optional preferences                                        */
/* ------------------------------------------------------------------ */

/**
 * The two optional preferences Grio offers once the eight fields are in —
 * an age range and a city preference, the exact pair `preferenceEvidence.ts`
 * needs (`MIN_COMPARABLE_SIGNALS`) before the reel may show a preference
 * match. Nothing else is accepted through `acceptPreferences`, however the
 * model phrases it: the spoken first sitting asks for two things, not a
 * partner-preference form.
 */
export const BOLO_PREFERENCE_KEYS = ["partnerAgeRange", "partnerCityPreference"] as const;
export type BoloPreferenceKey = (typeof BOLO_PREFERENCE_KEYS)[number];

/** Everything the spoken flow fills — the eight a live profile needs, then the two preferences. */
export const BOLO_FIELD_KEYS: readonly string[] = [...MINIMUM_LIVE_KEYS, ...BOLO_PREFERENCE_KEYS];

export function isBoloPreferenceKey(key: string): key is BoloPreferenceKey {
  return (BOLO_PREFERENCE_KEYS as readonly string[]).includes(key);
}

export interface AcceptPreferencesResult {
  values: BoloValues;
  /** Preference keys stored in this batch. */
  saved: BoloPreferenceKey[];
  /** Values that were not one of the catalog's options, with the options to read back. */
  rejected: RejectedAnswer[];
  /** Keys the model sent that are not one of the two — dropped, never stored. */
  ignored: string[];
  /** Of the two, the ones still empty afterwards — what Grio may still ask for. */
  missing: BoloPreferenceKey[];
}

/**
 * `acceptAnswers`, narrowed to the two preference keys. Same normalisation,
 * same catalog validation, same rejection loop — a city outside the list or
 * an age range the catalog does not offer is read back to the model with the
 * real options rather than stored. A key the user did not mention is left
 * exactly as it was: absent stays absent, filled stays filled.
 */
export function acceptPreferences(current: BoloValues, incoming: Record<string, unknown>): AcceptPreferencesResult {
  const allowed: Record<string, unknown> = {};
  const ignored: string[] = [];
  for (const [key, raw] of Object.entries(incoming ?? {})) {
    if (isBoloPreferenceKey(key)) allowed[key] = raw;
    else ignored.push(key);
  }
  const result = acceptAnswers(current, allowed);
  return {
    values: result.values,
    saved: result.saved.filter(isBoloPreferenceKey),
    rejected: result.rejected,
    ignored,
    missing: missingPreferences(result.values),
  };
}

/** Of the two optional preferences, the ones not validly answered yet. */
export function missingPreferences(values: BoloValues): BoloPreferenceKey[] {
  return BOLO_PREFERENCE_KEYS.filter((key) => {
    const def = FIELD_BY_KEY[key];
    return !def || !isValidFieldValue(def, values[key]);
  });
}

/** The preference half of the draft — what the done screen lists as "pasand save ho gayi". */
export function preferenceValues(values: BoloValues): Partial<Record<BoloPreferenceKey, string>> {
  const out: Partial<Record<BoloPreferenceKey, string>> = {};
  for (const key of BOLO_PREFERENCE_KEYS) if (values[key]) out[key] = values[key];
  return out;
}

/** Minimum fields not yet validly answered, in catalog order. */
export function missingMinimum(values: BoloValues): string[] {
  return MINIMUM_LIVE_FIELDS.filter((f) => !isValidFieldValue(f, values[f.key])).map((f) => f.key);
}

export function isMinimumComplete(values: BoloValues): boolean {
  return missingMinimum(values).length === 0;
}

/** Labels for a list of keys — what Grio reads out as "abhi ye baaki hai". */
export function labelsFor(keys: readonly string[]): string[] {
  return keys.map((k) => FIELD_BY_KEY[k]?.label ?? k);
}

export { MINIMUM_LIVE_KEYS };
