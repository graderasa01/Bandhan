import { after } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { PROFILE_FULL_INCLUDE } from "@/lib/services/profile/profileInclude";
import { getPlanContext, reelBatchSize } from "@/lib/services/plans/entitlements";
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

/**
 * How many of the first batch's cards get the model's two sentences.
 *
 * The best-ranked few, not the whole batch: the deterministic "Why this
 * match?" is on every card regardless, and each explanation is one model call
 * per member per day against a free-tier quota of about twenty calls per
 * model per day — fifteen a member was the reason the quota ran dry by noon.
 */
export const AI_EXPLAINED_PER_REEL = 5;

/**
 * Work that must never hold the reel's first paint.
 *
 * Both AI steps of a new day's reel — the viewer's Deep Profile refresh and the
 * cards' explanations — used to be awaited before the page could render, and
 * on a day the providers were out of quota that was a minute or more of
 * spinner: every attempt waited out its timeout before failing over. Neither
 * result is needed to show a single card, so they now run once the response
 * has gone. `after` is Next's way of saying that; outside a request (a script)
 * there is no response to wait for, so the task simply runs. A failure is
 * logged and swallowed either way — nothing here may break a reel.
 */
function afterResponse(label: string, task: () => Promise<unknown>) {
  const run = async () => {
    try {
      await task();
    } catch (err) {
      console.error(`[reel] ${label} failed:`, err instanceof Error ? err.message : String(err));
    }
  };
  try {
    after(run);
  } catch {
    void run();
  }
}

/** Exported so other daily-boundary logic (e.g. AI-ask quota) shares this exact cutoff. */
export function todayUTCDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/**
 * The first batch of today's reel — computed once on first visit of the day,
 * persisted, and read plainly on every later load that day.
 *
 * ## The reel does not end at a number any more (D-91)
 *
 * It used to: `dailyLimit` cards were dealt at 9am and that was the day. D-02
 * argued scarcity meant seriousness, and the number it produced — fifteen —
 * had nothing to do with how many rishtey actually existed for the person
 * looking. Somebody with two hundred real matches was told there were fifteen,
 * and somebody with nine was shown a deck that looked artificially cut short.
 *
 * So this function now deals the *first* batch, and `extendTodayReel` appends
 * the next one whenever the member gets near the bottom. The deck ends when
 * the candidate pool ends, and the screen says so in those words. What
 * survives from D-02 is the part that was actually load-bearing: the cards are
 * rank-ordered best-first and every one carries its reasons, so this is a
 * ranked queue that happens to be long — not a feed.
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

  // How many cards arrive at once — a delivery size, not a ceiling. See
  // `reelBatchSize` for why REEL_UNLOCK credits are no longer folded in.
  const ctx = await getPlanContext(userId);
  const dailyLimit = reelBatchSize(ctx);

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

  // Written without the model's sentences; the step after `persist` below
  // fills them in on the best-ranked rows once the reel is on screen. Until
  // then a card looks exactly like a top-up card — deterministic reasons, no
  // prose — which is a state every card can already be in.
  const organicRows = scored.map((s, i) => ({
    profileId: s.profile.id,
    rank: i,
    preferenceScore: s.preferenceScore,
    trustScoreFactor: s.trustScoreFactor,
    recentActivityScore: s.recentActivityScore,
    deepProfileFit: s.deepProfileFit,
    finalScore: s.finalScore,
    aiReasonText: null,
    aiConcernText: null,
    explainedAt: null,
    aiFactsHash: null,
  }));

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

    // Only the request that actually wrote today's reel gets here — a loser of
    // the race below re-reads the winner's row and schedules nothing — so each
    // of these runs once a day per member, after the reel is already showing.
    //
    // The viewer's own Deep Profile, refreshed once a day. It is one of soch
    // fit's three inputs; today's first batch scores on the stored one and the
    // refresh reaches the next batch, which is the whole cost of not making
    // the member wait up to a minute and a half for it.
    afterResponse("deep-profile recompute", async () => {
      if (await needsRecompute(userId)) await computeAndStoreScores(userId);
    });
    // The model's two sentences for the best-ranked cards (L3, D-32:
    // explanation only, never ranking). A card reads its row on every load, so
    // what lands here shows the next time the reel or the insight sheet opens.
    const explainable = scored.slice(0, AI_EXPLAINED_PER_REEL);
    afterResponse("match explanations", async () => {
      const explanations = await explainTopCandidates(userId, viewerProfile, explainable);
      await Promise.all(
        [...explanations].map(([profileId, ex]) =>
          prisma.dailyReelProfile.updateMany({
            where: { dailyReelId: created.id, profileId },
            data: {
              aiReasonText: ex.strengths.join(" • "),
              aiConcernText: ex.concern,
              explainedAt: new Date(),
              aiFactsHash: ex.factsHash,
            },
          }),
        ),
      );
    });

    if (pick && result.completed) {
      await announceCampaignCompleted(pick.campaignId).catch((err) => {
        console.error("[reel] spotlight completion notice failed:", err instanceof Error ? err.message : String(err));
      });
    }

    return created;
  } catch (err) {
    // Two requests can both see `existing === null` and both reach this
    // create — a plain read-then-write race that widens the more async work
    // sits between the two (the reel page and the dashboard both generate on
    // the first visit of the day). Rather than close the window with
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

/**
 * The next batch, appended to today's reel — D-91's "reel khatam nahi hoti".
 *
 * Called when the member is a few cards from the bottom of what they have.
 * Everything the first batch excludes is still excluded here: blocked people
 * both ways, hidden and deleted profiles, anybody already swiped, and now also
 * anybody already sitting in today's deck undecided (`excludeProfileIds` —
 * `swipedBy` cannot see those, and a repeat card in one deck is the one bug
 * this function must not have).
 *
 * ## Why a top-up carries no AI explanation
 *
 * `explainTopCandidates` is one model call per card. It runs on the first
 * batch, where the best-ranked rishtey are, and nowhere after. A member who
 * works through two hundred profiles would otherwise cost two hundred calls —
 * and the deeper batches are, by construction, the ones the ranking is least
 * enthusiastic about. Those cards still carry everything the code knows:
 * "Why this match?" is deterministic (`whyThisMatch.ts`), so it is there on
 * card two hundred exactly as on card one. The AI's two sentences are simply
 * absent rather than faked — the same state a card already shows when the
 * explanation has gone stale.
 *
 * Spotlight is not touched either: the paid slot is one card per member per
 * day and it was placed in the first batch (see `pickSpotlightForViewer`).
 * Delivering another one here would sell reach the campaign never bought.
 */
export async function extendTodayReel(
  userId: string,
): Promise<{ reel: Awaited<ReturnType<typeof getOrCreateTodayReel>>; addedProfileIds: string[] }> {
  const reel = await getOrCreateTodayReel(userId);

  const viewerProfile = await prisma.profile.findUnique({
    where: { userId },
    include: PROFILE_FULL_INCLUDE,
  });
  if (!viewerProfile) throw new Error("Profile not found for reel extension.");

  const ctx = await getPlanContext(userId);
  const batchSize = reelBatchSize(ctx);

  const [discovery, behaviorProfile] = ctx.features.advancedDiscovery
    ? await Promise.all([
        prisma.discoverySettings.findUnique({ where: { userId } }),
        buildLearnedBehaviorProfile(userId),
      ])
    : [null, null];

  const alreadyInReel = reel.candidates.map((c) => c.profileId);
  const candidates = await getCandidates(viewerProfile, batchSize, {
    strict: discovery?.filterMode === "STRICT",
    discoveryFilters: discovery
      ? { verifiedOnly: discovery.verifiedOnly, minTrustScore: discovery.minTrustScore }
      : undefined,
    excludeProfileIds: alreadyInReel,
  });
  if (candidates.length === 0) return { reel, addedProfileIds: [] };

  const signals = await loadMatchSignals([viewerProfile, ...candidates]);
  const scored = scoreCandidates(viewerProfile, candidates, signals, behaviorProfile).slice(0, batchSize);
  if (scored.length === 0) return { reel, addedProfileIds: [] };

  const nextRank = reel.candidates.reduce((max, c) => Math.max(max, c.rank), -1) + 1;

  // `skipDuplicates`: two tabs (or a double-tap on "aur dikhao") can both
  // reach here with the same scored list. The unique index on
  // (dailyReelId, profileId) is the real guard; skipping rather than throwing
  // means the slower request still returns the reel instead of an error the
  // member would read as "reel toot gayi".
  await prisma.dailyReelProfile.createMany({
    data: scored.map((s, i) => ({
      dailyReelId: reel.id,
      profileId: s.profile.id,
      rank: nextRank + i,
      preferenceScore: s.preferenceScore,
      trustScoreFactor: s.trustScoreFactor,
      recentActivityScore: s.recentActivityScore,
      deepProfileFit: s.deepProfileFit,
      finalScore: s.finalScore,
      aiReasonText: null,
      aiConcernText: null,
      explainedAt: null,
      aiFactsHash: null,
    })),
    skipDuplicates: true,
  });

  const updated = await prisma.dailyReel.findUniqueOrThrow({
    where: { id: reel.id },
    include: CANDIDATE_INCLUDE,
  });

  const before = new Set(alreadyInReel);
  return {
    reel: updated,
    addedProfileIds: updated.candidates.filter((c) => !before.has(c.profileId)).map((c) => c.profileId),
  };
}
