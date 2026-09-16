import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { createNotice } from "@/lib/services/notice/noticeService";
import { getBlockedUserIds } from "@/lib/services/safety/blockService";
import { audienceWhere, type CampaignSpec } from "./audience";
import { checkCampaignEligibility, loadAdvertiserFacts } from "./eligibility";
import { pauseCampaign, resumeCampaign } from "./campaignService";
import {
  MAX_PROMOTED_PER_VIEWER_PER_DAY,
  MIN_ORGANIC_CARDS_BEFORE_PROMOTED,
  SPOTLIGHT_DELIVERY_LIVE,
} from "./spotlightPolicy";

/**
 * Spotlight delivery — the part that makes a paid campaign real (D-90 Phase 6).
 *
 * Until this existed, a captured campaign flipped to RUNNING and nothing ever
 * showed it to anyone. Now a campaign is delivered the only way a member
 * actually sees a profile: as one card in their daily Reel, written in the
 * same transaction as the reel itself, and counted as one `SpotlightDelivery`
 * row per person.
 *
 * ## The rules, in the order they are checked
 *
 * 1. At most one promoted card per member per day, and never in a reel too
 *    short to have three organic cards before it (spotlightPolicy.ts).
 * 2. A viewer who chose STRICT discovery gets none — they asked for exactly
 *    their own filters, and a paid card is by definition not one of those.
 * 3. The audience filter runs both ways (audience.ts), plus everything that
 *    means "this person has already had their say": a block either way, a
 *    swipe on the card, an interest either way.
 * 4. The viewer's own hard pool filters (verified only, a minimum trust
 *    score) apply to the paid card exactly as they apply to organic ones.
 * 5. A profile already in the viewer's reel on its own merit is not charged
 *    for — that reach was free.
 * 6. The advertiser must still clear the eligibility bar at the moment of
 *    delivery. If they no longer do, the campaign pauses (its days stop
 *    running) instead of the card quietly going out anyway.
 *
 * ## No cron
 *
 * Same settle-on-read rule as the rest of the app: a window that ran out is
 * closed when anyone next asks — a delivery run, the owner's screen, the admin
 * refund queue.
 */

const DAY_MS = 86_400_000;

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export type SpotlightPick = { campaignId: string; profileId: string };

/** The viewer's own discovery pool controls, as the reel generator already loaded them. */
export type ViewerPoolFilters = {
  filterMode: string | null;
  verifiedOnly: boolean;
  minTrustScore: number | null;
} | null;

/** The campaign moved on between being picked and being written. The reel goes out without the card. */
export class SpotlightSlotGone extends Error {
  constructor() {
    super("Spotlight slot is no longer available");
    this.name = "SpotlightSlotGone";
  }
}

// ------------------------------------------------------------------ settle on read

async function notifyCompleted(
  campaign: { id: string; ownerUserId: string; deliveredReach: number; promisedReach: number },
): Promise<void> {
  const short = campaign.deliveredReach < campaign.promisedReach;
  await createNotice({
    userId: campaign.ownerUserId,
    kind: "SERVICE_UPDATE",
    title: short ? "Spotlight ka samay poora hua" : "Spotlight poora hua",
    body: short
      ? `Aapki profile ${campaign.deliveredReach} logon tak pahunchi — wada ${campaign.promisedReach} ka tha. Jitni reach kam rahi, uske hisaab se paisa wapas kiya jayega.`
      : `Aapki profile ${campaign.promisedReach} logon tak pahunch gayi.`,
    href: "/user/spotlight",
    relatedId: `spotlight-complete:${campaign.id}`,
  }).catch((err) => {
    console.error("[spotlight] completion notice failed:", err instanceof Error ? err.message : String(err));
  });
}

/**
 * Closes every RUNNING campaign whose window has ended, whatever it delivered,
 * and tells each owner the real number. A PAUSED campaign is left alone: its
 * days are frozen, and `resumeCampaign` pushes its window out by the pause.
 */
export async function settleExpiredCampaigns(now = new Date(), ownerUserId?: string): Promise<number> {
  const expired = await prisma.spotlightCampaign.findMany({
    where: { status: "RUNNING", endsAt: { lte: now }, ...(ownerUserId ? { ownerUserId } : {}) },
    select: { id: true, ownerUserId: true, deliveredReach: true, promisedReach: true },
    take: 50,
  });

  let settled = 0;
  for (const campaign of expired) {
    const closed = await prisma.spotlightCampaign.updateMany({
      where: { id: campaign.id, status: "RUNNING" },
      data: { status: "COMPLETED", completedAt: now },
    });
    if (closed.count === 0) continue;
    settled++;
    await notifyCompleted(campaign);
  }
  return settled;
}

/** Told once, after the delivery that filled the promise has committed. */
export async function announceCampaignCompleted(campaignId: string): Promise<void> {
  const campaign = await prisma.spotlightCampaign.findUnique({
    where: { id: campaignId },
    select: { id: true, ownerUserId: true, deliveredReach: true, promisedReach: true, status: true },
  });
  if (campaign?.status === "COMPLETED") await notifyCompleted(campaign);
}

/**
 * Settle on read for one owner: close a window that ran out, and resume a
 * paused campaign whose owner clears the bar again.
 */
export async function refreshOwnerCampaigns(ownerUserId: string, now = new Date()): Promise<void> {
  await settleExpiredCampaigns(now, ownerUserId);
  const paused = await prisma.spotlightCampaign.findMany({
    where: { ownerUserId, status: "PAUSED", refundedAt: null },
    select: { id: true },
  });
  if (paused.length === 0) return;
  const eligibility = await checkCampaignEligibility(ownerUserId);
  if (!eligibility.eligible) return;
  for (const campaign of paused) await resumeCampaign(campaign.id, now);
}

// ------------------------------------------------------------------ picking

/**
 * The one campaign — if any — this member should see today, given the organic
 * cards their reel already has. Reads only; nothing is counted until
 * `recordSpotlightDelivery` runs inside the reel's own transaction.
 */
export async function pickSpotlightForViewer(params: {
  viewerUserId: string;
  viewerProfileId: string;
  organicProfileIds: string[];
  poolFilters: ViewerPoolFilters;
  now?: Date;
}): Promise<SpotlightPick | null> {
  if (!SPOTLIGHT_DELIVERY_LIVE) return null;
  if (params.organicProfileIds.length < MIN_ORGANIC_CARDS_BEFORE_PROMOTED) return null;
  if (params.poolFilters?.filterMode === "STRICT") return null;
  const now = params.now ?? new Date();

  // Cheapest question first: on most days nothing is running at all, and the
  // reel should cost exactly one extra count for that.
  const running = await prisma.spotlightCampaign.count({ where: { status: "RUNNING" } });
  if (running === 0) return null;

  await settleExpiredCampaigns(now);

  const seenToday = await prisma.spotlightDelivery.count({
    where: { viewerUserId: params.viewerUserId, deliveredAt: { gte: startOfUtcDay(now) } },
  });
  if (seenToday >= MAX_PROMOTED_PER_VIEWER_PER_DAY) return null;

  const campaigns = await prisma.spotlightCampaign.findMany({
    where: {
      status: "RUNNING",
      endsAt: { gt: now },
      ownerUserId: { not: params.viewerUserId },
      deliveries: { none: { viewerUserId: params.viewerUserId } },
    },
    select: {
      id: true,
      ownerUserId: true,
      cities: true,
      minAge: true,
      maxAge: true,
      targetGender: true,
      promisedReach: true,
      deliveredReach: true,
      endsAt: true,
    },
    take: 50,
  });

  // Most behind first: the campaign still owed the most people per remaining
  // day is the one a slot helps most, which is what keeps shortfalls — and
  // refunds — rare.
  const owedPerDay = (c: (typeof campaigns)[number]) =>
    (c.promisedReach - c.deliveredReach) / Math.max(1, ((c.endsAt?.getTime() ?? now.getTime()) - now.getTime()) / DAY_MS);
  const ordered = campaigns
    .filter((c) => c.deliveredReach < c.promisedReach)
    .sort((a, b) => owedPerDay(b) - owedPerDay(a));

  for (const campaign of ordered) {
    const advertiser = await loadAdvertiserFacts(campaign.ownerUserId);
    if (!advertiser) continue;
    if (params.organicProfileIds.includes(advertiser.profileId)) continue;

    const spec: CampaignSpec = {
      cities: campaign.cities,
      minAge: campaign.minAge,
      maxAge: campaign.maxAge,
      targetGender: campaign.targetGender,
    };
    const [blocked, swiped, interests, fits] = await Promise.all([
      getBlockedUserIds(advertiser.userId),
      prisma.swipeAction.count({
        where: { actorUserId: params.viewerUserId, targetProfileId: advertiser.profileId },
      }),
      prisma.interest.count({
        where: {
          OR: [
            { fromUserId: params.viewerUserId, toUserId: advertiser.userId },
            { fromUserId: advertiser.userId, toUserId: params.viewerUserId },
          ],
        },
      }),
      prisma.profile.count({
        where: { AND: [audienceWhere(advertiser, spec, []), { id: params.viewerProfileId }] },
      }),
    ]);
    if (blocked.includes(params.viewerUserId) || swiped > 0 || interests > 0 || fits === 0) continue;

    const filters = params.poolFilters;
    if (filters && (filters.verifiedOnly || filters.minTrustScore !== null)) {
      const own = await prisma.profile.findUnique({
        where: { id: advertiser.profileId },
        select: { profileStatus: true, trustScore: true },
      });
      if (filters.verifiedOnly && own?.profileStatus !== "VERIFIED") continue;
      if (filters.minTrustScore !== null && (own?.trustScore ?? 0) < filters.minTrustScore) continue;
    }

    const eligibility = await checkCampaignEligibility(campaign.ownerUserId);
    if (!eligibility.eligible) {
      await pauseCampaign(
        campaign.id,
        eligibility.firstBlocker?.label ?? "Spotlight ki shart ab poori nahi hoti",
        now,
      );
      continue;
    }

    return { campaignId: campaign.id, profileId: advertiser.profileId };
  }

  return null;
}

// ------------------------------------------------------------------ counting

/**
 * Counts one delivery. Must run inside the transaction that writes the reel
 * row carrying the card, so a reel that is never written counts nothing and a
 * delivery that is refused takes its card out of the reel with it.
 *
 * The increment takes the campaign's row lock and holds it to commit, so two
 * members landing on the last slot at once serialise on it: the second sees
 * the campaign COMPLETED (or over its promise) and is refused. The unique
 * (campaign, viewer) pair means a person is counted once however a race goes.
 */
export async function recordSpotlightDelivery(
  tx: Prisma.TransactionClient,
  params: { campaignId: string; viewerUserId: string; dailyReelProfileId: string; now: Date },
): Promise<{ completed: boolean }> {
  const counted = await tx.spotlightCampaign.updateMany({
    where: { id: params.campaignId, status: "RUNNING", endsAt: { gt: params.now } },
    data: { deliveredReach: { increment: 1 } },
  });
  if (counted.count === 0) throw new SpotlightSlotGone();

  const row = await tx.spotlightCampaign.findUniqueOrThrow({
    where: { id: params.campaignId },
    select: { deliveredReach: true, promisedReach: true },
  });
  if (row.deliveredReach > row.promisedReach) throw new SpotlightSlotGone();

  await tx.spotlightDelivery.create({
    data: {
      campaignId: params.campaignId,
      viewerUserId: params.viewerUserId,
      dailyReelProfileId: params.dailyReelProfileId,
      deliveredAt: params.now,
    },
  });

  const completed = row.deliveredReach >= row.promisedReach;
  if (completed) {
    await tx.spotlightCampaign.update({
      where: { id: params.campaignId },
      data: { status: "COMPLETED", completedAt: params.now },
    });
  }
  return { completed };
}

// ------------------------------------------------------------------ refunds

export type SpotlightRefundRow = {
  campaignId: string;
  ownerName: string;
  itemCode: string;
  status: "COMPLETED" | "PAUSED";
  promisedReach: number;
  deliveredReach: number;
  paidPaise: number;
  /** Paid × the share of the promise not delivered, rounded down to the paisa. */
  suggestedRefundPaise: number;
  /** The gateway's payment id — what an admin searches for in Razorpay. */
  paymentRef: string | null;
  paymentRefunded: boolean;
  pausedReason: string | null;
};

/**
 * Campaigns that ended — or stopped — short of their promise and have not been
 * refunded yet. The app never moves money: an admin refunds in Razorpay by
 * hand, then marks the row, and only then does it leave this list.
 */
export async function listSpotlightRefundQueue(now = new Date()): Promise<SpotlightRefundRow[]> {
  await settleExpiredCampaigns(now);

  const rows = await prisma.spotlightCampaign.findMany({
    where: { refundedAt: null, status: { in: ["COMPLETED", "PAUSED"] } },
    include: { owner: { select: { fullName: true } } },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  const short = rows.filter((r) => r.deliveredReach < r.promisedReach);
  const payments = await prisma.payment.findMany({
    where: { id: { in: short.map((r) => r.paymentId).filter((id): id is string => Boolean(id)) } },
    select: { id: true, amountPaise: true, externalPaymentId: true, status: true },
  });
  const paymentOf = new Map(payments.map((p) => [p.id, p]));

  return short.map((r) => {
    const payment = r.paymentId ? paymentOf.get(r.paymentId) : undefined;
    const paidPaise = payment?.amountPaise ?? 0;
    const missingShare = r.promisedReach > 0 ? (r.promisedReach - r.deliveredReach) / r.promisedReach : 0;
    return {
      campaignId: r.id,
      ownerName: r.owner.fullName,
      itemCode: r.itemCode,
      status: r.status === "PAUSED" ? "PAUSED" : "COMPLETED",
      promisedReach: r.promisedReach,
      deliveredReach: r.deliveredReach,
      paidPaise,
      suggestedRefundPaise: Math.floor(paidPaise * missingShare),
      paymentRef: payment?.externalPaymentId ?? null,
      paymentRefunded: payment?.status === "REFUNDED",
      pausedReason: r.pausedReason,
    };
  });
}

/**
 * Records that a person refunded this campaign. A paused campaign is also
 * closed here — refunded money must not come back to life as a resumed card.
 */
export async function markSpotlightRefunded(campaignId: string, note: string, now = new Date()): Promise<boolean> {
  const [closedPaused, completed] = await prisma.$transaction([
    prisma.spotlightCampaign.updateMany({
      where: { id: campaignId, refundedAt: null, status: "PAUSED" },
      data: { refundedAt: now, refundNote: note, status: "COMPLETED", completedAt: now },
    }),
    prisma.spotlightCampaign.updateMany({
      where: { id: campaignId, refundedAt: null, status: "COMPLETED" },
      data: { refundedAt: now, refundNote: note },
    }),
  ]);
  return closedPaused.count + completed.count > 0;
}
