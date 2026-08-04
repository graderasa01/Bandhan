import { SignJWT, jwtVerify } from "jose";
import { JWT_ALG, jwtSecretKey } from "@/lib/auth/jwt";

export const REFERRAL_COOKIE = "bt_ref";
export const REFERRAL_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

/**
 * Signed, not plain: an unsigned attribution cookie is trivially editable, and
 * attribution decides who gets paid. Reuses the app's existing JWT secret
 * rather than introducing a second signing scheme.
 */
export async function signReferralCookie(code: string): Promise<string> {
  return new SignJWT({ code, clicked_at: new Date().toISOString() })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime(`${REFERRAL_COOKIE_MAX_AGE_SECONDS}s`)
    .sign(jwtSecretKey());
}

export async function readReferralCookie(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, jwtSecretKey(), { algorithms: [JWT_ALG] });
    return typeof payload.code === "string" ? payload.code : null;
  } catch {
    return null;
  }
}
