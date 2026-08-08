import "server-only";
import { cache } from "react";
import { SignJWT } from "jose";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { JWT_ALG, SESSION_COOKIE, jwtSecretKey, verifySessionToken } from "@/lib/auth/jwt";
import type { Role, User, UserStatus } from "@prisma/client";

export { SESSION_COOKIE, verifySessionToken };

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * M02 §9.4 originally said 30 days remembered / 24 hours otherwise, and the
 * 24h default was the whole reason members kept meeting the login form: the
 * form's checkbox defaulted to off, so almost nobody was on the 30-day tier.
 * A matrimony account is checked every few days at best, so the remembered
 * tier is now 180 days and slides forward on use (`touchSession`) — a phone
 * that comes back at all should never be asked to log in again.
 *
 * The 1-day tier stays, deliberately: it is the shared-computer escape hatch,
 * and unticking the login form's checkbox is the only way to land in it.
 */
const REMEMBERED_DAYS = 180;
const PLAIN_DAYS = 1;

/** Re-issue only once a session is this far along, so ordinary browsing isn't re-signing a JWT per request. */
const SLIDE_AFTER_MS = 30 * DAY_MS;

/**
 * Which tier a session was created in, read back off its own lifetime rather
 * than stored — only the remembered tier is ever longer than two days, and
 * sliding only pushes `expiresAt` further out, so this stays true for the
 * life of the row without a schema change.
 */
function isRemembered(session: { createdAt: Date; expiresAt: Date }) {
  return session.expiresAt.getTime() - session.createdAt.getTime() > 2 * DAY_MS;
}

/**
 * Creates a real `auth_sessions` row and a JWT that names it (`jti`), then
 * sets the httpOnly cookie. The token is hashed into the row so a stolen DB
 * dump can't be replayed as a cookie, and so `destroySession`/admin
 * revocation invalidates the token immediately rather than waiting for exp.
 */
export async function createSession(params: {
  userId: string;
  role: Role;
  status: UserStatus;
  ipAddress?: string;
  userAgent?: string;
  rememberMe?: boolean;
}) {
  const durationMs = (params.rememberMe ? REMEMBERED_DAYS : PLAIN_DAYS) * DAY_MS;
  const expiresAt = new Date(Date.now() + durationMs);

  const session = await prisma.authSession.create({
    data: {
      userId: params.userId,
      sessionTokenHash: randomBytes(32).toString("hex"), // replaced once the token exists
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      expiresAt,
    },
  });

  const token = await new SignJWT({ role: params.role, status: params.status })
    .setProtectedHeader({ alg: JWT_ALG })
    .setSubject(params.userId)
    .setJti(session.id)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(jwtSecretKey());

  await prisma.authSession.update({
    where: { id: session.id },
    data: { sessionTokenHash: hashToken(token) },
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });

  return session;
}

/**
 * The authority, not the cookie: verifies signature + expiry, then confirms
 * the session row is still live (not revoked, hash matches) and the user
 * isn't blocked/deleted — three-layer check per D-32/M02 §11.3, done here so
 * every route/page that calls this gets it for free.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const claims = await verifySessionToken(token);
  if (!claims) return null;

  const session = await prisma.authSession.findUnique({ where: { id: claims.jti } });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (session.sessionTokenHash !== hashToken(token)) return null;

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  // SUSPENDED joined this list when /admin/users gained a suspend button. The
  // enum value had existed since M02 but nothing ever set or checked it, so a
  // suspension would have revoked the session and then let the same person log
  // straight back in — the status has to bite here and at login, or the button
  // is decorative.
  if (
    !user ||
    user.deletedAt ||
    user.status === "BLOCKED" ||
    user.status === "DELETED" ||
    user.status === "SUSPENDED"
  ) {
    return null;
  }

  return user;
});

/**
 * Re-signs the session cookie after something changed a claim baked into the
 * JWT (role or status) — e.g. `submitProfile()` flipping INCOMPLETE → ACTIVE.
 *
 * Without this, the DB is correct but middleware's edge-fast gate (D-32:
 * checked off the JWT, no DB round trip — see middleware.ts) keeps reading
 * the *old* status from the still-valid cookie, so a user who just finished
 * their profile would still get bounced off /user/reel etc. until they
 * logged out and back in. The old session row is revoked rather than left
 * around, matching how `destroySession` already treats a stale session.
 */
export async function refreshSession(
  user: Pick<User, "id" | "role" | "status">,
  req?: { headers: Headers },
) {
  const jar = await cookies();
  const oldToken = jar.get(SESSION_COOKIE)?.value;
  // Carried over, not re-asked: this used to drop `rememberMe` entirely, so
  // the replacement session always came back on the 24-hour tier. Finishing a
  // profile calls this (INCOMPLETE → ACTIVE), which meant the members who had
  // ticked "keep me signed in" were silently demoted to a one-day session at
  // the exact moment they started using the site.
  let remembered = true;
  if (oldToken) {
    const claims = await verifySessionToken(oldToken);
    if (claims) {
      const old = await prisma.authSession
        .findUnique({ where: { id: claims.jti }, select: { createdAt: true, expiresAt: true } })
        .catch(() => null);
      if (old) remembered = isRemembered(old);
      await prisma.authSession
        .update({ where: { id: claims.jti }, data: { revokedAt: new Date() } })
        .catch(() => {});
    }
  }

  return createSession({
    userId: user.id,
    role: user.role,
    status: user.status,
    ipAddress: req?.headers.get("x-forwarded-for") ?? undefined,
    userAgent: req?.headers.get("user-agent") ?? undefined,
    rememberMe: remembered,
  });
}

/**
 * Slides a remembered session's expiry forward so a returning member never
 * runs out the clock. Lives here but is called from a route handler, not from
 * `getCurrentUser()`: only a route handler may set a cookie, and the cookie's
 * own `expires` has to move with the row's or the browser drops the token
 * while the database still believes the session is alive.
 *
 * Re-signing is required rather than just bumping the row, because the JWT
 * carries its own `exp` — but it only happens once a month per device, so the
 * window where an in-flight parallel request still holds the previous token
 * is vanishingly small. One-day sessions are never slid; that tier exists
 * precisely so a shared computer forgets.
 */
export async function touchSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return;

  const claims = await verifySessionToken(token);
  if (!claims) return;

  const session = await prisma.authSession.findUnique({ where: { id: claims.jti } });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return;
  if (session.sessionTokenHash !== hashToken(token)) return;
  if (!isRemembered(session)) return;

  // Measured off what's left, not off `createdAt` — after the first slide the
  // row's age and its granted span both keep growing, so anything anchored to
  // creation reads "due" forever and re-signs on every single request.
  // Remaining time resets to the full window on each slide, so this fires
  // once and then goes quiet for another month.
  const remainingMs = session.expiresAt.getTime() - Date.now();
  if (remainingMs > REMEMBERED_DAYS * DAY_MS - SLIDE_AFTER_MS) return;

  const expiresAt = new Date(Date.now() + REMEMBERED_DAYS * DAY_MS);
  const fresh = await new SignJWT({ role: claims.role, status: claims.status })
    .setProtectedHeader({ alg: JWT_ALG })
    .setSubject(claims.sub)
    .setJti(session.id)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(jwtSecretKey());

  await prisma.authSession.update({
    where: { id: session.id },
    data: { sessionTokenHash: hashToken(fresh), expiresAt },
  });

  jar.set(SESSION_COOKIE, fresh, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const claims = await verifySessionToken(token);
    if (claims) {
      await prisma.authSession
        .update({ where: { id: claims.jti }, data: { revokedAt: new Date() } })
        .catch(() => {});
    }
  }
  jar.delete(SESSION_COOKIE);
}
