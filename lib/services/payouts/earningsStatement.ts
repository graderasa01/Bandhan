import "server-only";
import { prisma } from "@/lib/db/prisma";

/**
 * Where a partner's balance actually came from.
 *
 * ## Why three tiles were not enough
 *
 * The payouts screen has shown "available / in flight / paid" since Phase 2.
 * Those are the right three numbers and they are useless on their own: a
 * partner whose available balance drops by ₹1,200 has no way to find out which
 * booking that was, whether the platform fee was what they expected, or that a
 * refund took it back. "Reconcilable" is the word the plan uses, and a total
 * nobody can decompose is not.
 *
 * ## Why the two earning streams stay separate lines
 *
 * A ₹100 subscription referral commission and a ₹1,700 share of a service
 * booking are different money with different rules — the plan is explicit that
 * the referral ledger keeps its own. They settle through one withdrawal because
 * one bank transfer is kinder than two, but on this statement they are never
 * merged into a single "earnings" figure, because a partner arguing about one
 * of them needs to be able to point at it.
 */

export type EarningLineKind = "SERVICE" | "REFERRAL" | "RECOVERY";

export interface EarningLine {
  id: string;
  kind: EarningLineKind;
  /** What it was, in the partner's words. */
  label: string;
  at: string;
  /** What the buyer paid. Zero on a referral line, where there is no service. */
  grossPaise: number;
  platformFeePaise: number;
  /** What it moves in the partner's favour. Negative for a recovery. */
  netPaise: number;
  status: string;
  statusLabel: string;
  /** True when this line is already inside a withdrawal. */
  inWithdrawal: boolean;
}

const ALLOCATION_STATUS_LABEL: Record<string, string> = {
  HELD: "Kaam poora hone ka intezaar",
  RELEASED: "Withdraw ke liye taiyaar",
  PAID: "Bheja ja chuka",
  REVERSED: "Refund ho gaya",
};

const COMMISSION_STATUS_LABEL: Record<string, string> = {
  PENDING: "Taiyaar",
  APPROVED: "Taiyaar",
  PAID: "Bheja ja chuka",
  REVERSED: "Refund ho gaya",
};

const RECOVERY_STATUS_LABEL: Record<string, string> = {
  OPEN: "Aapki agli earning se katega",
  SETTLED: "Kat chuka",
  WAIVED: "Maaf kiya gaya",
};

export interface EarningsStatement {
  lines: EarningLine[];
  /** Service earnings that have not settled yet. Deliberately not a balance. */
  heldPaise: number;
  serviceEarnedPaise: number;
  referralEarnedPaise: number;
  recoveredPaise: number;
}

export async function getEarningsStatement(partnerId: string, limit = 60): Promise<EarningsStatement> {
  const [allocations, commissions, recoveries] = await Promise.all([
    prisma.servicePaymentAllocation.findMany({
      where: { partnerId },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { booking: { select: { service: { select: { name: true } } } } },
    }),
    prisma.partnerCommission.findMany({
      where: { partnerId },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.partnerRecovery.findMany({ where: { partnerId }, orderBy: { createdAt: "desc" }, take: limit }),
  ]);

  const lines: EarningLine[] = [
    ...allocations.map((a) => ({
      id: a.id,
      kind: "SERVICE" as const,
      label: a.booking?.service?.name ?? "Partner service",
      at: a.createdAt.toISOString(),
      grossPaise: a.grossPaise,
      platformFeePaise: a.platformFeePaise,
      // A reversed allocation earned nothing. Showing its original share with a
      // "refunded" label beside it would put money in a column that no longer
      // exists, which is how a statement stops adding up.
      netPaise: a.status === "REVERSED" ? 0 : a.partnerAmountPaise,
      status: a.status,
      statusLabel: ALLOCATION_STATUS_LABEL[a.status] ?? a.status,
      inWithdrawal: Boolean(a.withdrawalId),
    })),
    ...commissions.map((c) => ({
      id: c.id,
      kind: "REFERRAL" as const,
      label: "Referral commission",
      at: c.createdAt.toISOString(),
      grossPaise: c.basePaise,
      platformFeePaise: 0,
      netPaise: c.status === "REVERSED" ? 0 : c.amountPaise,
      status: c.status,
      statusLabel: COMMISSION_STATUS_LABEL[c.status] ?? c.status,
      inWithdrawal: Boolean(c.withdrawalId),
    })),
    ...recoveries.map((r) => ({
      id: r.id,
      kind: "RECOVERY" as const,
      label: r.reason,
      at: r.createdAt.toISOString(),
      grossPaise: 0,
      platformFeePaise: 0,
      // Negative, and only for what is still outstanding: a waived or fully
      // settled debt has stopped taking anything.
      netPaise: r.status === "OPEN" ? -Math.max(0, r.amountPaise - r.settledPaise) : 0,
      status: r.status,
      statusLabel: RECOVERY_STATUS_LABEL[r.status] ?? r.status,
      inWithdrawal: false,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return {
    lines,
    heldPaise: allocations.filter((a) => a.status === "HELD").reduce((n, a) => n + a.partnerAmountPaise, 0),
    serviceEarnedPaise: allocations
      .filter((a) => a.status === "RELEASED" || a.status === "PAID")
      .reduce((n, a) => n + a.partnerAmountPaise, 0),
    referralEarnedPaise: commissions
      .filter((c) => c.status !== "REVERSED")
      .reduce((n, c) => n + c.amountPaise, 0),
    recoveredPaise: recoveries
      .filter((r) => r.status === "OPEN")
      .reduce((n, r) => n + Math.max(0, r.amountPaise - r.settledPaise), 0),
  };
}
