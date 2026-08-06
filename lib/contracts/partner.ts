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

/** One entry in a lead's progress timeline. `at` is null for a step not reached yet. */
export type LeadTimelineStep = {
  key: "joined" | "profile_started" | "profile_done" | "paid";
  label: string;
  at: string | null;
  done: boolean;
};

export type LeadOutreachEntry = {
  id: string;
  channel: "WHATSAPP" | "EMAIL";
  /** "Aapne bheja" vs "Automatic gaya" — the partner should never wonder which. */
  automated: boolean;
  templateLabel: string;
  status: string;
  failureReason: string | null;
  at: string;
};

/**
 * The lead detail screen. Wider than `PartnerLeadViewModel` but not *deeper* —
 * every addition is either about the partner's own relationship with this lead
 * (what they sent, what they earned) or a coarser view of something the row
 * already showed. Still no contact details, no photo, no age, no exact
 * completion score: see lib/partner/visibility.ts.
 */
export type PartnerLeadDetailViewModel = {
  lead: PartnerLeadViewModel;
  timeline: LeadTimelineStep[];
  /** Days since the lead last did anything, bucketed into a sentence. */
  stalledNote: string | null;
  /** What this one lead has earned the partner so far. */
  earnedPaiseDisplay: string;
  /** Commission rows from this lead — renewals included (D-80). */
  commissionCount: number;
  outreach: LeadOutreachEntry[];
  /** The follow-up that fits this lead's current status. */
  suggestedAction: { label: string; reason: string } | null;
};

export type PartnerProfileViewModel = {
  id: string;
  displayName: string;
  partnerCode: string | null;
  partnerType: string;
  status: PartnerStatusLabel;
};

/**
 * The partner's own card — Bronze, Silver or Gold. Everything here is about
 * the partner themselves, so unlike `PartnerLeadViewModel` there is no privacy
 * boundary to keep: it is their name, their record, their rate.
 */
export type PartnerCardViewModel = {
  tier: "BRONZE" | "SILVER" | "GOLD";
  tierLabel: string;
  displayName: string;
  partnerCode: string | null;
  /** Members whose payment earned a commission — the number that sets the tier. */
  paidConversions: number;
  /** The rate actually applied to this partner's payments right now. */
  commissionPercentDisplay: string;
  /** Null at Gold — nothing above it. */
  nextTierLabel: string | null;
  /** Paid conversions still needed for the next tier. */
  remainingForNextTier: number;
  /** 0–1, measured from the current tier's floor. */
  progressFraction: number;
  /** What the next tier adds, e.g. "+3%". Null at Gold. */
  nextTierBonusDisplay: string | null;
  /** ISO date the partner was approved — the card's "member since". */
  memberSince: string | null;
};

export type PartnerDashboardViewModel = {
  partner: PartnerProfileViewModel;
  card: PartnerCardViewModel;
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
