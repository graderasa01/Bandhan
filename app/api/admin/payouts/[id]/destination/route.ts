import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { prisma } from "@/lib/db/prisma";
import { revealPayoutDestination } from "@/lib/services/payouts/payoutService";

export const runtime = "nodejs";

/**
 * The full account number for one withdrawal, plus an audit row saying who
 * looked. POST, not GET — it has a side effect and must never fire on a
 * prefetch.
 *
 * `[id]` is the *withdrawal* id, not the partner's: an admin only ever needs
 * these details in the act of paying a specific request, and keying the reveal
 * to the withdrawal keeps that true.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const { id } = await params;
  const withdrawal = await prisma.partnerWithdrawal.findUnique({
    where: { id },
    select: { partnerId: true, status: true },
  });
  if (!withdrawal) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Withdrawal nahi mili." }, { status: 404 });
  }
  if (withdrawal.status === "PAID" || withdrawal.status === "REJECTED") {
    return NextResponse.json(
      { error: "BAD_STATE", message: "Ye withdrawal band ho chuki hai — details ki ab zaroorat nahi." },
      { status: 409 },
    );
  }

  const result = await revealPayoutDestination({
    partnerId: withdrawal.partnerId,
    actorId: user.id,
    actorRole: user.role,
  });
  if (!result.ok) {
    return NextResponse.json({ error: "REVEAL_FAILED", message: result.message }, { status: result.status });
  }

  return NextResponse.json({ ok: true, destination: result.destination });
}
