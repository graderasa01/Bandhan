import "server-only";
import type { Payment, Prisma } from "@prisma/client";
import { computeCommission } from "./commissionRate";

/**
 * The referring partner's share of one captured payment — written from inside
 * the capture transaction, for a subscription and for a one-off item alike.
 *
 * D-12 + D-80: a percentage of what was captured, on this and every future
 * payment, for as long as the partner is in good standing at the moment of
 * payment. The rate depends on the partner's earned tier — see
 * `commissionRate.ts`, which must run inside the same transaction so the tier
 * can't be counted from a stale ledger.
 *
 * ## Why items earn too (D-90, 2026-09-15)
 *
 * On 2026-08-27 commission was deliberately limited to subscriptions, because
 * items were small add-ons to a plan. D-90 retired the plans: a member's
 * spending now *is* Chat Unlocks and the Rishta Pass, and a partner who brought
 * a family in would otherwise earn nothing at all. So both capture branches
 * call this one function — two copies are how, eventually, only one of them
 * writes commissions.
 *
 * Deliberately NOT called for SERVICE_BOOKING (the partner already earns the
 * booking itself) or VERIFICATION payments.
 */
export async function writeReferralCommission(
  tx: Prisma.TransactionClient,
  payment: Pick<Payment, "id" | "userId" | "amountPaise">,
): Promise<void> {
  const referral = await tx.partnerReferral.findUnique({
    where: { userId: payment.userId },
    include: { partner: { select: { id: true, status: true } } },
  });
  const partnerEligible = referral?.partner.status === "APPROVED" || referral?.partner.status === "ACTIVE";
  if (!referral || !partnerEligible) return;

  const commission = await computeCommission(tx, referral.partner.id, payment.amountPaise);
  await tx.partnerCommission.create({
    data: {
      partnerId: referral.partner.id,
      paymentId: payment.id,
      userId: payment.userId,
      ...commission,
      // Withdrawable immediately. This was PENDING with a `maturesAt` a week
      // out (D-14's refund window) until 2026-08-26, when the hold was removed
      // by product decision — see payoutService's header for what that trades
      // away. `maturesAt` is left null rather than backdated so old rows stay
      // distinguishable from new ones.
      status: "APPROVED",
    },
  });
}
