import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { PaymentStatus } from "@prisma/client";

/**
 * The money ledger, read-only.
 *
 * Deliberately has no write path. Refunds happen at the gateway and arrive back
 * through the webhook that owns `Payment.status`; a "mark refunded" button here
 * would let the app's ledger and the gateway's disagree, and the app would lose
 * that argument every time.
 */

export interface AdminPaymentRow {
  id: string;
  userName: string;
  userId: string;
  planCode: string;
  amountPaise: number;
  discountPaise: number;
  status: PaymentStatus;
  isTest: boolean;
  failureReason: string | null;
  createdAt: string;
  capturedAt: string | null;
}

const PAGE_SIZE = 30;

export async function getPayments(params: {
  status?: PaymentStatus;
  page?: number;
}): Promise<{
  rows: AdminPaymentRow[];
  total: number;
  page: number;
  pageSize: number;
  totals: { capturedPaise: number; refundedPaise: number; failedCount: number };
}> {
  const page = Math.max(1, params.page ?? 1);
  const where = params.status ? { status: params.status } : {};

  const [payments, total, captured, refunded, failed] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { user: { select: { id: true, fullName: true } } },
    }),
    prisma.payment.count({ where }),
    // Totals describe the *whole* ledger, not the filtered page — a "captured"
    // figure that changed every time you clicked a filter would be unreadable.
    prisma.payment.aggregate({
      where: { status: "CAPTURED", isTest: false },
      _sum: { amountPaise: true },
    }),
    prisma.payment.aggregate({
      where: { status: "REFUNDED", isTest: false },
      _sum: { amountPaise: true },
    }),
    prisma.payment.count({ where: { status: "FAILED" } }),
  ]);

  return {
    rows: payments.map((p) => ({
      id: p.id,
      userName: p.user.fullName,
      userId: p.user.id,
      planCode: p.planCode as string,
      amountPaise: p.amountPaise,
      discountPaise: p.discountPaise,
      status: p.status,
      isTest: p.isTest,
      failureReason: p.failureReason,
      createdAt: p.createdAt.toISOString().slice(0, 16).replace("T", " "),
      capturedAt: p.capturedAt ? p.capturedAt.toISOString().slice(0, 10) : null,
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
    totals: {
      capturedPaise: captured._sum.amountPaise ?? 0,
      refundedPaise: refunded._sum.amountPaise ?? 0,
      failedCount: failed,
    },
  };
}
