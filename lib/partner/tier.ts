import type { PartnerTier } from "@prisma/client";

/**
 * Partner tiers — Bronze, Silver, Gold.
 *
 * A tier is **earned, never assigned**: it is a pure function of how many
 * referred members actually paid. No admin grants it, no partner applies for
 * it, and it is recomputed from the ledger every time it is read rather than
 * stored on the Partner row — a number that can be derived can also drift when
 * it isn't, and "why is my card still Bronze" is not a support conversation
 * worth having.
 *
 * The tier is what moves a partner's commission rate (D-12 as revised
 * 2026-08-06). Bronze pays the config's base rate; Silver and Gold add a bonus
 * on top. The rate is still uniform across every plan — a partner's own track
 * record is the only thing that changes it, which is the distinction D-12's
 * "no per-plan slabs" rule was actually protecting.
 *
 * Deliberately no demotion: a partner who earned Gold keeps it. `paidCount`
 * counts commissions ever earned, so it only ever goes up. Taking a card back
 * because someone had a slow quarter would make the whole thing feel like a
 * trap rather than a reward.
 *
 * Type-only Prisma import, so this file stays safe to pull into a client
 * component (`PartnerCard` does exactly that).
 */

export type TierThresholds = {
  silverThreshold: number;
  goldThreshold: number;
};

export type TierRates = {
  baseBps: number;
  silverBonusBps: number;
  goldBonusBps: number;
};

export const TIER_ORDER: PartnerTier[] = ["BRONZE", "SILVER", "GOLD"];

export const TIER_LABEL: Record<PartnerTier, string> = {
  BRONZE: "Bronze",
  SILVER: "Silver",
  GOLD: "Gold",
};

export function resolveTier(paidCount: number, thresholds: TierThresholds): PartnerTier {
  if (paidCount >= thresholds.goldThreshold) return "GOLD";
  if (paidCount >= thresholds.silverThreshold) return "SILVER";
  return "BRONZE";
}

/** The rate actually applied to a payment: base plus whatever the tier adds. */
export function effectiveBps(tier: PartnerTier, rates: TierRates): number {
  const bonus = tier === "GOLD" ? rates.goldBonusBps : tier === "SILVER" ? rates.silverBonusBps : 0;
  return rates.baseBps + bonus;
}

/** 1000 bps of ₹1,249 → ₹124.90. Rounded to whole paise; nothing sub-paise exists. */
export function applyBps(amountPaise: number, bps: number): number {
  return Math.round((amountPaise * bps) / 10_000);
}

/** "12%" / "12.5%" — trailing `.0` dropped, because nobody writes a rate that way. */
export function bpsToPercentDisplay(bps: number): string {
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2).replace(/0$/, "")}%`;
}

export type TierProgress = {
  tier: PartnerTier;
  /** Null at Gold — there is nothing above it. */
  nextTier: PartnerTier | null;
  /** Paid conversions still needed for `nextTier`. */
  remaining: number;
  /** 0–1, for a progress bar. Always 1 at Gold. */
  fraction: number;
  /** What reaching `nextTier` would be worth, in bps. Null at Gold. */
  nextTierBonusBps: number | null;
};

/**
 * Progress is measured from the *current* tier's threshold, not from zero —
 * a Silver partner 1 conversion into a 3→10 gap should see a bar near empty,
 * not one already 30% full because their earlier Bronze conversions still
 * count toward the total.
 */
export function tierProgress(
  paidCount: number,
  thresholds: TierThresholds,
  rates: TierRates,
): TierProgress {
  const tier = resolveTier(paidCount, thresholds);

  if (tier === "GOLD") {
    return { tier, nextTier: null, remaining: 0, fraction: 1, nextTierBonusBps: null };
  }

  const floor = tier === "SILVER" ? thresholds.silverThreshold : 0;
  const target = tier === "SILVER" ? thresholds.goldThreshold : thresholds.silverThreshold;
  const nextTier: PartnerTier = tier === "SILVER" ? "GOLD" : "SILVER";
  const span = Math.max(1, target - floor);

  return {
    tier,
    nextTier,
    remaining: Math.max(0, target - paidCount),
    fraction: Math.min(1, Math.max(0, (paidCount - floor) / span)),
    nextTierBonusBps: nextTier === "GOLD" ? rates.goldBonusBps : rates.silverBonusBps,
  };
}
