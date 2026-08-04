import "server-only";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db/prisma";
import type { FamilyMember } from "@prisma/client";

/**
 * A completely separate cookie/session world from `SESSION_COOKIE`
 * (`lib/auth/session.ts`). This is deliberate, not an oversight: D-03's rule
 * — a family member can never reach chat — holds structurally as long as
 * `/api/messages/*`, `/api/interests/*` and every `/user/*` route only ever
 * check `SESSION_COOKIE`. A family session literally cannot present one, so
 * there's no role check to remember to add on a new route later; the two
 * systems just don't intersect.
 *
 * No password, no PIN, no JWT — a family member has no claims worth signing
 * (no role, no status to fast-path in edge middleware, since these routes
 * aren't in `middleware.ts`'s matcher at all). The invite link's token is the
 * only credential this whole feature has; see `familyService.ts` for why
 * that's an acceptable trade rather than a shortcut.
 */

export const FAMILY_SESSION_COOKIE = "bt_family_session";
const SESSION_DAYS = 90;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createFamilySession(familyMemberId: string, userAgent?: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.familySession.create({
    data: { familyMemberId, sessionTokenHash: hashToken(token), userAgent, expiresAt },
  });

  const jar = await cookies();
  jar.set(FAMILY_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
}

/**
 * The authority, not the cookie: a browser-side `expires` attribute is a
 * courtesy, not a security boundary, so validity is re-checked against the
 * DB row every time. A live session's window slides forward on each check —
 * an inactive one still lapses after `SESSION_DAYS`.
 */
export async function getCurrentFamilyMember(): Promise<FamilyMember | null> {
  const jar = await cookies();
  const token = jar.get(FAMILY_SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.familySession.findUnique({
    where: { sessionTokenHash: hashToken(token) },
    include: { familyMember: true },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (session.familyMember.status === "REVOKED") return null;

  const newExpiry = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.familySession
    .update({ where: { id: session.id }, data: { lastUsedAt: new Date(), expiresAt: newExpiry } })
    .catch(() => {}); // a failed touch shouldn't fail the request that triggered it

  return session.familyMember;
}

export async function destroyFamilySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(FAMILY_SESSION_COOKIE)?.value;
  if (token) {
    await prisma.familySession.updateMany({
      where: { sessionTokenHash: hashToken(token) },
      data: { revokedAt: new Date() },
    });
  }
  jar.delete(FAMILY_SESSION_COOKIE);
}
