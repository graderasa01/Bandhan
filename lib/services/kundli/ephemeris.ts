/**
 * A real ephemeris — small, dependency-free, and accurate enough that every
 * number this app prints on a kundli is one a pandit can check.
 *
 * ## Why this file exists at all
 *
 * `kundliService.ts` used to say, correctly, that a 36-guna score with no
 * ephemeris behind it is "a number pulled from the air". That objection was
 * never to guna milan — it was to *faking* it. This module removes the
 * objection by actually computing the sky: Moon longitude from Meeus' lunar
 * series, planets from JPL's approximate Keplerian elements, ascendant from
 * local sidereal time. Nothing downstream invents anything.
 *
 * ## Accuracy, stated plainly
 *
 *  - Moon: Meeus ch. 47 (60-term ΣL series) — better than 1 arcminute. This is
 *    the one that matters, because nakshatra (13°20') and rashi (30°) are both
 *    decided by the Moon, and guna milan is decided by those two alone.
 *  - Sun: Meeus ch. 25 low-accuracy series — ~0.01°.
 *  - Mars/Mercury/Venus/Jupiter/Saturn: JPL "Approximate Positions of the Major
 *    Planets" Keplerian elements, valid 1800–2050 — a few arcminutes for the
 *    inner planets, ~10' for Saturn. A rashi is 30° wide; this is far inside
 *    the tolerance of anything we say about it.
 *  - Rahu/Ketu: mean lunar node (not true node). Indian panchangs are split on
 *    which to use; mean is the more common choice and differs by under 1.5°.
 *
 * ## Sidereal, not tropical
 *
 * Everything public here returns **sidereal** (nirayana) longitude — the frame
 * Indian astrology actually uses — via Lahiri/Chitrapaksha ayanamsa. The
 * conversion is centralised in `toSidereal` so no caller can forget it.
 */

const DEG = Math.PI / 180;

function norm360(d: number): number {
  const r = d % 360;
  return r < 0 ? r + 360 : r;
}

const sinD = (d: number) => Math.sin(d * DEG);
const cosD = (d: number) => Math.cos(d * DEG);
const tanD = (d: number) => Math.tan(d * DEG);

/**
 * Julian Day from a UTC instant. Standard Fliegel/Meeus civil-calendar form —
 * every birth this app will ever see is Gregorian, so the Julian-calendar
 * branch is deliberately absent.
 */
export function julianDay(utc: Date): number {
  let year = utc.getUTCFullYear();
  let month = utc.getUTCMonth() + 1;
  const day =
    utc.getUTCDate() +
    (utc.getUTCHours() + utc.getUTCMinutes() / 60 + utc.getUTCSeconds() / 3600) / 24;

  if (month <= 2) {
    year -= 1;
    month += 12;
  }
  const a = Math.floor(year / 100);
  const b = 2 - a + Math.floor(a / 4);

  return (
    Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + b - 1524.5
  );
}

/** Julian centuries since J2000.0 — the argument every series below takes. */
export function julianCenturies(jd: number): number {
  return (jd - 2451545.0) / 36525;
}

/**
 * Lahiri (Chitrapaksha) ayanamsa.
 *
 * 23°51'11" at J2000.0, advancing at the general precession rate of ~50.29"/yr.
 * The quadratic term is precession's own acceleration. Over the 1900–2050 span
 * a matrimony app will ever be handed a birth date in, this agrees with
 * published Lahiri tables to a couple of arcseconds — irrelevant against a
 * 13°20' nakshatra, and this is why we can skip shipping a lookup table.
 */
export function ayanamsa(T: number): number {
  return 23.85306 + 1.397028 * T + 0.0000308 * T * T;
}

/** Tropical longitude of date → sidereal. The one door to the nirayana frame. */
export function toSidereal(tropicalOfDate: number, T: number): number {
  return norm360(tropicalOfDate - ayanamsa(T));
}

/** Mean obliquity of the ecliptic (Meeus 22.2), degrees. */
export function obliquity(T: number): number {
  return 23.4392911 - (46.815 * T + 0.00059 * T * T - 0.001813 * T * T * T) / 3600;
}

// ============================================================
// Moon — Meeus, Astronomical Algorithms ch. 47, table 47.A
// ============================================================

/**
 * [D, M, M', F, coefficient×1e-6 deg] — the 60 periodic terms of ΣL.
 *
 * Terms carrying M (the Sun's anomaly) are scaled by E = 1 − 0.002516T…, once
 * for |M| = 1 and twice for |M| = 2, because the Earth's orbital eccentricity
 * that drives them is itself slowly changing.
 */
const MOON_TERMS: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [0, 0, 1, 0, 6288774], [2, 0, -1, 0, 1274027], [2, 0, 0, 0, 658314],
  [0, 0, 2, 0, 213618], [0, 1, 0, 0, -185116], [0, 0, 0, 2, -114332],
  [2, 0, -2, 0, 58793], [2, -1, -1, 0, 57066], [2, 0, 1, 0, 53322],
  [2, -1, 0, 0, 45758], [0, 1, -1, 0, -40923], [1, 0, 0, 0, -34720],
  [0, 1, 1, 0, -30383], [2, 0, 0, -2, 15327], [0, 0, 1, 2, -12528],
  [0, 0, 1, -2, 10980], [4, 0, -1, 0, 10675], [0, 0, 3, 0, 10034],
  [4, 0, -2, 0, 8548], [2, 1, -1, 0, -7888], [2, 1, 0, 0, -6766],
  [1, 0, -1, 0, -5163], [1, 1, 0, 0, 4987], [2, -1, 1, 0, 4036],
  [2, 0, 2, 0, 3994], [4, 0, 0, 0, 3861], [2, 0, -3, 0, 3665],
  [0, 1, -2, 0, -2689], [2, 0, -1, 2, -2602], [2, -1, -2, 0, 2390],
  [1, 0, 1, 0, -2348], [2, -2, 0, 0, 2236], [0, 1, 2, 0, -2120],
  [0, 2, 0, 0, -2069], [2, -2, -1, 0, 2048], [2, 0, 1, -2, -1773],
  [2, 0, 0, 2, -1595], [4, -1, -1, 0, 1215], [0, 0, 2, 2, -1110],
  [3, 0, -1, 0, -892], [2, 1, 1, 0, -810], [4, -1, -2, 0, 759],
  [0, 2, -1, 0, -713], [2, 2, -1, 0, -700], [2, 1, -2, 0, 691],
  [2, -1, 0, -2, 596], [4, 0, 1, 0, 549], [0, 0, 4, 0, 537],
  [4, -1, 0, 0, 520], [1, 0, -2, 0, -487], [2, 1, 0, -2, -399],
  [0, 0, 2, -2, -381], [1, 1, 1, 0, 351], [3, 0, -2, 0, -340],
  [4, 0, -3, 0, 330], [2, -1, 2, 0, 327], [0, 2, 1, 0, -323],
  [1, 1, -1, 0, 299], [2, 0, 3, 0, 294], [2, 0, -1, -2, 0],
];

/** Apparent geocentric longitude of the Moon, tropical, mean equinox of date. */
export function moonLongitude(T: number): number {
  const T2 = T * T;
  const T3 = T2 * T;
  const T4 = T3 * T;

  // Meeus 47.1–47.6
  const Lp = 218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3 / 538841 - T4 / 65194000;
  const D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000;
  const M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000;
  const Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000;
  const F = 93.272095 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + T4 / 863310000;

  const E = 1 - 0.002516 * T - 0.0000074 * T2;

  let sumL = 0;
  for (const [d, m, mp, f, coeff] of MOON_TERMS) {
    if (coeff === 0) continue;
    const arg = d * D + m * M + mp * Mp + f * F;
    const ecc = m === 0 ? 1 : Math.abs(m) === 1 ? E : E * E;
    sumL += coeff * ecc * sinD(arg);
  }

  // Additive terms: Venus (A1), Jupiter (A2) and the flattening of the Earth (A3).
  const A1 = 119.75 + 131.849 * T;
  const A2 = 53.09 + 479264.29 * T;
  sumL += 3958 * sinD(A1) + 1962 * sinD(Lp - F) + 318 * sinD(A2);

  return norm360(Lp + sumL / 1_000_000 + nutationInLongitude(T));
}

/**
 * Nutation in longitude, principal terms only (Meeus 22.1 truncated), degrees.
 * Peaks around 17" — under a thousandth of a nakshatra, but it is the
 * difference between mean and *apparent* longitude and costs four lines.
 */
function nutationInLongitude(T: number): number {
  const omega = 125.04452 - 1934.136261 * T;
  const L = 280.4665 + 36000.7698 * T;
  const Lp = 218.3165 + 481267.8813 * T;
  const arcsec =
    -17.2 * sinD(omega) - 1.32 * sinD(2 * L) - 0.23 * sinD(2 * Lp) + 0.21 * sinD(2 * omega);
  return arcsec / 3600;
}

/** Mean ascending lunar node = Rahu. Ketu is always 180° away. */
export function rahuLongitude(T: number): number {
  const T2 = T * T;
  const T3 = T2 * T;
  return norm360(125.0445479 - 1934.1362891 * T + 0.0020754 * T2 + T3 / 467441);
}

/** Apparent geocentric longitude of the Sun, tropical, mean equinox of date. */
export function sunLongitude(T: number): number {
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * sinD(M) +
    (0.019993 - 0.000101 * T) * sinD(2 * M) +
    0.000289 * sinD(3 * M);
  // Annual aberration, −20.4"/R. Held constant because R varies by 3.4% and
  // the whole term is a fifth of an arcminute.
  const ABERRATION = -0.005691;
  return norm360(L0 + C + nutationInLongitude(T) + ABERRATION);
}

// ============================================================
// Planets — JPL approximate Keplerian elements, 1800–2050
// https://ssd.jpl.nasa.gov/planets/approx_pos.html
// ============================================================

/** [a, e, I, L, longPeri, longNode] and their per-century rates. */
interface KeplerElements {
  readonly base: readonly [number, number, number, number, number, number];
  readonly rate: readonly [number, number, number, number, number, number];
}

const ELEMENTS: Record<string, KeplerElements> = {
  Mercury: {
    base: [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593],
    rate: [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
  },
  Venus: {
    base: [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255],
    rate: [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418],
  },
  Earth: {
    base: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
    rate: [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
  },
  Mars: {
    base: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    rate: [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
  },
  Jupiter: {
    base: [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
    rate: [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
  },
  Saturn: {
    base: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
    rate: [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
  },
};

/** Heliocentric ecliptic rectangular coordinates (AU) at the J2000 equinox. */
function heliocentric(name: keyof typeof ELEMENTS, T: number): [number, number, number] {
  const { base, rate } = ELEMENTS[name];
  const a = base[0] + rate[0] * T;
  const e = base[1] + rate[1] * T;
  const I = base[2] + rate[2] * T;
  const L = base[3] + rate[3] * T;
  const peri = base[4] + rate[4] * T;
  const node = base[5] + rate[5] * T;

  const omega = peri - node;
  // Mean anomaly wrapped to ±180° so Newton starts near the root.
  const M = ((L - peri) % 360 + 540) % 360 - 180;

  // Kepler's equation, working in degrees (e* = e in degrees, per JPL's note).
  const eStar = (180 / Math.PI) * e;
  let E = M + eStar * sinD(M);
  for (let i = 0; i < 12; i++) {
    const dM = M - (E - eStar * sinD(E));
    const dE = dM / (1 - e * cosD(E));
    E += dE;
    if (Math.abs(dE) < 1e-9) break;
  }

  // Position in the orbital plane, then the standard three rotations into the
  // ecliptic frame: argument of perihelion, inclination, ascending node.
  const xp = a * (cosD(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * sinD(E);

  const cw = cosD(omega), sw = sinD(omega);
  const cO = cosD(node), sO = sinD(node);
  const cI = cosD(I), sI = sinD(I);

  return [
    (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    sw * sI * xp + cw * sI * yp,
  ];
}

/**
 * General precession in longitude since J2000, degrees — carries a J2000
 * longitude forward to the mean equinox of date so it can be compared against
 * an ayanamsa, which is itself measured from the equinox of date.
 */
function precession(T: number): number {
  return (5029.0966 * T + 1.11113 * T * T) / 3600;
}

/** Geocentric ecliptic longitude, tropical, mean equinox of date. */
export function planetLongitude(name: "Mercury" | "Venus" | "Mars" | "Jupiter" | "Saturn", T: number): number {
  const p = heliocentric(name, T);
  const e = heliocentric("Earth", T);
  const lon = Math.atan2(p[1] - e[1], p[0] - e[0]) / DEG;
  return norm360(lon + precession(T));
}

// ============================================================
// Ascendant (lagna)
// ============================================================

/** Greenwich mean sidereal time in degrees (Meeus 12.4). */
function gmst(jd: number, T: number): number {
  return norm360(
    280.46061837 +
      360.98564736629 * (jd - 2451545.0) +
      0.000387933 * T * T -
      (T * T * T) / 38710000,
  );
}

/**
 * Tropical ecliptic longitude of the ascendant, mean equinox of date.
 *
 * This is the one quantity on a kundli that genuinely needs the birth *place*
 * and an accurate birth *time* — it moves a full degree every four minutes.
 * `chart.ts` refuses to publish a lagna when either input is a guess, which is
 * why this function can afford to be unapologetically exact.
 */
export function ascendant(jd: number, T: number, latitude: number, longitudeEast: number): number {
  const ramc = norm360(gmst(jd, T) + longitudeEast);
  const eps = obliquity(T);
  const y = cosD(ramc);
  const x = -(sinD(ramc) * cosD(eps) + tanD(latitude) * sinD(eps));
  return norm360(Math.atan2(y, x) / DEG);
}

export { norm360 };
