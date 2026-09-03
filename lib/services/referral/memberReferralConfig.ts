import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getPlanCatalog } from "@/lib/services/plans/planCatalog";
import type { Role } from "@prisma/client";

/**
 * The dials for the member referral program — "dost ko bulao".
 *
 * ## Why these are settings and not constants
 *
 * The same argument `OpsSettings` makes, with one number that matters more
 * than the rest: this program pays in **plan access**, and how much access
 * three invites is worth is a pricing decision nobody can get right before a
 * pilot city has run. Devesh has to be able to open the tap during a launch
 * push and close it the week the maths stops working, without a deploy.
 *
 * What is deliberately *not* here: the ability to pay cash. That belongs to
 * the partner engine (`PartnerCommissionConfig`), which has KYC, a refund
 * hold, a payout ledger and an approval queue behind it. A member referral
 * grants a time-boxed entitlement and nothing else — there is no field on this
 * row that could ever turn into a liability.
 *
 * ## Why the defaults live in code as well as in the column
 *
 * The `@default`s in `schema.prisma` fill a row that exists; these fill the
 * absence of one. A fresh database must produce a *conservative* working
 * program rather than a crash — or, far worse, one that reads every threshold
 * as zero and hands Premium to everybody who opens the page.
 */

const CONFIG_ID = "default";

export interface MemberReferralConfigValues {
  enabled: boolean;
  rewardPlanCode: string;
  rewardDays: number;
  referralsPerReward: number;
  maxRewardsPerUser: number;
  requireJoinerPhoto: boolean;
  joinerMinCompletionPercent: number;
  requireJoinerVerifiedContact: boolean;
  requireReferrerProfileComplete: boolean;
  requireReferrerPhoto: boolean;
  oneQualifiedPerDevice: boolean;
  joinerRewardPlanCode: string;
  joinerRewardDays: number;
  shareMessage: string | null;
}

/**
 * The starting values, chosen 2026-09-03. Each one's reasoning is on its column
 * in `schema.prisma`; this is only the copy that survives a missing row.
 *
 * `joinerRewardDays: 0` is the one to notice — the double-sided version of the
 * program ships switched off. Turning it on doubles the cost of every referral
 * and should be a decision somebody makes on purpose.
 */
export const DEFAULT_MEMBER_REFERRAL_CONFIG: MemberReferralConfigValues = {
  enabled: true,
  rewardPlanCode: "STANDARD",
  rewardDays: 30,
  referralsPerReward: 3,
  maxRewardsPerUser: 4,
  requireJoinerPhoto: true,
  joinerMinCompletionPercent: 60,
  requireJoinerVerifiedContact: true,
  requireReferrerProfileComplete: true,
  requireReferrerPhoto: true,
  oneQualifiedPerDevice: true,
  joinerRewardPlanCode: "STANDARD",
  joinerRewardDays: 0,
  shareMessage: null,
};

/** Appended with the link. Overridable per-deployment via `shareMessage`. */
export const DEFAULT_SHARE_MESSAGE =
  "Main BandhanTak par apna rishta dhoondh raha/rahi hoon — profiles asli hain aur family ke saath dekh sakte hain. Aap bhi dekhiye:";

export async function getMemberReferralConfig(): Promise<MemberReferralConfigValues> {
  const row = await prisma.memberReferralConfig.findUnique({ where: { id: CONFIG_ID } });
  if (!row) return { ...DEFAULT_MEMBER_REFERRAL_CONFIG };
  return {
    enabled: row.enabled,
    rewardPlanCode: row.rewardPlanCode,
    rewardDays: row.rewardDays,
    referralsPerReward: row.referralsPerReward,
    maxRewardsPerUser: row.maxRewardsPerUser,
    requireJoinerPhoto: row.requireJoinerPhoto,
    joinerMinCompletionPercent: row.joinerMinCompletionPercent,
    requireJoinerVerifiedContact: row.requireJoinerVerifiedContact,
    requireReferrerProfileComplete: row.requireReferrerProfileComplete,
    requireReferrerPhoto: row.requireReferrerPhoto,
    oneQualifiedPerDevice: row.oneQualifiedPerDevice,
    joinerRewardPlanCode: row.joinerRewardPlanCode,
    joinerRewardDays: row.joinerRewardDays,
    shareMessage: row.shareMessage,
  };
}

export function shareMessageOf(config: MemberReferralConfigValues): string {
  const custom = config.shareMessage?.trim();
  return custom && custom.length > 0 ? custom : DEFAULT_SHARE_MESSAGE;
}

export type MemberReferralConfigResult =
  | { ok: true }
  | { ok: false; error: string; message: string; status: number };

interface Actor {
  actorId: string;
  actorRole: Role;
}

type NumericKey =
  | "rewardDays"
  | "referralsPerReward"
  | "maxRewardsPerUser"
  | "joinerMinCompletionPercent"
  | "joinerRewardDays";

/** Each number's own range, and the sentence an admin reads when they miss it. */
const RANGES: Record<NumericKey, { min: number; max: number; message: string }> = {
  // The floor is 1 rather than 0 because a reward of zero days is not a
  // cheaper reward, it is a promise the app makes and does not keep. The
  // ceiling is a year: past that a "reward" is really a permanent free plan
  // wearing a costume, and that decision belongs on the plan, not here.
  rewardDays: { min: 1, max: 365, message: "Reward 1 se 365 din ke beech rakhiye." },
  // 1 is allowed — a launch push where a single good invite pays is a real
  // strategy. 50 is where a ladder stops being a ladder nobody can climb.
  referralsPerReward: { min: 1, max: 50, message: "Ek reward ke liye 1 se 50 referrals rakhiye." },
  // 0 is legal and means "the program runs but pays nothing" — the honest way
  // to keep links alive while the reward is being re-thought.
  maxRewardsPerUser: { min: 0, max: 24, message: "Ek user ko zyada se zyada 0 se 24 reward mil sakte hain." },
  // 100 would demand a perfect profile, which almost nobody has; the bar is
  // "somebody a stranger can be shown", not "somebody who filled every field".
  joinerMinCompletionPercent: { min: 0, max: 95, message: "Profile ka bar 0 se 95 percent ke beech rakhiye." },
  // 0 = the double-sided reward is off.
  joinerRewardDays: { min: 0, max: 365, message: "Naye member ka reward 0 se 365 din ke beech rakhiye." },
};

const BOOLEAN_KEYS = [
  "enabled",
  "requireJoinerPhoto",
  "requireJoinerVerifiedContact",
  "requireReferrerProfileComplete",
  "requireReferrerPhoto",
  "oneQualifiedPerDevice",
] as const;

/** WhatsApp truncates long previews and a share message is not an essay. */
const MAX_SHARE_MESSAGE = 300;

/**
 * Writes whichever dials were sent, validates each on its own terms, and audits
 * the change as one row.
 *
 * Upserts rather than updates: the seed does not guarantee this row, and an
 * admin's first visit to the screen should be able to change a number rather
 * than report that the settings are missing.
 */
export async function setMemberReferralConfig(
  input: Partial<MemberReferralConfigValues>,
  actor: Actor,
): Promise<MemberReferralConfigResult> {
  const data: Record<string, number | boolean | string | null> = {};

  for (const [key, range] of Object.entries(RANGES) as [NumericKey, (typeof RANGES)[NumericKey]][]) {
    const value = input[key];
    if (value === undefined) continue;
    if (!Number.isInteger(value) || value < range.min || value > range.max) {
      return { ok: false, error: "OUT_OF_RANGE", message: range.message, status: 422 };
    }
    data[key] = value;
  }

  for (const key of BOOLEAN_KEYS) {
    if (input[key] !== undefined) data[key] = input[key] as boolean;
  }

  // Plan codes are free-form strings (admins create plans), so the only thing
  // that can say whether one is real is the live catalog. Without this a typo
  // would store a reward that silently resolves to nothing at grant time —
  // and the user would be told they had earned a plan that does not exist.
  if (input.rewardPlanCode !== undefined || input.joinerRewardPlanCode !== undefined) {
    const catalog = await getPlanCatalog();
    for (const key of ["rewardPlanCode", "joinerRewardPlanCode"] as const) {
      const code = input[key];
      if (code === undefined) continue;
      const normalised = code.trim().toUpperCase();
      if (!catalog.byCode[normalised]) {
        return { ok: false, error: "UNKNOWN_PLAN", message: `"${code}" naam ka koi plan nahi hai.`, status: 422 };
      }
      data[key] = normalised;
    }
  }

  if (input.shareMessage !== undefined) {
    const text = input.shareMessage?.trim() ?? "";
    if (text.length > MAX_SHARE_MESSAGE) {
      return {
        ok: false,
        error: "TOO_LONG",
        message: `Share message ${MAX_SHARE_MESSAGE} characters se chhota rakhiye.`,
        status: 422,
      };
    }
    // Empty string clears it back to the built-in rather than storing a blank
    // message that would ship a bare URL with no sentence around it.
    data.shareMessage = text.length > 0 ? text : null;
  }

  if (Object.keys(data).length === 0) {
    return { ok: false, error: "NOTHING_TO_DO", message: "Kuch badla nahi.", status: 422 };
  }

  const current = await getMemberReferralConfig();

  await prisma.memberReferralConfig.upsert({
    where: { id: CONFIG_ID },
    create: { id: CONFIG_ID, ...DEFAULT_MEMBER_REFERRAL_CONFIG, ...data, updatedBy: actor.actorId },
    update: { ...data, updatedBy: actor.actorId },
  });

  await prisma.adminAuditLog.create({
    data: {
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      actionType: "MEMBER_REFERRAL_CONFIG_UPDATED",
      targetType: "member_referral_config",
      targetId: CONFIG_ID,
      previousValue: JSON.stringify(current),
      newValue: JSON.stringify(data),
    },
  });

  return { ok: true };
}
