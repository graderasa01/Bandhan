import "./_env";
import assert from "node:assert/strict";
import {
  ayanamsa,
  julianCenturies,
  julianDay,
  moonLongitude,
  norm360,
  planetLongitude,
  rahuLongitude,
  sunLongitude,
  toSidereal,
} from "../lib/services/kundli/ephemeris";
import { buildChart, moonPositionFor, parseBirthTime } from "../lib/services/kundli/chart";
import { computeGunaMilan } from "../lib/services/kundli/gunaMilan";
import { resolvePlace } from "../lib/services/kundli/places";
import { offsetForDate, offsetMinutesAt } from "../lib/services/kundli/timezone";
import {
  placeFromCandidate,
  resetGeocodeCache,
  resolveBirthPlace,
  type GeoHit,
  type GeocoderProvider,
} from "../lib/services/kundli/geocoding";
import { chartSummaryForAi, sanitizeInterpretationLine } from "../lib/services/kundli/kundliInterpretation";
import { computeManualChart } from "../lib/services/kundli/manualKundliService";
import { buildKundliPdf, kundliPdfFilename } from "../lib/services/kundli/kundliPdf";

/**
 * The kundli engine, pinned.
 *
 * Run: `npx tsx scripts/kundli-check.ts`
 *
 * No database, no network, no model — every number below comes out of the
 * ephemeris, the koota tables and the static place list, so the answer is the
 * same on any machine on any day.
 *
 * Two kinds of assertion live here and they are kept apart on purpose:
 *
 *  1. **Against published reality.** Eclipse instants, sankranti crossings and
 *     the Lahiri ayanamsa at J2000 are facts an almanac will confirm; if the
 *     engine disagrees with them it is the engine that is wrong. This is what
 *     "asli ganit" means in the product copy, and this section is the evidence
 *     for that claim.
 *  2. **Regression pins.** Planet longitudes at a fixed instant, pinned to the
 *     value this engine produces today and cross-checked against the rashi each
 *     planet is known to have occupied. These catch drift (a broken series
 *     term, a sign flip); they are not independent truth and are not presented
 *     as such.
 *
 * The rest pins the promises the *product* makes on top of the maths: never a
 * silent noon, never a default city, a koota table that always totals 36, a
 * chart summary that carries no birth details into the model, and a manual
 * form that refuses a blank rather than assuming one.
 */

let failures = 0;
let checks = 0;

function check(label: string, fn: () => void) {
  checks++;
  try {
    fn();
    console.log(`  ok   ${label}`);
  } catch (err) {
    failures++;
    console.error(`  FAIL ${label}\n       ${err instanceof Error ? err.message : String(err)}`);
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

/** Sidereal longitudes of Sun, Moon and the mean node at one instant. */
function skyAt(iso: string) {
  const T = julianCenturies(julianDay(new Date(iso)));
  return {
    T,
    sun: toSidereal(sunLongitude(T), T),
    moon: toSidereal(moonLongitude(T), T),
    rahu: toSidereal(rahuLongitude(T), T),
  };
}

/** Shortest angular distance between two longitudes, 0–180. */
function sep(a: number, b: number): number {
  const d = Math.abs(norm360(a - b));
  return d > 180 ? 360 - d : d;
}

function near(actual: number, expected: number, tolerance: number, what: string) {
  const d = sep(actual, expected);
  assert.ok(d <= tolerance, `${what}: got ${actual.toFixed(3)}°, expected ${expected}° ±${tolerance}° (off by ${d.toFixed(3)}°)`);
}

/* ------------------------------------------------------------------ */
section("Against published reality — the sky, not our own output");

check("Lahiri ayanamsa at J2000.0 is 23°51'11\" (23.8531°)", () => {
  near(ayanamsa(0), 23.8531, 0.01, "ayanamsa(J2000)");
});

check("Lahiri ayanamsa at 2025.0 is ~24°12' (24.20°)", () => {
  const T = julianCenturies(julianDay(new Date("2025-01-01T00:00:00Z")));
  near(ayanamsa(T), 24.2, 0.05, "ayanamsa(2025)");
});

check("the Sun's tropical longitude at J2000.0 is 280.46°", () => {
  const T = julianCenturies(julianDay(new Date("2000-01-01T12:00:00Z")));
  near(norm360(sunLongitude(T)), 280.46, 0.2, "sun at J2000");
});

// A solar eclipse is a new moon seen from one spot on Earth: at greatest
// eclipse the Sun and Moon share a longitude, and both sit near a node.
for (const [iso, label] of [
  ["2024-04-08T18:17:00Z", "total solar eclipse, 8 Apr 2024"],
  ["2023-10-14T17:59:00Z", "annular solar eclipse, 14 Oct 2023"],
  ["2017-08-21T18:26:00Z", "total solar eclipse, 21 Aug 2017"],
] as const) {
  check(`${label}: Sun and Moon share a longitude`, () => {
    const s = skyAt(iso);
    assert.ok(sep(s.moon, s.sun) <= 0.5, `Moon−Sun separation ${sep(s.moon, s.sun).toFixed(3)}° (expected ≤0.5°)`);
  });
  check(`${label}: the eclipse sits on a lunar node`, () => {
    const s = skyAt(iso);
    const toNode = Math.min(sep(s.rahu, s.sun), sep(s.rahu, norm360(s.sun + 180)));
    assert.ok(toNode <= 6, `Sun is ${toNode.toFixed(2)}° from the mean node (expected ≤6°)`);
  });
}

// A lunar eclipse is a full moon in the Earth's shadow: exactly opposite.
for (const [iso, label] of [
  ["2022-11-08T10:59:00Z", "total lunar eclipse, 8 Nov 2022"],
  ["2018-07-27T20:22:00Z", "total lunar eclipse, 27 Jul 2018"],
] as const) {
  check(`${label}: Sun and Moon are opposite`, () => {
    const s = skyAt(iso);
    near(sep(s.moon, s.sun), 180, 0.5, "Moon−Sun separation");
  });
}

// Sankranti: the Sun crossing a sidereal sign boundary is the one public,
// dated event that tests the ayanamsa and the solar theory *together*.
check("Makar Sankranti 2024 — the Sun is just inside sidereal Makar (270°)", () => {
  const s = skyAt("2024-01-15T06:30:00Z"); // 12:00 IST, hours after the crossing
  assert.ok(s.sun >= 270 && s.sun <= 271, `Sun at ${s.sun.toFixed(3)}° (expected 270–271°)`);
});

check("Mesh Sankranti 2024 — the Sun has just entered sidereal Mesh (0°)", () => {
  const s = skyAt("2024-04-14T06:30:00Z"); // 12:00 IST, the day after the crossing
  assert.ok(s.sun >= 0 && s.sun <= 1.5, `Sun at ${s.sun.toFixed(3)}° (expected 0–1.5°)`);
});

/* ------------------------------------------------------------------ */
section("Regression pins — drift detectors, not independent truth");

check("planet longitudes at J2000.0 have not drifted", () => {
  const T = julianCenturies(julianDay(new Date("2000-01-01T12:00:00Z")));
  // Tropical longitudes, cross-checked against the sign each planet is known
  // to have occupied on 1 Jan 2000: Mercury early Capricorn, Venus early
  // Sagittarius, Mars late Aquarius, Jupiter mid Aries, Saturn early Taurus.
  const expected: Array<[Parameters<typeof planetLongitude>[0], number]> = [
    ["Mercury", 271.9],
    ["Venus", 241.6],
    ["Mars", 328.0],
    ["Jupiter", 25.4],
    ["Saturn", 40.2],
  ];
  for (const [name, lon] of expected) near(norm360(planetLongitude(name, T)), lon, 1, `${name} at J2000`);
});

check("Rahu and Ketu stay exactly opposite, always", () => {
  for (const iso of ["1975-06-11T00:00:00Z", "2001-09-09T09:00:00Z", "2030-02-02T23:30:00Z"]) {
    const chart = buildChart({ dateOfBirth: new Date(iso), birthTime: "10:00", birthPlace: "Jaipur" })!;
    const rahu = chart.grahas.find((g) => g.graha === "Rahu")!;
    const ketu = chart.grahas.find((g) => g.graha === "Ketu")!;
    near(sep(rahu.longitude, ketu.longitude), 180, 0.001, `Rahu/Ketu opposition on ${iso}`);
    assert.ok(rahu.retrograde && ketu.retrograde, "the nodes are always retrograde");
  }
});

/* ------------------------------------------------------------------ */
section("Birth time — free text, and what a blank is allowed to mean");

check("the phrasings people actually type", () => {
  const rows: Array<[string, number | null]> = [
    ["subah 6:30", 6 * 60 + 30],
    ["6.30 am", 6 * 60 + 30],
    ["06:30", 6 * 60 + 30],
    ["raat 10 baje", 22 * 60],
    ["shaam 6", 18 * 60],
    ["18:45", 18 * 60 + 45],
    ["dopahar 12 baje", 12 * 60],
    ["12 am", 0],
    ["", null],
    ["   ", null],
    ["pata nahi", null],
  ];
  for (const [said, want] of rows) {
    assert.equal(parseBirthTime(said), want, `parseBirthTime(${JSON.stringify(said)})`);
  }
});

/* ------------------------------------------------------------------ */
section("The precision ladder — every missing input is named, never assumed");

const DOB = new Date("1994-07-19T00:00:00Z");

check("date + time + a known place → a full chart with a lagna", () => {
  const chart = buildChart({ dateOfBirth: DOB, birthTime: "subah 6:30", birthPlace: "Jaipur" })!;
  assert.equal(chart.precision, "full");
  assert.deepEqual(chart.assumptions, []);
  assert.ok(chart.lagna, "a full chart has a lagna");
  assert.equal(chart.birthTimeResolved, "06:30");
  assert.equal(chart.place?.source, "static");
  assert.equal(chart.place?.timeZoneId, "Asia/Kolkata");
  assert.equal(chart.place?.tzOffsetMinutes, 330);
  assert.ok(chart.grahas.every((g) => g.bhava !== null), "every graha has a bhava");
  assert.equal(typeof chart.manglik.fromLagna, "boolean");
});

check("no birth time → no lagna, no bhava, and the assumption is named", () => {
  const chart = buildChart({ dateOfBirth: DOB, birthTime: null, birthPlace: "Jaipur" })!;
  assert.equal(chart.precision, "no-time");
  assert.deepEqual(chart.assumptions, ["moon-at-noon"]);
  assert.equal(chart.lagna, null);
  assert.equal(chart.birthTimeResolved, null);
  assert.ok(chart.grahas.every((g) => g.bhava === null), "no bhava without a lagna");
  assert.equal(chart.manglik.fromLagna, null, "no Manglik verdict from a lagna that does not exist");
  assert.equal(typeof chart.manglik.fromMoon, "boolean", "the Moon half is still answered");
});

check("an unknown place → no lagna, and never a default city", () => {
  const chart = buildChart({ dateOfBirth: DOB, birthTime: "06:30", birthPlace: "Nowhere-upon-Thames" })!;
  assert.equal(chart.precision, "no-place");
  assert.deepEqual(chart.assumptions, ["timezone-ist"]);
  assert.equal(chart.lagna, null);
  assert.equal(chart.place, null);
  assert.equal(chart.placeName, null, "an unresolved place is blank, not 'India'");
});

check("a place with no timezone → the lagna is refused, the reason recorded", () => {
  const chart = buildChart({
    dateOfBirth: DOB,
    birthTime: "06:30",
    place: { name: "Somewhere", lat: 12.5, lon: 44.2, tzOffsetMinutes: 330, timeZoneId: null, source: "nominatim" },
  })!;
  assert.equal(chart.precision, "no-place");
  assert.deepEqual(chart.assumptions, ["timezone-unknown"]);
  assert.equal(chart.lagna, null);
  assert.equal(chart.place?.name, "Somewhere", "the coordinates are still real and still shown");
});

check("the Moon survives every rung — which is why milan does too", () => {
  const full = moonPositionFor({ dateOfBirth: DOB, birthTime: "06:30", birthPlace: "Jaipur" })!;
  const noTime = moonPositionFor({ dateOfBirth: DOB, birthTime: null, birthPlace: "Jaipur" })!;
  const noPlace = moonPositionFor({ dateOfBirth: DOB, birthTime: "06:30", birthPlace: "Nowhere-upon-Thames" })!;
  assert.equal(full.approximate, false);
  assert.equal(noTime.approximate, true, "a noon Moon is flagged approximate — that flag gates the Reel score");
  assert.equal(noPlace.approximate, false);
  assert.equal(full.rashiName, noPlace.rashiName, "the Moon does not depend on where you stood");
  assert.equal(moonPositionFor({ dateOfBirth: null }), null);
});

check("a lagna actually moves with the clock and with the city", () => {
  const morning = buildChart({ dateOfBirth: DOB, birthTime: "06:30", birthPlace: "Jaipur" })!;
  const evening = buildChart({ dateOfBirth: DOB, birthTime: "18:30", birthPlace: "Jaipur" })!;
  assert.notEqual(morning.lagna!.rashi, evening.lagna!.rashi, "12 hours apart is a different lagna");
  const kolkata = buildChart({ dateOfBirth: DOB, birthTime: "06:30", birthPlace: "Kolkata" })!;
  assert.ok(
    sep(
      morning.lagna!.degreeInRashi + (morning.lagna!.rashi - 1) * 30,
      kolkata.lagna!.degreeInRashi + (kolkata.lagna!.rashi - 1) * 30,
    ) > 1,
    "1500 km east is a different ascendant",
  );
});

/* ------------------------------------------------------------------ */
section("Guna milan — eight kootas, always totalling 36");

check("the maxima sum to exactly 36, for every pair tried", () => {
  const keys = ["varna", "vashya", "tara", "yoni", "grahaMaitri", "gana", "bhakoot", "nadi"];
  for (let boyNak = 1; boyNak <= 27; boyNak += 4) {
    for (let girlNak = 1; girlNak <= 27; girlNak += 5) {
      const boy = moonPositionFor({ dateOfBirth: new Date("1992-03-04T00:00:00Z"), birthTime: `${boyNak % 24}:15`, birthPlace: "Delhi" })!;
      const girl = moonPositionFor({ dateOfBirth: new Date("1995-11-21T00:00:00Z"), birthTime: `${girlNak % 24}:40`, birthPlace: "Pune" })!;
      const milan = computeGunaMilan(boy, girl);
      assert.equal(milan.kootas.length, 8, "eight kootas");
      assert.deepEqual(milan.kootas.map((k) => k.key), keys, "in the classical order");
      assert.equal(milan.kootas.reduce((s, k) => s + k.max, 0), 36, "maxima total 36");
      assert.equal(milan.max, 36);
      const sum = Math.round(milan.kootas.reduce((s, k) => s + k.score, 0) * 2) / 2;
      assert.equal(milan.total, sum, "the total is the sum of its parts");
      assert.ok(milan.total >= 0 && milan.total <= 36, `total ${milan.total} out of range`);
      for (const k of milan.kootas) {
        assert.ok(k.score >= 0 && k.score <= k.max, `${k.key} scored ${k.score}/${k.max}`);
        assert.ok(k.boyValue.length > 0 && k.girlValue.length > 0, `${k.key} says what each side is`);
        assert.ok(k.meaning.length > 0 && k.verdict.length > 0, `${k.key} explains itself`);
      }
    }
  }
});

check("same nakshatra, same pada: Nadi dosha, and the band is honest about it", () => {
  const moon = moonPositionFor({ dateOfBirth: DOB, birthTime: "06:30", birthPlace: "Jaipur" })!;
  const milan = computeGunaMilan(moon, { ...moon });
  const nadi = milan.kootas.find((k) => k.key === "nadi")!;
  assert.equal(nadi.score, 0, "identical Moons share a nadi");
  assert.ok(milan.dosha.some((d) => d.key === "nadi"), "and it is reported as a dosha");
});

check("milan never reads a birth date, time or place — only the Moon", () => {
  const boy = moonPositionFor({ dateOfBirth: DOB, birthTime: "06:30", birthPlace: "Jaipur" })!;
  const girl = moonPositionFor({ dateOfBirth: new Date("1996-02-02T00:00:00Z"), birthTime: "21:10", birthPlace: "Indore" })!;
  const json = JSON.stringify(computeGunaMilan(boy, girl));
  for (const leak of ["1994", "1996", "06:30", "21:10", "Jaipur", "Indore"]) {
    assert.ok(!json.includes(leak), `guna milan leaked "${leak}"`);
  }
});

/* ------------------------------------------------------------------ */
function placesHeader() {
  section("Places — found, ambiguous, or honestly unknown");
}

const BIRTH = { year: 1994, month1: 7, day: 19 };

/** A geocoder that answers from a fixed list — no network in this file. */
function fakeProvider(hits: GeoHit[], mode: "ok" | "throw" = "ok"): GeocoderProvider {
  return {
    name: "nominatim",
    async search() {
      if (mode === "throw") throw new Error("geocoder 503");
      return hits;
    },
  };
}

/**
 * Two real places of one name, in a name the static table does not carry —
 * the table answers first by design, so an ambiguity fixture has to be a
 * town small enough that only a geocoder would know it.
 */
const TWO_KHAIRPURS: GeoHit[] = [
  { name: "Khairpur", region: "Rajasthan, India", lat: 26.51, lon: 74.62, countryCode: "in", timeZoneId: "Asia/Kolkata", source: "nominatim" },
  { name: "Khairpur", region: "Bihar, India", lat: 25.77, lon: 85.41, countryCode: "in", timeZoneId: "Asia/Kolkata", source: "nominatim" },
];

function staticTableCheck() {
check("the static table answers first, with no provider at all", () => {
  assert.ok(resolvePlace("Jaipur"));
  assert.equal(resolvePlace("Jaipur, Rajasthan")?.name, "Jaipur");
  assert.equal(resolvePlace("Nowhere-upon-Thames"), null, "an unknown city is null, never a fallback");
  assert.equal(resolvePlace(""), null);
});
}

async function placesSection() {
  placesHeader();
  staticTableCheck();
  resetGeocodeCache();
  const table = await resolveBirthPlace("Jaipur", BIRTH, null);
  check("a table hit needs no geocoder and carries the date's offset", () => {
    assert.equal(table.status, "resolved");
    assert.ok(table.status === "resolved" && table.place.source === "static");
    assert.ok(table.status === "resolved" && table.place.tzOffsetMinutes === 330);
  });

  resetGeocodeCache();
  const none = await resolveBirthPlace("Zzyzx Township", BIRTH, null);
  check("no geocoder configured → unresolved, never a guess", () => {
    assert.deepEqual(none, { status: "unresolved", reason: "no-provider" });
  });

  resetGeocodeCache();
  const down = await resolveBirthPlace("Zzyzx Township", BIRTH, fakeProvider([], "throw"));
  check("a geocoder that is down → unresolved, and says so", () => {
    assert.deepEqual(down, { status: "unresolved", reason: "provider-error" });
  });

  resetGeocodeCache();
  const empty = await resolveBirthPlace("Zzyzx Township", BIRTH, fakeProvider([]));
  check("a query that matches nothing → unresolved", () => {
    assert.deepEqual(empty, { status: "unresolved", reason: "no-match" });
  });

  resetGeocodeCache();
  const ambiguous = await resolveBirthPlace("Khairpur", BIRTH, fakeProvider(TWO_KHAIRPURS));
  check("two real places of one name → ask, do not pick", () => {
    assert.equal(ambiguous.status, "ambiguous");
    assert.equal(ambiguous.status === "ambiguous" && ambiguous.candidates.length, 2);
    assert.ok(ambiguous.status === "ambiguous" && ambiguous.candidates.every((c) => c.region.length > 0), "each option is tellable apart");
  });

  resetGeocodeCache();
  const disambiguated = await resolveBirthPlace("Khairpur, Bihar", BIRTH, fakeProvider(TWO_KHAIRPURS));
  check("a typed region resolves it — the question is not asked twice", () => {
    assert.equal(disambiguated.status, "resolved");
  });

  check("the person's own pick is used verbatim", () => {
    const picked = placeFromCandidate(
      { id: "31.3300,76.7500", name: "Khairpur", region: "Bihar, India", lat: 31.33, lon: 76.75, timeZoneId: "Asia/Kolkata" },
      BIRTH,
    );
    assert.equal(picked.lat, 31.33);
    assert.equal(picked.source, "user");
    assert.equal(picked.tzOffsetMinutes, 330);
    assert.ok(picked.name.startsWith("Khairpur"));
  });

  check("a picked place with no timezone keeps the IST reading and loses the lagna", () => {
    const picked = placeFromCandidate(
      { id: "x", name: "Elsewhere", region: "Nowhere", lat: 10, lon: 20, timeZoneId: null },
      BIRTH,
    );
    assert.equal(picked.timeZoneId, null);
    assert.equal(picked.tzOffsetMinutes, 330, "IST is the reading, and it is recorded as an assumption downstream");
    const chart = buildChart({ dateOfBirth: DOB, birthTime: "06:30", place: picked })!;
    assert.equal(chart.lagna, null);
    assert.deepEqual(chart.assumptions, ["timezone-unknown"]);
  });
}

function timezoneSection() {
check("timezone offsets come from the zone's own history, not a constant", () => {
  assert.equal(offsetForDate("Asia/Kolkata", 1994, 7, 19), 330);
  assert.equal(offsetForDate("America/New_York", 2024, 1, 15), -300, "EST in January");
  assert.equal(offsetForDate("America/New_York", 2024, 7, 15), -240, "EDT in July");
  assert.equal(offsetForDate("Europe/London", 2024, 7, 15), 60, "BST in July");
  assert.equal(offsetForDate("Europe/London", 2024, 1, 15), 0);
  assert.equal(offsetForDate("Not/AZone", 2024, 1, 15), null, "an unknown zone is null, not zero");
  assert.equal(offsetMinutesAt("Asia/Kathmandu", new Date("1994-07-19T00:00:00Z")), 345, "the 45-minute zones survive");
});
}

/* ------------------------------------------------------------------ */
function astroAiSection() {
section("Astro-AI — the model reads numbers, and never birth details");

check("the chart summary carries no birth date, time or place", () => {
  const chart = buildChart({ dateOfBirth: DOB, birthTime: "subah 6:30", birthPlace: "Jaipur" })!;
  const json = JSON.stringify(chartSummaryForAi(chart, null));
  for (const leak of ["1994", "07-19", "06:30", "Jaipur", "26.91", "75.78"]) {
    assert.ok(!json.includes(leak), `the model prompt leaked "${leak}"`);
  }
  assert.ok(json.includes("precision"), "but it does carry how complete the chart is");
});

check("a chart with no lagna tells the model there is none", () => {
  const chart = buildChart({ dateOfBirth: DOB, birthTime: null, birthPlace: "Jaipur" })!;
  const summary = chartSummaryForAi(chart, null) as { lagna: unknown; precision: string };
  assert.equal(summary.lagna, null);
  assert.equal(summary.precision, "no-time");
});

check("claims this feature must never make are dropped whole", () => {
  const banned = [
    "Shaadi zaroor hogi is saal.",
    "Ye pakka hai ki rishta chalega.",
    "Santaan yog prabal hai.",
    "Bimari ka yog dikh raha hai.",
    "Mrityu tak saath rahega.",
    "Ye scientifically proven hai.",
  ];
  for (const line of banned) assert.equal(sanitizeInterpretationLine(line), null, `not dropped: ${line}`);

  const allowed = [
    "Parampara ke hisaab se Chandra Kark me hone par swabhav me narmi maani jaati hai.",
    "Jyotish me Mangal saatve bhav me hone par baat-cheet ki salaah di jaati hai.",
  ];
  for (const line of allowed) assert.equal(sanitizeInterpretationLine(line), line, `wrongly dropped: ${line}`);

  assert.equal(sanitizeInterpretationLine(""), null);
  assert.equal(sanitizeInterpretationLine(42), null, "a non-string is not a line");
  assert.equal(sanitizeInterpretationLine("a".repeat(400))!.length, 240, "long lines are cut, not kept whole");
});
}

/* ------------------------------------------------------------------ */
function manualFormHeader() {
  section("The manual form — a blank is a question, never an assumption");
}

async function manualFormSection() {
  manualFormHeader();
  const base = { name: "Aarti Sharma", dateOfBirth: "1994-07-19" };

  const blankTime = await computeManualChart({ ...base, birthPlace: "Jaipur" });
  check("a blank birth time is refused — it is not read as 'unknown'", () => {
    assert.equal(blankTime.ok, false);
    assert.ok(!blankTime.ok && blankTime.code === "INVALID" && blankTime.field === "birthTime");
  });

  const badTime = await computeManualChart({ ...base, birthTime: "kabhi bhi", birthPlace: "Jaipur" });
  check("an unreadable birth time is refused rather than parsed loosely", () => {
    assert.ok(!badTime.ok && badTime.code === "INVALID" && badTime.field === "birthTime");
  });

  const blankPlace = await computeManualChart({ ...base, birthTime: "06:30" });
  check("a blank birth place is refused — never swapped for a default", () => {
    assert.ok(!blankPlace.ok && blankPlace.code === "INVALID" && blankPlace.field === "birthPlace");
  });

  const unknownTime = await computeManualChart({ ...base, birthTimeUnknown: true, birthPlace: "Jaipur" });
  check("an explicit 'samay pata nahi' is accepted, and downgrades the chart", () => {
    assert.ok(unknownTime.ok);
    assert.ok(unknownTime.ok && unknownTime.chart.precision === "no-time");
    assert.ok(unknownTime.ok && unknownTime.subject.birthTimeUnknown === true);
    assert.ok(unknownTime.ok && unknownTime.subject.birthTime === null);
  });

  const unknownPlace = await computeManualChart({ ...base, birthTime: "06:30", placeUnknown: true });
  check("an explicit 'sthaan pata nahi' is accepted, and drops the lagna", () => {
    assert.ok(unknownPlace.ok && unknownPlace.chart.precision === "no-place");
    assert.ok(unknownPlace.ok && unknownPlace.chart.lagna === null);
  });

  const unknownCity = await computeManualChart({ ...base, birthTime: "06:30", birthPlace: "Zzyzx Township" });
  check("an unrecognised city is handed back to be corrected, not resolved", () => {
    assert.ok(!unknownCity.ok && unknownCity.code === "PLACE_UNRESOLVED");
  });

  const future = await computeManualChart({ ...base, dateOfBirth: "2099-01-01", birthTime: "06:30", birthPlace: "Jaipur" });
  check("a date in the future is refused", () => {
    assert.ok(!future.ok && future.code === "INVALID" && future.field === "dateOfBirth");
  });

  const good = await computeManualChart({ ...base, birthTime: "subah 6:30", birthPlace: "Jaipur" });
  check("a complete form gives a full chart, and the name rides along unchanged", () => {
    assert.ok(good.ok);
    assert.ok(good.ok && good.chart.precision === "full");
    assert.ok(good.ok && good.subject.name === "Aarti Sharma");
    assert.ok(good.ok && good.subject.dateOfBirth === "1994-07-19");
    assert.ok(good.ok && good.chart.place?.name === "Jaipur");
  });

  check("the manual chart is identical to the same details through buildChart", () => {
    const direct = buildChart({ dateOfBirth: new Date("1994-07-19T00:00:00Z"), birthTime: "subah 6:30", birthPlace: "Jaipur" })!;
    assert.ok(good.ok && JSON.stringify(good.chart) === JSON.stringify(direct), "deterministic — so the PDF can recompute it");
  });
}

/* ------------------------------------------------------------------ */
function pdfSection() {
section("The PDF — whose kundli it is, and how complete");

const pdfChart = buildChart({ dateOfBirth: DOB, birthTime: "subah 6:30", birthPlace: "Jaipur" })!;
const pdfPartial = buildChart({ dateOfBirth: DOB, birthTime: null, birthPlace: "Jaipur" })!;

check("a full kundli renders a real PDF", () => {
  const pdf = buildKundliPdf(pdfChart, {
    name: "Aarti Sharma",
    dateOfBirth: new Date("1994-07-19T00:00:00Z"),
    birthTime: "subah 6:30",
    birthPlace: "Jaipur",
  });
  const text = pdf.toString("latin1");
  assert.ok(text.startsWith("%PDF-"), "it is a PDF");
  assert.ok(text.trimEnd().endsWith("%%EOF"), "and a complete one");
  assert.ok(text.includes("Aarti Sharma"), "the name is on it");
  assert.ok(text.includes("19 July 1994"), "and the date it was computed from");
  assert.ok(text.includes("Jaipur"), "and the place");
  assert.ok(/Poori kundli/.test(text), "and it says the kundli is complete");
});

check("a partial kundli says so on the page, not in a footnote", () => {
  const pdf = buildKundliPdf(pdfPartial, {
    name: "Aarti Sharma",
    dateOfBirth: new Date("1994-07-19T00:00:00Z"),
    birthTime: null,
    birthPlace: "Jaipur",
    birthTimeUnknown: true,
  });
  const text = pdf.toString("latin1");
  assert.ok(/Adhoori/.test(text), "the precision label is printed");
  assert.ok(/pata nahi/.test(text), "an unknown birth time is named as unknown");
  assert.ok(!/06:30/.test(text), "and no time is invented");
});

check("the download name is safe ASCII", () => {
  assert.equal(kundliPdfFilename("Aarti Sharma"), "kundli-aarti-sharma.pdf");
  assert.equal(kundliPdfFilename(""), "kundli-bandhantak.pdf");
});
}

/* ------------------------------------------------------------------ */
async function main() {
  await placesSection();
  timezoneSection();
  astroAiSection();
  await manualFormSection();
  pdfSection();

  if (failures > 0) {
    console.error(`\nkundli-check: ${failures} of ${checks} checks failed`);
    process.exit(1);
  }
  console.log(`\nPASS — ${checks} checks`);
}

void main();
