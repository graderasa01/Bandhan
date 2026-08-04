import "server-only";
import {
  PLAN_FEATURES,
  PLAN_FEATURE_KEYS,
  PLAN_NAMES,
  PLAN_ORDER,
  type PlanFeatureSet,
} from "@/lib/constants/plans";
import { getActiveOverrides, applyCapabilityOverride, type CapabilityValue } from "./entitlementOverrides";
import { getCredits, type RewardCredits } from "@/lib/services/rewards/rewardService";
import { getRollout, resolveAccess } from "@/lib/services/flags/featureFlagService";
import { getActiveSubscription } from "@/lib/services/payments/subscriptionService";
import type { FeatureKey } from "@/lib/constants/features";
import type { PlanCode } from "@prisma/client";

/**
 * M09 §10's `planGate` seam — the single server-side place that answers
 * "what is this user allowed to do".
 *
 * Three inputs, resolved in this order:
 *
 *   1. **Plan** — D-11's locked ladder (`PLAN_FEATURES`). Still the baseline,
 *      still code-only, still never edited from an admin panel.
 *   2. **Admin overrides** — `UserEntitlementOverride`. Raise-only.
 *   3. **Earned credits** — `RewardGrant`. Kept *separate* from the feature
 *      numbers rather than folded into them; see `effectiveReelLimit` below
 *      for why.
 *
 * There is still no Subscription table (M09's payment half isn't built), so
 * the billed plan resolves to FREE for everyone. The important change from the
 * earlier version of this file is that FREE is no longer the *only* possible
 * answer: an admin can hand a user PREMIUM by hand today, which is what makes
 * every paid feature testable before Razorpay exists.
 */

export async function getUserPlanCode(userId: string): Promise<PlanCode> {
  return (await getPlanContext(userId)).effectivePlanCode;
}

/**
 * What the user actually pays for, ignoring any admin grant.
 *
 * A CANCELLED subscription still counts until `currentPeriodEnd` — the month
 * was paid for. `getActiveSubscription` encodes that; this function just trusts
 * it rather than re-deriving the rule and getting it subtly different.
 */
export async function getBilledPlanCode(userId: string): Promise<PlanCode> {
  const subscription = await getActiveSubscription(userId);
  return subscription?.planCode ?? "FREE";
}

export interface PlanContext {
  billedPlanCode: PlanCode;
  /** After an admin plan override, if one is active. */
  effectivePlanCode: PlanCode;
  /** Plan baseline + capability overrides. Reward credits are NOT folded in. */
  features: PlanFeatureSet;
  credits: RewardCredits;
  /** True when the user holds any active override — the ALLOWLIST rollout's test. */
  hasOverride: boolean;
  /** Which keys sit above the plan baseline right now, for honest UI copy. */
  raisedKeys: (keyof PlanFeatureSet)[];
}

export async function getPlanContext(userId: string): Promise<PlanContext> {
  const [billedPlanCode, overrides, credits] = await Promise.all([
    getBilledPlanCode(userId),
    getActiveOverrides(userId),
    getCredits(userId),
  ]);

  const effectivePlanCode = overrides.planCode
    ? higherOf(billedPlanCode, overrides.planCode)
    : billedPlanCode;

  const base = PLAN_FEATURES[effectivePlanCode];
  const features = { ...base } as PlanFeatureSet;
  const raisedKeys: (keyof PlanFeatureSet)[] = [];

  for (const key of PLAN_FEATURE_KEYS) {
    const override = overrides.capabilities[key];
    if (override === undefined) continue;
    const merged = applyCapabilityOverride(key, base[key] as CapabilityValue, override);
    if (merged !== base[key]) raisedKeys.push(key);
    // The cast is safe: applyCapabilityOverride is keyed off PLAN_FEATURE_TYPES,
    // which is a Record over keyof PlanFeatureSet, so the value it returns
    // already matches this key's declared type.
    (features as Record<string, unknown>)[key] = merged;
  }

  if (effectivePlanCode !== billedPlanCode) raisedKeys.push("chat");

  // A live BOOST credit is the one reward that reads as a boolean capability
  // rather than a countable budget — you either are boosted right now or you
  // aren't. It is still *consumed* like any other credit when the boost is
  // applied; this only makes "am I boosted" answerable in one place.
  if (credits.BOOST > 0 && !features.boost) {
    features.boost = true;
    raisedKeys.push("boost");
  }

  return {
    billedPlanCode,
    effectivePlanCode,
    features,
    credits,
    hasOverride: overrides.any,
    raisedKeys: [...new Set(raisedKeys)],
  };
}

export async function getEntitlements(userId: string): Promise<PlanFeatureSet> {
  return (await getPlanContext(userId)).features;
}

/**
 * How many reel cards this user gets today: the plan's number plus any
 * REEL_UNLOCK credits they hold.
 *
 * Credits are added here rather than inside `features.reelPerDay` on purpose.
 * A credit is *spent* — whoever reads the higher number must also be the one
 * that calls `consumeReward`, and burying the addition inside the feature set
 * would make it easy to read the bonus in three places and charge for it in
 * none.
 */
export function effectiveReelLimit(ctx: PlanContext): number {
  return ctx.features.reelPerDay + ctx.credits.REEL_UNLOCK;
}

/** Same contract as `effectiveReelLimit`: null stays unlimited. */
export function effectiveAiAskLimit(ctx: PlanContext): number | null {
  if (ctx.features.aiAskPerDay === null) return null;
  return ctx.features.aiAskPerDay + ctx.credits.AI_ASK;
}

/**
 * Whether a feature is usable by this user right now — the flag layer and the
 * plan layer answered together.
 *
 * `planAllows` is a callback rather than a capability key because not every
 * feature maps to exactly one ladder key (voice notes read `voiceUnlock` for
 * opening but `interestsPerMonth` for sending). Passing the predicate keeps
 * that nuance at the call site instead of inventing a lookup table that would
 * be wrong half the time.
 */
export async function isFeatureAvailable(
  userId: string,
  feature: FeatureKey,
  planAllows?: (ctx: PlanContext) => boolean,
): Promise<{ allowed: boolean; reason: "ok" | "feature_off" | "plan" }> {
  const [rollout, ctx] = await Promise.all([getRollout(feature), getPlanContext(userId)]);
  const access = resolveAccess(rollout, ctx.hasOverride);

  if (access === "closed") return { allowed: false, reason: "feature_off" };
  if (access === "open") return { allowed: true, reason: "ok" };
  if (!planAllows) return { allowed: true, reason: "ok" };
  return planAllows(ctx) ? { allowed: true, reason: "ok" } : { allowed: false, reason: "plan" };
}

/**
 * Whether this user may see *who* shortlisted them. The count is public to the
 * owner regardless — see `admirerService`. Kept as its own function rather than
 * an inline `getEntitlements(...).admirerIdentity` so the profile-activity
 * panel has exactly one gate to audit.
 */
export async function canSeeAdmirerIdentity(userId: string): Promise<boolean> {
  return (await getEntitlements(userId)).admirerIdentity;
}

/**
 * Whether this user may see *who viewed* them — a stricter, Premium-only
 * sibling of `canSeeAdmirerIdentity` (see `viewerIdentity` in plans.ts for why
 * it isn't the same gate: viewers includes rejected/LEFT swipes, admirers don't).
 */
export async function canSeeViewerIdentity(userId: string): Promise<boolean> {
  return (await getEntitlements(userId)).viewerIdentity;
}

/** Whether this user's plan allows the deterministic photo-enhance tool (Standard+, D-11). */
export async function canUsePhotoEnhance(userId: string): Promise<boolean> {
  return (await getEntitlements(userId)).photoEnhance;
}

/** Whether this user's plan allows the generative "ultra realistic" relight tool (Premium-only). */
export async function canUsePhotoUltraEnhance(userId: string): Promise<boolean> {
  return (await getEntitlements(userId)).photoUltraEnhance;
}

/** How many family seats this user's plan allows — the invite flow's one hard limit. */
export async function getFamilySeatLimit(userId: string): Promise<number> {
  return (await getEntitlements(userId)).familySeats;
}

/**
 * Whether this user sees the seen/unseen tick on messages *they sent*.
 * `Message.readAt` is written for everyone regardless of plan (marking a
 * message read is the recipient's side of the interaction, not a purchase);
 * this only gates whether the *sender* gets shown that signal back.
 */
export async function canSeeReadReceipts(userId: string): Promise<boolean> {
  return (await getEntitlements(userId)).readReceipts;
}

/** The next plan up the ladder, or null at the top. */
export function nextPlanUp(code: PlanCode): PlanCode | null {
  const i = PLAN_ORDER.indexOf(code);
  return i >= 0 && i < PLAN_ORDER.length - 1 ? PLAN_ORDER[i + 1] : null;
}

const PLAN_RANK: Record<PlanCode, number> = { FREE: 0, BASIC: 1, STANDARD: 2, PREMIUM: 3 };

function higherOf(a: PlanCode, b: PlanCode): PlanCode {
  return PLAN_RANK[a] >= PLAN_RANK[b] ? a : b;
}

/**
 * What the contextual upgrade card needs at a reel-exhausted moment:
 * the next plan's name and its reel count. Null when there's nothing to sell.
 */
export async function reelUpgradeHint(
  userId: string,
): Promise<{ planName: string; reelPerDay: number } | null> {
  const next = nextPlanUp(await getUserPlanCode(userId));
  if (!next) return null;
  return { planName: PLAN_NAMES[next], reelPerDay: PLAN_FEATURES[next].reelPerDay };
}
