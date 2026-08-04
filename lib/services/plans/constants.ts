/**
 * Shared between the server-side plan/commission services and the admin
 * client UI — kept out of `planService.ts` so importing these into a client
 * component doesn't drag Prisma into the browser bundle.
 */
export const MIN_PLAN_PRICE_RUPEES = 1;
export const MAX_PLAN_PRICE_RUPEES = 50_000;

export const MIN_COMMISSION_RUPEES = 1;
export const MAX_COMMISSION_RUPEES = 5_000;
