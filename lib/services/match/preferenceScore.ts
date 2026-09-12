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
import { ageFromDate } from "./age";
import {
  isNeutralPreference,
  preferenceEvidenceState,
  statedCities,
  statedPartnerPreferences,
  type PreferenceEvidenceState,
  type PreferenceSignalKey,
} from "./preferenceEvidence";

/**
 * Which degrees clear each `partnerEducation` bar.
 *
 * A whitelist, not a rank: anything missing from a bar's list scores 30, so a
 * degree that exists in the catalog but not here is a candidate silently
 * marked down for a qualification they actually hold. That is what happened
 * to every non-listed degree before 2026-08-31, when the catalog only offered
 * twelve and everything else collapsed into "Other".
 *
 * Kept in step with `education`'s options in `lib/profile/fields.ts` and with
 * `EDUCATION_TREE` in `lib/profile/quickPicks.ts`. "Other" is deliberately in
 * none of them — it is the answer that says nothing, and reading it as
 * "graduate or above" would be a guess in the user's favour that a candidate
 * never made.
 */
const GRADUATE_DEGREES = [
  "Graduate", "B.Tech", "B.Sc", "B.Com", "B.A.", "BBA", "BCA", "LLB", "MBBS", "BDS", "B.Pharm",
];
const POST_GRADUATE_DEGREES = [
  "Post Graduate", "MBA", "M.Tech", "M.Sc", "M.A.", "M.Com", "MCA", "LLM", "MD", "CA", "CS", "PhD",
];

export const EDUCATION_FLOORS: Record<string, string[]> = {
  "Graduate ya upar": [...GRADUATE_DEGREES, ...POST_GRADUATE_DEGREES],
  "Post Graduate ya upar": POST_GRADUATE_DEGREES,
  // The licensed/qualifying degrees — a bar about the *kind* of degree rather
  // than its level, which is why MBBS and CA clear it while a plain M.A. does
  // not, and why B.Tech (the answer most people mean by "professional") stays.
  "Professional degree": [
    "B.Tech", "MBA", "M.Tech", "MBBS", "BDS", "B.Pharm", "MD",
    "LLB", "LLM", "CA", "CS", "MCA", "PhD",
  ],
};

/**
 * Every component below answers `null` — not 100 — when there is nothing to
 * compare: the viewer never stated this preference, stated the neutral
 * answer, or the candidate never filled the field it is checked against.
 *
 * That is the whole 2026-09-11 change. Before it, "no preference" scored the
 * same 100 as "perfect match", so a viewer who had filled nothing matched
 * every candidate at 100% and the reel presented an absence of data as
 * certainty. A null is excluded from the bucket and the remaining weights are
 * renormalized (see `scorePreferenceMatch`); a candidate is never marked down
 * for a blank on either side.
 */

/**
 * Age against the stated range. The SQL filter (`queryCandidates`) already
 * prefers this range, but it *widens* when the strict pool runs thin — so the
 * age preference has to be a scored signal too, or a widened candidate five
 * years outside the range would show the same preference match as one inside
 * it. Steps down by distance rather than falling off a cliff: two years past
 * a stated ceiling is a conversation, ten is not.
 */
export function scoreAgeMatch(
  prefs: ProfileWithSubTables["partnerPreferences"],
  candidate: Pick<ProfileWithSubTables, "dateOfBirth">,
): number | null {
  const min = prefs?.minAge ?? null;
  const max = prefs?.maxAge ?? null;
  if (min === null && max === null) return null;
  const age = ageFromDate(candidate.dateOfBirth);
  if (age === null) return null;
  const below = min !== null && age < min ? min - age : 0;
  const above = max !== null && age > max ? age - max : 0;
  const distance = Math.max(below, above);
  if (distance === 0) return 100;
  if (distance <= 2) return 70;
  if (distance <= 5) return 40;
  return 15;
}

export function scoreCityMatch(
  prefs: ProfileWithSubTables["partnerPreferences"],
  viewer: ProfileWithSubTables,
  candidate: ProfileWithSubTables,
): number | null {
  const wanted = statedCities(prefs);
  if (wanted.length === 0) return null;
  const theirs = (candidate.currentCity ?? "").trim();
  if (!theirs) return null;
  const mine = (viewer.currentCity ?? "").trim();
  const sameAsViewer = Boolean(mine) && theirs.toLowerCase() === mine.toLowerCase();
  const named = wanted.filter((c) => c !== "Isi sheher me");
  // "Isi sheher me" alone, from a viewer with no city of their own, compares
  // against nothing — there is no "isi sheher" to be in.
  if (named.length === 0 && !mine) return null;
  if (wanted.includes("Isi sheher me") && sameAsViewer) return 100;
  if (named.some((c) => c.toLowerCase() === theirs.toLowerCase())) return 100;
  return 40; // not a match, but not disqualifying — L0 already handles hard exclusions
}

export function scoreEducationMatch(
  prefs: ProfileWithSubTables["partnerPreferences"],
  candidate: ProfileWithSubTables,
): number | null {
  const wanted = prefs?.educationPreference;
  if (isNeutralPreference(wanted)) return null;
  const theirs = candidate.education?.highestEducation;
  if (!theirs) return null;
  const floor = EDUCATION_FLOORS[wanted as string];
  if (!floor) return 70;
  return floor.includes(theirs) ? 100 : 30;
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
 * asked them would turn silence into a mark against them. No check at all —
 * nothing stated, or nothing checkable on this candidate — is null, not 100.
 */
export function scoreDealBreakers(
  prefs: ProfileWithSubTables["partnerPreferences"],
  viewer: ProfileWithSubTables,
  candidate: ProfileWithSubTables,
  viewerSignals: SignalAnswerMap,
  candidateSignals: SignalAnswerMap,
): number | null {
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

  if (checks === 0) return null;
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
 * explicitly typed for themselves. "Koi farak nahi" (the default) and a blank
 * both mean this signal does not exist for the viewer — null, excluded,
 * renormalized — never a default 100 that reads as "matches".
 *
 * A candidate who left the field blank is null too. The old 30 for a missing
 * religion and 60 for a missing caste/manglik quietly marked people down for
 * a question they were never shown as mandatory.
 */
function scoreReligionMatch(prefs: ProfileWithSubTables["partnerPreferences"], candidate: ProfileWithSubTables): number | null {
  const wanted = prefs?.religionPreference;
  if (isNeutralPreference(wanted)) return null;
  const theirs = candidate.basicDetails?.religion;
  if (!theirs) return null;
  return theirs === wanted ? 100 : 30;
}

function scoreCasteMatch(prefs: ProfileWithSubTables["partnerPreferences"], candidate: ProfileWithSubTables): number | null {
  const wanted = (prefs?.castePreference ?? "").trim().toLowerCase();
  if (isNeutralPreference(wanted)) return null;
  const theirs = (candidate.basicDetails?.caste ?? "").trim().toLowerCase();
  if (!theirs) return null;
  return theirs === wanted ? 100 : 30;
}

function scoreManglikMatch(prefs: ProfileWithSubTables["partnerPreferences"], candidate: ProfileWithSubTables): number | null {
  const wanted = prefs?.manglikPreference;
  if (isNeutralPreference(wanted)) return null;
  const theirs = candidate.basicDetails?.manglikStatus;
  if (!theirs || theirs === "Pata nahi") return null;
  if (wanted === "Manglik chahiye") return theirs === "Haan" || theirs === "Aanshik manglik" ? 100 : 30;
  if (wanted === "Non-manglik chahiye") return theirs === "Nahi" || theirs === "Hum nahi maante" ? 100 : 30;
  return null;
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
export function scoreChildrenMatch(viewerSignals: SignalAnswerMap, candidateSignals: SignalAnswerMap): number | null {
  const gap = childrenGap(viewerSignals, candidateSignals);
  if (gap === null) return null;
  return [100, 70, 35, 0][Math.min(gap, 3)];
}

export function scoreLivingMatch(viewerSignals: SignalAnswerMap, candidateSignals: SignalAnswerMap): number | null {
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

export function scoreRelocationMatch(
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
export function scorePartnerCareerMatch(
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
 * The most a learned behaviour lean may move the preference score, in points
 * of its own 0..100 scale, in either direction.
 *
 * Behaviour is a *tilt on* the stated-preference score, not a part *inside*
 * its weighted average. It used to be the latter — a 0.08 weight next to the
 * stated components — and that shape has a flaw the renormalization hides: a
 * viewer who stated two things (city 0.25 + education 0.15 = 0.40) saw 0.08
 * renormalize to a sixth of the bucket, and a blended part pulls the score
 * toward *its own value*, so the movement was `⅙ × (affinity − score)`. From
 * a score of 74 that is +4 toward 100 but −12 toward 0 — asymmetric, and
 * larger the fewer preferences the viewer stated, which is the opposite of
 * "a small tie-breaker under explicit preferences".
 *
 * A centred shift has none of that: `computeBehaviorAffinity` already puts
 * "never seen this value" at 50, so `(affinity − 50) / 50` is a −1..+1 lean
 * and the nudge is at most ±5 points regardless of how many components the
 * viewer stated or where the score sits. At the bucket's 0.30 share that is
 * ±1.5 points of the final ranking — a tie-breaker between near-equal cards,
 * never a reordering against anything the user typed.
 */
export const BEHAVIOR_MAX_SHIFT = 5;

/**
 * Behaviour affinity (0..100, 50 = neutral) → the signed shift applied to a
 * stated-preference score. Symmetric by construction, bounded by
 * `BEHAVIOR_MAX_SHIFT`, and exactly 0 when there is no signal — the
 * no-regression guarantee the check script pins.
 */
export function behaviorShift(behaviorAffinity: number | null): number {
  if (behaviorAffinity === null || !Number.isFinite(behaviorAffinity)) return 0;
  const lean = (Math.max(0, Math.min(100, behaviorAffinity)) - 50) / 50;
  return lean * BEHAVIOR_MAX_SHIFT;
}

/** Base weight of each stated-preference component, before importance multipliers and renormalization. */
const COMPONENT_WEIGHT: Record<PreferenceSignalKey, number> = {
  age: 0.2,
  city: 0.25,
  education: 0.15,
  // No multiplier: a deal breaker is already the strictest thing a user can
  // say. Letting an importance answer soften it would contradict the word.
  dealBreakers: 0.15,
  religion: 0.2,
  caste: 0.15,
  manglik: 0.1,
  children: 0.2,
  living: 0.15,
  relocation: 0.1,
  partnerCareer: 0.1,
};

export interface PreferenceMatch {
  /**
   * 0..100, or null. Null is not a low score: it means this pair has no
   * preference match — the viewer stated nothing (NOT_PROVIDED) or fewer than
   * `MIN_COMPARABLE_SIGNALS` of their preferences could be checked against
   * this candidate (PARTIAL). Ranking excludes it and renormalizes; screens
   * say "jaankari kam hai" instead of a number.
   */
  score: number | null;
  state: PreferenceEvidenceState;
  /** Preferences the viewer stated at all — pair-independent. */
  stated: PreferenceSignalKey[];
  /** The subset that could actually be compared against this candidate. */
  compared: PreferenceSignalKey[];
  /**
   * How many points of `score` came from learned behaviour (see
   * `behaviorShift`), so the fit card can say "+2 aapki swipes se" instead of
   * presenting a nudged number as a stated match. 0 whenever behaviour did
   * not take part, and always 0 when `score` is null.
   */
  behaviorShift: number;
}

/**
 * The preference bucket — 0.30 of the final score whenever it exists.
 *
 * Every component is nullable (see the note above `scoreAgeMatch`). The
 * parts that exist are weighted by their base weight × the viewer's stated
 * importance ("Must match" counts more, "Flexible" less) and the weights are
 * renormalized over exactly those parts, so a viewer who stated two things is
 * scored on two things, at full weight, and nothing invented fills the gap.
 *
 * Below `MIN_COMPARABLE_SIGNALS` comparisons the score is withheld entirely —
 * from the ranking as well as from the screen, so the number the user reads
 * is always the number that ranked the card (D-33: explainable).
 */
export function scorePreferenceMatch(
  viewer: ProfileWithSubTables,
  candidate: ProfileWithSubTables,
  viewerSignals: SignalAnswerMap,
  candidateSignals: SignalAnswerMap,
  /**
   * Null for every user who isn't a paying, opted-in, threshold-cleared
   * Advanced Discovery user — see `reelGenerator.ts`, the only caller that
   * ever passes something other than the default.
   */
  behaviorAffinity: number | null = null,
): PreferenceMatch {
  const prefs = viewer.partnerPreferences;
  const stated = statedPartnerPreferences(viewer, viewerSignals).map((p) => p.key);

  const raw: Record<PreferenceSignalKey, number | null> = {
    age: scoreAgeMatch(prefs, candidate),
    city: scoreCityMatch(prefs, viewer, candidate),
    education: scoreEducationMatch(prefs, candidate),
    dealBreakers: scoreDealBreakers(prefs, viewer, candidate, viewerSignals, candidateSignals),
    religion: scoreReligionMatch(prefs, candidate),
    caste: scoreCasteMatch(prefs, candidate),
    manglik: scoreManglikMatch(prefs, candidate),
    children: scoreChildrenMatch(viewerSignals, candidateSignals),
    living: scoreLivingMatch(viewerSignals, candidateSignals),
    // `scoreRelocationMatch` answers off either side (relocation is solved
    // together), but as a *preference* component it only counts when the
    // viewer stated a boundary of their own — `compared` must stay a subset
    // of `stated`, or "aapki pasand se mel" would be scoring somebody else's.
    relocation: stated.includes("relocation")
      ? scoreRelocationMatch(viewer, candidate, viewerSignals, candidateSignals)
      : null,
    partnerCareer: scorePartnerCareerMatch(viewerSignals, candidateSignals),
  };

  const parts: { score: number; weight: number }[] = [];
  const compared: PreferenceSignalKey[] = [];
  for (const key of Object.keys(COMPONENT_WEIGHT) as PreferenceSignalKey[]) {
    const score = raw[key];
    if (score === null) continue;
    compared.push(key);
    const multiplier = key === "dealBreakers" ? 1 : importanceMultiplier(viewerSignals, key);
    parts.push({ score, weight: COMPONENT_WEIGHT[key] * multiplier });
  }

  const state = preferenceEvidenceState(stated.length, compared.length);
  if (state !== "COMPARABLE") return { score: null, state, stated, compared, behaviorShift: 0 };

  const total = parts.reduce((sum, p) => sum + p.weight, 0);
  if (total === 0) return { score: null, state: "PARTIAL", stated, compared, behaviorShift: 0 };
  const statedScore = parts.reduce((sum, p) => sum + p.score * p.weight, 0) / total;

  // Behaviour tilts only a score that already exists on stated evidence — a
  // learned lean can nudge a real comparison, never stand in for one, and
  // never by more than `BEHAVIOR_MAX_SHIFT` in either direction. Applied
  // after the weighted average, outside it, so the stated components keep
  // their full weight whatever the viewer did or did not state.
  const shift = behaviorShift(behaviorAffinity);
  const score = Math.max(0, Math.min(100, Math.round(statedScore + shift)));
  return { score, state, stated, compared, behaviorShift: score - Math.round(statedScore) };
}
