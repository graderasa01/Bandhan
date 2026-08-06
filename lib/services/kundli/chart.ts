import {
  ascendant,
  julianCenturies,
  julianDay,
  moonLongitude,
  norm360,
  planetLongitude,
  rahuLongitude,
  sunLongitude,
  toSidereal,
} from "./ephemeris";
import {
  BHAVA_MEANING,
  BHAVA_ORDINAL,
  NAKSHATRAS,
  NAKSHATRA_LORDS,
  RASHIS,
  type GrahaKey,
} from "./tables";
import { resolvePlace, type Place } from "./places";
import type { GrahaPosition, KundliChart } from "@/lib/contracts/kundli";

export { BHAVA_MEANING, BHAVA_ORDINAL };

/**
 * Turns the three things the profile builder collects — date of birth, a
 * free-text birth time, a free-text birth place — into a real natal chart.
 *
 * ## The degradation ladder, and why it is explicit
 *
 * Users answer these three at very different rates. Date of birth is required;
 * birth time is optional and often remembered as "subah ke aas paas"; birth
 * place is optional too. A kundli product that quietly substitutes noon and
 * Delhi for the missing two would produce a chart that *looks* complete and is
 * wrong by up to six rashis on the lagna.
 *
 * So the chart carries `precision` and the nullable `lagna`, and the UI shows
 * exactly which of the three inputs was real:
 *
 *  - **full** — date + time + a place we could resolve. Everything valid.
 *  - **no-place** — time known, place not. Planets are right (they do not
 *    depend on where you stood), lagna is dropped.
 *  - **no-time** — the Moon is computed for local noon, which pins its rashi
 *    and usually its nakshatra (it moves ~13°/day against a 13°20' nakshatra),
 *    but never a lagna.
 *
 * Guna milan runs off the Moon alone, so it survives all three rungs. That is
 * the reason this app can offer milan to nearly every user while still refusing
 * to invent a lagna for anybody.
 */

const IST_OFFSET_MINUTES = 330;

/** Nakshatra span, degrees. 360/27. */
const NAKSHATRA_SPAN = 360 / 27;

export interface BirthInput {
  dateOfBirth: Date | null;
  birthTime?: string | null;
  birthPlace?: string | null;
}

// ------------------------------------------------------------
// Birth time — a Hinglish free-text field, not a time picker
// ------------------------------------------------------------

const PERIOD_WORDS: ReadonlyArray<readonly [RegExp, "am" | "pm" | "am-early"]> = [
  [/\b(subah|savere|sabere|morning|prataah|pratah|bhor)\b/i, "am"],
  [/\b(dopahar|dopeher|noon|madhyanh|afternoon)\b/i, "pm"],
  [/\b(shaam|sham|evening|sandhya)\b/i, "pm"],
  [/\b(raat|raat ko|night|ratri|rat)\b/i, "pm"],
  [/\b(tadke|late night|midnight|aadhi raat)\b/i, "am-early"],
];

/**
 * Parses what people actually type: "subah 6:30", "6.30 am", "raat 10 baje",
 * "18:45", "dopahar 12 baje", "सुबह" is out of scope (the field is Latin-script
 * across the app). Returns minutes past local midnight, or null.
 *
 * Ambiguity is resolved the way a person would: a bare "7" with "subah" is
 * 07:00; with "raat" it is 19:00; with nothing at all it is left as typed and
 * only trusted when it already reads as 24-hour.
 */
export function parseBirthTime(raw?: string | null): number | null {
  const text = (raw ?? "").trim();
  if (!text) return null;

  const m = text.match(/(\d{1,2})\s*[:.\s]?\s*(\d{2})?/);
  if (!m) return null;

  let hour = Number(m[1]);
  const minute = m[2] === undefined ? 0 : Number(m[2]);
  if (!Number.isFinite(hour) || hour > 24 || minute > 59) return null;

  let period: "am" | "pm" | "am-early" | null = null;
  if (/\bam\b|a\.m\./i.test(text)) period = "am";
  else if (/\bpm\b|p\.m\./i.test(text)) period = "pm";
  else {
    for (const [re, p] of PERIOD_WORDS) {
      if (re.test(text)) {
        period = p;
        break;
      }
    }
  }

  if (period === "am" || period === "am-early") {
    if (hour === 12) hour = 0;
  } else if (period === "pm") {
    // "dopahar 12" is noon, not midnight; "shaam 6" is 18:00.
    if (hour < 12) hour += 12;
  } else if (hour > 24) {
    return null;
  }

  if (hour >= 24) hour -= 24;
  return hour * 60 + minute;
}

// ------------------------------------------------------------
// Chart
// ------------------------------------------------------------

function rashiOf(lon: number): number {
  return Math.floor(norm360(lon) / 30) + 1;
}

function nakshatraOf(lon: number): { index: number; pada: number } {
  const l = norm360(lon);
  const index = Math.floor(l / NAKSHATRA_SPAN) + 1;
  const within = l - (index - 1) * NAKSHATRA_SPAN;
  return { index, pada: Math.min(4, Math.floor(within / (NAKSHATRA_SPAN / 4)) + 1) };
}

/** House number 1–12 counting from a reference rashi, both 1-based. */
function houseFrom(referenceRashi: number, targetRashi: number): number {
  return ((targetRashi - referenceRashi + 12) % 12) + 1;
}

const MANGLIK_HOUSES = new Set([1, 2, 4, 7, 8, 12]);

function position(
  graha: GrahaKey,
  siderealLon: number,
  lagnaRashi: number | null,
  retrograde = false,
): GrahaPosition {
  const rashi = rashiOf(siderealLon);
  const nak = nakshatraOf(siderealLon);
  return {
    graha,
    longitude: siderealLon,
    rashi,
    rashiName: RASHIS[rashi - 1],
    degreeInRashi: norm360(siderealLon) - (rashi - 1) * 30,
    nakshatra: nak.index,
    nakshatraName: NAKSHATRAS[nak.index - 1],
    pada: nak.pada,
    bhava: lagnaRashi === null ? null : houseFrom(lagnaRashi, rashi),
    retrograde,
  };
}

/**
 * The public entry point. `dateOfBirth` is the only hard requirement; the rest
 * of the ladder is handled inside.
 */
export function buildChart(input: BirthInput): KundliChart | null {
  if (!input.dateOfBirth) return null;

  const minutes = parseBirthTime(input.birthTime);
  const place: Place | null = resolvePlace(input.birthPlace);
  const hasBirthTime = minutes !== null;
  const hasBirthPlace = place !== null;

  // Without a time we use local noon: it is the midpoint of the day, so it
  // halves the worst-case Moon error to ~6.5° instead of 13°.
  const localMinutes = minutes ?? 12 * 60;
  const tz = place?.tzOffsetMinutes ?? IST_OFFSET_MINUTES;

  // dateOfBirth is a @db.Date — Prisma hands it back as UTC midnight, so its
  // UTC calendar fields are the calendar date the user typed. Rebuild the
  // instant from those, then step back to UTC by the birth place's offset.
  const utc = new Date(
    Date.UTC(
      input.dateOfBirth.getUTCFullYear(),
      input.dateOfBirth.getUTCMonth(),
      input.dateOfBirth.getUTCDate(),
      0,
      localMinutes - tz,
    ),
  );

  const jd = julianDay(utc);
  const T = julianCenturies(jd);

  const lagnaLon =
    hasBirthTime && place ? toSidereal(ascendant(jd, T, place.lat, place.lon), T) : null;
  const lagnaRashi = lagnaLon === null ? null : rashiOf(lagnaLon);

  const moonLon = toSidereal(moonLongitude(T), T);
  const rahuLon = toSidereal(rahuLongitude(T), T);

  const grahas: GrahaPosition[] = [
    position("Surya", toSidereal(sunLongitude(T), T), lagnaRashi),
    position("Chandra", moonLon, lagnaRashi),
    position("Mangal", toSidereal(planetLongitude("Mars", T), T), lagnaRashi),
    position("Budh", toSidereal(planetLongitude("Mercury", T), T), lagnaRashi),
    position("Guru", toSidereal(planetLongitude("Jupiter", T), T), lagnaRashi),
    position("Shukra", toSidereal(planetLongitude("Venus", T), T), lagnaRashi),
    position("Shani", toSidereal(planetLongitude("Saturn", T), T), lagnaRashi),
    // Rahu and Ketu are always retrograde by definition — the node regresses.
    position("Rahu", rahuLon, lagnaRashi, true),
    position("Ketu", norm360(rahuLon + 180), lagnaRashi, true),
  ];

  const mars = grahas[2];
  const moonRashi = rashiOf(moonLon);
  const marsHouseFromMoon = houseFrom(moonRashi, mars.rashi);
  const moonNak = nakshatraOf(moonLon);

  return {
    hasBirthTime,
    hasBirthPlace,
    placeName: place?.name ?? null,
    lagna:
      lagnaLon === null || lagnaRashi === null
        ? null
        : {
            rashi: lagnaRashi,
            rashiName: RASHIS[lagnaRashi - 1],
            degreeInRashi: norm360(lagnaLon) - (lagnaRashi - 1) * 30,
          },
    chandra: {
      rashi: moonRashi,
      rashiName: RASHIS[moonRashi - 1],
      nakshatra: moonNak.index,
      nakshatraName: NAKSHATRAS[moonNak.index - 1],
      pada: moonNak.pada,
      nakshatraLord: NAKSHATRA_LORDS[(moonNak.index - 1) % 9],
    },
    grahas,
    manglik: {
      fromLagna: mars.bhava === null ? null : MANGLIK_HOUSES.has(mars.bhava),
      fromMoon: MANGLIK_HOUSES.has(marsHouseFromMoon),
      marsHouseFromLagna: mars.bhava,
      marsHouseFromMoon,
    },
    precision: !hasBirthTime ? "no-time" : !hasBirthPlace ? "no-place" : "full",
  };
}

/**
 * The Moon's rashi + nakshatra, which is all guna milan needs. Separated from
 * `buildChart` so the milan path never has to compute — or hold in memory — a
 * chart belonging to someone the viewer is not allowed to see one for.
 */
export interface MoonPosition {
  rashi: number;
  rashiName: string;
  nakshatra: number;
  nakshatraName: string;
  pada: number;
  /** True when birth time was missing, so the Moon came from local noon. */
  approximate: boolean;
}

export function moonPositionFor(input: BirthInput): MoonPosition | null {
  if (!input.dateOfBirth) return null;

  const minutes = parseBirthTime(input.birthTime);
  const place = resolvePlace(input.birthPlace);
  const tz = place?.tzOffsetMinutes ?? IST_OFFSET_MINUTES;

  const utc = new Date(
    Date.UTC(
      input.dateOfBirth.getUTCFullYear(),
      input.dateOfBirth.getUTCMonth(),
      input.dateOfBirth.getUTCDate(),
      0,
      (minutes ?? 12 * 60) - tz,
    ),
  );

  const T = julianCenturies(julianDay(utc));
  const lon = toSidereal(moonLongitude(T), T);
  const rashi = rashiOf(lon);
  const nak = nakshatraOf(lon);

  return {
    rashi,
    rashiName: RASHIS[rashi - 1],
    nakshatra: nak.index,
    nakshatraName: NAKSHATRAS[nak.index - 1],
    pada: nak.pada,
    approximate: minutes === null,
  };
}
