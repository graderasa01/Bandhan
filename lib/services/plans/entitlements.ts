import "server-only";
import { prisma } from "@/lib/db/prisma";
import { PLAN_FEATURE_KEYS, type PlanFeatureSet } from "@/lib/constants/plans";
import { getActiveOverrides, applyCapabilityOverride, type CapabilityValue } from "./entitlementOverrides";
import {
  basePlanCode,
  getPlanCatalog,
  higherOf as higherOfIn,
  nextPlanUp as nextPlanUpIn,
  planFeaturesOf,
} from "./planCatalog";
import { getCredits, type RewardCredits } from "@/lib/services/rewards/rewardService";
import { getRollout, resolveAccess } from "@/lib/services/flags/featureFlagService";
import { getActiveSubscription } from "@/lib/services/payments/subscriptionService";
import type { FeatureKey } from "@/lib/constants/features";
import type { PlanCode } from "@/lib/constants/plans";

/**
 * M09 §10's `planGate` seam — the single server-side place that answers
 * "what is this user allowed to do".
 *
 * Three inputs, resolved in this order:
 *
 *   1. **Plan** — the live catalog (`getPlanCatalog()`), which is the `plans`
 *      table with D-11's built-in defaults underneath it. This used to read
 *      `PLAN_FEATURES` straight from code; since plans became admin-editable
 *      (2026-08-07) reading the constant here would ignore every edit and
 *      return nothing at all for an admin-created plan.
 *   2. **Admin overrides** — `UserEntitlementOverride`. Raise-only.
 *   3. **Earned credits** — `RewardGrant`. Kept *separate* from the feature
 *      numbers rather than folded into them; see `effectiveReelLimit` below
 *      for why.
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
  if (subscription) return subscription.planCode;
  return basePlanCode(await getPlanCatalog());
}

export interface PlanContext {
  billedPlanCode: PlanCode;
  /** After an admin plan override, if one is active. */
  effectivePlanCode: PlanCode;
  /**
   * How the user got `effectivePlanCode`. An admin grant is deliberately not
   * dressed up as a purchase (no fake Subscription row, no fake Payment), so
   * the UI has to be able to tell the two apart and label the grant honestly.
   */
  planSource: "BILLED" | "ADMIN_GRANT";
  /** When an ADMIN_GRANT lapses. `null` = no expiry, or `planSource` is BILLED. */
  grantExpiresAt: Date | null;
  /** Plan baseline + capability overrides. Reward credits are NOT folded in. */
  features: PlanFeatureSet;
  credits: RewardCredits;
  /** True when the user holds any active override — the ALLOWLIST rollout's test. */
  hasOverride: boolean;
  /** Which keys sit above the plan baseline right now, for honest UI copy. */
  raisedKeys: (keyof PlanFeatureSet)[];
}

export async function getPlanContext(userId: string): Promise<PlanContext> {
  const [catalog, overrides, credits] = await Promise.all([
    getPlanCatalog(),
    getActiveOverrides(userId),
    getCredits(userId),
  ]);
  const billedPlanCode = await getBilledPlanCode(userId);

  const effectivePlanCode = overrides.planCode
    ? higherOfIn(catalog, billedPlanCode, overrides.planCode)
    : billedPlanCode;

  // The plan's own capability set, straight from the catalog. Every admin edit
  // — including `reelPerDay`, which used to need its own separate lookup — is
  // already folded in by `getPlanCatalog()`, so there is exactly one number for
  // `effectiveReelLimit`, the reel generator, Grio's context line and the
  // upgrade hints to agree on.
  //
  // Unlike `UserEntitlementOverride` below, this is not raise-only — it is the
  // plan's number, so it moves in both directions.
  const base = planFeaturesOf(catalog, effectivePlanCode);
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

  // Same shape, different reason: `matchExplain` is a boolean capability but
  // MATCH_EXPLAIN credits are counted per *question* (see rewardService), so
  // holding any at all flips the door open and the route spends one per call.
  // Callers that need "does the plan itself include this" — as opposed to "can
  // they use it right now" — must read `PLAN_FEATURES[code].matchExplain`
  // directly, exactly as the concierge route does before consuming a credit.
  if (credits.MATCH_EXPLAIN > 0 && !features.matchExplain) {
    features.matchExplain = true;
    raisedKeys.push("matchExplain");
  }

  const grantedByAdmin = effectivePlanCode !== billedPlanCode;

  return {
    billedPlanCode,
    effectivePlanCode,
    planSource: grantedByAdmin ? "ADMIN_GRANT" : "BILLED",
    grantExpiresAt: grantedByAdmin ? overrides.planExpiresAt : null,
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
 * How many cards arrive in one go — **not** how many this user may see.
 *
 * D-91 took the ceiling off the reel: a member works through every rishta that
 * exists for them, and the deck tops itself up as they go. `reelPerDay` (the
 * name is kept so no plan row has to be migrated) is now the size of one of
 * those top-ups: a delivery detail an admin can still retune, never a
 * capability one plan has more of than another.
 *
 * REEL_UNLOCK credits are deliberately *not* added any more. A credit that
 * bought extra cards has nothing left to buy once the cards are unlimited, and
 * quietly making it widen a batch instead would be a reward that reads as
 * generous while doing nothing. See `rewardService.ts` — the quests that
 * granted it now grant something that is still scarce.
 */
export function reelBatchSize(ctx: PlanContext): number {
  return ctx.features.reelPerDay;
}

/** Plan quota plus any AI_ASK credits held; null stays unlimited. */
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
  const [entitlements, profile] = await Promise.all([
    getEntitlements(userId),
    prisma.profile.findUnique({ where: { userId }, select: { incognitoEnabled: true } }),
  ]);
  if (!entitlements.viewerIdentity) return false;
  // Incognito is symmetric: while you are hidden from other people's "Viewed
  // You", theirs is closed to you. This is the enforcement point rather than a
  // UI rule, so no surface can accidentally offer the one-way version.
  //
  // Read straight from the row instead of calling `isBrowsingIncognito`, which
  // would call back into `getEntitlements` — the plan check it adds is already
  // satisfied here (incognitoBrowse and viewerIdentity are both Premium, so a
  // user holding the switch on without the plan has already failed the line
  // above).
  return !(entitlements.incognitoBrowse && profile?.incognitoEnabled);
}

/**
 * The photo studio — both tiers — is open to everyone, plan flags or not.
 *
 * A photo is the one thing this product asks for before it will show anyone
 * anything (D-90 reciprocity, `photoAccess.ts`), and the member most likely to
 * have a soft, badly lit photo is exactly the member on FREE. Charging them to
 * fix it taxes the step the whole reel depends on, so both the deterministic
 * clean-up and the generative relight are handed over without a gate.
 *
 * Written as one switch rather than by editing `BUILTIN_PLAN_DEFAULTS`: plans
 * are admin-editable rows now (`getPlanCatalog()`), so a code-side default
 * change can be silently overridden by whatever the `plans` table already
 * stores. This sits above the catalog and cannot be.
 *
 * What is NOT removed by this: `ULTRA_ENHANCE_DAILY_LIMIT` (4/day, see
 * `photoUltraEnhance.ts`). The generative tier bills a real API call per use,
 * so the *cap* stays — the plan no longer buys access, the cap still bounds
 * the spend. Set this to `false` and both tools hand themselves back to
 * `photoEnhance` / `photoUltraEnhance` in the plan catalog, unchanged.
 */
const PHOTO_STUDIO_UNGATED = true;

/** Whether this user may use the deterministic photo clean-up (open to all — see `PHOTO_STUDIO_UNGATED`). */
export async function canUsePhotoEnhance(userId: string): Promise<boolean> {
  if (PHOTO_STUDIO_UNGATED) return true;
  return (await getEntitlements(userId)).photoEnhance;
}

/** Whether this user may use the generative "ultra realistic" relight (open to all, still capped per day). */
export async function canUsePhotoUltraEnhance(userId: string): Promise<boolean> {
  if (PHOTO_STUDIO_UNGATED) return true;
  return (await getEntitlements(userId)).photoUltraEnhance;
}

/**
 * Whether this user may talk to Grio about one specific rishta (Premium).
 *
 * Note what this gate is *not*: the deterministic breakdown behind it
 * (`getFitBreakdown`) has no gate at all and ships to FREE. This only decides
 * whether the AI conversation on top of that breakdown opens — which is why a
 * `false` here should never hide the score card, only the chat entry point.
 */
export async function canExplainMatch(userId: string): Promise<boolean> {
  return (await getEntitlements(userId)).matchExplain;
}

/** Whether this user may talk to Grio out loud (Standard+) — see `grioVoice`. */
export async function canUseGrioVoice(userId: string): Promise<boolean> {
  return (await getEntitlements(userId)).grioVoice;
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
export async function nextPlanUp(code: PlanCode): Promise<PlanCode | null> {
  return nextPlanUpIn(await getPlanCatalog(), code);
}

/*
 * `reelUpgradeHint` used to live here: the next plan's name and reel count,
 * shown when a member hit the end of the day's fifteen. D-91 deleted the
 * moment it sold into — the reel ends when the *pool* ends, and no plan on
 * sale has ever had more rishtey in it than FREE (D-90: "paisa reach nahi
 * khareedta"). An upgrade card at that moment would have been an offer to buy
 * more of something nobody is short of.
 */
