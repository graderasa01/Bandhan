import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getPayoutConfig } from "./payoutService";

/**
 * Flips matured commissions from PENDING to APPROVED.
 *
 * Once the refund window has passed there is nothing left for a human to
 * decide — the payment stuck, so the commission is owed. Leaving hundreds of
 * rows waiting on a click is how partners end up chasing us for money we
 * already agreed to pay, and it makes the admin queue a chore rather than an
 * exception list.
 *
 * An admin who wants every rupee to pass under their eye can set
 * `PartnerCommissionConfig.autoApproveAfterMaturity = false`; the manual queue
 * at /admin/commissions keeps working either way.
 *
 * Safe to run twice: it only ever moves PENDING → APPROVED, and a row already
 * approved (or reversed by a refund) no longer matches the filter.
 */

export type MaturitySummary = {
  skipped: boolean;
  scanned: number;
  approved: number;
};

const BATCH_LIMIT = 500;

export async function runCommissionMaturity(): Promise<MaturitySummary> {
  const config = await getPayoutConfig();
  if (!config.autoApproveAfterMaturity) {
    return { skipped: true, scanned: 0, approved: 0 };
  }

  const now = new Date();
  const windowMs = config.maturityDays * 24 * 3600_000;
  const legacyCutoff = new Date(now.getTime() - windowMs);

  const due = await prisma.partnerCommission.findMany({
    where: {
      status: "PENDING",
      OR: [
        { maturesAt: { lte: now } },
        // Rows written before `maturesAt` existed fall back to the rule the
        // commission queue always applied.
        { maturesAt: null, createdAt: { lte: legacyCutoff } },
      ],
    },
    select: { id: true },
    take: BATCH_LIMIT,
  });

  if (due.length === 0) return { skipped: false, scanned: 0, approved: 0 };

  const result = await prisma.partnerCommission.updateMany({
    // Re-asserting `status: PENDING` closes the race with an admin approving
    // the same row by hand between the read and the write.
    where: { id: { in: due.map((d) => d.id) }, status: "PENDING" },
    data: { status: "APPROVED", approvedAt: now },
  });

  console.info(`[payouts:maturity] approved ${result.count} of ${due.length} matured commissions`);
  return { skipped: false, scanned: due.length, approved: result.count };
}
