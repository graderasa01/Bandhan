/**
 * L2 preference scoring — pure TypeScript, no DB, no AI.
 *
 * Split out of `pipeline.ts` so the half D-33 describes as "pure TS,
 * deterministic, config-driven" is actually a module you can import and reason
 * about on its own. `pipeline.ts` keeps the parts that talk to the database
 * (candidate queries, signal pre-fetch) and calls into here for the maths.
 *
 * Everything below is exported for the same reason `liveWeights` and
 * `scoreRecentActivity` are: the "ye rishta kyun dikha" card and the
 * verification script both show the user real numbers, and a display-only
 * second copy of these formulas would drift from the ones that did the ranking
 * the first time anyone touched them.
 */

import {
  IMPORTANCE_MULTIPLIER,
  importanceKeyFor,
  type ImportanceAnswer,
} from "@/lib/profile/intelligenceQuestions";
import { asList, firstValue, type SignalAnswerMap } from "@/lib/profile/signalAnswers";
import type { ProfileWithSubTables } from "@/lib/services/profile/completionService";

export const EDUCATION_FLOORS: Record<string, string[]> = {
  "Graduate ya upar": ["Graduate", "B.Tech", "B.Com", "B.A.", "MBA", "M.Tech", "M.Sc", "Post Graduate", "PhD"],
  "Post Graduate ya upar": ["Post Graduate", "M.Tech", "M.Sc", "MBA", "PhD"],
  "Professional degree": ["B.Tech", "MBA", "PhD"],
};

export function scoreCityMatch(prefs: ProfileWithSubTables["partnerPreferences"], viewer: ProfileWithSubTables, candidate: ProfileWithSubTables): number {
  const wanted = prefs?.preferredCities ?? [];
  if (wanted.length === 0 || wanted.includes("Kahin bhi")) return 100;
  if (wanted.includes("Isi sheher me") && candidate.currentCity && candidate.currentCity === viewer.currentCity) return 100;
  if (candidate.currentCity && wanted.includes(candidate.currentCity)) return 100;
  return 40; // not a match, but not disqualifying — L0 already handles hard exclusions
}

export function scoreEducationMatch(prefs: ProfileWithSubTables["partnerPreferences"], candidate: ProfileWithSubTables): number {
  const wanted = prefs?.educationPreference;
  if (!wanted || wanted === "Koi farak nahi") return 100;
  const floor = EDUCATION_FLOORS[wanted];
  if (!floor) return 70;
  return candidate.education?.highestEducation && floor.includes(candidate.education.highestEducation) ? 100 : 30;
}

/**
 * Deal breakers, structured first and free text second.
 *
 * The free-text box has always been honest about being a keyword scan: it looks
 * for the literal words "smoking", "relocate" and "joint family". Which means
 * "sharaab bilkul nahi" matched nothing at all, and the user who typed it got a
 * silent 100 — a non-negotiable the app quietly ignored.
 *
 * Structured codes (`dealBreakerCodes`, Layer 9) fix that without removing the
 * box: somebody with an unusual non-negotiable still needs somewhere to write
 * it. Both run and their checks pool, so a viewer with neither still scores
 * exactly 100, exactly as before.
 *
 * A code whose data is missing on either side is *skipped*, not failed. An
 * unanswered question is UNKNOWN; failing a candidate over a question nobody
 * asked them would turn silence into a mark against them.
 */
export function scoreDealBreakers(
  prefs: ProfileWithSubTables["partnerPreferences"],
  viewer: ProfileWithSubTables,
  candidate: ProfileWithSubTables,
  viewerSignals: SignalAnswerMap,
  candidateSignals: SignalAnswerMap,
): number {
  let violations = 0;
  let checks = 0;

  for (const code of asList(viewerSignals.get("dealBreakerCodes")?.value)) {
    const verdict = checkDealBreakerCode(code, viewer, candidate, viewerSignals, candidateSignals);
    if (verdict === null) continue;
    checks++;
    if (verdict) violations++;
  }

  const text = (prefs?.dealBreakers ?? []).join(" ").toLowerCase();
  if (text) {
    if (text.includes("smoking")) {
      checks++;
      if (candidate.lifestyle?.smoking === "Haan") violations++;
    }
    if (text.includes("relocate")) {
      checks++;
      if (candidate.lifestyle?.relocateWilling === "Nahi") violations++;
    }
    if (text.includes("joint family")) {
      checks++;
      if (candidate.family?.familyType === "Joint family") violations++;
    }
  }

  if (checks === 0) return 100;
  return Math.round(((checks - violations) / checks) * 100);
}

/** True = violated, false = fine, null = not enough data to say either way. */
function checkDealBreakerCode(
  code: string,
  viewer: ProfileWithSubTables,
  candidate: ProfileWithSubTables,
  viewerSignals: SignalAnswerMap,
  candidateSignals: SignalAnswerMap,
): boolean | null {
  const life = candidate.lifestyle;
  switch (code) {
    case "NO_SMOKING":
      if (!life?.smoking) return null;
      // "Kabhi-kabhi" counts. Someone who named smoking a non-negotiable did
      // not mean "only on weekends".
      return life.smoking === "Haan" || life.smoking === "Kabhi-kabhi";
    case "NO_DRINKING":
      if (!life?.drinking) return null;
      return life.drinking === "Haan" || life.drinking === "Sirf mauke par";
    case "DIET": {
      const mine = viewer.lifestyle?.diet;
      const theirs = life?.diet;
      if (!mine || !theirs) return null;
      const vegetarian = new Set(["Veg", "Jain veg", "Vegan"]);
      if (!vegetarian.has(mine)) return null; // no diet conflict available to have
      return !vegetarian.has(theirs);
    }
    case "CHILDREN_MISMATCH": {
      const gap = childrenGap(viewerSignals, candidateSignals);
      return gap === null ? null : gap >= 2;
    }
    case "LIVING_ARRANGEMENT": {
      const mine = firstValue(viewerSignals.get("postMarriageLivingPlan")?.value);
      const theirs = firstValue(candidateSignals.get("postMarriageLivingPlan")?.value);
      if (!mine || !theirs) return null;
      return isOpposedLiving(mine, theirs);
    }
    case "NO_RELOCATION": {
      const theirs =
        firstValue(candidateSignals.get("relocationBoundary")?.value) ??
        (life?.relocateWilling === "Nahi" ? "Relocate nahi kar sakta/sakti" : null);
      if (!theirs) return null;
      if (sameCity(viewer, candidate)) return false; // nobody has to move
      return theirs === "Relocate nahi kar sakta/sakti" || theirs === "Same city/nearby only";
    }
    case "CAREER_CONTINUATION": {
      const theirs =
        firstValue(candidateSignals.get("partnerCareerExpectation")?.value) ??
        (candidate.partnerPreferences?.partnerWorkExpectation === "Ghar sambhalein"
          ? "Prefer home-focused"
          : null);
      if (!theirs) return null;
      return theirs === "Prefer home-focused";
    }
    case "RELIGION": {
      const wanted = viewer.partnerPreferences?.religionPreference;
      if (!wanted || wanted === "Koi farak nahi") return null;
      const theirs = candidate.basicDetails?.religion;
      return theirs ? theirs !== wanted : null;
    }
    case "COMMUNITY": {
      const wanted = (viewer.partnerPreferences?.castePreference ?? "").trim().toLowerCase();
      if (!wanted || wanted === "koi farak nahi") return null;
      const theirs = (candidate.basicDetails?.caste ?? "").trim().toLowerCase();
      return theirs ? theirs !== wanted : null;
    }
    case "FAMILY_INVOLVEMENT": {
      const mine = firstValue(viewerSignals.get("familyInvolvementLevel")?.value);
      const theirs = firstValue(candidateSignals.get("familyInvolvementLevel")?.value);
      if (!mine || !theirs) return null;
      const ends = new Set(["Bahut close/involved", "Mostly couple-led life"]);
      return ends.has(mine) && ends.has(theirs) && mine !== theirs;
    }
    default:
      return null;
  }
}

function sameCity(a: ProfileWithSubTables, b: ProfileWithSubTables): boolean {
  const x = (a.currentCity ?? "").trim().toLowerCase();
  const y = (b.currentCity ?? "").trim().toLowerCase();
  return Boolean(x) && x === y;
}

const CHILDREN_RANK: Record<string, number> = {
  "Definitely yes": 3,
  "Probably yes": 2,
  Unsure: 1,
  No: 0,
};

/** How far apart two people are on children, or null when either never said. */
function childrenGap(viewerSignals: SignalAnswerMap, candidateSignals: SignalAnswerMap): number | null {
  const mine = firstValue(viewerSignals.get("childrenPreference")?.value);
  const theirs = firstValue(candidateSignals.get("childrenPreference")?.value);
  if (!mine || !theirs) return null;
  const a = CHILDREN_RANK[mine];
  const b = CHILDREN_RANK[theirs];
  if (a === undefined || b === undefined) return null;
  return Math.abs(a - b);
}

function isOpposedLiving(a: string, b: string): boolean {
  return (a === "Joint family" && b === "Nuclear family") || (a === "Nuclear family" && b === "Joint family");
}

/**
 * Religion, caste and manglik status: explicit-preference-only, on purpose.
 *
 * Every function above compares what the *viewer* asked for against what the
 * *candidate* stated — never the viewer's own value against the candidate's.
 * That distinction is the whole safety property: a candidate's religion/caste
 * never enters a shared embedding or auto-clusters anyone (M17 §L1,
 * `NEVER_EMBED_KEYS`), it only gets checked against a preference someone
 * explicitly typed for themselves. A viewer who leaves it at "Koi farak
 * nahi" (the default) gets 100 from all three — this signal is opt-in, not
 * a default penalty for not stating a preference.
 */
function scoreReligionMatch(prefs: ProfileWithSubTables["partnerPreferences"], candidate: ProfileWithSubTables): number {
  const wanted = prefs?.religionPreference;
  if (!wanted || wanted === "Koi farak nahi") return 100;
  return candidate.basicDetails?.religion === wanted ? 100 : 30;
}

function scoreCasteMatch(prefs: ProfileWithSubTables["partnerPreferences"], candidate: ProfileWithSubTables): number {
  const wanted = (prefs?.castePreference ?? "").trim().toLowerCase();
  if (!wanted || wanted === "koi farak nahi") return 100;
  const theirs = (candidate.basicDetails?.caste ?? "").trim().toLowerCase();
  if (!theirs) return 60; // candidate didn't say — not a confirmed mismatch, not a confirmed match
  return theirs === wanted ? 100 : 30;
}

function scoreManglikMatch(prefs: ProfileWithSubTables["partnerPreferences"], candidate: ProfileWithSubTables): number {
  const wanted = prefs?.manglikPreference;
  if (!wanted || wanted === "Koi farak nahi") return 100;
  const theirs = candidate.basicDetails?.manglikStatus;
  if (!theirs || theirs === "Pata nahi") return 60;
  if (wanted === "Manglik chahiye") return theirs === "Haan" || theirs === "Aanshik manglik" ? 100 : 30;
  if (wanted === "Non-manglik chahiye") return theirs === "Nahi" || theirs === "Hum nahi maante" ? 100 : 30;
  return 60;
}

/* ------------------------------------------------------------------ */
/* What the viewer explicitly asked for — the Marriage Intelligence     */
/* half of the preference bucket. Still 0.30 in total; D-33 untouched.  */
/* ------------------------------------------------------------------ */

/**
 * How strict the viewer said this preference is.
 *
 * Before Layer 9 existed the app could not tell a must-have from a
 * nice-to-have, so every stated preference weighed the same — someone for whom
 * city is negotiable and religion is not got the same ranking as someone for
 * whom it is the other way round. Answering "Must match" multiplies that one
 * signal's weight; "Flexible" shrinks it. Everything renormalizes afterwards,
 * so the preference bucket is still worth exactly 0.30 of the final score.
 *
 * Unanswered means 1 — the neutral multiplier, which is what makes a profile
 * with no Layer 9 answers score identically to how it scored before this
 * existed.
 */
function importanceMultiplier(viewerSignals: SignalAnswerMap, signal: string): number {
  const answer = firstValue(viewerSignals.get(importanceKeyFor(signal))?.value);
  if (!answer) return 1;
  return IMPORTANCE_MULTIPLIER[answer as ImportanceAnswer] ?? 1;
}

/**
 * Children, ranked rather than matched exactly: "Definitely yes" next to
 * "Probably yes" is a conversation, next to "No" it is the end of one. Null
 * when either side never answered — silence is not disagreement.
 */
function scoreChildrenMatch(viewerSignals: SignalAnswerMap, candidateSignals: SignalAnswerMap): number | null {
  const gap = childrenGap(viewerSignals, candidateSignals);
  if (gap === null) return null;
  return [100, 70, 35, 0][Math.min(gap, 3)];
}

function scoreLivingMatch(viewerSignals: SignalAnswerMap, candidateSignals: SignalAnswerMap): number | null {
  const mine = firstValue(viewerSignals.get("postMarriageLivingPlan")?.value);
  const theirs = firstValue(candidateSignals.get("postMarriageLivingPlan")?.value);
  if (!mine || !theirs) return null;
  if (mine === theirs) return 100;
  const open = new Set(["Flexible", "Partner ke saath decide karenge"]);
  if (open.has(mine) || open.has(theirs)) return 85;
  if (isOpposedLiving(mine, theirs)) return 25;
  return 70; // one of them said "parents ke paas, separate home" — adjacent, not opposed
}

/**
 * Somebody has to be able to move — unless nobody does.
 *
 * Scored off the *better* of the two boundaries rather than either one alone,
 * because relocation is a problem the couple solves together: two people in the
 * same city have nothing to solve, and one person willing to move is enough.
 */
const RELOCATION_RANK: Record<string, number> = {
  "Relocate nahi kar sakta/sakti": 0,
  "Same city/nearby only": 1,
  "Right person ho to discuss kar sakte hain": 2,
  "Selected cities": 2,
  "Anywhere in India": 3,
  "International bhi": 3,
};

function scoreRelocationMatch(
  viewer: ProfileWithSubTables,
  candidate: ProfileWithSubTables,
  viewerSignals: SignalAnswerMap,
  candidateSignals: SignalAnswerMap,
): number | null {
  const mine = firstValue(viewerSignals.get("relocationBoundary")?.value);
  const theirs = firstValue(candidateSignals.get("relocationBoundary")?.value);
  if (!mine && !theirs) return null;
  if (sameCity(viewer, candidate)) return 100;
  const ranks = [mine, theirs].flatMap((v) => (v && RELOCATION_RANK[v] !== undefined ? [RELOCATION_RANK[v]] : []));
  if (ranks.length === 0) return null;
  return [25, 40, 75, 100][Math.max(...ranks)];
}

/** What the viewer expects of a partner's career, against what the candidate said theirs means to them. */
function scorePartnerCareerMatch(
  viewerSignals: SignalAnswerMap,
  candidateSignals: SignalAnswerMap,
): number | null {
  const expectation = firstValue(viewerSignals.get("partnerCareerExpectation")?.value);
  const priority = firstValue(candidateSignals.get("careerPriority")?.value);
  if (!expectation || !priority) return null;

  const strong = priority === "Top priority" || priority === "Bahut important";
  const balanced = priority === "Balanced with family";
  const easy = priority === "Flexible";
  if (!strong && !balanced && !easy) return null; // "Abhi sure nahi" — no signal

  switch (expectation) {
    case "Career continue karna important hai":
      return strong ? 100 : balanced ? 85 : 60;
    case "Continue kare to accha hai":
      return strong ? 95 : balanced ? 100 : 75;
    case "Prefer home-focused":
      return strong ? 30 : balanced ? 70 : 90;
    default:
      return null; // "Unki choice" / "Discuss together" — deliberately no opinion
  }
}

/**
 * The preference bucket — still 0.30 of the final score, still six base
 * components, now with two things it never had: how strict each one is, and
 * the four life questions people actually break rishtas over.
 *
 * ## The no-regression guarantee
 *
 * A viewer who has answered nothing in Layer 9 takes the early return below —
 * the identical expression this function has always used, not a renormalized
 * approximation of it. That matters at the float level: dividing by a weight
 * sum that computes to 1.0000000000000002 can move a score across a rounding
 * boundary, and "your matches reshuffled slightly for no reason" is not a
 * change anyone asked for.
 */
export function scorePreferenceMatch(
  viewer: ProfileWithSubTables,
  candidate: ProfileWithSubTables,
  viewerSignals: SignalAnswerMap,
  candidateSignals: SignalAnswerMap,
): number {
  const prefs = viewer.partnerPreferences;
  const city = scoreCityMatch(prefs, viewer, candidate);
  const education = scoreEducationMatch(prefs, candidate);
  const dealBreakers = scoreDealBreakers(prefs, viewer, candidate, viewerSignals, candidateSignals);
  const religion = scoreReligionMatch(prefs, candidate);
  const caste = scoreCasteMatch(prefs, candidate);
  const manglik = scoreManglikMatch(prefs, candidate);

  const children = scoreChildrenMatch(viewerSignals, candidateSignals);
  const living = scoreLivingMatch(viewerSignals, candidateSignals);
  const relocation = scoreRelocationMatch(viewer, candidate, viewerSignals, candidateSignals);
  const partnerCareer = scorePartnerCareerMatch(viewerSignals, candidateSignals);

  const impCity = importanceMultiplier(viewerSignals, "city");
  const impEducation = importanceMultiplier(viewerSignals, "education");
  const impReligion = importanceMultiplier(viewerSignals, "religion");
  const impCaste = importanceMultiplier(viewerSignals, "caste");
  const impManglik = importanceMultiplier(viewerSignals, "manglik");

  const untouched =
    children === null &&
    living === null &&
    relocation === null &&
    partnerCareer === null &&
    impCity === 1 &&
    impEducation === 1 &&
    impReligion === 1 &&
    impCaste === 1 &&
    impManglik === 1;

  if (untouched) {
    return Math.round(
      city * 0.25 + education * 0.15 + dealBreakers * 0.15 + religion * 0.2 + caste * 0.15 + manglik * 0.1,
    );
  }

  const parts: { score: number; weight: number }[] = [
    { score: city, weight: 0.25 * impCity },
    { score: education, weight: 0.15 * impEducation },
    // No multiplier: a deal breaker is already the strictest thing a user can
    // say. Letting an importance answer soften it would contradict the word.
    { score: dealBreakers, weight: 0.15 },
    { score: religion, weight: 0.2 * impReligion },
    { score: caste, weight: 0.15 * impCaste },
    { score: manglik, weight: 0.1 * impManglik },
  ];

  if (children !== null) {
    parts.push({ score: children, weight: 0.2 * importanceMultiplier(viewerSignals, "children") });
  }
  if (living !== null) {
    parts.push({ score: living, weight: 0.15 * importanceMultiplier(viewerSignals, "living") });
  }
  if (relocation !== null) {
    parts.push({ score: relocation, weight: 0.1 * importanceMultiplier(viewerSignals, "relocation") });
  }
  if (partnerCareer !== null) {
    parts.push({ score: partnerCareer, weight: 0.1 * importanceMultiplier(viewerSignals, "partnerCareer") });
  }

  const total = parts.reduce((sum, p) => sum + p.weight, 0);
  if (total === 0) return 100;
  return Math.round(parts.reduce((sum, p) => sum + p.score * p.weight, 0) / total);
}
