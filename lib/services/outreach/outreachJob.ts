import "server-only";
import { prisma } from "@/lib/db/prisma";
import { leadStatus } from "@/lib/partner/visibility";
import { templateForStatus } from "@/lib/partner/leadTemplates";
import { sendToLead } from "./outreachService";

/**
 * The automated half of partner outreach: the nudge that goes out without the
 * partner doing anything.
 *
 * Everything about this file is written to be *quiet*. The failure mode of an
 * automated messaging job is not that it sends too little — it is that it
 * messages a real family too often and BandhanTak becomes the thing they mute.
 * So there are four independent brakes, and a lead has to clear all of them:
 *
 * 1. **The partner opted in** (`Partner.autoOutreachEnabled`, on by default,
 *    switchable off without losing the manual button).
 * 2. **The template allows it** — `REFER_BACK` never goes out automatically,
 *    because asking a favour is a judgement call about a relationship we
 *    can't see.
 * 3. **The lead is actually stuck** — `MIN_IDLE_DAYS` since they were last
 *    seen. Somebody who registered this morning does not need a reminder.
 * 4. **The template's own cooldown** — enforced inside `sendToLead`, keyed on
 *    the lead rather than the partner, and counted only against sends that
 *    actually succeeded.
 *
 * On top of that the run itself is capped, so a misconfiguration costs one
 * batch rather than the whole member base.
 */

/** A lead has to have been idle this long before an unattended nudge is fair. */
const MIN_IDLE_DAYS = 3;

/** Ceiling per invocation. A schedule that fires more often just catches up. */
const DEFAULT_BATCH_LIMIT = 200;

/** No partner's whole list in one run — spreads sends out and caps blast radius. */
const MAX_PER_PARTNER = 25;

export type OutreachJobSummary = {
  scanned: number;
  sent: number;
  skipped: {
    notIdleEnough: number;
    templateManualOnly: number;
    cooldown: number;
    noContact: number;
    partnerCap: number;
  };
  failed: number;
};

export async function runAutomatedOutreach(
  limit = DEFAULT_BATCH_LIMIT,
): Promise<OutreachJobSummary> {
  const now = new Date();
  const idleCutoff = new Date(now.getTime() - MIN_IDLE_DAYS * 86_400_000);

  const referrals = await prisma.partnerReferral.findMany({
    where: {
      partner: {
        status: { in: ["APPROVED", "ACTIVE"] },
        autoOutreachEnabled: true,
      },
    },
    // Oldest attribution first: a lead who has been waiting longest is the one
    // most likely to go cold, and a stable order makes successive runs walk
    // the list rather than re-examining the same head of it.
    orderBy: { attributedAt: "asc" },
    take: limit,
    select: {
      userId: true,
      partnerId: true,
      partner: { select: { fullName: true } },
      user: {
        select: {
          createdAt: true,
          lastLoginAt: true,
          mobile: true,
          email: true,
          profile: { select: { profileCompletionScore: true } },
        },
      },
    },
  });

  const summary: OutreachJobSummary = {
    scanned: referrals.length,
    sent: 0,
    skipped: { notIdleEnough: 0, templateManualOnly: 0, cooldown: 0, noContact: 0, partnerCap: 0 },
    failed: 0,
  };
  if (referrals.length === 0) return summary;

  const subscribed = await activeSubscriberIds(referrals.map((r) => r.userId));
  const sentPerPartner = new Map<string, number>();

  for (const referral of referrals) {
    const lastSeen = referral.user.lastLoginAt ?? referral.user.createdAt;
    if (lastSeen > idleCutoff) {
      summary.skipped.notIdleEnough++;
      continue;
    }

    const status = leadStatus({
      completionScore: referral.user.profile?.profileCompletionScore ?? 0,
      hasProfile: referral.user.profile !== null,
      hasPlan: subscribed.has(referral.userId),
      lastActiveAt: lastSeen,
      now,
    });

    if (!templateForStatus(status).automated) {
      summary.skipped.templateManualOnly++;
      continue;
    }

    const already = sentPerPartner.get(referral.partnerId) ?? 0;
    if (already >= MAX_PER_PARTNER) {
      summary.skipped.partnerCap++;
      continue;
    }

    // WhatsApp when we have a number, email otherwise — a message that gets
    // read beats a channel preference nobody expressed.
    const channel = referral.user.mobile ? "WHATSAPP" : referral.user.email ? "EMAIL" : null;
    if (!channel) {
      summary.skipped.noContact++;
      continue;
    }

    const outcome = await sendToLead({
      partnerId: referral.partnerId,
      partnerName: referral.partner.fullName,
      userId: referral.userId,
      leadStatus: status,
      channel,
      trigger: "AUTOMATED",
      ignoreCooldown: false,
    });

    if (outcome.ok) {
      summary.sent++;
      sentPerPartner.set(referral.partnerId, already + 1);
      continue;
    }

    if (outcome.reason === "cooldown") summary.skipped.cooldown++;
    else if (outcome.reason === "no_contact") summary.skipped.noContact++;
    else if (outcome.reason === "opted_out") summary.skipped.templateManualOnly++;
    else summary.failed++;
  }

  console.info(
    `[outreach:job] scanned=${summary.scanned} sent=${summary.sent} failed=${summary.failed} ` +
      `skipped=${JSON.stringify(summary.skipped)}`,
  );

  return summary;
}

/** Same rule as `getActiveSubscription`, batched — mirrors lib/data/partnerData.ts. */
async function activeSubscriberIds(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await prisma.subscription.findMany({
    where: {
      userId: { in: userIds },
      status: { in: ["ACTIVE", "CANCELLED"] },
      currentPeriodEnd: { gt: new Date() },
    },
    select: { userId: true },
  });
  return new Set(rows.map((r) => r.userId));
}
