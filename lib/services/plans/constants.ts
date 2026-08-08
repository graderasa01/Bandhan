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

/**
 * Days a commission is held before it can be paid out — the refund window.
 *
 * The floor is 1, not 0: paying a partner the same day a card was charged
 * means paying out money that can still be charged back, and "we already sent
 * it" is not a recoverable position. The ceiling is 90 because a hold longer
 * than a quarter stops reading as a refund window and starts reading as us
 * keeping the money.
 */
export const MIN_MATURITY_DAYS = 1;
export const MAX_MATURITY_DAYS = 90;

/**
 * Minimum balance before a partner may request a withdrawal, in paise.
 *
 * The floor is ₹100 rather than ₹0 because every transfer costs a fixed amount
 * of bank fee and admin attention; the ceiling is ₹10,000 because a minimum
 * high enough that most partners never reach it is indistinguishable, from
 * their side, from not paying them at all.
 */
export const MIN_WITHDRAWAL_FLOOR_PAISE = 10_000;
export const MAX_WITHDRAWAL_FLOOR_PAISE = 1_000_000;

/**
 * Rishta Reel cards per day, the one plan capability an admin can retune
 * (see the `Plan.reelPerDay` note in schema.prisma for why this one and not
 * the rest of the D-11 ladder).
 *
 * The floor is 1, not 0: a plan that shows zero rishtey a day isn't a cheaper
 * plan, it's a broken app, and "switch the reel off for FREE users" is a
 * product decision that should cost a deploy rather than one stray keystroke
 * in an admin form. The ceiling is 100 because the reel is deliberately a
 * finite daily ritual (D-02, no infinite scroll) — a number in the thousands
 * would quietly turn it into the feed the product decided not to be, and the
 * candidate pool cannot fill it honestly anyway.
 */
export const MIN_REEL_PER_DAY = 1;
export const MAX_REEL_PER_DAY = 100;
