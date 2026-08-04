/**
 * Shared between the server-side status service and the admin client UI —
 * kept out of `statusService.ts` so importing these into a client component
 * doesn't drag Prisma into the browser bundle.
 */
export const REASON_MIN = 10;
export const REASON_MAX = 500;
