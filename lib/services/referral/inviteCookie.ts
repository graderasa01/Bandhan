import { SignJWT, jwtVerify } from "jose";
import { JWT_ALG, jwtSecretKey } from "@/lib/auth/jwt";

export const INVITE_COOKIE = "bt_inv";
/** Shorter than the referral cookie's 30 days: an invite is a specific, recent conversation. */
export const INVITE_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/**
 * Carries a `PartnerInvite.token` from the `/j/<token>` landing page through
 * to registration, so the invite can be closed out as JOINED.
 *
 * Signed for the same reason the referral cookie is: an editable invite cookie
 * would let anyone claim credit for an invite they didn't send, and invites
 * feed the same attribution that decides who gets paid. Reuses the app's
 * existing JWT secret rather than introducing a third signing scheme.
 *
 * Kept separate from `bt_ref` rather than folded into its payload — the two
 * have different lifetimes and either can arrive without the other (a bare
 * `/r/<code>` click has no invite; a suspended partner's invite has no code).
 */
export async function signInviteCookie(token: string): Promise<string> {
  return new SignJWT({ invite: token })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime(`${INVITE_COOKIE_MAX_AGE_SECONDS}s`)
    .sign(jwtSecretKey());
}

export async function readInviteCookie(value: string | undefined): Promise<string | null> {
  if (!value) return null;
  try {
    const { payload } = await jwtVerify(value, jwtSecretKey(), { algorithms: [JWT_ALG] });
    return typeof payload.invite === "string" ? payload.invite : null;
  } catch {
    return null;
  }
}
