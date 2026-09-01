import { prisma } from "@/lib/db/prisma";
import { PROFILE_FULL_INCLUDE } from "@/lib/services/profile/profileInclude";
import { getPlanContext, effectiveReelLimit } from "@/lib/services/plans/entitlements";
import { consumeReward } from "@/lib/services/rewards/rewardService";
import { needsRecompute, computeAndStoreScores } from "@/lib/services/deepProfile/deepProfileService";
import { getCandidates, loadMatchSignals, scoreCandidates } from "./pipeline";
import { explainTopCandidates } from "./explain";
import { buildLearnedBehaviorProfile } from "@/lib/services/discovery/behaviorLearning";

const CANDIDATE_INCLUDE = {
  candidates: {
    include: { profile: { include: PROFILE_FULL_INCLUDE } },
    orderBy: { rank: "asc" as const },
  },
} as const;

/** Exported so other daily-boundary logic (e.g. AI-ask quota) shares this exact cutoff. */
export function todayUTCDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/**
 * "Roz 5, pre-computed" without a nightly job: compute once on first visit
 * of the day, persist, and every subsequent load that day is a plain read —
 * the instant-on-repeat-visit feel the doc wants, no BullMQ required (D-30
 * marks that "later" anyway).
 */
export async function getOrCreateTodayReel(userId: string) {
  const reelDate = todayUTCDate();

  const existing = await prisma.dailyReel.findUnique({
    where: { userId_reelDate: { userId, reelDate } },
    include: CANDIDATE_INCLUDE,
  });
  if (existing) return existing;

  const viewerProfile = await prisma.profile.findUnique({
    where: { userId },
    include: PROFILE_FULL_INCLUDE,
  });
  if (!viewerProfile) throw new Error("Profile not found for reel generation.");

  // D-11's ladder, read through the plan gate rather than hardcoded — see
  // lib/services/plans/entitlements.ts for why this resolves to FREE today.
  // effectiveReelLimit folds in any held REEL_UNLOCK credits on top of the
  // plan baseline; the extra slots are spent (consumeReward) below, only
  // once the reel that actually used them is the one that gets persisted.
  const ctx = await getPlanContext(userId);
  const baseLimit = ctx.features.reelPerDay;
  const dailyLimit = effectiveReelLimit(ctx);

  // Best-effort: the viewer's own Deep Profile is refreshed once here, at the
  // same "first reel of the day" moment that already tolerates an AI-call
  // wait for L3 explanations below. A failure here must never break reel
  // generation — it just costs one of soch fit's three inputs for the day,
  // and `computeSochFit` still scores on poll and mindset agreement (see
  // sochFit.ts).
  try {
    if (await needsRecompute(userId)) await computeAndStoreScores(userId);
  } catch (err) {
    console.error("[reel] deep-profile recompute failed:", err instanceof Error ? err.message : String(err));
  }

  // Advanced Discovery's pool controls (STRICT/verified-only/min-trust) and
  // behaviour learning both read the same entitlement check once, up front —
  // every FREE/BASIC-without-the-plan user takes the exact path this
  // function always has, byte-identical.
  const [discovery, behaviorProfile] = ctx.features.advancedDiscovery
    ? await Promise.all([
        prisma.discoverySettings.findUnique({ where: { userId } }),
        buildLearnedBehaviorProfile(userId),
      ])
    : [null, null];

  // minDesired=dailyLimit: if the strict (age-preference-respecting) pool
  // can't fill today's reel on its own, getCandidates widens the pool rather
  // than returning fewer cards than the plan promises — see pipeline.ts.
  // STRICT (Advanced Discovery) turns that widening off; verified-only/
  // min-trust are additional hard filters on the pool, both gated on the
  // same entitlement.
  const candidates = await getCandidates(viewerProfile, dailyLimit, {
    strict: discovery?.filterMode === "STRICT",
    discoveryFilters: discovery
      ? { verifiedOnly: discovery.verifiedOnly, minTrustScore: discovery.minTrustScore }
      : undefined,
  });
  const signals = await loadMatchSignals([viewerProfile, ...candidates]);
  const scored = scoreCandidates(viewerProfile, candidates, signals, behaviorProfile).slice(0, dailyLimit);
  const explanations = await explainTopCandidates(userId, viewerProfile, scored);

  try {
    const created = await prisma.dailyReel.create({
      data: {
        userId,
        reelDate,
        dailyLimit,
        candidates: {
          create: scored.map((s, i) => {
            const ex = explanations.get(s.profile.id);
            return {
              profileId: s.profile.id,
              rank: i,
              preferenceScore: s.preferenceScore,
              trustScoreFactor: s.trustScoreFactor,
              recentActivityScore: s.recentActivityScore,
              deepProfileFit: s.deepProfileFit,
              finalScore: s.finalScore,
              aiReasonText: ex?.strengths.join(" • ") ?? null,
              aiConcernText: ex?.concern ?? null,
              explainedAt: ex ? new Date() : null,
            };
          }),
        },
      },
      include: CANDIDATE_INCLUDE,
    });

    // Only the request that actually persisted today's reel spends the
    // credit — the P2002 loser below never reaches here. Spend only what
    // the candidate pool actually delivered past the plan baseline: a
    // thin pool can leave `scored.length` under `dailyLimit`, and we must
    // never charge for a card the user didn't get.
    const creditsUsed = Math.max(0, Math.min(created.candidates.length - baseLimit, ctx.credits.REEL_UNLOCK));
    if (creditsUsed > 0) {
      try {
        await consumeReward(userId, "REEL_UNLOCK", creditsUsed);
      } catch (err) {
        console.error("[reel] failed to consume REEL_UNLOCK credit:", err instanceof Error ? err.message : String(err));
      }
    }

    return created;
  } catch (err) {
    // Two requests can both see `existing === null` and both reach this
    // create — a plain read-then-write race that widens the more async work
    // sits between the two (the deep-profile recompute and L3 explanations
    // above both add time to that window). Rather than close the window with
    // a lock, the loser here just re-reads what the winner created: the
    // unique constraint on (userId, reelDate) is already the source of
    // truth, so a P2002 means someone else's row is the real answer.
    const isUniqueViolation =
      typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002";
    if (!isUniqueViolation) throw err;

    const winner = await prisma.dailyReel.findUnique({
      where: { userId_reelDate: { userId, reelDate } },
      include: CANDIDATE_INCLUDE,
    });
    if (!winner) throw err; // Shouldn't happen — the constraint that just fired guarantees a row exists.
    return winner;
  }
}
