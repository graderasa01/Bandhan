import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { revokeDelegation } from "@/lib/services/managedProfile/delegationService";
import { createNotice } from "@/lib/services/notice/noticeService";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

/**
 * Revoke a helper's access.
 *
 * Takes effect immediately, with nothing to invalidate: every delegated read
 * and write re-reads the row through `hasDelegatedPermission`, so the
 * delegate's *next* request is already denied. Nothing about the owner's
 * profile, their confirmed values or their history is touched — ending a
 * helping relationship costs the owner none of the work that came out of it.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ delegationId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { delegationId } = await params;
  const result = await revokeDelegation(user.id, delegationId, user.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }

  // Telling the delegate is a courtesy and a safety property both: a helper
  // who does not know they were revoked keeps trying, and every attempt looks
  // to them like a bug rather than a boundary.
  if (result.delegation.delegateUserId) {
    const owner = await prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } });
    await createNotice({
      userId: result.delegation.delegateUserId,
      kind: "FAMILY_ACTION",
      title: "Profile access hata diya gaya",
      body: `${owner?.fullName ?? "Member"} ne aapka profile access hata diya hai.`,
      href: "/partner/clients",
      relatedId: result.delegation.id,
    });
  }

  return NextResponse.json({ ok: true });
}
