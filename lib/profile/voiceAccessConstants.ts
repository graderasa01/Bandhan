/**
 * Shared with both the client-side request form and the server route/service —
 * kept in its own file, with no Prisma import, specifically so client
 * components can pull these two numbers in without dragging a database
 * client into the browser bundle.
 */
export const VOICE_REASON_MIN = 10;
export const VOICE_REASON_MAX = 400;
