/**
 * Internal review language must never reach the partner. An admin writing
 * "suspicious velocity pattern, possible fraud" in a rejection reason is
 * writing a note for the team; the partner sees a cleaned, shorter version.
 */
const INTERNAL_TERMS = [/fraud/gi, /suspicious/gi, /high risk/gi, /blacklist/gi];
const MAX_USER_FACING_LENGTH = 200;

export function sanitizeReasonForPartner(reason: string): string {
  let out = reason;
  for (const term of INTERNAL_TERMS) out = out.replace(term, "review");
  out = out.replace(/\s+/g, " ").trim();
  return out.length > MAX_USER_FACING_LENGTH ? `${out.slice(0, MAX_USER_FACING_LENGTH - 1)}…` : out;
}

/** 9812345612 → 98XXXXXX12 */
export function maskMobile(mobile: string): string {
  if (mobile.length < 4) return "XXXX";
  return `${mobile.slice(0, 2)}${"X".repeat(Math.max(0, mobile.length - 4))}${mobile.slice(-2)}`;
}

/** ram@example.com → r***@example.com */
export function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email[0]}***${email.slice(at)}`;
}
