import "server-only";
import { prisma } from "@/lib/db/prisma";
import { maskEmail, maskMobile } from "@/lib/services/partner/sanitize";
import type { Role, UserStatus } from "@prisma/client";

/**
 * The admin's view of an account.
 *
 * Two rules this module holds, both borrowed from surfaces that already got
 * them right:
 *
 *  1. **Contact details are masked before they reach the client bundle** — the
 *     same call `/admin/partners` and `/admin/voice-access` make. An admin
 *     scanning a user list does not need raw phone numbers on screen, and a
 *     list that ships them is a list that leaks them into every screenshot,
 *     support ticket and browser cache.
 *  2. **Status changes are audited, and need a reason.** Suspending someone is
 *     the most consequential button in this panel; `UserEntitlementOverride`
 *     already established "no override without a written reason" for a far
 *     smaller action, so this holds the same line.
 */

export interface AdminUserRow {
  id: string;
  fullName: string;
  maskedMobile: string | null;
  maskedEmail: string | null;
  role: Role;
  status: UserStatus;
  profileStatus: string | null;
  planCode: string | null;
  joinedAt: string;
  lastLoginAt: string | null;
}

export interface AdminUserSearch {
  query?: string;
  status?: UserStatus;
  role?: Role;
  page?: number;
}

const PAGE_SIZE = 25;

export async function searchUsers(
  params: AdminUserSearch,
): Promise<{ rows: AdminUserRow[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, params.page ?? 1);
  const q = params.query?.trim();

  const where = {
    deletedAt: null,
    ...(params.status ? { status: params.status } : {}),
    ...(params.role ? { role: params.role } : {}),
    // Searching by name/mobile/email against the *stored* values, even though
    // only masked versions are ever rendered — an admin typing a full number
    // they already have from a support call must still find the account.
    ...(q
      ? {
          OR: [
            { fullName: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { mobile: { contains: q } },
          ],
        }
      : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        fullName: true,
        mobile: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        lastLoginAt: true,
        profile: { select: { profileStatus: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  // Plan comes from the live subscription rather than a column on User, so it
  // is fetched for the page's users only — one extra query per page, not one
  // per row.
  const subs = await prisma.subscription.findMany({
    where: {
      userId: { in: users.map((u) => u.id) },
      status: { in: ["ACTIVE", "CANCELLED"] },
      currentPeriodEnd: { gt: new Date() },
    },
    select: { userId: true, planCode: true },
  });
  const planByUser = new Map(subs.map((s) => [s.userId, s.planCode as string]));

  return {
    rows: users.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      maskedMobile: u.mobile ? maskMobile(u.mobile) : null,
      maskedEmail: u.email ? maskEmail(u.email) : null,
      role: u.role,
      status: u.status,
      profileStatus: u.profile?.profileStatus ?? null,
      planCode: planByUser.get(u.id) ?? "FREE",
      joinedAt: u.createdAt.toISOString().slice(0, 10),
      lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString().slice(0, 10) : null,
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
  };
}

/** The only transitions this panel performs. DELETED is deliberately absent — see below. */
export type UserStatusAction = "SUSPEND" | "BLOCK" | "REACTIVATE";

const NEXT_STATUS: Record<UserStatusAction, UserStatus> = {
  SUSPEND: "SUSPENDED",
  BLOCK: "BLOCKED",
  REACTIVATE: "ACTIVE",
};

export async function setUserStatus(params: {
  actorId: string;
  userId: string;
  action: UserStatusAction;
  reason: string;
}): Promise<{ ok: true; status: UserStatus } | { ok: false; message: string; status: number }> {
  const reason = params.reason.trim();
  if (reason.length < 4) {
    return { ok: false, message: "Reason likhna zaroori hai.", status: 400 };
  }

  const target = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { id: true, status: true, role: true, deletedAt: true },
  });
  if (!target || target.deletedAt) {
    return { ok: false, message: "User nahi mila.", status: 404 };
  }

  // An admin locking themselves — or another admin — out of the panel through
  // the panel is not a recoverable mistake from inside the app.
  if (target.role === "ADMIN") {
    return { ok: false, message: "Admin account ka status yahan se nahi badla ja sakta.", status: 403 };
  }
  if (params.actorId === params.userId) {
    return { ok: false, message: "Apna khud ka status nahi badal sakte.", status: 403 };
  }

  const next = NEXT_STATUS[params.action];
  if (target.status === next) {
    return { ok: false, message: "User pehle se hi is status mein hai.", status: 409 };
  }
  // Reactivating an account that never finished signup would mark it ACTIVE
  // with an unbuilt profile, which the member-side gates read as "ready" —
  // INCOMPLETE is a signup stage, not a punishment, so it is not ours to clear.
  if (params.action === "REACTIVATE" && target.status === "INCOMPLETE") {
    return { ok: false, message: "Ye account abhi signup hi poora nahi kar paya.", status: 409 };
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: params.userId }, data: { status: next } });

    // Suspension has to end the live session too. Flipping the column alone
    // leaves an already-signed-in user browsing on their existing cookie until
    // it expires — `getCurrentUser` only rejects BLOCKED and DELETED, so a
    // SUSPENDED user would keep full access until they happened to log out.
    // Revoked rather than deleted, matching `destroySession`/`refreshSession`:
    // the row is the audit trail of a session that existed.
    if (next !== "ACTIVE") {
      await tx.authSession.updateMany({
        where: { userId: params.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await tx.adminAuditLog.create({
      data: {
        actorId: params.actorId,
        actorRole: "ADMIN",
        actionType: `USER_${params.action}`,
        targetType: "User",
        targetId: params.userId,
        previousValue: target.status,
        newValue: next,
        reason,
      },
    });
  });

  return { ok: true, status: next };
}
