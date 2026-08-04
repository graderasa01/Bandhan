import type { InterviewErrorCode, SpokenLanguage } from "./interview";

/**
 * Bio writer contracts — 02_product_spec §19.
 *
 * §19.2 forbids the bio from containing salary, caste, exact location and the
 * rest. The enforcement here is not a prompt instruction but the field
 * whitelist below: the model is only ever handed the nine things §19.1 permits,
 * so the forbidden ones are absent from its input rather than merely
 * discouraged in it. A rule the model cannot break beats a rule it is asked not
 * to.
 */

/** §19.1 — the only profile fields a bio may be built from. */
export const BIO_ALLOWED_FIELDS = [
  "fullName",
  "dateOfBirth", // sent as age, never as a date
  "currentCity",
  "education",
  "profession",
  "familyType",
  "fatherOccupation",
  "motherOccupation",
  "siblings",
  "diet",
  "hobbies",
  "languagesKnown",
  "familyValues",
  "partnerAgeRange",
  "partnerEducation",
  "relocateWilling",
] as const;

/**
 * §19.2 — never reaches the model. Kept as an explicit list so the guard in the
 * route reads as the rule it enforces, and so a field added to the catalog
 * later cannot leak in by default.
 */
export const BIO_FORBIDDEN_FIELDS = [
  "annualIncome",
  "religion",
  "caste",
  "subCaste",
  "gotra",
  "manglik",
  "birthTime",
  "birthPlace",
  "workLocation",
  "dealBreakers",
  "photos",
  "gender",
  "maritalStatus",
  "height",
  "motherTongue",
  "partnerCityPreference",
] as const;

export type BioTone = "simple" | "family" | "professional";

export const BIO_TONES: { id: BioTone; label: string; hint: string }[] = [
  { id: "simple", label: "Seedha-saada", hint: "Chhota, saaf, bina bhaari shabdon ke" },
  { id: "family", label: "Ghar-parivaar wala", hint: "Jaise rishta dekhne wale padhna chahte hain" },
  { id: "professional", label: "Professional", hint: "Padhai aur kaam par zor" },
];

/** One small answer the user gave to a prompt like "weekend me kya karte hain". */
export type BioAnswer = {
  prompt: string;
  answer: string;
};

export type BioRequest = {
  answers: BioAnswer[];
  language: SpokenLanguage;
  fillingFor: "self" | "son" | "daughter";
  /** Whitelisted profile values only — the route filters before sending. */
  knownFields: Record<string, string>;
};

export type BioDraft = {
  tone: BioTone;
  text: string;
};

export type BioResponse =
  | {
      ok: true;
      drafts: BioDraft[];
      /**
       * The exact inputs the bio was built from, echoed back so the screen can
       * show "ye isi se bana hai". A bio the user cannot audit is a bio they
       * have to take on faith.
       */
      usedFields: string[];
    }
  | { ok: false; code: InterviewErrorCode; message: string };
