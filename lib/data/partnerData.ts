// Real Prisma-backed partner data. Every lead-shaped and commission-shaped
// row leaves this module through lib/partner/visibility.ts's mappers — see
// that file for why that is not optional.
import { prisma } from "@/lib/db/prisma";
import { toPartnerLead, toPartnerCommissionRow, type LeadSource } from "@/lib/partner/visibility";
import { countPaidConversions } from "@/lib/partner/commissionRate";
import { bpsToPercentDisplay, effectiveBps, tierProgress, TIER_LABEL } from "@/lib/partner/tier";
import { LEAD_TEMPLATES, templateForStatus } from "@/lib/partner/leadTemplates";
import { getOutreachHistory } from "@/lib/services/outreach/outreachService";
import type {
  LeadStatus,
  LeadTimelineStep,
  PartnerCardViewModel,
  PartnerCommissionSummary,
  PartnerCommissionsViewModel,
  PartnerDashboardViewModel,
  PartnerLeadDetailViewModel,
  PartnerLeadViewModel,
  PartnerPayoutStatusViewModel,
  PartnerProfileViewModel,
  ReferralToolsViewModel,
} from "@/lib/contracts/partner";
import { paiseToRupeeDisplay } from "@/lib/utils/money";
import { noopT, type Translate } from "@/lib/i18n/translate";
import type { Partner } from "@prisma/client";

const LEAD_INCLUDE = {
  user: {
    select: {
      fullName: true,
      createdAt: true,
      lastLoginAt: true,
      profile: {
        select: { displayName: true, currentCity: true, profileCompletionScore: true },
      },
    },
  },
} as const;

/**
 * Same "active or still-paid-for-this-period" rule as
 * `getActiveSubscription` (lib/services/payments/subscriptionService.ts),
 * batched for a whole lead list instead of one user at a time — this runs
 * once per dashboard/leads load, not once per lead.
 */
async function activeSubscriberIds(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await prisma.subscription.findMany({
    where: { userId: { in: userIds }, status: { in: ["ACTIVE", "CANCELLED"] }, currentPeriodEnd: { gt: new Date() } },
    select: { userId: true },
  });
  return new Set(rows.map((r) => r.userId));
}

async function activeCode(partnerId: string): Promise<string | null> {
  const row = await prisma.referralCode.findFirst({
    where: { partnerId, active: true },
    select: { code: true },
  });
  return row?.code ?? null;
}

function toPartnerProfile(partner: Partner, code: string | null): PartnerProfileViewModel {
  return {
    id: partner.id,
    displayName: partner.fullName,
    partnerCode: code,
    partnerType: partner.partnerType,
    status: partner.status,
  };
}

export async function getPartnerLeads(partnerId: string): Promise<PartnerLeadViewModel[]> {
  const referrals = await prisma.partnerReferral.findMany({
    where: { partnerId },
    orderBy: { attributedAt: "desc" },
    include: LEAD_INCLUDE,
  });

  const subscribed = await activeSubscriberIds(referrals.map((r) => r.userId));
  const now = new Date();
  return referrals.map((r) =>
    toPartnerLead(
      { referralId: r.id, attributedAt: r.attributedAt, user: r.user } satisfies LeadSource,
      subscribed.has(r.userId),
      now,
    ),
  );
}

/**
 * A lead's progress as four dated steps.
 *
 * Dates are days, never timestamps — same reason `activityBucket` exists. A
 * partner needs to know a profile was finished last Tuesday; they do not need
 * to know it was finished at 1:40am.
 */
function buildTimeline(
  params: {
    joinedAt: Date;
    completionScore: number;
    hasProfile: boolean;
    profileUpdatedAt: Date | null;
    firstPaidAt: Date | null;
  },
  t: Translate = noopT,
): LeadTimelineStep[] {
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  const started = params.hasProfile && params.completionScore > 0;
  const done = params.completionScore >= 100;

  return [
    { key: "joined", label: t("partnerData.timeline.joined", "Join kiya"), at: day(params.joinedAt), done: true },
    {
      key: "profile_started",
      label: t("partnerData.timeline.profileStarted", "Profile started"),
      // The profile row's own updatedAt is the closest thing we have to "when
      // they started"; it is only meaningful once something was actually
      // filled, hence the guard.
      at: started ? day(params.profileUpdatedAt) : null,
      done: started,
    },
    {
      key: "profile_done",
      label: t("partnerData.timeline.profileDone", "Profile complete"),
      at: done ? day(params.profileUpdatedAt) : null,
      done,
    },
    {
      key: "paid",
      label: t("partnerData.timeline.paid", "Plan liya"),
      at: day(params.firstPaidAt),
      done: params.firstPaidAt !== null,
    },
  ];
}

/**
 * "3 hafte se profile adhoori hai" — the sentence that makes a partner act.
 *
 * The lead list's `activityBucket` says when someone was last seen; this says
 * how long they have been stuck, which is the number that decides whether a
 * follow-up is worth sending. Null for a paid lead: they are not stuck.
 */
function stalledNote(status: LeadStatus, lastSeen: Date, now: Date, t: Translate = noopT): string | null {
  if (status === "PAID") return null;
  const days = Math.floor((now.getTime() - lastSeen.getTime()) / 86_400_000);
  if (days < 3) return null;

  const what =
    status === "JOINED"
      ? t("partnerData.stalled.notStarted", "profile shuru nahi ki")
      : status === "PROFILE_STARTED"
        ? t("partnerData.stalled.incomplete", "profile adhoori hai")
        : status === "PROFILE_DONE"
          ? t("partnerData.stalled.noPlan", "plan nahi liya")
          : t("partnerData.stalled.noActivity", "koi activity nahi");

  if (days < 14) return `${days} ${t("partnerData.stalled.daysUnit", "din se")} ${what}.`;
  if (days < 60) return `${Math.floor(days / 7)} ${t("partnerData.stalled.weeksUnit", "hafte se")} ${what}.`;
  return `${Math.floor(days / 30)} ${t("partnerData.stalled.monthsUnit", "mahine se")} ${what}.`;
}

export async function getPartnerLeadDetail(
  partner: Partner,
  leadId: string,
  t: Translate = noopT,
): Promise<PartnerLeadDetailViewModel | null> {
  const referral = await prisma.partnerReferral.findFirst({
    // Scoped to this partner, so another partner's lead id resolves to null
    // rather than to somebody else's lead.
    where: { id: leadId, partnerId: partner.id },
    include: {
      user: {
        select: {
          fullName: true,
          createdAt: true,
          lastLoginAt: true,
          profile: {
            select: {
              displayName: true,
              currentCity: true,
              profileCompletionScore: true,
              updatedAt: true,
            },
          },
        },
      },
    },
  });
  if (!referral) return null;

  const now = new Date();
  const [subscribed, commissions, outreachRows] = await Promise.all([
    activeSubscriberIds([referral.userId]),
    prisma.partnerCommission.findMany({
      where: { partnerId: partner.id, userId: referral.userId },
      orderBy: { createdAt: "asc" },
      select: { amountPaise: true, status: true, createdAt: true },
    }),
    getOutreachHistory(prisma, partner.id, referral.userId),
  ]);

  const lead = toPartnerLead(
    { referralId: referral.id, attributedAt: referral.attributedAt, user: referral.user } satisfies LeadSource,
    subscribed.has(referral.userId),
    now,
  );

  // REVERSED rows are excluded: that money was taken back when the payment was
  // refunded, and showing it as earned would be a number the payout page
  // disagrees with.
  const earnedPaise = commissions
    .filter((c) => c.status !== "REVERSED")
    .reduce((sum, c) => sum + c.amountPaise, 0);

  const template = templateForStatus(lead.status);
  const lastSeen = referral.user.lastLoginAt ?? referral.user.createdAt;

  return {
    lead,
    timeline: buildTimeline(
      {
        joinedAt: referral.attributedAt,
        completionScore: referral.user.profile?.profileCompletionScore ?? 0,
        hasProfile: referral.user.profile !== null,
        profileUpdatedAt: referral.user.profile?.updatedAt ?? null,
        firstPaidAt: commissions[0]?.createdAt ?? null,
      },
      t,
    ),
    stalledNote: stalledNote(lead.status, lastSeen, now, t),
    earnedPaiseDisplay: paiseToRupeeDisplay(earnedPaise),
    commissionCount: commissions.filter((c) => c.status !== "REVERSED").length,
    outreach: outreachRows.map((r) => ({
      id: r.id,
      channel: r.channel,
      automated: r.trigger === "AUTOMATED",
      templateLabel: LEAD_TEMPLATES.find((t) => t.key === r.templateKey)?.label ?? r.templateKey,
      status: r.status,
      failureReason: r.failureReason,
      at: (r.sentAt ?? r.createdAt).slice(0, 10),
    })),
    suggestedAction:
      lead.status === "PAID"
        ? null
        : {
            label: template.label,
            reason:
              stalledNote(lead.status, lastSeen, now, t) ??
              t("partnerData.suggestedAction.defaultReason", "Abhi follow-up ka sahi waqt hai."),
          },
  };
}

/** Feeds both the dashboard's money tiles and the commissions page's summary cards. */
export async function getPartnerCommissionSummary(partnerId: string): Promise<PartnerCommissionSummary> {
  const [paid, pending] = await Promise.all([
    prisma.partnerCommission.aggregate({
      where: { partnerId, status: "PAID" },
      _sum: { amountPaise: true },
    }),
    prisma.partnerCommission.aggregate({
      where: { partnerId, status: { in: ["PENDING", "APPROVED"] } },
      _sum: { amountPaise: true },
    }),
  ]);

  return {
    earnedPaise: paid._sum.amountPaise ?? 0,
    pendingPaise: pending._sum.amountPaise ?? 0,
  };
}

export async function getPartnerCommissions(partnerId: string): Promise<PartnerCommissionsViewModel> {
  const [summary, rows] = await Promise.all([
    getPartnerCommissionSummary(partnerId),
    prisma.partnerCommission.findMany({
      where: { partnerId },
      orderBy: { createdAt: "desc" },
      include: { payment: { select: { user: { select: { fullName: true, profile: { select: { displayName: true } } } } } } },
    }),
  ]);

  return {
    summary,
    rows: rows.map((r) => toPartnerCommissionRow({ ...r, user: r.payment.user })),
  };
}

/**
 * There's no batched "payout run" concept yet (M14 isn't built) — a payout
 * today *is* an admin marking one commission PAID. This reports exactly that,
 * honestly, rather than inventing a payout schedule or bank-verification
 * status neither of which exist. See CommissionComingSoon's old comment for
 * why fabricating numbers on a money screen is the one thing not to do.
 */
export async function getPartnerPayoutStatus(partnerId: string): Promise<PartnerPayoutStatusViewModel> {
  const [approved, paidTotal, paidRows] = await Promise.all([
    // Only APPROVED is payout-ready — PENDING is still inside the 7-day
    // refund window and isn't "ready" yet even though the dashboard's
    // combined "Aane wala" tile counts both (see getPartnerCommissionSummary).
    prisma.partnerCommission.aggregate({ where: { partnerId, status: "APPROVED" }, _sum: { amountPaise: true } }),
    prisma.partnerCommission.aggregate({ where: { partnerId, status: "PAID" }, _sum: { amountPaise: true } }),
    prisma.partnerCommission.findMany({
      where: { partnerId, status: "PAID" },
      orderBy: { paidAt: "desc" },
      select: { id: true, amountPaise: true, paidAt: true },
    }),
  ]);

  return {
    readyPaise: approved._sum.amountPaise ?? 0,
    totalPaidPaise: paidTotal._sum.amountPaise ?? 0,
    history: paidRows.map((r) => ({
      commissionId: r.id,
      amountPaise: r.amountPaise,
      // paidAt is always set once status=PAID (see commissionService.ts's markPaid transition).
      paidAt: r.paidAt!.toISOString().slice(0, 10),
    })),
  };
}

/**
 * Deterministic, not AI. M12 specs a nightly Claude "Partner Coach" with
 * per-lead suggestions and cached generation — a real feature, deliberately
 * scoped to its own session rather than bolted on here. This computes the one
 * genuinely useful nudge today at zero cost, and is a drop-in replacement
 * point later.
 */
function buildInsight(
  leads: PartnerLeadViewModel[],
  t: Translate = noopT,
): { title: string; message: string } | null {
  if (leads.length === 0) return null;

  const stalled = leads.filter((l) => l.status === "PROFILE_STARTED").length;
  if (stalled > 0) {
    return {
      title: t("partnerData.insight.stalledTitle", "Inhe ek reminder bhej sakte hain"),
      message: `${stalled} ${t(
        "partnerData.insight.stalledMessage",
        "logon ne profile shuru ki hai lekin poori nahi ki. Ek chhota reminder aksar kaam kar jaata hai.",
      )}`,
    };
  }

  const inactive = leads.filter((l) => l.status === "INACTIVE").length;
  if (inactive > 0) {
    return {
      title: t("partnerData.insight.inactiveTitle", "Kuch log kaafi time se active nahi hain"),
      message: `${inactive} ${t(
        "partnerData.insight.inactiveMessage",
        "logon ne ek mahine se zyada time se login nahi kiya.",
      )}`,
    };
  }

  return {
    title: t("partnerData.insight.okTitle", "Sab theek chal raha hai"),
    message: t("partnerData.insight.okMessage", "Aapke bheje huye log active hain aur profile complete kar rahe hain."),
  };
}

/**
 * The partner's own card. Read live rather than stored: tier is a pure
 * function of the commission ledger (lib/partner/tier.ts), and a cached copy
 * is exactly the kind of thing that goes stale the day a partner crosses a
 * threshold and wonders why nothing happened.
 */
export async function getPartnerCard(partner: Partner, code: string | null): Promise<PartnerCardViewModel> {
  const [config, paidConversions] = await Promise.all([
    prisma.partnerCommissionConfig.findUnique({ where: { id: "default" } }),
    countPaidConversions(prisma, partner.id),
  ]);

  const rates = {
    baseBps: config?.baseBps ?? 1000,
    silverBonusBps: config?.silverBonusBps ?? 200,
    goldBonusBps: config?.goldBonusBps ?? 500,
  };
  const thresholds = {
    silverThreshold: config?.silverThreshold ?? 3,
    goldThreshold: config?.goldThreshold ?? 10,
  };

  const progress = tierProgress(paidConversions, thresholds, rates);

  return {
    tier: progress.tier,
    tierLabel: TIER_LABEL[progress.tier],
    displayName: partner.fullName,
    partnerCode: code,
    paidConversions,
    commissionPercentDisplay: bpsToPercentDisplay(effectiveBps(progress.tier, rates)),
    nextTierLabel: progress.nextTier ? TIER_LABEL[progress.nextTier] : null,
    remainingForNextTier: progress.remaining,
    progressFraction: progress.fraction,
    nextTierBonusDisplay:
      progress.nextTierBonusBps === null ? null : `+${bpsToPercentDisplay(progress.nextTierBonusBps)}`,
    memberSince: partner.approvedAt ? partner.approvedAt.toISOString().slice(0, 10) : null,
  };
}

export async function getPartnerDashboardData(
  partner: Partner,
  t: Translate = noopT,
): Promise<PartnerDashboardViewModel> {
  const [code, leads, commissionSummary] = await Promise.all([
    activeCode(partner.id),
    getPartnerLeads(partner.id),
    getPartnerCommissionSummary(partner.id),
  ]);
  const card = await getPartnerCard(partner, code);

  const paidCount = leads.filter((l) => l.hasPlan).length;

  return {
    partner: toPartnerProfile(partner, code),
    card,
    // M12 spec §1's exact 4 — a 2×2 grid, money included. Completion detail
    // stays at the per-lead level (LeadRow's bucket) rather than a 5th tile.
    metrics: [
      { label: t("partnerData.metrics.sent", "leads sent"), value: leads.length },
      { label: t("partnerData.metrics.paid", "paid count"), value: paidCount },
      { label: t("partnerData.metrics.totalEarned", "Total earned"), value: paiseToRupeeDisplay(commissionSummary.earnedPaise) },
      { label: t("partnerData.metrics.upcoming", "Upcoming"), value: paiseToRupeeDisplay(commissionSummary.pendingPaise) },
    ],
    // A sentence, never a percentage — "25%" invites a partner to argue about
    // the denominator; "24 me se 6" is just what happened.
    conversionSentence:
      leads.length === 0
        ? t("partnerData.conversion.none", "Abhi tak koi log nahi bheje.")
        : `${leads.length} ${t("partnerData.conversion.of", "me se")} ${paidCount} ${t(
            "partnerData.conversion.tookPlan",
            "log ne plan liya",
          )}`,
    leads: leads.slice(0, 5),
    insight: buildInsight(leads, t),
  };
}

export async function getReferralTools(partner: Partner, origin: string): Promise<ReferralToolsViewModel> {
  const code = await activeCode(partner.id);

  const [totalClicks, totalRegistrations] = await Promise.all([
    code ? prisma.referralClick.count({ where: { code } }) : Promise.resolve(0),
    prisma.partnerReferral.count({ where: { partnerId: partner.id } }),
  ]);

  return {
    partnerCode: code,
    referralLink: code ? `${origin}/r/${code}` : null,
    stats: { totalClicks, totalRegistrations },
  };
}
