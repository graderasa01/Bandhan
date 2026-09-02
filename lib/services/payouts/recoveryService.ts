import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

/**
 * What a partner owes back after a refund landed on money that had already
 * left.
 *
 * ## Why this exists
 *
 * Phase 2's reversal could take back money that was still HELD or RELEASED.
 * It could not take back money that had been paid into a bank account — and an
 * admin refunding a COMPLETED booking is not an edge case, it is the most
 * serious kind of complaint, the kind discovered after the window closed. Until
 * now the platform silently absorbed the loss and no row recorded it.
 *
 * ## The one number everything reads
 *
 * `amountPaise - settledPaise`. The balance screen subtracts it, the next
 * withdrawal pays it down, and an admin can waive what is left. Three surfaces,
 * one arithmetic, so they cannot disagree about what somebody owes.
 *
 * ## What this is not
 *
 * Not a collection system. There is no way here to charge a card, and the
 * balance floors at zero rather than showing a negative — a payout screen
 * demanding money is a threat this product cannot carry out, and should not
 * make. A debt is recovered out of future earnings or it is waived.
 */

export const RECOVERY_REASON_REFUND_AFTER_PAYOUT =
  "Is booking ka refund hua, par aapki earning pehle hi bheji ja chuki thi.";
export const RECOVERY_REASON_REFUND_IN_FLIGHT =
  "Is booking ka refund hua jab aapki payout request bheji ja rahi thi.";

type Tx = Prisma.TransactionClient;

/**
 * Records a debt. Idempotent per allocation: `allocationId` is unique, so a
 * replayed refund cannot charge a partner twice for one booking.
 */
export async function recordRecovery(
  tx: Tx,
  input: { partnerId: string; bookingId: string | null; allocationId: string | null; amountPaise: number; reason: string },
): Promise<void> {
  if (input.amountPaise <= 0) return;

  if (input.allocationId) {
    const existing = await tx.partnerRecovery.findUnique({
      where: { allocationId: input.allocationId },
      select: { id: true },
    });
    if (existing) return;
  }

  await tx.partnerRecovery.create({
    data: {
      partnerId: input.partnerId,
      bookingId: input.bookingId,
      allocationId: input.allocationId,
      amountPaise: input.amountPaise,
      reason: input.reason,
    },
  });
}

/** Outstanding total for one partner. The balance screen's subtrahend. */
export async function openRecoveryPaise(partnerId: string, client: Tx | typeof prisma = prisma): Promise<number> {
  const rows = await client.partnerRecovery.findMany({
    where: { partnerId, status: "OPEN" },
    select: { amountPaise: true, settledPaise: true },
  });
  return rows.reduce((n, r) => n + Math.max(0, r.amountPaise - r.settledPaise), 0);
}

/**
 * Pays debts down out of a withdrawal, oldest first.
 *
 * Returns how much was taken, which the caller subtracts from the transfer.
 * Partial settlement is the normal case and is why `settledPaise` exists — a
 * ₹2,000 debt against a ₹1,500 payout takes the ₹1,500 and stays open for ₹500.
 */
export async function settleRecoveries(
  tx: Tx,
  partnerId: string,
  withdrawalId: string,
  availablePaise: number,
  now = new Date(),
): Promise<number> {
  if (availablePaise <= 0) return 0;

  const rows = await tx.partnerRecovery.findMany({
    where: { partnerId, status: "OPEN" },
    orderBy: { createdAt: "asc" },
    select: { id: true, amountPaise: true, settledPaise: true },
  });

  let budget = availablePaise;
  let taken = 0;

  for (const r of rows) {
    if (budget <= 0) break;
    const outstanding = Math.max(0, r.amountPaise - r.settledPaise);
    if (outstanding === 0) continue;

    const pay = Math.min(outstanding, budget);
    const settledPaise = r.settledPaise + pay;
    const cleared = settledPaise >= r.amountPaise;

    await tx.partnerRecovery.update({
      where: { id: r.id },
      data: {
        settledPaise,
        ...(cleared
          ? { status: "SETTLED", settledAt: now, settledWithdrawalId: withdrawalId }
          : // A part-paid debt keeps pointing at the withdrawal that last paid
            // into it, so the partner's statement can say where the money went
            // without a second table of payments-against-debts.
            { settledWithdrawalId: withdrawalId }),
      },
    });

    budget -= pay;
    taken += pay;
  }

  return taken;
}

export interface RecoveryView {
  id: string;
  amountPaise: number;
  settledPaise: number;
  outstandingPaise: number;
  reason: string;
  status: string;
  createdAt: string;
  settledAt: string | null;
  waiveReason: string | null;
}

export async function listRecoveries(partnerId: string, limit = 30): Promise<RecoveryView[]> {
  const rows = await prisma.partnerRecovery.findMany({
    where: { partnerId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    amountPaise: r.amountPaise,
    settledPaise: r.settledPaise,
    outstandingPaise: Math.max(0, r.amountPaise - r.settledPaise),
    reason: r.reason,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    settledAt: r.settledAt?.toISOString() ?? null,
    waiveReason: r.waiveReason,
  }));
}

export type WaiveResult = { ok: true } | { ok: false; error: string; message: string; status: number };

/**
 * An admin writing a debt off.
 *
 * The row stays, with the reason on it. Deleting it would destroy the one fact
 * somebody will eventually ask about — that ₹2,000 was written off for this
 * partner, by this admin, for this stated reason.
 */
export async function waiveRecovery(params: {
  recoveryId: string;
  adminUserId: string;
  reason: string;
}): Promise<WaiveResult> {
  const reason = params.reason.trim();
  if (!reason) return { ok: false, error: "REASON_REQUIRED", message: "Waive karne ka reason likhiye.", status: 422 };

  const row = await prisma.partnerRecovery.findUnique({ where: { id: params.recoveryId } });
  if (!row) return { ok: false, error: "NOT_FOUND", message: "Ye recovery nahi mili.", status: 404 };
  if (row.status !== "OPEN") {
    return { ok: false, error: "BAD_STATE", message: "Ye ab open nahi hai.", status: 409 };
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.partnerRecovery.update({
      where: { id: params.recoveryId },
      data: { status: "WAIVED", waivedAt: now, waivedBy: params.adminUserId, waiveReason: reason },
    });
    await tx.adminAuditLog.create({
      data: {
        actorId: params.adminUserId,
        actorRole: "ADMIN",
        actionType: "PARTNER_RECOVERY_WAIVED",
        targetType: "partner_recovery",
        targetId: params.recoveryId,
        previousValue: String(Math.max(0, row.amountPaise - row.settledPaise)),
        newValue: "WAIVED",
        reason,
      },
    });
  });

  return { ok: true };
}
