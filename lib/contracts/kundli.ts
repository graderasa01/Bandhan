/**
 * Kundli & guna milan — the shapes that cross the server/client line.
 *
 * One privacy rule governs every type in this file, and it comes straight from
 * the promise made to the user while they typed the data
 * (`lib/profile/fields.ts`): *"birth time / birth place — sirf kundli ke liye,
 * kisi aur ko kabhi nahi dikhta."*
 *
 * So: **no type here carries the other person's birth time, birth date, or
 * birth place.** A `KundliChart` is only ever built for its own owner. What a
 * viewer receives about someone else is `GunaMilan` — nakshatra, rashi and the
 * koota scores derived from them, which are conclusions, not the raw birth
 * details they came from.
 */

export type KundliTone = "ok" | "info" | "caution";

/** The two traditional notes that need no birth time at all. */
export interface KundliNote {
  id: "gotra" | "manglik";
  tone: KundliTone;
  title: string;
  detail: string;
}

export interface GrahaPosition {
  /** "Surya", "Chandra", … — Hinglish, matching what a pandit would say. */
  graha: string;
  /** Sidereal longitude, 0–360. */
  longitude: number;
  /** 1–12, Mesh = 1. */
  rashi: number;
  rashiName: string;
  /** Degrees within the rashi, 0–30. */
  degreeInRashi: number;
  /** 1–27, Ashwini = 1. */
  nakshatra: number;
  nakshatraName: string;
  /** 1–4. */
  pada: number;
  /** 1–12 from the lagna. Null when the chart has no lagna. */
  bhava: number | null;
  retrograde: boolean;
}

export interface KundliChart {
  /** False when birth time was missing/unparseable — planets still valid, lagna is not. */
  hasBirthTime: boolean;
  /** False when the birth place could not be resolved — no lagna, no bhavas. */
  hasBirthPlace: boolean;
  placeName: string | null;
  /** Present only when both flags above are true. */
  lagna: {
    rashi: number;
    rashiName: string;
    degreeInRashi: number;
  } | null;
  /** The Moon — always computable from the date alone, so never null. */
  chandra: {
    rashi: number;
    rashiName: string;
    nakshatra: number;
    nakshatraName: string;
    pada: number;
    nakshatraLord: string;
  };
  grahas: GrahaPosition[];
  /**
   * Computed Mangal dosha, from lagna and from the Moon. Null when there is no
   * lagna to judge it from — see `manglikFromMoon` for the half-answer that is
   * still available in that case.
   */
  manglik: {
    fromLagna: boolean | null;
    fromMoon: boolean;
    /** The house Mars sits in, from lagna. Null without a lagna. */
    marsHouseFromLagna: number | null;
    marsHouseFromMoon: number;
  };
  /**
   * How much of the birth data was real vs. assumed — rendered next to the
   * chart so nobody mistakes a date-only kundli for a full one.
   */
  precision: "full" | "no-place" | "no-time";
}

export interface KootaResult {
  key: "varna" | "vashya" | "tara" | "yoni" | "grahaMaitri" | "gana" | "bhakoot" | "nadi";
  label: string;
  score: number;
  max: number;
  /** What each side actually is — "Brahmin vs Kshatriya", "Gau vs Vyaghra". */
  boyValue: string;
  girlValue: string;
  /** One plain-Hinglish line on what this koota is even about. */
  meaning: string;
  /** Why this particular score came out. */
  verdict: string;
  tone: KundliTone;
}

export interface GunaMilan {
  total: number;
  max: 36;
  kootas: KootaResult[];
  /** "Uttam" / "Shubh" / "Madhyam" / "Vichaar yogya" — the classical bands. */
  band: string;
  bandTone: KundliTone;
  headline: string;
  /** Present when Nadi or Bhakoot scored zero — the two classical dosha. */
  dosha: { key: "nadi" | "bhakoot"; title: string; detail: string }[];
  /** Nakshatra/rashi of both sides — safe to show, unlike birth details. */
  boy: { rashiName: string; nakshatraName: string };
  girl: { rashiName: string; nakshatraName: string };
}

/** What a profile screen gets: the old notes, plus milan when both sides have birth data. */
export interface KundliMatchView {
  notes: KundliNote[];
  milan: GunaMilan | null;
  /** Why milan is absent, when it is — shown as a prompt, not an error. */
  milanBlockedReason: "viewer-missing-dob" | "candidate-missing-dob" | "same-gender" | null;
}

export const GUNA_BANDS: ReadonlyArray<{ min: number; band: string; tone: KundliTone; headline: string }> = [
  {
    min: 32,
    band: "Uttam",
    tone: "ok",
    headline: "Parampara ke hisaab se ye bahut achha milan hai.",
  },
  {
    min: 25,
    band: "Shubh",
    tone: "ok",
    headline: "Guna achhe mile hain — parivaar aam taur par ise shubh maante hain.",
  },
  {
    min: 18,
    band: "Madhyam",
    tone: "info",
    headline: "Guna theek-thaak hain. Kaafi rishte isi range me tay hote hain.",
  },
  {
    min: 0,
    band: "Vichaar yogya",
    tone: "caution",
    headline: "Guna kam mile hain. Agar ye aapke ghar me maayne rakhta hai to pandit ji se poori kundli dikhwa lijiye.",
  },
];
