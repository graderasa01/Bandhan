import "server-only";
import { prisma } from "@/lib/db/prisma";
import { createNotice } from "@/lib/services/notice/noticeService";
import { rupees } from "@/lib/services/marketplace/servicePolicy";
import { loadAdvertiserFacts } from "./eligibility";
import { audienceWhere, resolveExclusions } from "./audience";
import { recountDelivered } from "./delivery";

/**
 * What happens to a campaign whose window runs out before its promise does.
 *
 * ## The promise being kept
 *
 * The buy screen tells people, in `estimateCampaign`'s own warning: *"Reach
 * poori na hui to din apne aap badha diye jayenge."* Nothing implemented that.
 * A campaign's `endsAt` simply passed and the row sat at RUNNING forever,
 * delivering nothing (the selector filters on `endsAt > now`) and refunding
 * nothing. The buyer was told days would be added and instead got silence.
 *
 * So an expired campaign gets exactly one of two endings, and which one is not
 * a judgement call:
 *
 *   **Somebody is left to reach** → extend. The pack promised people, not
 *   days; `maxDays` was a forecast the estimator itself flagged as possibly
 *   short. Extending costs the platform inventory and costs the buyer nothing,
 *   which is the correct direction for a forecast we got wrong.
 *
 *   **Nobody is left to reach** → end it and give back the unreached share.
 *   Every qualifying person has already seen the card; another month changes
 *   nothing. Holding money for reach that is now physically undeliverable is
 *   the failure this whole file exists to prevent.
 *
 * ## Why the refund is pro-rata and not all-or-nothing
 *
 * A campaign that delivered 31 of 50 delivered something real: 31 people saw
 * that profile who otherwise would not have. Refunding the whole fee would
 * price that at nothing; refunding none of it would charge for 19 people who
 * do not exist. The unreached fraction of the fee goes back and the rest
 * stays, which is the only split either side can argue from.
 *
 * The rounding goes to the buyer — `Math.ceil` on their share. It is at most a
 * paisa per campaign and it is not worth being on the other side of.
 */

/** How much of a campaign's fee is owed back, given what it actually reached. */
export function shortfallRefundPaise(amountPaise: number, delivered: number, promised: number): number {
  if (promised <= 0) return 0;
  const unreached = Math.max(0, promised - delivered);
  if (unreached === 0) return 0;
  // Never more than was paid, however the numbers arrive.
  return Math.min(amountPaise, Math.ceil((amountPaise * unreached) / promised));
}

/**
 * How many qualifying people have still never been shown this campaign.
 *
 * The same `audienceWhere` the buyer was quoted off, minus everyone already
 * delivered to. Asking the question this way rather than "is the audience
 * bigger than the promise" matters: a pool of 300 with 300 deliveries is
 * exhausted, and a pool of 40 with 2 deliveries is not — the raw pool size
 * answers neither case correctly.
 */
async function remainingAudience(campaignId: string): Promise<number | null> {
  const campaign = await prisma.spotlightCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return null;

  const advertiser = await loadAdvertiserFacts(campaign.ownerUserId);
  // An advertiser whose profile can no longer be audience-matched has no
  // reachable audience by definition — which routes to the refund branch, and
  // is the right answer: we cannot deliver what we cannot target.
  if (!advertiser) return 0;

  const exclusions = await resolveExclusions(advertiser);
  const seen = await prisma.spotlightDelivery.findMany({
    where: { campaignId },
    select: { viewerUserId: true },
  });

  const where = audienceWhere(advertiser, campaign, [...exclusions, ...seen.map((s) => s.viewerUserId)]);
  return prisma.profile.count({ where });
}

export interface CampaignSweepSummary {
  /** Windows pushed out because there are still people left to reach. */
  extended: number;
  /** Campaigns closed short, with money returned. */
  endedShort: number;
  /** Total returned to buyers this run, in paise. */
  refundedPaise: number;
}

/**
 * How much longer an extended campaign gets.
 *
 * Its own original window again, not a fixed week: a 7-day pack and a 30-day
 * pack are different promises and a flat extension would treat them as one.
 * Each pass through the sweep adds one more window, so a campaign that is
 * genuinely crawling keeps getting time — and a campaign whose audience has
 * run out never reaches this branch at all.
 */
function extensionMs(maxDays: number): number {
  return Math.max(1, maxDays) * 86_400_000;
}

/**
 * One pass over every campaign whose window has closed.
 *
 * Safe to run repeatedly: each campaign is guarded by `status: "RUNNING"` in
 * the update's `where`, so two overlapping runs cannot both refund the same
 * row, and a campaign extended by one run has an `endsAt` in the future that
 * the next run does not select.
 */
export async function runCampaignSweep(options: { dryRun?: boolean } = {}): Promise<CampaignSweepSummary> {
  const dryRun = options.dryRun ?? false;
  const now = new Date();
  const summary: CampaignSweepSummary = { extended: 0, endedShort: 0, refundedPaise: 0 };

  const expired = await prisma.spotlightCampaign.findMany({
    where: { status: "RUNNING", endsAt: { lte: now } },
    select: { id: true },
  });

  for (const { id } of expired) {
    // The counter is a cache of the delivery rows. Recount before deciding
    // what is owed, so a refund is never computed off a drifted number.
    const delivered = dryRun
      ? await prisma.spotlightDelivery.count({ where: { campaignId: id } })
      : await prisma.$transaction((tx) => recountDelivered(tx, id));

    const campaign = await prisma.spotlightCampaign.findUnique({ where: { id } });
    if (!campaign || campaign.status !== "RUNNING") continue;

    if (delivered >= campaign.promisedReach) {
      // Delivered in full and the window closed before anything noticed. Not a
      // shortfall — just a completion nobody wrote down.
      if (!dryRun) {
        await prisma.spotlightCampaign.updateMany({
          where: { id, status: "RUNNING" },
          data: { status: "COMPLETED", completedAt: now },
        });
      }
      continue;
    }

    const left = await remainingAudience(id);
    if (left === null) continue;

    if (left > 0) {
      summary.extended += 1;
      if (!dryRun) {
        await prisma.spotlightCampaign.updateMany({
          where: { id, status: "RUNNING" },
          data: { endsAt: new Date(now.getTime() + extensionMs(campaign.maxDays)) },
        });
      }
      continue;
    }

    // Nobody left. Whatever was not reached cannot be reached, so it goes back.
    const payment = campaign.paymentId
      ? await prisma.payment.findUnique({ where: { id: campaign.paymentId } })
      : null;
    const paid = payment?.status === "CAPTURED" ? payment.amountPaise : 0;
    const refund = shortfallRefundPaise(paid, delivered, campaign.promisedReach);

    summary.endedShort += 1;
    summary.refundedPaise += refund;
    if (dryRun) continue;

    const closed = await prisma.$transaction(async (tx) => {
      const changed = await tx.spotlightCampaign.updateMany({
        where: { id, status: "RUNNING" },
        data: { status: "ENDED_SHORT", completedAt: now, refundPaise: refund, refundedAt: refund > 0 ? now : null },
      });
      if (changed.count === 0) return false;

      if (refund > 0 && payment) {
        await tx.payment.updateMany({
          where: { id: payment.id, status: "CAPTURED" },
          data: {
            refundedPaise: refund,
            refundedAt: now,
            // Only a refund of the whole fee makes the payment REFUNDED. A
            // partial one stays CAPTURED with `refundedPaise` set, because
            // calling it REFUNDED would tell every revenue query that money
            // the buyer never got back had been returned.
            ...(refund >= payment.amountPaise ? { status: "REFUNDED" as const } : {}),
          },
        });
      }
      return true;
    });

    if (closed) await notifyEndedShort(campaign.ownerUserId, delivered, campaign.promisedReach, refund);
  }

  return summary;
}

async function notifyEndedShort(
  ownerUserId: string,
  delivered: number,
  promised: number,
  refundPaise: number,
): Promise<void> {
  // Says what happened and what is coming back, in that order. A member who
  // reads only the first line should still learn the campaign fell short —
  // leading with the refund would bury the part they are owed an explanation
  // for.
  const body =
    refundPaise > 0
      ? `Aapki profile ${delivered} logon tak pahunchi, ${promised} ka wada tha. Is targeting par aur koi eligible nahi bacha, isliye jo reach nahi hui uske ${rupees(refundPaise)} wapas kar diye gaye hain.`
      : `Aapki profile ${delivered} logon tak pahunchi, ${promised} ka wada tha. Is targeting par aur koi eligible nahi bacha, isliye campaign band kar diya gaya hai.`;

  await createNotice({
    userId: ownerUserId,
    kind: "SPOTLIGHT_UPDATE",
    title: "Spotlight band — reach poori nahi hui",
    body,
    href: "/user/spotlight",
  }).catch((err) => {
    console.error("[spotlight] shortfall notice failed:", err instanceof Error ? err.message : String(err));
  });
}
