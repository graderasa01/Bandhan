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
  // M02 §9.4: 30 days when remembered, 24 hours otherwise.
  const durationMs = (params.rememberMe ? 30 : 1) * 24 * 60 * 60 * 1000;
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
  if (oldToken) {
    const claims = await verifySessionToken(oldToken);
    if (claims) {
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
