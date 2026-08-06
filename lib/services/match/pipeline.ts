import { prisma } from "@/lib/db/prisma";
import { PROFILE_FULL_INCLUDE } from "@/lib/services/profile/profileInclude";
import { getBlockedUserIds } from "@/lib/services/safety/blockService";
import { isBoosted } from "@/lib/services/boost/boostService";
import { computeSochFit, type MatchSignals, type SochFit } from "./sochFit";
import type { ProfileWithSubTables } from "@/lib/services/profile/completionService";

// D-33, exact. One of the five signals — trust-graph proximity (M11 partner
// referrals) — belongs to a module this pass doesn't build. `deepProfileDistance`
// *is* live now (lib/services/deepProfile) — `liveWeights()` renormalizes
// across whichever signals are actually available for a given pair, so the
// config shape below never has to change when trustGraph lands either — only
// `liveWeights()` does.
//
// `deepProfileDistance` is still 0.25 and D-33 is still untouched, but what
// feeds that 0.25 got wider: it is now `computeSochFit` (lib/services/match/
// sochFit.ts), which blends poll answers and the mindset trio with the AI
// dimension scores instead of using the dimensions alone. That is a change of
// *inputs*, not of weights — see sochFit.ts's module note for why direct
// answers belong in the same slot rather than in a sixth weight.
//
// `preference` (0.3) widened the same way, 2026-08-04: `scorePreferenceMatch`
// now also scores an explicit religion/caste/manglik *preference* the viewer
// declared for their partner, alongside the existing city/education/deal-
// breaker checks. Explicit-preference-only is the hard rule — a candidate's
// own religion/caste is never read into a shared embedding or used to
// auto-cluster anyone (M17 §L1, `NEVER_EMBED_KEYS` in lib/profile/fields.ts);
// it is only ever checked against what someone typed for themselves, and
// "Koi farak nahi" (the default) always scores 100. See
// `scoreReligionMatch`/`scoreCasteMatch`/`scoreManglikMatch` below.
export const MATCH_WEIGHTS = {
  preference: 0.3,
  deepProfileDistance: 0.25,
  trust: 0.2,
  recentActivity: 0.15,
  trustGraph: 0.1,
} as const;

/**
 * Per-pair, not global: whether deep-profile fit is available depends on how
 * many dimensions *this specific pair* both have scored (M17 §3.2 — fewer
 * than 3 in common means no signal for that pair specifically). A candidate
 * who hasn't run their analysis yet still gets scored on the other three
 * signals, renormalized — never zeroed out for a plan-level feature they may
 * not even know exists yet.
 */
function liveWeights(hasDeepFit: boolean) {
  const total = hasDeepFit
    ? MATCH_WEIGHTS.preference + MATCH_WEIGHTS.deepProfileDistance + MATCH_WEIGHTS.trust + MATCH_WEIGHTS.recentActivity
    : MATCH_WEIGHTS.preference + MATCH_WEIGHTS.trust + MATCH_WEIGHTS.recentActivity;
  return {
    preference: MATCH_WEIGHTS.preference / total,
    deep: hasDeepFit ? MATCH_WEIGHTS.deepProfileDistance / total : 0,
    trust: MATCH_WEIGHTS.trust / total,
    recentActivity: MATCH_WEIGHTS.recentActivity / total,
  };
}

/**
 * Signals pre-fetched once per scoring run, never inside `scoreCandidates`'s
 * loop (D-33: L2 stays pure TS, no DB, no AI). Both maps are optional — every
 * one of them missing is a legal state that degrades the pair's soch signal to
 * null rather than to zero.
 */
export type { PollVoteMap, MatchSignals } from "./sochFit";
import type { DimensionScoreMap, PollVoteMap } from "./sochFit";
export type { DimensionScoreMap };

export interface ScoredCandidate {
  profile: ProfileWithSubTables;
  preferenceScore: number;
  trustScoreFactor: number;
  recentActivityScore: number;
  /** Null when this pair shares no thinking data at all — no signal, not a zero. */
  sochFit: SochFit | null;
  /**
   * `sochFit.score`, flattened. Exists because `DailyReelProfile.deepProfileFit`
   * is the column this number has always been persisted in — renaming it would
   * be a migration that buys nothing, since it still answers the same question.
   */
  deepProfileFit: number | null;
  finalScore: number;
}

function ageBoundsToDobRange(minAge?: number | null, maxAge?: number | null) {
  const now = new Date();
  const maxDob = minAge != null ? new Date(now.getFullYear() - minAge, now.getMonth(), now.getDate()) : undefined;
  const minDob =
    maxAge != null ? new Date(now.getFullYear() - maxAge - 1, now.getMonth(), now.getDate() + 1) : undefined;
  return { minDob, maxDob };
}

/**
 * L0 — SQL hard filter (D-33: ~2ms at doc scale; here it's the whole table,
 * which is the same query, just against fewer rows). Excludes: self, not
 * visible, not submitted/verified, wrong gender for the viewer's stated
 * preference, anything the viewer has already swiped (never re-show), and —
 * only when `respectAgePreference` is true — outside the viewer's age
 * preference.
 *
 * Gender, visibility, profile status, block-list and already-swiped are
 * never optional: they are correctness/safety floors, not taste. Age
 * preference is the one filter `getCandidates` below is allowed to drop, and
 * only as a fallback.
 */
async function queryCandidates(
  viewer: ProfileWithSubTables,
  blockedUserIds: string[],
  respectAgePreference: boolean,
): Promise<ProfileWithSubTables[]> {
  const prefs = viewer.partnerPreferences;
  const { minDob, maxDob } = respectAgePreference
    ? ageBoundsToDobRange(prefs?.minAge, prefs?.maxAge)
    : {};

  return prisma.profile.findMany({
    where: {
      userId: { not: viewer.userId },
      ...(blockedUserIds.length ? { userId: { not: viewer.userId, notIn: blockedUserIds } } : {}),
      isVisible: true,
      profileStatus: { in: ["SUBMITTED", "VERIFIED"] },
      deletedAt: null,
      ...(prefs?.lookingForGender ? { gender: prefs.lookingForGender } : {}),
      ...(minDob || maxDob ? { dateOfBirth: { gte: minDob, lte: maxDob } } : {}),
      swipedBy: { none: { actorUserId: viewer.userId } },
    },
    include: PROFILE_FULL_INCLUDE,
  });
}

/**
 * A brand-new profile (or one with a narrow age preference in a thin city)
 * can have too few — sometimes zero — strict matches to fill even one day's
 * reel. Rather than show an empty deck while real signal is still building
 * up, this tops up with a wider pass that drops the age-preference range —
 * still gender/visibility/status/block/already-swiped filtered, just not
 * age-bounded.
 *
 * Nothing about *scoring* changes: `scoreCandidates` still computes each
 * pair's real preferenceScore (which includes the soft, non-excluding city
 * check — see `scoreCityMatch`) honestly, so a widened candidate simply shows
 * whatever true score they actually earn. As soon as enough real, in-preference
 * candidates exist to fill `minDesired` on their own, this fallback pass never
 * runs and today's reel is 100% strict-matched again — no separate "fallback
 * mode" to turn off, it just stops being needed.
 */
export async function getCandidates(viewer: ProfileWithSubTables, minDesired = 0): Promise<ProfileWithSubTables[]> {
  // Both directions: someone the viewer blocked, and someone who blocked the
  // viewer, are equally not candidates. Filtering only one way would leave a
  // blocked person able to act on a card the other side can no longer see.
  const blockedUserIds = await getBlockedUserIds(viewer.userId);

  const strict = await queryCandidates(viewer, blockedUserIds, true);
  if (strict.length >= minDesired) return strict;

  const wider = await queryCandidates(viewer, blockedUserIds, false);
  const strictIds = new Set(strict.map((p) => p.id));
  return [...strict, ...wider.filter((p) => !strictIds.has(p.id))];
}

export const EDUCATION_FLOORS: Record<string, string[]> = {
  "Graduate ya upar": ["Graduate", "B.Tech", "B.Com", "B.A.", "MBA", "M.Tech", "M.Sc", "Post Graduate", "PhD"],
  "Post Graduate ya upar": ["Post Graduate", "M.Tech", "M.Sc", "MBA", "PhD"],
  "Professional degree": ["B.Tech", "MBA", "PhD"],
};

function scoreCityMatch(prefs: ProfileWithSubTables["partnerPreferences"], viewer: ProfileWithSubTables, candidate: ProfileWithSubTables): number {
  const wanted = prefs?.preferredCities ?? [];
  if (wanted.length === 0 || wanted.includes("Kahin bhi")) return 100;
  if (wanted.includes("Isi sheher me") && candidate.currentCity && candidate.currentCity === viewer.currentCity) return 100;
  if (candidate.currentCity && wanted.includes(candidate.currentCity)) return 100;
  return 40; // not a match, but not disqualifying — L0 already handles hard exclusions
}

function scoreEducationMatch(prefs: ProfileWithSubTables["partnerPreferences"], candidate: ProfileWithSubTables): number {
  const wanted = prefs?.educationPreference;
  if (!wanted || wanted === "Koi farak nahi") return 100;
  const floor = EDUCATION_FLOORS[wanted];
  if (!floor) return 70;
  return candidate.education?.highestEducation && floor.includes(candidate.education.highestEducation) ? 100 : 30;
}

/** Deal breakers are free text (fields.ts `dealBreakers` is a textarea) — a keyword check, not a parser. */
function scoreDealBreakers(prefs: ProfileWithSubTables["partnerPreferences"], candidate: ProfileWithSubTables): number {
  const text = (prefs?.dealBreakers ?? []).join(" ").toLowerCase();
  if (!text) return 100;
  let violations = 0;
  let checks = 0;
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
  if (checks === 0) return 100;
  return Math.round(((checks - violations) / checks) * 100);
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

function scorePreferenceMatch(viewer: ProfileWithSubTables, candidate: ProfileWithSubTables): number {
  const prefs = viewer.partnerPreferences;
  const city = scoreCityMatch(prefs, viewer, candidate);
  const education = scoreEducationMatch(prefs, candidate);
  const dealBreakers = scoreDealBreakers(prefs, candidate);
  const religion = scoreReligionMatch(prefs, candidate);
  const caste = scoreCasteMatch(prefs, candidate);
  const manglik = scoreManglikMatch(prefs, candidate);
  return Math.round(
    city * 0.25 + education * 0.15 + dealBreakers * 0.15 + religion * 0.2 + caste * 0.15 + manglik * 0.1,
  );
}

/**
 * D-11's `boost`: a bounded nudge, never an override.
 *
 * Capped at +15% and applied only to `recentActivityScore` — the weakest of
 * L2's three live signals (15% of the final weight, per `MATCH_WEIGHTS`) — so
 * boost can move someone from the bottom of a page toward the top, but a
 * boosted-but-poor-fit profile can never outrank a genuinely better match on
 * `preferenceScore` or `trustScoreFactor`. D-33 calls ranking "deterministic,
 * reproducible, explainable" — a boost strong enough to override preference
 * or trust would make the deterministic part of that a lie. See
 * lib/services/boost/boostService.ts for what sets `boostActiveUntil`.
 *
 * Exported (with `scoreRecentActivity` below) so the boost page can show the
 * user this exact formula applied to their own profile — the same "real
 * number, not an invented one" discipline as the rest of L2, rather than a
 * second, display-only copy of these two numbers that could quietly drift
 * from what actually happens in ranking.
 */
export const BOOST_MULTIPLIER = 1.15;

/** Structural, not `ProfileWithSubTables` — the boost page calls this with a plain `{updatedAt, boostActiveUntil}` read, not a full profile. */
export function scoreRecentActivity(profile: { updatedAt: Date; boostActiveUntil: Date | null }): number {
  const hoursSince = (Date.now() - profile.updatedAt.getTime()) / (1000 * 60 * 60);
  const base = hoursSince <= 24 ? 100 : hoursSince <= 24 * 7 ? 80 : hoursSince <= 24 * 30 ? 50 : 20;
  return isBoosted(profile.boostActiveUntil) ? Math.min(100, Math.round(base * BOOST_MULTIPLIER)) : base;
}

/**
 * L2 — pure TS, deterministic, config-driven weights. No AI, no DB calls in
 * this loop (D-32/D-33). `signals` is pre-fetched once by the caller (see
 * `loadMatchSignals`) — this function only ever reads the in-memory maps.
 */
export function scoreCandidates(
  viewer: ProfileWithSubTables,
  candidates: ProfileWithSubTables[],
  signals: MatchSignals = {},
): ScoredCandidate[] {
  return candidates
    .map((profile) => {
      const preferenceScore = scorePreferenceMatch(viewer, profile);
      const trustScoreFactor = profile.trustScore ?? 50;
      const recentActivityScore = scoreRecentActivity(profile);
      const sochFit = computeSochFit(viewer, profile, signals);

      const w = liveWeights(sochFit !== null);
      const finalScore = Math.round(
        preferenceScore * w.preference +
          (sochFit?.score ?? 0) * w.deep +
          trustScoreFactor * w.trust +
          recentActivityScore * w.recentActivity,
      );
      return {
        profile,
        preferenceScore,
        trustScoreFactor,
        recentActivityScore,
        sochFit,
        deepProfileFit: sochFit?.score ?? null,
        finalScore,
      };
    })
    .sort((a, b) => b.finalScore - a.finalScore);
}

/**
 * Loads both scoring signals for a set of people in two queries.
 *
 * Takes profiles rather than ids because the two maps are keyed differently —
 * dimensions by `profile.id`, poll votes by `profile.userId` — and making each
 * caller remember which is which is how one of them eventually passes the
 * wrong one and silently gets an empty map (a null signal looks exactly like
 * "these two have nothing in common", so it would never throw).
 */
export async function loadMatchSignals(
  profiles: { id: string; userId: string }[],
): Promise<MatchSignals> {
  if (profiles.length === 0) return {};
  const profileIds = profiles.map((p) => p.id);
  const userIds = profiles.map((p) => p.userId);

  const [dimRows, voteRows] = await Promise.all([
    prisma.profileDimensionScore.findMany({
      where: { profileId: { in: profileIds }, scoreValue: { not: null } },
      select: { profileId: true, dimensionKey: true, scoreValue: true },
    }),
    prisma.pollVote.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, pollId: true, optionIndex: true },
    }),
  ]);

  const dimensionScores: DimensionScoreMap = new Map();
  for (const r of dimRows) {
    if (r.scoreValue === null) continue;
    const existing = dimensionScores.get(r.profileId) ?? {};
    existing[r.dimensionKey] = r.scoreValue;
    dimensionScores.set(r.profileId, existing);
  }

  const pollVotes: PollVoteMap = new Map();
  for (const v of voteRows) {
    const existing = pollVotes.get(v.userId) ?? new Map<string, number>();
    existing.set(v.pollId, v.optionIndex);
    pollVotes.set(v.userId, existing);
  }

  return { dimensionScores, pollVotes };
}
