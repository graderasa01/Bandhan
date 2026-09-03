import { SignJWT, jwtVerify } from "jose";
import { JWT_ALG, jwtSecretKey } from "@/lib/auth/jwt";

export const MEMBER_REFERRAL_COOKIE = "bt_mref";
/** Same 30 days as the partner cookie — a shared link has the same shelf life. */
export const MEMBER_REFERRAL_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * Carries a member's share code from the `/i/<code>` landing page through to
 * registration.
 *
 * Signed for the same reason `bt_ref` is: an editable attribution cookie would
 * let anyone credit themselves with invites they never sent, and here that
 * credit converts directly into a paid plan. Reuses the app's existing JWT
 * secret rather than introducing a fourth signing scheme.
 *
 * Kept separate from `bt_ref` rather than folded into its payload — a person
 * can arrive through a bureau's poster and a friend's WhatsApp forward in the
 * same week, and the two attributions pay entirely different things (cash to
 * the bureau, plan-days to the friend). One cookie holding both would have to
 * choose, and choosing would silently delete one of them.
 */
export async function signMemberReferralCookie(code: string): Promise<string> {
  return new SignJWT({ code, clicked_at: new Date().toISOString() })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime(`${MEMBER_REFERRAL_COOKIE_MAX_AGE_SECONDS}s`)
    .sign(jwtSecretKey());
}

export async function readMemberReferralCookie(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, jwtSecretKey(), { algorithms: [JWT_ALG] });
    return typeof payload.code === "string" ? payload.code : null;
  } catch {
    return null;
  }
}
