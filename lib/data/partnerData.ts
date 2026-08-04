// Real Prisma-backed partner data. Every lead-shaped and commission-shaped
// row leaves this module through lib/partner/visibility.ts's mappers — see
// that file for why that is not optional.
import { prisma } from "@/lib/db/prisma";
import { toPartnerLead, toPartnerCommissionRow, type LeadSource } from "@/lib/partner/visibility";
import type {
  PartnerCommissionSummary,
  PartnerCommissionsViewModel,
  PartnerDashboardViewModel,
  PartnerLeadViewModel,
  PartnerPayoutStatusViewModel,
  PartnerProfileViewModel,
  ReferralToolsViewModel,
} from "@/lib/contracts/partner";
import { paiseToRupeeDisplay } from "@/lib/utils/money";
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
function buildInsight(leads: PartnerLeadViewModel[]): { title: string; message: string } | null {
  if (leads.length === 0) return null;

  const stalled = leads.filter((l) => l.status === "PROFILE_STARTED").length;
  if (stalled > 0) {
    return {
      title: "Inhe ek reminder bhej sakte hain",
      message: `${stalled} logon ne profile shuru ki hai lekin poori nahi ki. Ek chhota reminder aksar kaam kar jaata hai.`,
    };
  }

  const inactive = leads.filter((l) => l.status === "INACTIVE").length;
  if (inactive > 0) {
    return {
      title: "Kuch log kaafi time se active nahi hain",
      message: `${inactive} logon ne ek mahine se zyada time se login nahi kiya.`,
    };
  }

  return {
    title: "Sab theek chal raha hai",
    message: "Aapke bheje huye log active hain aur profile complete kar rahe hain.",
  };
}

export async function getPartnerDashboardData(partner: Partner): Promise<PartnerDashboardViewModel> {
  const [code, leads, commissionSummary] = await Promise.all([
    activeCode(partner.id),
    getPartnerLeads(partner.id),
    getPartnerCommissionSummary(partner.id),
  ]);

  const paidCount = leads.filter((l) => l.hasPlan).length;

  return {
    partner: toPartnerProfile(partner, code),
    // M12 spec §1's exact 4 — a 2×2 grid, money included. Completion detail
    // stays at the per-lead level (LeadRow's bucket) rather than a 5th tile.
    metrics: [
      { label: "Log bheje", value: leads.length },
      { label: "Plan liya", value: paidCount },
      { label: "Total mila", value: paiseToRupeeDisplay(commissionSummary.earnedPaise) },
      { label: "Aane wala", value: paiseToRupeeDisplay(commissionSummary.pendingPaise) },
    ],
    // A sentence, never a percentage — "25%" invites a partner to argue about
    // the denominator; "24 me se 6" is just what happened.
    conversionSentence:
      leads.length === 0 ? "Abhi tak koi log nahi bheje." : `${leads.length} me se ${paidCount} log ne plan liya`,
    leads: leads.slice(0, 5),
    insight: buildInsight(leads),
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
