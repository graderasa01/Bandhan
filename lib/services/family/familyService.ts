import "server-only";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { createFamilySession } from "@/lib/auth/familySession";
import { getFamilySeatLimit } from "@/lib/services/plans/entitlements";
import type { FamilyMember, FamilyRelation } from "@prisma/client";

// Re-exported so existing server-side call sites don't need two import lines —
// `familyConstants.ts` is the actual (client-safe) source of truth for both.
export { FAMILY_RELATION_LABELS, permissionsFor, type FamilyPermissions } from "@/lib/services/family/familyConstants";

/**
 * Family Circle (D-03, Phase 4). The core design call: no password, no PIN.
 *
 * The invite link's token is the entire credential — tapping the one join
 * button on `/f/[token]` *is* proving you're the intended person, the same
 * way holding a house key proves you're allowed in. Nothing is typed, so
 * there's nothing to phish beyond the link itself.
 *
 * What makes that an acceptable trade rather than a shortcut:
 *  1. The link only *binds a new device* for 48 hours after it's issued —
 *     a stale forwarded copy can't seat someone later, though a device that
 *     already bound keeps working (see `familySession.ts`'s sliding 90-day
 *     session).
 *  2. The owner can see exactly when a seat was claimed and revoke it in one
 *     tap — `listFamilyMembers`.
 *  3. Even a wrongly-bound session is capped hard by role, not by a password:
 *     view-only, and the chat/interest routes are on a cookie a family
 *     session can never present at all (see `familySession.ts`'s header).
 */

const INVITE_WINDOW_HOURS = 48;

function generateToken(): string {
  return randomBytes(16).toString("base64url");
}

export type FamilyServiceResult<T = { member: FamilyMember }> =
  | ({ ok: true } & T)
  | { ok: false; error: string; message: string; status: number };

export async function inviteFamilyMember(
  ownerUserId: string,
  params: { displayName: string; relation: FamilyRelation },
): Promise<FamilyServiceResult> {
  const displayName = params.displayName.trim();
  if (!displayName) {
    return { ok: false, error: "VALIDATION_FAILED", message: "Naam chahiye.", status: 422 };
  }

  const [limit, activeCount, existing] = await Promise.all([
    getFamilySeatLimit(ownerUserId),
    prisma.familyMember.count({ where: { ownerUserId, status: { not: "REVOKED" } } }),
    prisma.familyMember.findUnique({ where: { ownerUserId_displayName: { ownerUserId, displayName } } }),
  ]);

  if (!existing && activeCount >= limit) {
    return {
      ok: false,
      error: "SEAT_LIMIT",
      message: `Aapke plan me sirf ${limit} family seat${limit > 1 ? "s" : ""} hain.`,
      status: 403,
    };
  }

  if (existing && existing.status !== "REVOKED") {
    return {
      ok: false,
      error: "DUPLICATE_NAME",
      message: "Is naam se ek member pehle se hai. Alag naam chunein (jaise \"Papa\" aur \"Chacha\").",
      status: 409,
    };
  }

  const inviteToken = generateToken();
  const inviteExpiresAt = new Date(Date.now() + INVITE_WINDOW_HOURS * 60 * 60 * 1000);

  // Re-inviting a previously revoked name reuses the row (the unique index on
  // (ownerUserId, displayName) would otherwise block a fresh insert) rather
  // than accumulating dead rows per name.
  const member = existing
    ? await prisma.familyMember.update({
        where: { id: existing.id },
        data: { relation: params.relation, status: "INVITED", inviteToken, inviteExpiresAt, boundAt: null, revokedAt: null },
      })
    : await prisma.familyMember.create({
        data: { ownerUserId, displayName, relation: params.relation, inviteToken, inviteExpiresAt },
      });

  return { ok: true, member };
}

/** Fresh token + window on the same row — used both to resend an unclaimed invite and to seat a second device. */
export async function reinviteFamilyMember(ownerUserId: string, id: string): Promise<FamilyServiceResult> {
  const member = await prisma.familyMember.findUnique({ where: { id } });
  if (!member || member.ownerUserId !== ownerUserId) {
    return { ok: false, error: "NOT_FOUND", message: "Member nahi mila.", status: 404 };
  }

  const inviteToken = generateToken();
  const inviteExpiresAt = new Date(Date.now() + INVITE_WINDOW_HOURS * 60 * 60 * 1000);
  const updated = await prisma.familyMember.update({
    where: { id },
    data: { inviteToken, inviteExpiresAt, status: "INVITED", boundAt: null, revokedAt: null },
  });
  // A fresh invite means "start over" — any device bound under the old
  // invite stops working, matching the "lost phone" case this button exists
  // for. If nothing was actually wrong, they just tap the new link again.
  await prisma.familySession.updateMany({ where: { familyMemberId: id, revokedAt: null }, data: { revokedAt: new Date() } });

  return { ok: true, member: updated };
}

export async function revokeFamilyMember(ownerUserId: string, id: string): Promise<FamilyServiceResult> {
  const member = await prisma.familyMember.findUnique({ where: { id } });
  if (!member || member.ownerUserId !== ownerUserId) {
    return { ok: false, error: "NOT_FOUND", message: "Member nahi mila.", status: 404 };
  }

  const [updated] = await prisma.$transaction([
    prisma.familyMember.update({ where: { id }, data: { status: "REVOKED", revokedAt: new Date() } }),
    prisma.familySession.updateMany({ where: { familyMemberId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);

  return { ok: true, member: updated };
}

export async function listFamilyMembers(ownerUserId: string): Promise<FamilyMember[]> {
  return prisma.familyMember.findMany({ where: { ownerUserId }, orderBy: { createdAt: "desc" } });
}

export type ResolvedInvite =
  | { status: "not_found" }
  | { status: "expired" }
  | { status: "revoked" }
  | { status: "ok"; member: FamilyMember; ownerName: string };

/** Read-only — used by the join page before anyone has tapped anything. */
export async function resolveInvite(token: string): Promise<ResolvedInvite> {
  const member = await prisma.familyMember.findUnique({
    where: { inviteToken: token },
    include: { owner: { select: { fullName: true } } },
  });
  if (!member) return { status: "not_found" };
  if (member.status === "REVOKED") return { status: "revoked" };
  // Already-bound devices keep working past the window (their own session
  // cookie carries them); the window only gates *new* binds via this token.
  if (member.status === "INVITED" && member.inviteExpiresAt < new Date()) return { status: "expired" };

  return { status: "ok", member, ownerName: member.owner.fullName };
}

export interface FamilyActivityItem {
  id: string;
  kind: "SHORTLIST" | "NOTE";
  familyMemberName: string;
  targetDisplayName: string;
  noteBody?: string;
  createdAt: string;
}

/**
 * The retention hook the whole feature is built around: "Papa ne Priya ko
 * shortlist ki" is more likely to bring someone back than any push copy this
 * app could write itself. Shortlist adds and notes are the only two actions
 * a family session can take, so they're the only two sources here.
 */
export async function getRecentFamilyActivity(ownerUserId: string, limit = 3): Promise<FamilyActivityItem[]> {
  const [shortlists, notes] = await Promise.all([
    prisma.shortlist.findMany({
      where: { userId: ownerUserId, addedByFamilyMemberId: { not: null } },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        addedByFamilyMember: { select: { displayName: true } },
        targetProfile: { select: { displayName: true } },
      },
    }),
    prisma.familyNote.findMany({
      where: { familyMember: { ownerUserId } },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        familyMember: { select: { displayName: true } },
        targetProfile: { select: { displayName: true } },
      },
    }),
  ]);

  const items: FamilyActivityItem[] = [
    ...shortlists
      .filter((s) => s.addedByFamilyMember)
      .map((s) => ({
        id: s.id,
        kind: "SHORTLIST" as const,
        familyMemberName: s.addedByFamilyMember!.displayName,
        targetDisplayName: s.targetProfile.displayName ?? "Profile",
        createdAt: s.createdAt.toISOString(),
      })),
    ...notes.map((n) => ({
      id: n.id,
      kind: "NOTE" as const,
      familyMemberName: n.familyMember.displayName,
      targetDisplayName: n.targetProfile.displayName ?? "Profile",
      noteBody: n.body,
      createdAt: n.createdAt.toISOString(),
    })),
  ];

  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

export type JoinResult = ResolvedInvite | { status: "joined"; member: FamilyMember };

/**
 * The one mutating action in this whole flow, and it only ever runs from an
 * explicit button tap (`POST /api/f/[token]/join`) — never from the page's
 * own GET. WhatsApp, iMessage and most chat apps pre-fetch a link's page to
 * build a preview card *before* a human ever taps it; if binding happened on
 * GET, that crawler request would silently consume the invite.
 */
export async function joinFamily(token: string, userAgent?: string): Promise<JoinResult> {
  const resolved = await resolveInvite(token);
  if (resolved.status !== "ok") return resolved;

  await createFamilySession(resolved.member.id, userAgent);

  const member =
    resolved.member.status === "INVITED"
      ? await prisma.familyMember.update({ where: { id: resolved.member.id }, data: { status: "ACTIVE", boundAt: new Date() } })
      : resolved.member;

  return { status: "joined", member };
}
