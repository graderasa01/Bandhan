/**
 * Lifecycle Engine (M2) — the shapes the cron job, the admin preview and the
 * console all agree on.
 *
 * Split from the service for the same reason `contracts/growth.ts` is: the
 * service is `server-only` and the console is a client component that needs
 * the tier labels at runtime, not just their types.
 */

/**
 * Priority tiers, in the order a nudge is allowed to win.
 *
 * This ordering is the single most important decision in the engine. A user
 * can qualify for six campaigns at once, and only one may go out — so the
 * question "which one" is really the question "whose problem is this". A
 * message about *another person waiting on them* is news they cannot get any
 * other way. A message about *us* wanting something is not news at all, and
 * every one of those spent is a small withdrawal from the user's willingness
 * to look at the next notification.
 */
export const LIFECYCLE_TIERS = {
  WAITING_HUMAN: 1,
  EXPIRING: 2,
  UNDISCOVERABLE: 3,
  HABIT: 4,
  UPGRADE: 5,
} as const;

export type LifecycleTier = (typeof LIFECYCLE_TIERS)[keyof typeof LIFECYCLE_TIERS];

export const TIER_LABELS: Record<LifecycleTier, string> = {
  1: "Koi intezaar kar raha hai",
  2: "Kuchh khatam ho raha hai",
  3: "Aap dhoondhe nahi ja sakte",
  4: "Wapas aane ki wajah",
  5: "Upgrade",
};

/** Why a candidate did not get their nudge. Every skip is counted, never silent. */
export type SkipReason =
  | "quietHours"
  | "recentlyActive"
  | "weeklyCap"
  | "unreadPending"
  | "cooldown"
  | "batchCap"
  | "suspended";

export const SKIP_LABELS: Record<SkipReason, string> = {
  quietHours: "Quiet hours — raat mein kuchh nahi jaata",
  recentlyActive: "Abhi app mein active tha — inbox samne hi hai",
  weeklyCap: "Is hafte ki limit poori",
  unreadPending: "Pichhli baat abhi tak padhi nahi",
  cooldown: "Isi campaign ka cooldown chal raha hai",
  batchCap: "Is run ka batch bhar gaya",
  suspended: "Account active nahi hai",
};

export interface CampaignResult {
  id: string;
  label: string;
  tier: LifecycleTier;
  /** How many users the campaign's own query matched, before any brake. */
  matched: number;
  /** How many actually received it this run (always 0 on a dry run). */
  sent: number;
  /** Matched, top-ranked for their user, but stopped by a brake. */
  skipped: number;
}

/** One nudge as it would go out — the dry run's whole point is that this is readable. */
export interface PlannedNudge {
  userId: string;
  userName: string;
  campaignId: string;
  campaignLabel: string;
  tier: LifecycleTier;
  title: string;
  body: string;
  href: string;
}

export interface LifecycleRunSummary {
  ranAt: string;
  dryRun: boolean;
  /** False when the run was outside 09:00–21:00 IST; nothing goes out then. */
  withinSendWindow: boolean;
  /** Distinct users at least one campaign matched. */
  candidates: number;
  /** Users who cleared every brake — sent for real, or would have been on a dry run. */
  selected: number;
  sent: number;
  failed: number;
  skipped: Record<SkipReason, number>;
  campaigns: CampaignResult[];
  /** Up to `PREVIEW_LIMIT` of the selected nudges, verbatim. */
  preview: PlannedNudge[];
}

export const PREVIEW_LIMIT = 25;
