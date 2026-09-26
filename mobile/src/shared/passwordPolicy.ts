// GENERATED from lib/auth/passwordPolicy.ts by mobile/scripts/sync-catalog.ts — do not edit.
// The web file is the one source of truth: change it there, then run
// `npm run sync-catalog` in mobile/. `npm run check-catalog` fails on drift.

/**
 * The one password rule, readable from both sides of the wire.
 *
 * `/api/auth/password` (setting one later), `/api/bolo/complete` (an account
 * no code can verify, so it must have one) and the screens that collect a
 * password all check the same length — a screen that accepted seven characters
 * the server then refused would be a form that fails on submit for no visible
 * reason.
 *
 * Isomorphic: no Node imports, so client components can read it too.
 */

export const PASSWORD_MIN_LENGTH = 8;

/** bcrypt only reads 72 bytes; anything far past that is a paste accident, or someone probing the hash cost. */
export const PASSWORD_MAX_LENGTH = 128;

export function isAcceptablePassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= PASSWORD_MIN_LENGTH && value.length <= PASSWORD_MAX_LENGTH;
}
