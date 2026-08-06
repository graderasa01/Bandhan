/**
 * The traditional tables — the part of a kundli that is *not* astronomy.
 *
 * `ephemeris.ts` computes where the Moon was; everything here is the classical
 * bookkeeping laid on top of that, and it is all lookup, no cleverness. Kept
 * as plain readable data on purpose: a family that wants to check one of these
 * against their own pandit's book should be able to find the row in seconds.
 *
 * Where classical sources disagree — and for Vashya, Gana and Graha Maitri
 * they genuinely do — the comment above the table says which reading is
 * encoded. The app then says so on screen too, rather than presenting one
 * school's number as the number.
 */

export const RASHIS = [
  "Mesh", "Vrishabh", "Mithun", "Kark", "Simha", "Kanya",
  "Tula", "Vrishchik", "Dhanu", "Makar", "Kumbh", "Meen",
] as const;

export const RASHIS_EN = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
] as const;

export const NAKSHATRAS = [
  "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra",
  "Punarvasu", "Pushya", "Ashlesha", "Magha", "Purva Phalguni", "Uttara Phalguni",
  "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha", "Jyeshtha",
  "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana", "Dhanishta", "Shatabhisha",
  "Purva Bhadrapada", "Uttara Bhadrapada", "Revati",
] as const;

/** Nakshatra lords in the Vimshottari order — also the dasha sequence. */
export const NAKSHATRA_LORDS = [
  "Ketu", "Shukra", "Surya", "Chandra", "Mangal", "Rahu", "Guru", "Shani", "Budh",
] as const;

export const PLANET_NAMES = {
  Surya: "Surya", Chandra: "Chandra", Mangal: "Mangal", Budh: "Budh",
  Guru: "Guru", Shukra: "Shukra", Shani: "Shani", Rahu: "Rahu", Ketu: "Ketu",
} as const;

export type GrahaKey = keyof typeof PLANET_NAMES;

/** Rashi lords, index 0 = Mesh. Used by Graha Maitri and by the chart itself. */
export const RASHI_LORDS: readonly GrahaKey[] = [
  "Mangal", "Shukra", "Budh", "Chandra", "Surya", "Budh",
  "Shukra", "Mangal", "Guru", "Shani", "Shani", "Guru",
];

// ------------------------------------------------------------
// Koota 1 — Varna (1 guna)
// ------------------------------------------------------------

export type Varna = "Brahmin" | "Kshatriya" | "Vaishya" | "Shudra";

/** By Moon rashi. Water signs → Brahmin, fire → Kshatriya, earth → Vaishya, air → Shudra. */
export const RASHI_VARNA: readonly Varna[] = [
  "Kshatriya", "Vaishya", "Shudra", "Brahmin", "Kshatriya", "Vaishya",
  "Shudra", "Brahmin", "Kshatriya", "Vaishya", "Shudra", "Brahmin",
];

export const VARNA_RANK: Record<Varna, number> = {
  Shudra: 1, Vaishya: 2, Kshatriya: 3, Brahmin: 4,
};

// ------------------------------------------------------------
// Koota 2 — Vashya (2 guna)
// ------------------------------------------------------------

export type Vashya = "Chatushpad" | "Manav" | "Jalchar" | "Vanchar" | "Keet";

/**
 * Classical texts split Dhanu and Makar across two vashya groups by half-sign.
 * Almost every printed milan chart collapses that to one group per rashi, and
 * so does this table — a half-sign split would change the answer only for a
 * Moon in the exact middle 15° of two signs, and would need a precision of
 * *stated intent* the source texts do not agree on.
 */
export const RASHI_VASHYA: readonly Vashya[] = [
  "Chatushpad", "Chatushpad", "Manav", "Jalchar", "Vanchar", "Manav",
  "Manav", "Keet", "Manav", "Jalchar", "Manav", "Jalchar",
];

const VASHYA_ORDER: readonly Vashya[] = ["Chatushpad", "Manav", "Jalchar", "Vanchar", "Keet"];

/** Rows = boy's vashya, columns = girl's. Max 2. */
const VASHYA_MATRIX: readonly (readonly number[])[] = [
  [2, 1, 2, 0, 2],
  [1, 2, 2, 0.5, 2],
  [2, 1, 2, 0.5, 2],
  [0, 1, 0.5, 2, 2],
  [2, 2, 2, 0.5, 2],
];

export function vashyaScore(boy: Vashya, girl: Vashya): number {
  return VASHYA_MATRIX[VASHYA_ORDER.indexOf(boy)][VASHYA_ORDER.indexOf(girl)];
}

// ------------------------------------------------------------
// Koota 4 — Yoni (4 guna)
// ------------------------------------------------------------

export const YONI_ANIMALS = [
  "Ashwa", "Gaja", "Mesh", "Sarp", "Shwan", "Marjar", "Mushak",
  "Gau", "Mahish", "Vyaghra", "Mrig", "Vanar", "Nakul", "Simha",
] as const;

export const YONI_ANIMALS_HI = [
  "Ghoda", "Haathi", "Bhed", "Saanp", "Kutta", "Billi", "Chuha",
  "Gaay", "Bhains", "Sher (baagh)", "Hiran", "Bandar", "Neola", "Sinh",
] as const;

/** Nakshatra 1–27 → index into YONI_ANIMALS, plus the yoni's own gender. */
export const NAKSHATRA_YONI: readonly (readonly [number, "M" | "F"])[] = [
  [0, "M"], [1, "M"], [2, "F"], [3, "M"], [3, "F"], [4, "F"],
  [5, "F"], [2, "M"], [5, "M"], [6, "M"], [6, "F"], [7, "M"],
  [8, "F"], [9, "F"], [8, "M"], [9, "M"], [10, "F"], [10, "M"],
  [4, "M"], [11, "M"], [12, "F"], [11, "F"], [13, "F"], [0, "F"],
  [13, "M"], [7, "F"], [1, "F"],
];

/** The classical 14×14 yoni compatibility grid. 4 = same, 0 = sworn enemies. */
const YONI_MATRIX: readonly (readonly number[])[] = [
  [4, 2, 2, 3, 2, 2, 2, 1, 0, 1, 1, 3, 2, 1],
  [2, 4, 3, 3, 3, 2, 2, 2, 3, 1, 2, 3, 2, 0],
  [2, 3, 4, 2, 1, 2, 1, 3, 3, 1, 2, 0, 3, 1],
  [3, 3, 2, 4, 2, 1, 1, 1, 1, 2, 2, 2, 0, 2],
  [2, 3, 1, 2, 4, 2, 1, 2, 2, 1, 0, 2, 1, 1],
  [2, 2, 2, 1, 2, 4, 0, 2, 2, 1, 3, 3, 2, 1],
  [2, 2, 1, 1, 1, 0, 4, 2, 2, 2, 2, 2, 1, 2],
  [1, 2, 3, 1, 2, 2, 2, 4, 3, 0, 3, 2, 2, 1],
  [0, 3, 3, 1, 2, 2, 2, 3, 4, 1, 2, 2, 2, 1],
  [1, 1, 1, 2, 1, 1, 2, 0, 1, 4, 1, 1, 2, 1],
  [1, 2, 2, 2, 0, 3, 2, 3, 2, 1, 4, 2, 1, 1],
  [3, 3, 0, 2, 2, 3, 2, 2, 2, 1, 2, 4, 2, 1],
  [2, 2, 3, 0, 1, 2, 1, 2, 2, 2, 1, 2, 4, 1],
  [1, 0, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 4],
];

export function yoniScore(boyAnimal: number, girlAnimal: number): number {
  return YONI_MATRIX[boyAnimal][girlAnimal];
}

// ------------------------------------------------------------
// Koota 5 — Graha Maitri (5 guna)
// ------------------------------------------------------------

type Relation = "friend" | "neutral" | "enemy";

/** Naimittika-free *natural* friendship only — the standard milan reading. */
const FRIENDSHIP: Record<GrahaKey, { friends: GrahaKey[]; neutrals: GrahaKey[] }> = {
  Surya: { friends: ["Chandra", "Mangal", "Guru"], neutrals: ["Budh"] },
  Chandra: { friends: ["Surya", "Budh"], neutrals: ["Mangal", "Guru", "Shukra", "Shani"] },
  Mangal: { friends: ["Surya", "Chandra", "Guru"], neutrals: ["Shukra", "Shani"] },
  Budh: { friends: ["Surya", "Shukra"], neutrals: ["Mangal", "Guru", "Shani"] },
  Guru: { friends: ["Surya", "Chandra", "Mangal"], neutrals: ["Shani"] },
  Shukra: { friends: ["Budh", "Shani"], neutrals: ["Mangal", "Guru"] },
  Shani: { friends: ["Budh", "Shukra"], neutrals: ["Guru"] },
  // Rahu/Ketu never rule a rashi, so they can never reach this table.
  Rahu: { friends: [], neutrals: [] },
  Ketu: { friends: [], neutrals: [] },
};

export function relationTo(from: GrahaKey, to: GrahaKey): Relation {
  if (from === to) return "friend";
  const row = FRIENDSHIP[from];
  if (row.friends.includes(to)) return "friend";
  if (row.neutrals.includes(to)) return "neutral";
  return "enemy";
}

/**
 * Both directions matter and are not symmetric — Surya counts Shukra an enemy
 * while Shukra counts Surya one too, but Chandra→Shani is neutral where
 * Shani→Chandra is hostile. The pair of relations picks the score.
 */
export function grahaMaitriScore(a: Relation, b: Relation): number {
  const key = [a, b].sort().join("-");
  switch (key) {
    case "friend-friend": return 5;
    case "friend-neutral": return 4;
    case "neutral-neutral": return 3;
    case "enemy-friend": return 1;
    case "enemy-neutral": return 0.5;
    default: return 0; // enemy-enemy
  }
}

// ------------------------------------------------------------
// Koota 6 — Gana (6 guna)
// ------------------------------------------------------------

export type Gana = "Dev" | "Manushya" | "Rakshas";

export const NAKSHATRA_GANA: readonly Gana[] = [
  "Dev", "Manushya", "Rakshas", "Manushya", "Dev", "Manushya",
  "Dev", "Dev", "Rakshas", "Rakshas", "Manushya", "Manushya",
  "Dev", "Rakshas", "Dev", "Rakshas", "Dev", "Rakshas",
  "Rakshas", "Manushya", "Manushya", "Dev", "Rakshas", "Rakshas",
  "Manushya", "Manushya", "Dev",
];

const GANA_ORDER: readonly Gana[] = ["Dev", "Manushya", "Rakshas"];

/**
 * Rows = boy, columns = girl. Asymmetric by design: the tradition is harsher
 * on a Rakshas-gana boy with a Dev-gana girl than on the reverse.
 */
const GANA_MATRIX: readonly (readonly number[])[] = [
  [6, 6, 0],
  [5, 6, 0],
  [1, 0, 6],
];

export function ganaScore(boy: Gana, girl: Gana): number {
  return GANA_MATRIX[GANA_ORDER.indexOf(boy)][GANA_ORDER.indexOf(girl)];
}

// ------------------------------------------------------------
// Koota 8 — Nadi (8 guna)
// ------------------------------------------------------------

export type Nadi = "Adi" | "Madhya" | "Antya";

export const NAKSHATRA_NADI: readonly Nadi[] = [
  "Adi", "Madhya", "Antya", "Antya", "Madhya", "Adi",
  "Adi", "Madhya", "Antya", "Antya", "Madhya", "Adi",
  "Adi", "Madhya", "Antya", "Antya", "Madhya", "Adi",
  "Adi", "Madhya", "Antya", "Antya", "Madhya", "Adi",
  "Adi", "Madhya", "Antya",
];

export const NADI_MEANING: Record<Nadi, string> = {
  Adi: "Vata",
  Madhya: "Pitta",
  Antya: "Kapha",
};

// ------------------------------------------------------------
// Houses / bhava names — used by the chart, not by milan
// ------------------------------------------------------------

/**
 * "12ve bhav" is what a naive `${n}ve` produces and it is wrong for most of
 * the twelve — Hindi ordinals are irregular exactly where they are used most
 * (pehle, doosre, chauthe, saatve). Twelve strings is cheaper than a rule.
 */
export const BHAVA_ORDINAL: readonly string[] = [
  "pehle", "doosre", "teesre", "chauthe", "paanchve", "chhathe",
  "saatve", "aathve", "nauve", "dasve", "gyarahve", "barahve",
];

export const BHAVA_MEANING: readonly string[] = [
  "Aap khud, sehat, personality",
  "Paisa, parivaar, boli",
  "Himmat, bhai-behen",
  "Ghar, maa, sukh",
  "Padhai, santaan, prem",
  "Rog, karz, competition",
  "Shaadi aur partner",
  "Aayu, badlav, virasat",
  "Bhagya, dharm, guru",
  "Career, samaaj me naam",
  "Aamdani, dost, ichchha",
  "Kharch, videsh, mukti",
];
