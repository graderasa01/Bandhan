/** Partner-facing contracts. Every field here is safe for a partner to see — see lib/partner/visibility.ts. */

export type PartnerStatusLabel = "PENDING_APPROVAL" | "APPROVED" | "ACTIVE" | "INACTIVE" | "REJECTED" | "SUSPENDED";

/** Derived from real profile/activity data, never stored. */
export type LeadStatus = "JOINED" | "PROFILE_STARTED" | "PROFILE_DONE" | "PAID" | "INACTIVE";

export type CompletionBucket = "Complete" | "75–100%" | "50–75%" | "25–50%" | "0–25%";

export type ActivityBucket = "Aaj" | "Is hafte" | "Is mahine" | "1 mahine se zyada";

/**
 * Deliberately carries no identity: no userId, no full name, no age/gender,
 * no contact details, no exact completion percentage. `leadId` is opaque.
 */
export type PartnerLeadViewModel = {
  leadId: string;
  firstName: string;
  city: string | null;
  joinedAt: string;
  completionBucket: CompletionBucket;
  activityBucket: ActivityBucket;
  hasPlan: boolean;
  status: LeadStatus;
};

export type PartnerProfileViewModel = {
  id: string;
  displayName: string;
  partnerCode: string | null;
  partnerType: string;
  status: PartnerStatusLabel;
};

export type PartnerDashboardViewModel = {
  partner: PartnerProfileViewModel;
  metrics: { label: string; value: string | number }[];
  /** Phrased as a sentence, never a percentage — "24 me se 6 log ne plan liya". */
  conversionSentence: string;
  leads: PartnerLeadViewModel[];
  insight: { title: string; message: string } | null;
};

export type ReferralToolsViewModel = {
  partnerCode: string | null;
  referralLink: string | null;
  stats: { totalClicks: number; totalRegistrations: number };
};

/** M12 spec §5 — PENDING and APPROVED are indistinguishable to a partner; both just mean "not paid yet". */
export type PartnerCommissionStatusLabel = "Aane wala" | "Mil gaya" | "Cancel";

/** Deliberately carries no identity beyond first name — same rule as `PartnerLeadViewModel`. */
export type PartnerCommissionRowViewModel = {
  commissionId: string;
  firstName: string;
  amountPaise: number;
  statusLabel: PartnerCommissionStatusLabel;
  createdAt: string;
  paidAt: string | null;
};

/** Shared by the dashboard's money tiles and the commissions page's summary cards. */
export type PartnerCommissionSummary = {
  /** Sum of PAID commissions. */
  earnedPaise: number;
  /** Sum of PENDING + APPROVED commissions — earned but not yet paid out. */
  pendingPaise: number;
};

export type PartnerCommissionsViewModel = {
  summary: PartnerCommissionSummary;
  rows: PartnerCommissionRowViewModel[];
};

export type PartnerPayoutHistoryRow = {
  commissionId: string;
  amountPaise: number;
  paidAt: string;
};

export type PartnerPayoutStatusViewModel = {
  /** Approved but not yet paid — what the partner can expect next. */
  readyPaise: number;
  /** Sum of everything ever paid. */
  totalPaidPaise: number;
  history: PartnerPayoutHistoryRow[];
};
