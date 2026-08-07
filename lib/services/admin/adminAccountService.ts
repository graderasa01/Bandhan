import "server-only";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";
import type { Role } from "@prisma/client";

/**
 * Accounts for the admin panel itself — ADMIN and SUPPORT, the two roles
 * `/admin/**` ever lets in. Deliberately separate from `userAdminService.ts`
 * (which handles the member directory): creating one of these grants panel
 * access, which is a different order of consequence than anything that
 * service does.
 */

export interface AdminAccountRow {
  id: string;
  fullName: string;
  email: string | null;
  role: Role;
  createdAt: string;
  lastLoginAt: string | null;
}

export async function listAdminAccounts(): Promise<AdminAccountRow[]> {
  const users = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "SUPPORT"] }, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, fullName: true, email: true, role: true, createdAt: true, lastLoginAt: true },
  });

  return users.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    role: u.role,
    createdAt: u.createdAt.toISOString().slice(0, 10),
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString().slice(0, 10) : null,
  }));
}

export type CreateAdminAccountResult = { ok: true; id: string } | { ok: false; message: string; status: number };

export async function createAdminAccount(params: {
  actorId: string;
  fullName: string;
  email: string;
  password: string;
  role: Extract<Role, "ADMIN" | "SUPPORT">;
}): Promise<CreateAdminAccountResult> {
  const email = params.email.trim().toLowerCase();
  const fullName = params.fullName.trim();

  const existing = await prisma.user.findFirst({ where: { email }, select: { id: true } });
  if (existing) {
    return { ok: false, message: "Is email se pehle se ek account maujood hai.", status: 409 };
  }

  const passwordHash = await hashPassword(params.password);

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { fullName, email, passwordHash, role: params.role, status: "ACTIVE" },
    });
    await tx.adminAuditLog.create({
      data: {
        actorId: params.actorId,
        actorRole: "ADMIN",
        actionType: "ADMIN_ACCOUNT_CREATED",
        targetType: "User",
        targetId: user.id,
        newValue: params.role,
      },
    });
    return user;
  });

  return { ok: true, id: created.id };
}
