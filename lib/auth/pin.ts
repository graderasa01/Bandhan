import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { JWT_ALG, jwtSecretKey } from "@/lib/auth/jwt";

/**
 * Quick-unlock PIN — the household-privacy layer, deliberately *not* an
 * authentication layer.
 *
 * `bt_session` is still the only thing that proves who you are; this file
 * decides something narrower and more domestic: whether the person holding
 * the phone right now is the account owner, or the brother who picked it up
 * off the table. That distinction is the whole feature. Matrimony accounts in
 * India live on shared handsets, and the thing users actually fear is not a
 * remote attacker but a relative scrolling their chats.
 *
 * Everything below follows from that framing:
 *   - Losing the PIN is a nuisance, not a lockout — "Forgot PIN?" logs out and
 *     sends you to the normal login form. There is no recovery flow to phish,
 *     and none is needed, because the password already recovers everything.
 *   - The lock is a *display* gate, enforced where the screen is drawn rather
 *     than at the API layer. Someone who can drive fetch() from devtools on an
 *     unlocked session is not the threat model; a family member tapping around
 *     is.
 *   - app/user/layout.tsx `redirect`s to /lock. It does **not** render the lock
 *     in place of the page: that variant was tried, measured, and leaks the
 *     page's RSC flight payload into the same 200 HTML document. Do not
 *     "simplify" it back — app/lock/page.tsx records the measurement.
 *
 * Rules and lengths shared with the client live in `pinShared.ts` — this file
 * is `server-only` and cannot be imported from the lock screen.
 */

export * from "@/lib/auth/pinShared";

/**
 * A browser-session cookie (no `expires`/`max-age`), on purpose: closing the
 * browser should re-lock. The signed payload carries its own 8-hour `exp` on
 * top of that, so a phone whose browser is never actually closed still
 * relocks on its own instead of staying open forever.
 */
export const PIN_UNLOCK_COOKIE = "bt_pin_ok";
const PIN_UNLOCK_TTL_SECONDS = 8 * 60 * 60;

/**
 * Signed rather than a bare `"1"` for one reason that actually matters: it is
 * bound to a specific user *and* a specific `pinSetAt`. Without the binding, a
 * cookie left behind by whoever used the phone before would silently unlock
 * the next account to log in on it — precisely the scenario the feature exists
 * to prevent — and changing the PIN would leave every older unlock valid.
 */
interface PinUnlockClaims {
  sub: string;
  /** `pinSetAt` epoch ms — re-setting or removing the PIN invalidates old unlocks. */
  psa: number;
}

export async function issuePinUnlockCookie(userId: string, pinSetAt: Date) {
  const token = await new SignJWT({ psa: pinSetAt.getTime() })
    .setProtectedHeader({ alg: JWT_ALG })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + PIN_UNLOCK_TTL_SECONDS)
    .sign(jwtSecretKey());

  const jar = await cookies();
  jar.set(PIN_UNLOCK_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

export async function clearPinUnlockCookie() {
  const jar = await cookies();
  jar.delete(PIN_UNLOCK_COOKIE);
}

/**
 * True only when the cookie is present, signed by us, unexpired, and issued
 * for *this* user's *current* PIN. Every other state reads as locked — the
 * safe direction for a privacy gate.
 */
export async function isPinUnlocked(userId: string, pinSetAt: Date | null): Promise<boolean> {
  if (!pinSetAt) return true; // no PIN set → nothing to unlock

  const jar = await cookies();
  const token = jar.get(PIN_UNLOCK_COOKIE)?.value;
  if (!token) return false;

  try {
    const { payload } = await jwtVerify(token, jwtSecretKey(), { algorithms: [JWT_ALG] });
    const claims = payload as unknown as PinUnlockClaims;
    return claims.sub === userId && claims.psa === pinSetAt.getTime();
  } catch {
    return false;
  }
}
