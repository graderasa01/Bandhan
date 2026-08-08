import "server-only";
import { prisma } from "@/lib/db/prisma";
import { PARTNER_FIRST_MONTH_DISCOUNT_PAISE } from "@/lib/constants/plans";
import { getPaymentGateway, isTestGateway, type GatewayWebhookEvent } from "./gateway";
import { computeCommission } from "@/lib/partner/commissionRate";
import { syncBoostFromSubscription } from "@/lib/services/boost/boostService";
import type { PlanCode } from "@/lib/constants/plans";

/**
 * Subscriptions: creating a checkout, and what happens when money lands.
 *
 * ## One rule above all others
 *
 * **Only a CAPTURED payment changes anything.** Creating an order grants
 * nothing, redirecting the user grants nothing, and a client saying "I paid"
 * grants nothing. Access moves when the webhook says the money moved — which
 * is why `handleGatewayEvent` is the only function here that writes a
 * Subscription, and why it is reachable only from the webhook route.
 *
 * ## Replay safety
 *
 * Gateways retry webhooks. `Payment.externalOrderId` is unique and the capture
 * path only acts on a payment still in `CREATED`/`AUTHORIZED`, so a redelivered
 * event finds nothing to do. `PartnerCommission.paymentId` is unique on top of
 * that — a partner cannot be paid twice for one payment even if both guards
 * somehow raced.
 */

/** D-10: monthly. One period = one month from now (or from the current end). */
function addOneMonth(from: Date): Date {
  const d = new Date(from);
  d.setMonth(d.getMonth() + 1);
  return d;
}

export interface CheckoutQuote {
  planCode: PlanCode;
  listPricePaise: number;
  discountPaise: number;
  payablePaise: number;
  /** D-13's mandatory second line — never show the discounted price alone. */
  discountNote: string | null;
}

/**
 * D-13, in full: ₹500 off, Basic only, first *ever* paid subscription, and the
 * partner must be APPROVED at the time of purchase.
 *
 * "First ever" is checked against captured payments rather than against the
 * subscription, so cancelling and returning cannot re-trigger it.
 */
export async function quoteCheckout(userId: string, planCode: PlanCode): Promise<CheckoutQuote | null> {
  const plan = await prisma.plan.findUnique({ where: { code: planCode } });
  if (!plan || !plan.isActive || planCode === "FREE") return null;

  const listPricePaise = plan.priceInPaise;
  let discountPaise = 0;
  let discountNote: string | null = null;

  if (planCode === "BASIC") {
    const [everPaid, referral] = await Promise.all([
      prisma.payment.count({ where: { userId, status: "CAPTURED" } }),
      prisma.partnerReferral.findUnique({
        where: { userId },
        include: { partner: { select: { status: true } } },
      }),
    ]);

    const partnerEligible =
      referral?.partner.status === "APPROVED" || referral?.partner.status === "ACTIVE";

    if (everPaid === 0 && partnerEligible) {
      discountPaise = Math.min(PARTNER_FIRST_MONTH_DISCOUNT_PAISE, listPricePaise);
      // Both lines, always, together. Showing only "₹499" is the dark pattern
      // D-13 explicitly names.
      discountNote = `Partner code se pehla mahina sirf ₹${(listPricePaise - discountPaise) / 100}. Uske baad ₹${listPricePaise / 100}/month.`;
    }
  }

  return {
    planCode,
    listPricePaise,
    discountPaise,
    payablePaise: listPricePaise - discountPaise,
    discountNote,
  };
}

export type CheckoutResult =
  | { ok: true; paymentId: string; checkoutUrl: string; quote: CheckoutQuote; isTest: boolean }
  | { ok: false; message: string };

export async function createCheckout(userId: string, planCode: PlanCode): Promise<CheckoutResult> {
  const quote = await quoteCheckout(userId, planCode);
  if (!quote) return { ok: false, message: "Ye plan abhi available nahi hai." };

  // The Payment row exists before the order does, so its id can be the
  // gateway's receipt — which is what lets a webhook find its way home even if
  // the order id somehow doesn't match.
  const payment = await prisma.payment.create({
    data: {
      userId,
      planCode,
      amountPaise: quote.payablePaise,
      discountPaise: quote.discountPaise,
      status: "CREATED",
      isTest: isTestGateway(),
    },
  });

  try {
    const order = await getPaymentGateway().createOrder({
      amountPaise: quote.payablePaise,
      receipt: payment.id,
      notes: { userId, planCode },
    });

    await prisma.payment.update({
      where: { id: payment.id },
      data: { externalOrderId: order.orderId },
    });

    return {
      ok: true,
      paymentId: payment.id,
      checkoutUrl: order.checkoutUrl,
      quote,
      isTest: isTestGateway(),
    };
  } catch (err) {
    console.error("[payments] order creation failed:", err instanceof Error ? err.message : String(err));
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", failureReason: "Order banane me dikkat aayi." },
    });
    return { ok: false, message: "Payment shuru nahi ho payi — thodi der me dobara try karein." };
  }
}

export type WebhookOutcome =
  | { handled: true; action: "captured" | "failed" | "duplicate"; subscriptionId?: string }
  | { handled: false; reason: string };

/**
 * The one place access is granted.
 *
 * Everything happens in a single transaction: the payment flips to CAPTURED,
 * the subscription is created or extended, and the partner's commission row is
 * written. If any of the three fails, none of them happened — a user with
 * access but no payment row, or a payment with no commission, are both states
 * nobody could later explain.
 */
export async function handleGatewayEvent(event: GatewayWebhookEvent): Promise<WebhookOutcome> {
  const payment = await prisma.payment.findUnique({
    where: { externalOrderId: event.orderId },
  });
  if (!payment) return { handled: false, reason: "Unknown order." };

  if (payment.status === "CAPTURED" || payment.status === "REFUNDED") {
    return { handled: true, action: "duplicate" };
  }

  if (event.status === "FAILED") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "FAILED",
        externalPaymentId: event.paymentId,
        failureReason: event.failureReason ?? "Payment fail ho gaya.",
      },
    });
    return { handled: true, action: "failed" };
  }

  // A captured amount that doesn't match what we asked for is not something to
  // reconcile silently — it is either a bug or someone tampering with the
  // checkout, and both need a human.
  if (event.amountPaise !== payment.amountPaise) {
    console.error(
      `[payments] amount mismatch on ${payment.id}: expected ${payment.amountPaise}, got ${event.amountPaise}`,
    );
    return { handled: false, reason: "Amount mismatch." };
  }

  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.subscription.findFirst({
      where: { userId: payment.userId, status: { in: ["ACTIVE", "PAST_DUE", "CANCELLED"] } },
      orderBy: { currentPeriodEnd: "desc" },
    });

    // A renewal extends from whichever is later: the current period's end (so
    // paying early doesn't burn days) or now (so a lapsed subscription doesn't
    // start in the past).
    const base = existing && existing.currentPeriodEnd > now ? existing.currentPeriodEnd : now;

    const subscription = existing
      ? await tx.subscription.update({
          where: { id: existing.id },
          data: {
            planCode: payment.planCode,
            status: "ACTIVE",
            currentPeriodEnd: addOneMonth(base),
            cancelledAt: null,
          },
        })
      : await tx.subscription.create({
          data: {
            userId: payment.userId,
            planCode: payment.planCode,
            status: "ACTIVE",
            currentPeriodEnd: addOneMonth(base),
          },
        });

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "CAPTURED",
        externalPaymentId: event.paymentId,
        capturedAt: now,
        subscriptionId: subscription.id,
      },
    });

    // D-12 + D-80: a percentage of what was captured, on this and every future
    // renewal, for as long as the partner is in good standing at the moment of
    // payment. The rate depends on the partner's earned tier — see
    // lib/partner/commissionRate.ts, which is deliberately called inside this
    // transaction so the tier can't be counted from a stale ledger.
    const referral = await tx.partnerReferral.findUnique({
      where: { userId: payment.userId },
      include: { partner: { select: { id: true, status: true } } },
    });
    const partnerEligible =
      referral?.partner.status === "APPROVED" || referral?.partner.status === "ACTIVE";

    if (referral && partnerEligible) {
      const commission = await computeCommission(tx, referral.partner.id, payment.amountPaise);
      // The refund window, resolved and *stored* now rather than recomputed on
      // read: a later change to `maturityDays` must not move the unlock date of
      // money a partner has already been shown a date for.
      const config = await tx.partnerCommissionConfig.findUnique({ where: { id: "default" } });
      const maturityDays = config?.maturityDays ?? 7;
      await tx.partnerCommission.create({
        data: {
          partnerId: referral.partner.id,
          paymentId: payment.id,
          userId: payment.userId,
          ...commission,
          // D-14: PENDING through the refund window; approved after it passes.
          status: "PENDING",
          maturesAt: new Date(Date.now() + maturityDays * 24 * 3600_000),
        },
      });
    }

    return subscription;
  });

  // Outside the transaction, same non-fatal-side-effect pattern as notices and
  // celebrations elsewhere: a profile boost is a consequence of the payment,
  // not part of what makes the payment valid. Its own failure must not roll
  // back a subscription that was already correctly paid for.
  try {
    await syncBoostFromSubscription({
      userId: payment.userId,
      planCode: result.planCode,
      currentPeriodEnd: result.currentPeriodEnd,
    });
  } catch (err) {
    console.error("[payments] boost sync failed:", err instanceof Error ? err.message : String(err));
  }

  return { handled: true, action: "captured", subscriptionId: result.id };
}

/** The active subscription, if the paid period hasn't run out. */
export async function getActiveSubscription(userId: string) {
  return prisma.subscription.findFirst({
    where: {
      userId,
      status: { in: ["ACTIVE", "CANCELLED"] },
      currentPeriodEnd: { gt: new Date() },
    },
    orderBy: { currentPeriodEnd: "desc" },
  });
}

/**
 * Cancels at period end rather than immediately.
 *
 * Someone who paid for this month keeps this month — cutting access the
 * instant they cancel would be taking back something already bought, and it
 * also makes "cancel" feel like a trap rather than a control.
 */
export async function cancelSubscription(userId: string): Promise<{ ok: boolean; endsAt?: Date; message?: string }> {
  const sub = await getActiveSubscription(userId);
  if (!sub) return { ok: false, message: "Koi active subscription nahi hai." };
  if (sub.cancelledAt) return { ok: true, endsAt: sub.currentPeriodEnd };

  const updated = await prisma.subscription.update({
    where: { id: sub.id },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  return { ok: true, endsAt: updated.currentPeriodEnd };
}
