import "server-only";
import { cache } from "react";
import { SignJWT } from "jose";
import { cookies, headers } from "next/headers";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { JWT_ALG, SESSION_COOKIE, jwtSecretKey, verifySessionToken } from "@/lib/auth/jwt";
import type { Role, User, UserStatus } from "@prisma/client";

export { SESSION_COOKIE, verifySessionToken };

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/* ------------------------------------------------------------------ */
/* The native app                                                      */
/* ------------------------------------------------------------------ */

/**
 * The native app (`mobile/`) carries the very same session JWT a browser
 * keeps in `bt_session`, only in `Authorization: Bearer` — a phone app has no
 * httpOnly cookie jar it can rely on, and the platform keychain is the safer
 * home for the token anyway. Same `auth_sessions` row, same revocation, same
 * `getCurrentUser()` checks: this is a second way to *present* a session, not
 * a second kind of session.
 *
 * The app says who it is with this header on every request, and that header
 * decides which of the two carriers is read — never both. A native request is
 * judged by its bearer token alone, so a stray cookie some web view left in
 * the platform's shared jar can never sign the app in as somebody else; a
 * browser request is judged by its cookie alone, so a page script cannot
 * trade a cookie for a token it could carry off (a browser never sends this
 * header on its own, and the API grants no CORS for it).
 */
export const NATIVE_CLIENT_HEADER = "x-bandhantak-client";
const NATIVE_CLIENT_VALUE = "mobile";

/** Whether this request came from the native app — see `NATIVE_CLIENT_HEADER`. */
export async function isNativeClient(): Promise<boolean> {
  return (await headers()).get(NATIVE_CLIENT_HEADER) === NATIVE_CLIENT_VALUE;
}

/** The session token this request presents: the bearer for the native app, the cookie for a browser. */
async function readSessionToken(): Promise<string | undefined> {
  if (await isNativeClient()) {
    const auth = (await headers()).get("authorization") ?? "";
    const match = auth.match(/^Bearer\s+(\S+)$/i);
    return match?.[1];
  }
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/**
 * `{ sessionToken }` for the native app, `{}` for a browser.
 *
 * Only the routes that just *proved* who someone is (password, OTP, a new
 * account) and the sliding refresh hand a token back, and only to the native
 * app. A browser already holds the same token as an httpOnly cookie, and a
 * token in a JSON body is exactly what that cookie exists to keep away from
 * page scripts.
 */
export async function sessionTokenForNative(token: string | null | undefined): Promise<{ sessionToken?: string }> {
  if (!token || !(await isNativeClient())) return {};
  return { sessionToken: token };
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
  // The native app always gets the remembered tier: the one-day tier is the
  // shared-computer escape hatch, and an installed app on someone's own phone
  // is the opposite case — logging out there is an explicit button.
  const native = await isNativeClient();
  const remembered = params.rememberMe || native;
  const durationMs = (remembered ? REMEMBERED_DAYS : PLAIN_DAYS) * DAY_MS;
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

  // The native app keeps the token itself (see `sessionTokenForNative`); a
  // cookie on its response would only sit in the platform's shared jar.
  if (!native) {
    const jar = await cookies();
    jar.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      expires: expiresAt,
      path: "/",
    });
  }

  return Object.assign(session, { token });
}

/**
 * The authority, not the cookie: verifies signature + expiry, then confirms
 * the session row is still live (not revoked, hash matches) and the user
 * isn't blocked/deleted — three-layer check per D-32/M02 §11.3, done here so
 * every route/page that calls this gets it for free.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = await readSessionToken();
  if (!token) return null;

  const claims = await verifySessionToken(token);
  if (!claims) return null;

  // Both lookups key off the already-verified JWT (`jti` and `sub`), so
  // neither waits on the other's answer — issued as one round trip rather
  // than two. That matters more than it looks: this runs on every
  // authenticated request, and the database is a network hop away, so the
  // sequential version spent a whole round trip proving the session row was
  // live before it would even ask who the user was.
  //
  // The cost is one wasted `user` query when a session turns out to be dead.
  // That path is the rare one — a revoked or expired cookie — while the path
  // this speeds up is every page view. The checks below still happen in the
  // same order and still reject for exactly the same reasons.
  const [session, user] = await Promise.all([
    prisma.authSession.findUnique({ where: { id: claims.jti } }),
    prisma.user.findUnique({ where: { id: claims.sub } }),
  ]);

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (session.sessionTokenHash !== hashToken(token)) return null;

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
 *
 * A no-op for the native app, deliberately. The claims being refreshed are
 * read only by middleware's page gate, which a native client never passes
 * through — every API route asks `getCurrentUser()`, which reads the live row.
 * Rotating here would revoke the token the app is holding mid-request, and
 * log it out the moment its profile went live.
 */
export async function refreshSession(
  user: Pick<User, "id" | "role" | "status">,
  req?: { headers: Headers },
) {
  if (await isNativeClient()) return null;

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
 * Whether this browser's cookie still describes the account the way the row
 * does. Role and status are copied into the JWT when it is signed, and
 * middleware's gate reads them from there, never from the database.
 *
 * Every write that changes one of them is meant to call `refreshSession`, but
 * not every place can: a Server Component may not set a cookie, and the
 * dashboard, `/user/me` and the reel all run `activateIfReady` while they
 * render. A member who logs in with a profile that is ready but not yet live is
 * made ACTIVE by the dashboard's own render and keeps a cookie that says
 * INCOMPLETE. From then on middleware sends every ACTIVE-only page to /bolo,
 * and /bolo, which reads the row, sends them back home: the reel never opens.
 * `/bolo` asks this to tell that loop apart from a member who really is
 * unfinished, and `/api/auth/session/refresh` asks it before re-signing.
 *
 * Always false for the native app, whose bearer never meets middleware's gate.
 */
export async function sessionClaimsStale(user: Pick<User, "role" | "status">): Promise<boolean> {
  if (await isNativeClient()) return false;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return false;
  const claims = await verifySessionToken(token);
  return claims !== null && (claims.role !== user.role || claims.status !== user.status);
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
 *
 * Returns the re-signed token when it slid, null otherwise — the native app
 * has no cookie to receive it, so `/api/auth/session` hands it over in the body
 * (the old token stops matching the row the moment this runs).
 */
export async function touchSession(): Promise<string | null> {
  const native = await isNativeClient();
  const token = await readSessionToken();
  if (!token) return null;

  const claims = await verifySessionToken(token);
  if (!claims) return null;

  const session = await prisma.authSession.findUnique({ where: { id: claims.jti } });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (session.sessionTokenHash !== hashToken(token)) return null;
  if (!isRemembered(session)) return null;

  // Measured off what's left, not off `createdAt` — after the first slide the
  // row's age and its granted span both keep growing, so anything anchored to
  // creation reads "due" forever and re-signs on every single request.
  // Remaining time resets to the full window on each slide, so this fires
  // once and then goes quiet for another month.
  const remainingMs = session.expiresAt.getTime() - Date.now();
  if (remainingMs > REMEMBERED_DAYS * DAY_MS - SLIDE_AFTER_MS) return null;

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

  if (!native) {
    const jar = await cookies();
    jar.set(SESSION_COOKIE, fresh, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      expires: expiresAt,
      path: "/",
    });
  }
  return fresh;
}

export async function destroySession() {
  const token = await readSessionToken();
  if (token) {
    const claims = await verifySessionToken(token);
    if (claims) {
      await prisma.authSession
        .update({ where: { id: claims.jti }, data: { revokedAt: new Date() } })
        .catch(() => {});
    }
  }
  if (!(await isNativeClient())) (await cookies()).delete(SESSION_COOKIE);
}

/**
 * Every other session this account holds, gone at once.
 *
 * Called from password reset: a reset happens either because the owner lost
 * their password or because someone else got hold of it, and both cases want
 * the same outcome — whoever is not the one who just set the new password
 * gets logged out everywhere, not just on the device that reset it.
 */
export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.authSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
