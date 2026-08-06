import {
  GUNA_BANDS,
  type GunaMilan,
  type KootaResult,
  type KundliTone,
} from "@/lib/contracts/kundli";
import type { MoonPosition } from "./chart";
import {
  NADI_MEANING,
  NAKSHATRA_GANA,
  NAKSHATRA_NADI,
  NAKSHATRA_YONI,
  RASHI_LORDS,
  RASHI_VARNA,
  RASHI_VASHYA,
  VARNA_RANK,
  YONI_ANIMALS,
  YONI_ANIMALS_HI,
  ganaScore,
  grahaMaitriScore,
  relationTo,
  vashyaScore,
  yoniScore,
} from "./tables";

/**
 * Ashtakoot guna milan — the 36-point check every Indian family has heard of,
 * computed from a real Moon position rather than asserted.
 *
 * ## What changed, and why this file is allowed to exist
 *
 * `kundliService.ts` originally refused to ship a guna score, on the grounds
 * that "real guna milan needs an ephemeris and an exact verified birth time;
 * anything less is a number pulled from the air." That was the right call
 * against a decorative score. It is not an argument against guna milan itself —
 * it is a specification for it, and `ephemeris.ts` now meets the first half of
 * it. The second half is met by admitting when it is not met: every result
 * carries whether the Moon came from a stated birth time or from local noon,
 * and the UI says so.
 *
 * ## The three rules this module holds to
 *
 *  1. **It never reaches `pipeline.ts`.** No koota, no total, no dosha changes
 *     who a user is shown. Guna milan is information for a family that already
 *     chose to look at a profile — the same standing the gotra note has always
 *     had. Wiring it into ranking would quietly make the product sort people by
 *     astrology, which is not what anyone signed up for.
 *  2. **It never exposes a birth detail.** Input is a `MoonPosition` — a rashi
 *     and a nakshatra. Birth time, date and place stay on the server.
 *  3. **It never states a verdict as fact.** Every `verdict` string below
 *     describes what the tradition says, not what is true. A 36/36 does not
 *     make a marriage work and a 14/36 does not make one fail, and nothing this
 *     file prints should read as though it does.
 */

/** Counts 1-based positions from `from` to `to` around a 27- or 12-cycle. */
function countFrom(from: number, to: number, cycle: number): number {
  return ((to - from + cycle) % cycle) + 1;
}

// ------------------------------------------------------------
// 1. Varna (1) — temperament/ego order
// ------------------------------------------------------------

function varnaKoota(boy: MoonPosition, girl: MoonPosition): KootaResult {
  const b = RASHI_VARNA[boy.rashi - 1];
  const g = RASHI_VARNA[girl.rashi - 1];
  const score = VARNA_RANK[b] >= VARNA_RANK[g] ? 1 : 0;
  return {
    key: "varna",
    label: "Varna",
    score,
    max: 1,
    boyValue: b,
    girlValue: g,
    meaning: "Dono ke swabhaav ka darja — kaam ke prati soch aur ahankaar.",
    verdict:
      score === 1
        ? "Parampara ke hisaab se ye kram theek hai."
        : "Parampara is kram ko kam anukool maanti hai. Aaj ke zamaane me ise sabse halka koota maana jaata hai — poore 36 me se sirf 1.",
    tone: score === 1 ? "ok" : "info",
  };
}

// ------------------------------------------------------------
// 2. Vashya (2) — pull, influence
// ------------------------------------------------------------

function vashyaKoota(boy: MoonPosition, girl: MoonPosition): KootaResult {
  const b = RASHI_VASHYA[boy.rashi - 1];
  const g = RASHI_VASHYA[girl.rashi - 1];
  const score = vashyaScore(b, g);
  return {
    key: "vashya",
    label: "Vashya",
    score,
    max: 2,
    boyValue: b,
    girlValue: g,
    meaning: "Ek doosre par kitna sehaj asar — kaun kis par bharosa karke chalta hai.",
    verdict:
      score >= 2
        ? "Dono ke vashya group aapas me anukool hain."
        : score >= 1
          ? "Vashya thoda mila-jula hai — aadha ank."
          : "Vashya group aapas me anukool nahi maane jaate.",
    tone: score >= 2 ? "ok" : score >= 1 ? "info" : "caution",
  };
}

// ------------------------------------------------------------
// 3. Tara / Dina (3) — mutual well-being
// ------------------------------------------------------------

const TARA_NAMES = [
  "Janma", "Sampat", "Vipat", "Kshema", "Pratyari",
  "Sadhak", "Naidhana", "Mitra", "Param Mitra",
];
const INAUSPICIOUS_TARA = new Set([3, 5, 7]); // Vipat, Pratyari, Naidhana

function taraKoota(boy: MoonPosition, girl: MoonPosition): KootaResult {
  function tara(from: number, to: number): number {
    const r = countFrom(from, to, 27) % 9;
    return r === 0 ? 9 : r;
  }
  const fromGirl = tara(girl.nakshatra, boy.nakshatra);
  const fromBoy = tara(boy.nakshatra, girl.nakshatra);
  const score =
    (INAUSPICIOUS_TARA.has(fromGirl) ? 0 : 1.5) + (INAUSPICIOUS_TARA.has(fromBoy) ? 0 : 1.5);

  return {
    key: "tara",
    label: "Tara",
    score,
    max: 3,
    boyValue: TARA_NAMES[fromGirl - 1],
    girlValue: TARA_NAMES[fromBoy - 1],
    meaning: "Ek doosre ki sehat aur bhagya par asar — dono taraf se alag-alag gina jaata hai.",
    verdict:
      score === 3
        ? "Dono taraf se tara shubh hai."
        : score === 1.5
          ? "Ek taraf tara shubh hai, doosri taraf nahi."
          : "Dono taraf tara ashubh shreni me aata hai.",
    tone: score === 3 ? "ok" : score >= 1.5 ? "info" : "caution",
  };
}

// ------------------------------------------------------------
// 4. Yoni (4) — physical & instinctive compatibility
// ------------------------------------------------------------

function yoniKoota(boy: MoonPosition, girl: MoonPosition): KootaResult {
  const [bAnimal] = NAKSHATRA_YONI[boy.nakshatra - 1];
  const [gAnimal] = NAKSHATRA_YONI[girl.nakshatra - 1];
  const score = yoniScore(bAnimal, gAnimal);

  const label = (i: number) => `${YONI_ANIMALS[i]} (${YONI_ANIMALS_HI[i]})`;
  return {
    key: "yoni",
    label: "Yoni",
    score,
    max: 4,
    boyValue: label(bAnimal),
    girlValue: label(gAnimal),
    meaning: "Sharirik aur sahaj tal par tal-mel.",
    verdict:
      score === 4
        ? "Ek hi yoni — parampara me sabse anukool."
        : score >= 3
          ? "Dono yoni aapas me mitra maani jaati hain."
          : score >= 2
            ? "Yoni tatasth hai — na khaas anukool, na virodhi."
            : score >= 1
              ? "Yoni aapas me virodhi maani jaati hai."
              : "Parampara me ye do yoni param shatru maani jaati hain.",
    tone: score >= 3 ? "ok" : score >= 2 ? "info" : "caution",
  };
}

// ------------------------------------------------------------
// 5. Graha Maitri (5) — friendship of the two Moon-sign lords
// ------------------------------------------------------------

function grahaMaitriKoota(boy: MoonPosition, girl: MoonPosition): KootaResult {
  const bLord = RASHI_LORDS[boy.rashi - 1];
  const gLord = RASHI_LORDS[girl.rashi - 1];
  const score = grahaMaitriScore(relationTo(bLord, gLord), relationTo(gLord, bLord));

  return {
    key: "grahaMaitri",
    label: "Graha Maitri",
    score,
    max: 5,
    boyValue: bLord,
    girlValue: gLord,
    meaning: "Dono ke rashi-swami aapas me mitra hain ya nahi — mansik tal-mel.",
    verdict:
      score >= 4
        ? "Dono rashi-swami aapas me mitra hain."
        : score >= 3
          ? "Rashi-swami tatasth hain."
          : score >= 1
            ? "Ek taraf mitrata hai, doosri taraf nahi."
            : "Dono rashi-swami aapas me shatru maane jaate hain.",
    tone: score >= 4 ? "ok" : score >= 3 ? "info" : "caution",
  };
}

// ------------------------------------------------------------
// 6. Gana (6) — temperament class
// ------------------------------------------------------------

function ganaKoota(boy: MoonPosition, girl: MoonPosition): KootaResult {
  const b = NAKSHATRA_GANA[boy.nakshatra - 1];
  const g = NAKSHATRA_GANA[girl.nakshatra - 1];
  const score = ganaScore(b, g);

  return {
    key: "gana",
    label: "Gana",
    score,
    max: 6,
    boyValue: b,
    girlValue: g,
    meaning: "Swabhaav ki shreni — shaant, vyavaharik ya tez.",
    verdict:
      score >= 6
        ? "Dono ka gana aapas me anukool hai."
        : score >= 5
          ? "Gana lagbhag anukool hai."
          : score >= 1
            ? "Gana me antar hai — parampara ise dhyaan dene layak maanti hai."
            : "Gana aapas me virodhi maana jaata hai.",
    tone: score >= 5 ? "ok" : score >= 1 ? "info" : "caution",
  };
}

// ------------------------------------------------------------
// 7. Bhakoot (7) — the rashi distance
// ------------------------------------------------------------

/** The three classical dosha pairs, as {smaller}-{larger} distance. */
const BHAKOOT_DOSHA: Record<string, string> = {
  "2-12": "Dwi-Dwadash",
  "5-9": "Nav-Pancham",
  "6-8": "Shad-Ashtak",
};

function bhakootKoota(boy: MoonPosition, girl: MoonPosition): KootaResult {
  const a = countFrom(boy.rashi, girl.rashi, 12);
  const b = countFrom(girl.rashi, boy.rashi, 12);
  const key = [a, b].sort((x, y) => x - y).join("-");
  const dosha = BHAKOOT_DOSHA[key];
  const score = dosha ? 0 : 7;

  return {
    key: "bhakoot",
    label: "Bhakoot",
    score,
    max: 7,
    boyValue: boy.rashiName,
    girlValue: girl.rashiName,
    meaning: "Dono rashiyon ki aapsi doori — ghar ki barkat aur sehat se joda jaata hai.",
    verdict: dosha
      ? `${dosha} dosh ban raha hai (${a}-${b} ki doori). Parampara ise dosh maanti hai, par graha maitri achhi ho to kai pandit ise khatm maan lete hain.`
      : "Rashiyon ki doori me koi dosh nahi ban raha.",
    tone: dosha ? "caution" : "ok",
  };
}

// ------------------------------------------------------------
// 8. Nadi (8) — the heaviest single koota
// ------------------------------------------------------------

function nadiKoota(boy: MoonPosition, girl: MoonPosition): KootaResult {
  const b = NAKSHATRA_NADI[boy.nakshatra - 1];
  const g = NAKSHATRA_NADI[girl.nakshatra - 1];
  const score = b === g ? 0 : 8;

  return {
    key: "nadi",
    label: "Nadi",
    score,
    max: 8,
    boyValue: `${b} (${NADI_MEANING[b]})`,
    girlValue: `${g} (${NADI_MEANING[g]})`,
    meaning: "Ayurveda ki tarah shareer-prakriti ka bhed — sabse bhaari koota, poore 8 ank.",
    verdict:
      score === 8
        ? "Dono ki nadi alag hai — parampara me yahi chaha jaata hai."
        : "Dono ki nadi ek hi hai (Nadi dosh). Ye akela 8 ank le jaata hai. Ek hi nakshatra ka alag charan ho, ya rashi alag ho, to kai pandit ise khatm maante hain — poori kundli dikhwana behtar hai.",
    tone: score === 8 ? "ok" : "caution",
  };
}

// ------------------------------------------------------------

function bandFor(total: number): { band: string; tone: KundliTone; headline: string } {
  const found = GUNA_BANDS.find((b) => total >= b.min) ?? GUNA_BANDS[GUNA_BANDS.length - 1];
  return { band: found.band, tone: found.tone, headline: found.headline };
}

/**
 * Runs all eight kootas. Order of arguments matters — three of the kootas
 * (Varna, Vashya, Gana) are asymmetric in the tradition, so passing the boy's
 * Moon as the girl's would change the answer. Callers must resolve who is who
 * from the profile's own `gender`, never guess.
 */
export function computeGunaMilan(boyMoon: MoonPosition, girlMoon: MoonPosition): GunaMilan {
  const kootas: KootaResult[] = [
    varnaKoota(boyMoon, girlMoon),
    vashyaKoota(boyMoon, girlMoon),
    taraKoota(boyMoon, girlMoon),
    yoniKoota(boyMoon, girlMoon),
    grahaMaitriKoota(boyMoon, girlMoon),
    ganaKoota(boyMoon, girlMoon),
    bhakootKoota(boyMoon, girlMoon),
    nadiKoota(boyMoon, girlMoon),
  ];

  const total = Math.round(kootas.reduce((sum, k) => sum + k.score, 0) * 2) / 2;
  const { band, tone, headline } = bandFor(total);

  const dosha: GunaMilan["dosha"] = [];
  const nadi = kootas.find((k) => k.key === "nadi")!;
  const bhakoot = kootas.find((k) => k.key === "bhakoot")!;
  if (nadi.score === 0) {
    dosha.push({
      key: "nadi",
      title: "Nadi dosh",
      detail: nadi.verdict,
    });
  }
  if (bhakoot.score === 0) {
    dosha.push({
      key: "bhakoot",
      title: "Bhakoot dosh",
      detail: bhakoot.verdict,
    });
  }

  return {
    total,
    max: 36,
    kootas,
    band,
    bandTone: tone,
    headline,
    dosha,
    boy: { rashiName: boyMoon.rashiName, nakshatraName: boyMoon.nakshatraName },
    girl: { rashiName: girlMoon.rashiName, nakshatraName: girlMoon.nakshatraName },
  };
}
