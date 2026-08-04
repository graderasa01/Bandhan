import type {
  ActivityBucket,
  CompletionBucket,
  LeadStatus,
  PartnerCommissionRowViewModel,
  PartnerCommissionStatusLabel,
  PartnerLeadViewModel,
} from "@/lib/contracts/partner";
import type { CommissionStatus } from "@prisma/client";

/**
 * The partner privacy boundary — the single most important rule in the
 * partner module.
 *
 * A partner is an outside business contact (a pandit ji, a marriage bureau),
 * not staff. They referred someone; that earns them the right to know their
 * referral is progressing, and nothing more. Everything a partner may ever see
 * about a lead is listed here, and every partner-facing query result must go
 * through `toPartnerLead()` rather than shaping rows ad hoc at a call site.
 *
 * Never exposed, deliberately: userId, full name, mobile, email, photos, age,
 * gender, trust score, exact completion percentage, lastActiveAt, and anything
 * about their matches, interests, messages or reel activity.
 */
export const PARTNER_VISIBLE_FIELDS = [
  "first_name",
  "city",
  "joined_at",
  "completion_bucket",
  "activity_bucket",
  "has_plan",
  "status",
] as const;

/** Bucketed server-side so an exact score never reaches the partner's browser. */
export function completionBucket(score: number): CompletionBucket {
  if (score >= 100) return "Complete";
  if (score >= 75) return "75–100%";
  if (score >= 50) return "50–75%";
  if (score >= 25) return "25–50%";
  return "0–25%";
}

/** Same reason: "Is hafte" tells a partner what they need; a timestamp tells them where someone was at 11:40pm. */
export function activityBucket(lastActiveAt: Date | null, now = new Date()): ActivityBucket {
  if (!lastActiveAt) return "1 mahine se zyada";
  const days = (now.getTime() - lastActiveAt.getTime()) / 86_400_000;
  if (days < 1) return "Aaj";
  if (days < 7) return "Is hafte";
  if (days < 30) return "Is mahine";
  return "1 mahine se zyada";
}

export function leadStatus(params: {
  completionScore: number;
  hasProfile: boolean;
  hasPlan: boolean;
  lastActiveAt: Date | null;
  now?: Date;
}): LeadStatus {
  const { completionScore, hasProfile, hasPlan, lastActiveAt } = params;
  const now = params.now ?? new Date();

  if (hasPlan) return "PAID";
  const inactiveDays = lastActiveAt ? (now.getTime() - lastActiveAt.getTime()) / 86_400_000 : Infinity;
  if (inactiveDays > 30) return "INACTIVE";
  if (completionScore >= 100) return "PROFILE_DONE";
  if (hasProfile && completionScore > 0) return "PROFILE_STARTED";
  return "JOINED";
}

/** First token only — "Priya Agarwal" is identifying, "Priya" is enough to have a conversation. */
export function firstNameOf(fullName: string, displayName: string | null): string {
  const source = displayName?.trim() || fullName.trim();
  return source.split(/\s+/)[0] ?? "—";
}

export type LeadSource = {
  referralId: string;
  attributedAt: Date;
  user: {
    fullName: string;
    createdAt: Date;
    lastLoginAt: Date | null;
    profile: { displayName: string | null; currentCity: string | null; profileCompletionScore: number } | null;
  };
};

/**
 * The only sanctioned way to turn a referred user into something a partner
 * sees. Note the id: it's the PartnerReferral row's id, not the user's — a
 * partner never holds a handle to a user account.
 *
 * `hasActiveSubscription` is passed in rather than looked up here because a
 * caller listing many leads needs to batch that query (see
 * `getPartnerLeads` in lib/data/partnerData.ts) — this function stays a pure
 * mapper with no DB access of its own.
 */
export function toPartnerLead(
  source: LeadSource,
  hasActiveSubscription: boolean,
  now = new Date(),
): PartnerLeadViewModel {
  const { user } = source;
  const completionScore = user.profile?.profileCompletionScore ?? 0;
  // `lastLoginAt` is only stamped on an explicit login, so someone who
  // registered minutes ago still has null — without this fallback a brand-new
  // lead shows up to the partner as "1 mahine se zyada" inactive.
  const lastSeen = user.lastLoginAt ?? user.createdAt;
  const hasPlan = hasActiveSubscription;

  return {
    leadId: source.referralId,
    firstName: firstNameOf(user.fullName, user.profile?.displayName ?? null),
    city: user.profile?.currentCity ?? null,
    joinedAt: source.attributedAt.toISOString().slice(0, 10),
    completionBucket: completionBucket(completionScore),
    activityBucket: activityBucket(lastSeen, now),
    hasPlan,
    status: leadStatus({
      completionScore,
      hasProfile: Boolean(user.profile),
      hasPlan,
      lastActiveAt: lastSeen,
      now,
    }),
  };
}

/**
 * M12 spec §5's status-copy table. `HOLD`/`REJECTED` aren't states our
 * `CommissionStatus` enum has (see D-14's simpler MVP lifecycle) — PENDING and
 * APPROVED read identically to a partner on purpose: both just mean "not paid
 * yet", and the difference is an internal admin concern, never theirs to see.
 */
const COMMISSION_STATUS_LABEL: Record<CommissionStatus, PartnerCommissionStatusLabel> = {
  PENDING: "Aane wala",
  APPROVED: "Aane wala",
  PAID: "Mil gaya",
  REVERSED: "Cancel",
};

export type CommissionRowSource = {
  id: string;
  amountPaise: number;
  status: CommissionStatus;
  createdAt: Date;
  paidAt: Date | null;
  user: { fullName: string; profile: { displayName: string | null } | null };
};

/** Same rule as `toPartnerLead`: a partner sees who earned them money, never who they are. */
export function toPartnerCommissionRow(source: CommissionRowSource): PartnerCommissionRowViewModel {
  return {
    commissionId: source.id,
    firstName: firstNameOf(source.user.fullName, source.user.profile?.displayName ?? null),
    amountPaise: source.amountPaise,
    statusLabel: COMMISSION_STATUS_LABEL[source.status],
    createdAt: source.createdAt.toISOString().slice(0, 10),
    paidAt: source.paidAt ? source.paidAt.toISOString().slice(0, 10) : null,
  };
}
