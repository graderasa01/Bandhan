import "server-only";
import { prisma } from "@/lib/db/prisma";
import { maskEmail, maskMobile } from "@/lib/services/partner/sanitize";
import { countPaidConversions } from "@/lib/partner/commissionRate";
import { effectiveBps, tierProgress, type TierProgress } from "@/lib/partner/tier";
import type { PartnerStatus, PartnerType } from "@prisma/client";

/**
 * Everything an admin needs to actually *decide* about one partner, in one
 * read.
 *
 * `/admin/partners` was a queue: name, city, masked contact, approve/reject.
 * That is enough to rubber-stamp an application and nothing else — it could
 * not answer "is this partner performing", "what have we paid them", "why is
 * their rate 18%", or "what number do I ring". Those are the questions that
 * come up once a partner is live, and they all used to require a psql session.
 *
 * Contact details stay masked here, same as the list. The unmasked value is a
 * separate, audited call (`revealPartnerContact`) — an admin who needs to phone
 * someone should be able to, and the record of who looked should exist.
 */

export type AdminPartnerLead = {
  userId: string;
  maskedName: string;
  joinedAt: Date;
  codeUsed: string;
  /** Derived, never stored — same rule as the partner's own lead list. */
  status: "REGISTERED" | "PROFILE_LIVE" | "SUBSCRIBED";
};

export type AdminPartnerDetail = {
  id: string;
  userId: string;
  fullName: string;
  maskedMobile: string;
  maskedEmail: string | null;
  city: string;
  state: string;
  partnerType: PartnerType;
  organizationName: string | null;
  experienceYears: number | null;
  expectedMonthlyReferrals: number | null;
  knownCommunityOrArea: string | null;
  notesFromPartner: string | null;
  status: PartnerStatus;
  rejectionReason: string | null;
  suspensionReason: string | null;
  autoOutreachEnabled: boolean;
  appliedAt: Date;
  timeline: { label: string; at: Date; by: string | null }[];

  activeCode: string | null;
  clickCount: number;
  leads: AdminPartnerLead[];
  leadCount: number;
  subscribedCount: number;

  /** Distinct paying members — what the tier is computed from. */
  paidConversions: number;
  tier: TierProgress;
  /** Rate that would apply to the next payment right now. */
  effectiveBps: number;
  /** Set when an admin has pinned a rate for this partner specifically. */
  commissionBpsOverride: number | null;
  /** What the tier alone would pay — shown next to the override so the gap is visible. */
  tierBps: number;

  earnings: { pendingPaise: number; approvedPaise: number; paidPaise: number; reversedPaise: number };
  recentCommissions: {
    id: string;
    amountPaise: number;
    basePaise: number;
    percentBpsApplied: number;
    status: string;
    createdAt: Date;
    paidAt: Date | null;
  }[];

  outreach: { channel: string; templateKey: string; status: string; sentAt: Date | null; createdAt: Date }[];
  invites: { fullName: string; status: string; createdAt: Date; joinedAt: Date | null }[];
};

/** "Priya Sharma" → "Priya S." — an admin reviewing a partner's funnel doesn't need full member names. */
function maskLeadName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export async function getAdminPartnerDetail(partnerId: string): Promise<AdminPartnerDetail | null> {
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    include: {
      referralCodes: { orderBy: { createdAt: "desc" } },
      referrals: {
        orderBy: { attributedAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              createdAt: true,
              // Same "profile live" test the partner's own lead list uses
              // (lib/data/partnerData.ts) — the required-fields score at 100,
              // not `profileStatus`, which tracks the verification queue.
              profile: { select: { profileCompletionScore: true } },
              subscriptions: { where: { status: "ACTIVE" }, select: { id: true }, take: 1 },
            },
          },
        },
      },
      commissions: { orderBy: { createdAt: "desc" } },
      outreach: { orderBy: { createdAt: "desc" }, take: 20 },
      invites: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!partner) return null;

  const codes = partner.referralCodes.map((c) => c.code);
  const [config, paidConversions, clickCount] = await Promise.all([
    prisma.partnerCommissionConfig.findUnique({ where: { id: "default" } }),
    countPaidConversions(prisma, partner.id),
    // Clicks are recorded against the code string, not the partner id, so a
    // partner who has rotated codes needs all of theirs counted.
    codes.length > 0 ? prisma.referralClick.count({ where: { code: { in: codes } } }) : Promise.resolve(0),
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

  const tier = tierProgress(paidConversions, thresholds, rates);
  const tierBps = effectiveBps(tier.tier, rates);

  const leads: AdminPartnerLead[] = partner.referrals.map((r) => ({
    userId: r.userId,
    maskedName: maskLeadName(r.user.fullName),
    joinedAt: r.attributedAt,
    codeUsed: r.codeUsed,
    status:
      r.user.subscriptions.length > 0
        ? "SUBSCRIBED"
        : (r.user.profile?.profileCompletionScore ?? 0) >= 100
          ? "PROFILE_LIVE"
          : "REGISTERED",
  }));

  const sumBy = (status: string) =>
    partner.commissions.filter((c) => c.status === status).reduce((n, c) => n + c.amountPaise, 0);

  const timeline: AdminPartnerDetail["timeline"] = [
    { label: "Apply kiya", at: partner.createdAt, by: null },
    ...(partner.approvedAt ? [{ label: "Approve hua", at: partner.approvedAt, by: partner.approvedBy }] : []),
    ...(partner.rejectedAt ? [{ label: "Reject hua", at: partner.rejectedAt, by: partner.rejectedBy }] : []),
    ...(partner.suspendedAt ? [{ label: "Suspend hua", at: partner.suspendedAt, by: partner.suspendedBy }] : []),
    ...(partner.reactivatedAt
      ? [{ label: "Reactivate hua", at: partner.reactivatedAt, by: partner.reactivatedBy }]
      : []),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  return {
    id: partner.id,
    userId: partner.userId,
    fullName: partner.fullName,
    maskedMobile: maskMobile(partner.mobileNumber),
    maskedEmail: maskEmail(partner.email),
    city: partner.city,
    state: partner.state,
    partnerType: partner.partnerType,
    organizationName: partner.organizationName,
    experienceYears: partner.experienceYears,
    expectedMonthlyReferrals: partner.expectedMonthlyReferrals,
    knownCommunityOrArea: partner.knownCommunityOrArea,
    notesFromPartner: partner.notesFromPartner,
    status: partner.status,
    rejectionReason: partner.rejectionReason,
    suspensionReason: partner.suspensionReason,
    autoOutreachEnabled: partner.autoOutreachEnabled,
    appliedAt: partner.createdAt,
    timeline,

    activeCode: partner.referralCodes.find((c) => c.active)?.code ?? null,
    clickCount,
    leads: leads.slice(0, 50),
    leadCount: leads.length,
    subscribedCount: leads.filter((l) => l.status === "SUBSCRIBED").length,

    paidConversions,
    tier,
    effectiveBps: partner.commissionBpsOverride ?? tierBps,
    commissionBpsOverride: partner.commissionBpsOverride,
    tierBps,

    earnings: {
      pendingPaise: sumBy("PENDING"),
      approvedPaise: sumBy("APPROVED"),
      paidPaise: sumBy("PAID"),
      reversedPaise: sumBy("REVERSED"),
    },
    recentCommissions: partner.commissions.slice(0, 20).map((c) => ({
      id: c.id,
      amountPaise: c.amountPaise,
      basePaise: c.basePaise,
      percentBpsApplied: c.percentBpsApplied,
      status: c.status,
      createdAt: c.createdAt,
      paidAt: c.paidAt,
    })),

    outreach: partner.outreach.map((o) => ({
      channel: o.channel,
      templateKey: o.templateKey,
      status: o.status,
      sentAt: o.sentAt,
      createdAt: o.createdAt,
    })),
    invites: partner.invites.map((i) => ({
      fullName: i.fullName,
      status: i.status,
      createdAt: i.createdAt,
      joinedAt: i.joinedAt,
    })),
  };
}
