import "server-only";
import { prisma } from "@/lib/db/prisma";
import { applyBps, effectiveBps, resolveTier } from "./tier";
import type { PartnerTier, Prisma } from "@prisma/client";

/**
 * What a partner earns on one payment — the single place that question is
 * answered.
 *
 * D-12 as revised 2026-08-06: a percentage of what the member actually paid,
 * at whatever rate the partner's earned tier commands. Both inputs move over
 * time (an admin can change the rate; a partner climbs tiers), so the caller
 * gets back not just the amount but the two numbers it came from — those are
 * written onto the commission row so a payout can still be explained months
 * later without replaying history.
 *
 * `basePaise` is the *captured* amount, not the plan's list price. A member
 * who used D-13's partner discount paid less, and the partner earns a
 * percentage of what actually arrived — paying commission on money nobody sent
 * is how a referral programme quietly runs at a loss.
 *
 * Takes a `tx` so it can run inside the same transaction as the payment
 * capture: the tier is counted from the commission ledger, and reading that
 * outside the transaction would race a concurrent capture.
 */

export type CommissionComputation = {
  amountPaise: number;
  basePaise: number;
  percentBpsApplied: number;
  tierAtEarning: PartnerTier;
};

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Conversions counted for tier purposes: distinct members whose payment earned
 * this partner a commission that wasn't later reversed.
 *
 * Distinct *members*, not commission rows — D-80 pays on every renewal, so
 * counting rows would let one loyal member walk a partner to Gold on their own
 * while a partner who genuinely introduced ten couples sat at Bronze.
 */
export async function countPaidConversions(db: Db, partnerId: string): Promise<number> {
  const rows = await db.partnerCommission.findMany({
    where: { partnerId, status: { in: ["PENDING", "APPROVED", "PAID"] } },
    select: { userId: true },
    distinct: ["userId"],
  });
  return rows.length;
}

export async function computeCommission(
  db: Db,
  partnerId: string,
  capturedPaise: number,
): Promise<CommissionComputation> {
  const [config, paidCount, partner] = await Promise.all([
    db.partnerCommissionConfig.findUnique({ where: { id: "default" } }),
    countPaidConversions(db, partnerId),
    db.partner.findUnique({ where: { id: partnerId }, select: { commissionBpsOverride: true } }),
  ]);

  // Schema defaults, mirrored — a missing config row must not silently pay
  // zero, which is the failure nobody notices until a partner complains.
  const rates = {
    baseBps: config?.baseBps ?? 1000,
    silverBonusBps: config?.silverBonusBps ?? 200,
    goldBonusBps: config?.goldBonusBps ?? 500,
  };
  const thresholds = {
    silverThreshold: config?.silverThreshold ?? 3,
    goldThreshold: config?.goldThreshold ?? 10,
  };

  // The tier is resolved either way, even when an override wins. It is still
  // written onto the commission row, so a later "why did this one pay 18%"
  // can be answered with both halves: the rate that applied and the tier the
  // partner had actually earned at the time.
  const tierAtEarning = resolveTier(paidCount, thresholds);
  const percentBpsApplied = partner?.commissionBpsOverride ?? effectiveBps(tierAtEarning, rates);

  return {
    amountPaise: applyBps(capturedPaise, percentBpsApplied),
    basePaise: capturedPaise,
    percentBpsApplied,
    tierAtEarning,
  };
}
