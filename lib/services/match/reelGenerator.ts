import { prisma } from "@/lib/db/prisma";
import { PROFILE_FULL_INCLUDE } from "@/lib/services/profile/profileInclude";
import { getPlanContext, effectiveReelLimit } from "@/lib/services/plans/entitlements";
import { consumeReward } from "@/lib/services/rewards/rewardService";
import { needsRecompute, computeAndStoreScores } from "@/lib/services/deepProfile/deepProfileService";
import {
  announceCampaignCompleted,
  pickSpotlightForViewer,
  recordSpotlightDelivery,
  type SpotlightPick,
} from "@/lib/services/spotlight/deliveryService";
import { MIN_ORGANIC_CARDS_BEFORE_PROMOTED } from "@/lib/services/spotlight/spotlightPolicy";
import { getCandidates, loadMatchSignals, scoreCandidates } from "./pipeline";
import { explainTopCandidates } from "./explain";
import { buildLearnedBehaviorProfile } from "@/lib/services/discovery/behaviorLearning";

const CANDIDATE_INCLUDE = {
  candidates: {
    include: {
      profile: { include: PROFILE_FULL_INCLUDE },
      // Only whether this row was a paid card — the card reads it for its label.
      spotlightDelivery: { select: { id: true } },
    },
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

  const organicRows = scored.map((s, i) => {
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
      aiFactsHash: ex?.factsHash ?? null,
    };
  });

  // Spotlight (D-90 Phase 6): at most one paid card, after the first
  // MIN_ORGANIC_CARDS_BEFORE_PROMOTED organic ones, in addition to — never
  // instead of — the cards the plan promises. Best-effort: a failure picking
  // one costs the card, never the reel.
  let pick: SpotlightPick | null = null;
  try {
    pick = await pickSpotlightForViewer({
      viewerUserId: userId,
      viewerProfileId: viewerProfile.id,
      organicProfileIds: scored.map((s) => s.profile.id),
      poolFilters: discovery
        ? {
            filterMode: discovery.filterMode,
            verifiedOnly: discovery.verifiedOnly,
            minTrustScore: discovery.minTrustScore,
          }
        : null,
    });
  } catch (err) {
    console.error("[reel] spotlight pick failed:", err instanceof Error ? err.message : String(err));
  }

  const persist = async (withPick: SpotlightPick | null) => {
    if (!withPick) {
      const reel = await prisma.dailyReel.create({
        data: { userId, reelDate, dailyLimit, candidates: { create: organicRows } },
        include: CANDIDATE_INCLUDE,
      });
      return { reel, completed: false };
    }

    // The paid card's stored scores are placeholders on purpose: every card
    // re-scores itself from the live profiles on read (reelData.toCard), and
    // a paid card carries no AI explanation — that would be the app vouching
    // for someone who paid to be seen.
    const at = Math.min(MIN_ORGANIC_CARDS_BEFORE_PROMOTED, organicRows.length);
    const rows = [
      ...organicRows.slice(0, at),
      {
        profileId: withPick.profileId,
        rank: at,
        preferenceScore: null,
        trustScoreFactor: 0,
        recentActivityScore: 0,
        deepProfileFit: null,
        finalScore: 0,
        aiReasonText: null,
        aiConcernText: null,
        explainedAt: null,
        aiFactsHash: null,
      },
      ...organicRows.slice(at).map((row) => ({ ...row, rank: row.rank + 1 })),
    ];

    // The reel row and the delivery count commit together or not at all: a
    // reel that is never written counts nobody, and a refused delivery takes
    // its card out of the reel with it.
    const written = await prisma.$transaction(async (tx) => {
      const reel = await tx.dailyReel.create({
        // One more swipe for the one more card — the plan's own count is untouched.
        data: { userId, reelDate, dailyLimit: dailyLimit + 1, candidates: { create: rows } },
        select: { id: true, candidates: { select: { id: true, profileId: true } } },
      });
      const card = reel.candidates.find((c) => c.profileId === withPick.profileId);
      if (!card) throw new Error("Spotlight reel row missing");
      const { completed } = await recordSpotlightDelivery(tx, {
        campaignId: withPick.campaignId,
        viewerUserId: userId,
        dailyReelProfileId: card.id,
        now: new Date(),
      });
      return { reelId: reel.id, completed };
    });

    const reel = await prisma.dailyReel.findUniqueOrThrow({
      where: { id: written.reelId },
      include: CANDIDATE_INCLUDE,
    });
    return { reel, completed: written.completed };
  };

  try {
    let result: Awaited<ReturnType<typeof persist>>;
    try {
      result = await persist(pick);
    } catch (err) {
      if (!pick) throw err;
      // A concurrent request may have written today's reel first — that one is
      // the answer, exactly as in the race handled below.
      const winner = await prisma.dailyReel.findUnique({
        where: { userId_reelDate: { userId, reelDate } },
        include: CANDIDATE_INCLUDE,
      });
      if (winner) return winner;
      // Otherwise it was the paid slot itself: the campaign filled up or
      // stopped between picking and writing, or another request already
      // delivered it to this member. None of that is a reason to show no reel.
      console.error("[reel] spotlight slot dropped:", err instanceof Error ? err.message : String(err));
      pick = null;
      result = await persist(null);
    }
    const created = result.reel;

    if (pick && result.completed) {
      await announceCampaignCompleted(pick.campaignId).catch((err) => {
        console.error("[reel] spotlight completion notice failed:", err instanceof Error ? err.message : String(err));
      });
    }

    // Only the request that actually persisted today's reel spends the
    // credit — the P2002 loser below never reaches here. Spend only what
    // the candidate pool actually delivered past the plan baseline: a
    // thin pool can leave `scored.length` under `dailyLimit`, and we must
    // never charge for a card the user didn't get. A paid Spotlight card is
    // not the member's card and never counts toward it.
    const organicDelivered = created.candidates.filter((c) => !c.spotlightDelivery).length;
    const creditsUsed = Math.max(0, Math.min(organicDelivered - baseLimit, ctx.credits.REEL_UNLOCK));
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
