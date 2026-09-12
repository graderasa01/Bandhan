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

/**
 * A birth place the chart was actually computed for — the canonical name,
 * the coordinates the ascendant used, and the UTC offset the birth time was
 * read in. `source` says where the answer came from, because "we found it in
 * our own city table" and "a geocoder said so" deserve different trust.
 */
export interface ResolvedPlace {
  name: string;
  lat: number;
  /** East-positive. */
  lon: number;
  /** Minutes east of UTC *on the birth date* — historical DST included when a timezone id is known. */
  tzOffsetMinutes: number;
  /** IANA id when known ("Asia/Kolkata"); null when only an offset could be established. */
  timeZoneId: string | null;
  source: "static" | "nominatim" | "opencage" | "user";
}

/**
 * Every value the chart had to *assume* rather than read, named. A chart
 * with an empty list used exactly what it was given; anything here is shown
 * to the reader as the reason a rung of precision is missing. Never a silent
 * noon, never a silent city.
 */
export type KundliAssumption =
  /** No usable birth time — the Moon was placed for local noon (±6.5° worst case). */
  | "moon-at-noon"
  /** No resolvable place — the time was read as IST, and no lagna was built. */
  | "timezone-ist"
  /** Place found, but no timezone for it — the time was read as IST and the lagna dropped. */
  | "timezone-unknown";

export interface KundliChart {
  /** False when birth time was missing/unparseable — planets still valid, lagna is not. */
  hasBirthTime: boolean;
  /** False when the birth place could not be resolved — no lagna, no bhavas. */
  hasBirthPlace: boolean;
  placeName: string | null;
  /** The place the ascendant was computed for; null when none could be resolved. */
  place: ResolvedPlace | null;
  /** The birth time as the chart read it, "HH:MM" local — null when none was usable. */
  birthTimeResolved: string | null;
  /** The birth date the chart was computed for, "YYYY-MM-DD". */
  dateOfBirth: string;
  assumptions: KundliAssumption[];
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

/**
 * Astro-AI: a short traditional reading of a chart that code has already
 * computed. Every field is prose *about* the numbers, never a number — the
 * model is handed the chart summary and may not add a planet, a house or a
 * guna to it. `note` is fixed copy from code, not the model's.
 */
export interface KundliInterpretation {
  /** Two or three sentences on the chart as a whole. */
  summary: string;
  /** Temperament / behaviour tendencies the tradition reads from the Moon, lagna and their lords. */
  temperament: string[];
  strengths: string[];
  /** Things a family would traditionally sit down and talk about — never verdicts. */
  discuss: string[];
  /** Present only when a guna milan was interpreted: one plain line per koota. */
  gunaNotes: Array<{ key: KootaResult["key"]; label: string; note: string }>;
  /** The standing disclaimer, from code. */
  note: string;
  /** Which model answered — for the "AI se, {provider}" line and cost tracing. */
  provider: string;
}

/** Who a manual kundli was made for — printed on the result and the PDF, saved nowhere. */
export interface KundliSubject {
  name: string;
  /** "YYYY-MM-DD" */
  dateOfBirth: string;
  /** Exactly as typed; null when the person said they do not know it. */
  birthTime: string | null;
  birthTimeUnknown: boolean;
  /** Exactly as typed. */
  birthPlace: string | null;
  /** True when the person chose "Sthaan pata nahi" rather than leaving it blank. */
  birthPlaceUnknown: boolean;
}

/** A place the geocoder offered when the typed text fit more than one — the person picks one. */
export interface PlaceCandidate {
  id: string;
  name: string;
  /** "Rajasthan, India" — enough to tell two same-named towns apart. */
  region: string;
  lat: number;
  lon: number;
  timeZoneId: string | null;
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
