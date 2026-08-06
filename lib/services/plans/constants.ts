/**
 * Shared between the server-side plan/commission services and the admin
 * client UI — kept out of `planService.ts` so importing these into a client
 * component doesn't drag Prisma into the browser bundle.
 */
export const MIN_PLAN_PRICE_RUPEES = 1;
export const MAX_PLAN_PRICE_RUPEES = 50_000;

/**
 * Commission is a percentage of what the member paid (D-12 as revised
 * 2026-08-06), expressed in basis points so half-percent rates need no float.
 *
 * The ceiling is 50% rather than 100% deliberately: a rate above half of the
 * subscription is almost certainly a typo — someone typing 50 meaning "50 bps"
 * — and there is no business in which we hand a partner more of the payment
 * than we keep. The floor is 1% for the same reason in the other direction.
 */
export const MIN_COMMISSION_BPS = 100;
export const MAX_COMMISSION_BPS = 5_000;

/** A tier bonus sits on top of the base, so it is capped well below it. */
export const MIN_TIER_BONUS_BPS = 0;
export const MAX_TIER_BONUS_BPS = 2_000;

/** Paid conversions needed to climb a tier — see lib/partner/tier.ts. */
export const MIN_TIER_THRESHOLD = 1;
export const MAX_TIER_THRESHOLD = 1_000;
