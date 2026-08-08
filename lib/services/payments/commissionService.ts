import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { CommissionStatus, Role } from "@prisma/client";

/**
 * D-14's PENDING → APPROVED → PAID lifecycle, made actionable.
 *
 * `handleGatewayEvent` (subscriptionService.ts) is the only place a commission
 * row is *created* — one per CAPTURED payment, PENDING. This file is what
 * moves it forward: an admin approves once the 7-day refund window has
 * passed, and marks paid once a payout actually happened. Nothing here
 * creates money; it only records what a human already decided.
 */

const TRANSITIONS: Record<"approve" | "markPaid" | "reverse", { from: CommissionStatus[]; to: CommissionStatus }> = {
  approve: { from: ["PENDING"], to: "APPROVED" },
  markPaid: { from: ["APPROVED"], to: "PAID" },
  // A REFUNDED payment reverses its commission regardless of where it was —
  // even an already-PAID one, because the money behind it no longer exists.
  reverse: { from: ["PENDING", "APPROVED", "PAID"], to: "REVERSED" },
};

export interface CommissionRow {
  id: string;
  partnerId: string;
  partnerName: string;
  userName: string;
  amountPaise: number;
  status: CommissionStatus;
  createdAt: Date;
  /** True once the 7-day refund window (D-14) has passed — the UI's cue to approve. */
  refundWindowPassed: boolean;
}

/**
 * Fallback only. The live value is `PartnerCommissionConfig.maturityDays`
 * (admin-editable from /admin/pricing); this mirrors the schema default so a
 * missing config row can't silently pay a partner on day zero.
 */
const REFUND_WINDOW_DAYS = 7;

/** Per-row unlock time — `maturesAt` when the row has one, else the old createdAt + window rule. */
async function maturityWindowMs(): Promise<number> {
  const config = await prisma.partnerCommissionConfig.findUnique({ where: { id: "default" } });
  return (config?.maturityDays ?? REFUND_WINDOW_DAYS) * 24 * 3600_000;
}

export async function listCommissions(status?: CommissionStatus, limit = 50): Promise<CommissionRow[]> {
  const rows = await prisma.partnerCommission.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "asc" },
    take: limit,
    include: {
      partner: { select: { fullName: true } },
      payment: { select: { user: { select: { fullName: true } } } },
    },
  });

  const windowMs = await maturityWindowMs();
  return rows.map((r) => ({
    id: r.id,
    partnerId: r.partnerId,
    partnerName: r.partner.fullName,
    userName: r.payment.user.fullName,
    amountPaise: r.amountPaise,
    status: r.status,
    createdAt: r.createdAt,
    refundWindowPassed:
      (r.maturesAt ?? new Date(r.createdAt.getTime() + windowMs)).getTime() <= Date.now(),
  }));
}

export type CommissionActionResult = { ok: true } | { ok: false; message: string };

export async function transitionCommission(params: {
  commissionId: string;
  action: "approve" | "markPaid" | "reverse";
  actorId: string;
  actorRole: Role;
  reason?: string | null;
}): Promise<CommissionActionResult> {
  const { commissionId, action, actorId, actorRole, reason } = params;
  const rule = TRANSITIONS[action];

  const commission = await prisma.partnerCommission.findUnique({ where: { id: commissionId } });
  if (!commission) return { ok: false, message: "Commission nahi mili." };
  if (!rule.from.includes(commission.status)) {
    return { ok: false, message: `${commission.status} se ${rule.to} me nahi ja sakta.` };
  }

  // The UI already disables "Approve" until the window passes (CommissionQueue.tsx's
  // `refundWindowPassed`) — this is the server-side half of that same rule, so a
  // direct POST can't skip the wait a client-rendered button only hints at.
  if (action === "approve") {
    const windowMs = await maturityWindowMs();
    const eligibleAt = commission.maturesAt ?? new Date(commission.createdAt.getTime() + windowMs);
    if (eligibleAt.getTime() > Date.now()) {
      return {
        ok: false,
        message: `Refund window abhi khatam nahi hua. ${eligibleAt.toLocaleDateString("en-IN")} ke baad approve kar sakte hain.`,
      };
    }
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.partnerCommission.update({
      where: { id: commissionId },
      data: {
        status: rule.to,
        ...(action === "approve" ? { approvedAt: now } : {}),
        ...(action === "markPaid" ? { paidAt: now } : {}),
        ...(action === "reverse" ? { reversedAt: now } : {}),
      },
    });
    await tx.adminAuditLog.create({
      data: {
        actorId,
        actorRole,
        actionType: `COMMISSION_${rule.to}`,
        targetType: "partner_commission",
        targetId: commissionId,
        previousValue: commission.status,
        newValue: rule.to,
        reason: reason ?? null,
      },
    });
  });

  return { ok: true };
}

/** Reverses whatever commission belongs to a refunded payment, if one exists. */
export async function reverseCommissionForPayment(paymentId: string, actorId: string, actorRole: Role): Promise<void> {
  const commission = await prisma.partnerCommission.findUnique({ where: { paymentId } });
  if (!commission || commission.status === "REVERSED") return;
  await transitionCommission({ commissionId: commission.id, action: "reverse", actorId, actorRole, reason: "Payment refunded" });
}
