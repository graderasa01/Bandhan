import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getPlanCatalog, planFeaturesOf } from "@/lib/services/plans/planCatalog";
import { consumeReward } from "@/lib/services/rewards/rewardService";
import type { PlanCode } from "@/lib/constants/plans";
import { noopT, type Translate } from "@/lib/i18n/translate";

/**
 * D-11's `boost` capability: "your profile ranks slightly higher in other
 * people's reels for a while." Stored as one nullable timestamp on `Profile`
 * — `boostActiveUntil` — rather than a boolean, because "is it on" and "until
 * when" are the same fact and a separate flag would just be a second place
 * for that fact to go stale.
 *
 * Two independent writers:
 *
 * 1. **Subscription-level** (`syncBoostFromSubscription`) — STANDARD/PREMIUM
 *    get it as a standing feature of the plan, refreshed on every capture to
 *    track the paid period. Downgrading to a plan without `boost` clears it
 *    immediately rather than leaving a stale future timestamp around.
 * 2. **Reward-level** (`activateBoostFromReward`) — a quest can grant a
 *    `RewardGrant(BOOST)` credit; redeeming one buys 24 hours, independent of
 *    plan. A Free user who earns a boost gets to feel the paid feature
 *    briefly, same shape as `voiceUnlock`'s reward escape hatch.
 *
 * Both only ever *raise* `boostActiveUntil` (`max(current, new)`), except the
 * explicit downgrade-clear in (1) — the two writers must never fight each
 * other by shortening a window the other one set.
 */

/** Exported so the boost page can render an honest countdown against the same window this spends. */
export const REWARD_BOOST_HOURS = 24;

/** Called from the payment webhook on every CAPTURED payment. */
export async function syncBoostFromSubscription(params: {
  userId: string;
  planCode: PlanCode;
  currentPeriodEnd: Date;
}): Promise<void> {
  const { userId, planCode, currentPeriodEnd } = params;
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true, boostActiveUntil: true } });
  if (!profile) return; // No profile yet — nothing to boost.

  if (!planFeaturesOf(await getPlanCatalog(), planCode).boost) {
    // Downgraded to a plan without boost. A reward-earned window in progress
    // is the user's own, separate from what they're paying for, so it is left
    // alone rather than cleared here.
    return;
  }

  const next =
    profile.boostActiveUntil && profile.boostActiveUntil > currentPeriodEnd
      ? profile.boostActiveUntil
      : currentPeriodEnd;

  await prisma.profile.update({ where: { id: profile.id }, data: { boostActiveUntil: next } });
}

export type ActivateBoostResult = { ok: true; activeUntil: Date } | { ok: false; message: string };

/** Spends one BOOST credit. Called from a future quest-reward redemption UI. */
export async function activateBoostFromReward(
  userId: string,
  t: Translate = noopT,
): Promise<ActivateBoostResult> {
  const spent = await consumeReward(userId, "BOOST", 1);
  if (!spent) {
    return { ok: false, message: t("boost.reward.noCredit", "Aapke paas abhi koi boost credit nahi hai.") };
  }

  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true, boostActiveUntil: true } });
  if (!profile) return { ok: false, message: t("boost.reward.noProfile", "Profile nahi mila.") };

  const candidate = new Date(Date.now() + REWARD_BOOST_HOURS * 3600_000);
  const next = profile.boostActiveUntil && profile.boostActiveUntil > candidate ? profile.boostActiveUntil : candidate;

  await prisma.profile.update({ where: { id: profile.id }, data: { boostActiveUntil: next } });
  return { ok: true, activeUntil: next };
}

export function isBoosted(boostActiveUntil: Date | null): boolean {
  return boostActiveUntil !== null && boostActiveUntil > new Date();
}

export interface BoostStatus {
  active: boolean;
  activeUntil: Date | null;
}

/** For a profile owner's own screens — "is my boost on right now, until when". */
export async function getBoostStatus(userId: string): Promise<BoostStatus> {
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { boostActiveUntil: true } });
  const activeUntil = profile?.boostActiveUntil ?? null;
  return { active: isBoosted(activeUntil), activeUntil };
}
