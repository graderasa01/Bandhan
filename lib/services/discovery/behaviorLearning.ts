import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ageFromDate } from "@/lib/services/match/age";
import type { ProfileWithSubTables } from "@/lib/services/profile/completionService";

/**
 * Behaviour-personalised Reel ranking (Advanced Discovery, paid).
 *
 * ## The rules, and where each one is enforced
 *
 *  - **Threshold** (≥20 completed decisions, ≥3 positive) — `buildLearnedBehaviorProfile`
 *    returns `null` below it, and `null` is what keeps a thin history from
 *    ranking anyone (see `computeBehaviorAffinity`'s null-propagation).
 *  - **RIGHT/DOWN positive, LEFT weak-negative, UP ignored** — `SIGNAL_WEIGHT`
 *    below; `UP` is simply excluded from the query (`direction: { in: ["LEFT","RIGHT","DOWN"] }`).
 *  - **`decisionMs` never used as evidence** — never read anywhere in this file.
 *  - **Latest 100, recency-weighted** — `take: MAX_ELIGIBLE_SWIPES`, and
 *    `recencyWeight` decays linearly by position, most-recent first.
 *  - **Only non-sensitive, user-visible attributes** — age band, city,
 *    education, profession category, diet/smoking/drinking. Every one of
 *    these is already shown to any viewer at L1 (`candidateFacts.ts`); this
 *    file adds no new visibility, it only counts what a swipe already saw.
 *  - **Never a name, never religion/caste/income/gotra/manglik** —
 *    structurally true: `SwipeTargetSelect` below is the only shape a target
 *    profile is read in, and it has no field for any of them.
 *  - **Explicit saved preferences always override** — this module has no
 *    opinion on `ProfilePartnerPreferences`; it only feeds the small,
 *    additional `behaviorAffinity` part inside `scorePreferenceMatch`'s
 *    existing preference bucket (see `preferenceScore.ts`), which is
 *    dominated by the explicit signals already scored there.
 *  - **Pure scoring loop** — `computeBehaviorAffinity` takes an
 *    already-built `LearnedBehaviorProfile` and a candidate's already-loaded
 *    fields; no DB, no await, callable from inside `scoreCandidates`'s map.
 */

const MIN_DECISIONS = 20;
const MIN_POSITIVE = 3;
const MAX_ELIGIBLE_SWIPES = 100;

const POSITIVE_WEIGHT = 1;
/** LEFT is a *weak* negative — it should shave affinity, never invert it. */
const NEGATIVE_WEIGHT = 0.3;

export type BehaviorDimension = "ageBand" | "city" | "education" | "professionCategory" | "lifestyle";

/** value → net signed weight accumulated for that value, per dimension. */
export type DimensionScores = Map<string, number>;

export interface LearnedBehaviorProfile {
  dimensions: Record<BehaviorDimension, DimensionScores>;
  sampleSize: number;
  positiveCount: number;
  learnedAt: Date;
}

/** 3-year bands — fine enough to be useful, coarse enough that one swipe never singles out an exact age. */
export function ageBandOf(age: number): string {
  const start = Math.floor(age / 3) * 3;
  return `${start}-${start + 2}`;
}

function lifestyleValues(life: { diet: string | null; smoking: string | null; drinking: string | null } | null | undefined): string[] {
  if (!life) return [];
  return [life.diet ? `diet:${life.diet}` : null, life.smoking ? `smoking:${life.smoking}` : null, life.drinking ? `drinking:${life.drinking}` : null].filter(
    (v): v is string => v !== null,
  );
}

function addWeighted(map: DimensionScores, key: string, weight: number) {
  map.set(key, (map.get(key) ?? 0) + weight);
}

const SWIPE_TARGET_SELECT = {
  dateOfBirth: true,
  currentCity: true,
  education: { select: { highestEducation: true } },
  profession: { select: { professionCategory: true } },
  lifestyle: { select: { diet: true, smoking: true, drinking: true } },
} as const;

/**
 * Reads this user's own DiscoverySettings and their latest eligible swipes,
 * and returns a learned profile — or `null` when learning is paused, not yet
 * entitled to be called (callers gate on `advancedDiscovery` before calling
 * this at all), or the pair of thresholds isn't cleared yet.
 */
export async function buildLearnedBehaviorProfile(userId: string): Promise<LearnedBehaviorProfile | null> {
  const settings = await prisma.discoverySettings.findUnique({ where: { userId } });
  if (settings && !settings.behaviorLearningEnabled) return null;

  const swipes = await prisma.swipeAction.findMany({
    where: {
      actorUserId: userId,
      direction: { in: ["LEFT", "RIGHT", "DOWN"] },
      ...(settings?.behaviorResetAt ? { createdAt: { gt: settings.behaviorResetAt } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: MAX_ELIGIBLE_SWIPES,
    select: { direction: true, targetProfile: { select: SWIPE_TARGET_SELECT } },
  });

  const positiveCount = swipes.filter((s) => s.direction === "RIGHT" || s.direction === "DOWN").length;
  if (swipes.length < MIN_DECISIONS || positiveCount < MIN_POSITIVE) return null;

  const dimensions: Record<BehaviorDimension, DimensionScores> = {
    ageBand: new Map(),
    city: new Map(),
    education: new Map(),
    professionCategory: new Map(),
    lifestyle: new Map(),
  };

  swipes.forEach((s, i) => {
    // Linear recency decay: index 0 (most recent) ≈ 1.0, oldest in the window ≈ ~0.01.
    const recency = (MAX_ELIGIBLE_SWIPES - i) / MAX_ELIGIBLE_SWIPES;
    const signed = (s.direction === "LEFT" ? -NEGATIVE_WEIGHT : POSITIVE_WEIGHT) * recency;
    const t = s.targetProfile;

    const age = t.dateOfBirth ? ageFromDate(t.dateOfBirth) : null;
    if (age !== null) addWeighted(dimensions.ageBand, ageBandOf(age), signed);
    if (t.currentCity) addWeighted(dimensions.city, t.currentCity, signed);
    if (t.education?.highestEducation) addWeighted(dimensions.education, t.education.highestEducation, signed);
    if (t.profession?.professionCategory) addWeighted(dimensions.professionCategory, t.profession.professionCategory, signed);
    for (const v of lifestyleValues(t.lifestyle)) addWeighted(dimensions.lifestyle, v, signed);
  });

  return { dimensions, sampleSize: swipes.length, positiveCount, learnedAt: new Date() };
}

/**
 * The pure half — pluggable straight into `scorePreferenceMatch`'s existing
 * "optional part" pattern (see that file's `parts` array). Returns `null`
 * (no signal, not a zero) when the profile has nothing to say about this
 * particular candidate, which happens whenever every dimension the candidate
 * has a value for is a dimension the viewer has never shown any signal on.
 */
export function computeBehaviorAffinity(
  profile: LearnedBehaviorProfile | null,
  candidate: ProfileWithSubTables,
): number | null {
  if (!profile) return null;

  const candidateValues: { dim: BehaviorDimension; value: string }[] = [];
  const age = candidate.dateOfBirth ? ageFromDate(candidate.dateOfBirth) : null;
  if (age !== null) candidateValues.push({ dim: "ageBand", value: ageBandOf(age) });
  if (candidate.currentCity) candidateValues.push({ dim: "city", value: candidate.currentCity });
  if (candidate.education?.highestEducation) candidateValues.push({ dim: "education", value: candidate.education.highestEducation });
  if (candidate.profession?.professionCategory) candidateValues.push({ dim: "professionCategory", value: candidate.profession.professionCategory });
  for (const v of lifestyleValues(candidate.lifestyle)) candidateValues.push({ dim: "lifestyle", value: v });

  const perDimensionScores: number[] = [];
  for (const { dim, value } of candidateValues) {
    const scores = profile.dimensions[dim];
    if (scores.size === 0) continue;
    const maxAbs = Math.max(...[...scores.values()].map((v) => Math.abs(v)));
    if (maxAbs === 0) continue;
    const net = scores.get(value) ?? 0;
    // 0..100, centred at 50 (neutral — never seen this value).
    perDimensionScores.push(Math.max(0, Math.min(100, 50 + (net / maxAbs) * 50)));
  }

  if (perDimensionScores.length === 0) return null;
  return Math.round(perDimensionScores.reduce((a, b) => a + b, 0) / perDimensionScores.length);
}

/**
 * Raw counts only — for the settings screen's "12/20 so far" progress line
 * when `buildLearnedBehaviorProfile` has returned `null` and there is
 * otherwise no way to say how close the user is to the threshold.
 */
export async function countEligibleSwipes(userId: string, behaviorResetAt: Date | null): Promise<{ total: number; positive: number }> {
  const swipes = await prisma.swipeAction.findMany({
    where: {
      actorUserId: userId,
      direction: { in: ["LEFT", "RIGHT", "DOWN"] },
      ...(behaviorResetAt ? { createdAt: { gt: behaviorResetAt } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: MAX_ELIGIBLE_SWIPES,
    select: { direction: true },
  });
  return { total: swipes.length, positive: swipes.filter((s) => s.direction === "RIGHT" || s.direction === "DOWN").length };
}

/* ------------------------------------------------------------------ */
/* Explainable summary — what the settings screen and Grio may say     */
/* ------------------------------------------------------------------ */

export type BehaviorLearningState = "paused" | "collecting" | "active";

export interface BehaviorLearningSummary {
  state: BehaviorLearningState;
  sampleSize: number;
  positiveCount: number;
  /** Top 3 values per dimension the learner currently leans toward — for the UI's "learning from X, Y" sentence. Empty when not yet active. */
  topCities: string[];
  topAgeBands: string[];
  topEducation: string[];
}

function topValues(scores: DimensionScores, n: number): string[] {
  return [...scores.entries()]
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([v]) => v);
}

/**
 * Same threshold logic as `buildLearnedBehaviorProfile`, restated on the raw
 * counts so the settings screen can show "collecting — 12/20" without a
 * second swipe query (the caller already has `sampleSize`/`positiveCount`
 * from whatever it fetched, or passes zeros before any swiping has happened).
 */
export function summarizeBehaviorLearning(params: {
  enabled: boolean;
  profile: LearnedBehaviorProfile | null;
  sampleSize: number;
  positiveCount: number;
}): BehaviorLearningSummary {
  if (!params.enabled) {
    return { state: "paused", sampleSize: params.sampleSize, positiveCount: params.positiveCount, topCities: [], topAgeBands: [], topEducation: [] };
  }
  if (!params.profile) {
    return { state: "collecting", sampleSize: params.sampleSize, positiveCount: params.positiveCount, topCities: [], topAgeBands: [], topEducation: [] };
  }
  return {
    state: "active",
    sampleSize: params.profile.sampleSize,
    positiveCount: params.profile.positiveCount,
    topCities: topValues(params.profile.dimensions.city, 3),
    topAgeBands: topValues(params.profile.dimensions.ageBand, 2),
    topEducation: topValues(params.profile.dimensions.education, 2),
  };
}
