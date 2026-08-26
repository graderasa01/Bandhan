import "server-only";
import { prisma } from "@/lib/db/prisma";
import { PARTNER_FIRST_MONTH_DISCOUNT_PAISE } from "@/lib/constants/plans";
import { getPaymentGateway, isTestGateway, type GatewayWebhookEvent } from "./gateway";
import { computeCommission } from "@/lib/partner/commissionRate";
import { resolveOffer } from "@/lib/services/plans/planOfferService";
import { syncBoostFromSubscription } from "@/lib/services/boost/boostService";
import type { PlanCode } from "@/lib/constants/plans";
import { noopT, type Translate } from "@/lib/i18n/translate";

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
  /** The admin offer that set this price, when one did. */
  offerLabel: string | null;
  /** True when the price is zero, so no gateway is involved. */
  isFree: boolean;
}

/**
 * What this plan costs this user right now.
 *
 * Two discounts can apply and they **do not stack**:
 *
 * 1. **D-13** — ₹500 off Basic, first *ever* paid subscription, partner must be
 *    APPROVED at the time of purchase. "First ever" is checked against captured
 *    payments rather than the subscription, so cancelling and returning cannot
 *    re-trigger it.
 * 2. **An admin offer** — see `planOfferService`.
 *
 * The better of the two wins. Stacking was the obvious alternative and it is
 * wrong here: the two are unrelated promises rather than parts of one deal, and
 * summing them lets a 100%-off launch offer plus D-13 drive the price below
 * zero — a case nothing downstream can express. Taking the larger discount
 * always leaves the user with the cheaper of the two prices they were shown,
 * which is the only outcome that is never a complaint.
 */
export async function quoteCheckout(
  userId: string,
  planCode: PlanCode,
  t: Translate = noopT,
): Promise<CheckoutQuote | null> {
  const plan = await prisma.plan.findUnique({ where: { code: planCode } });
  if (!plan || !plan.isActive || planCode === "FREE") return null;

  const listPricePaise = plan.priceInPaise;
  let discountPaise = 0;
  let discountNote: string | null = null;
  let offerLabel: string | null = null;

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
      discountNote = `${t("subscription.checkout.discountFirstMonth", "Partner code se pehla mahina sirf")} ₹${(listPricePaise - discountPaise) / 100}. ${t("subscription.checkout.discountThereafter", "Uske baad")} ₹${listPricePaise / 100}/month.`;
    }
  }

  const offer = await resolveOffer(planCode, listPricePaise);
  if (offer && offer.discountPaise > discountPaise) {
    discountPaise = offer.discountPaise;
    offerLabel = offer.label;
    // Same "say what happens next" rule D-13 established: a price that is only
    // true this month must say so on the same screen, or the first renewal is a
    // surprise the user did not agree to.
    discountNote = offer.isFree
      ? `${offer.label} — ${t("subscription.checkout.offerFreeNote", "abhi ₹0. Uske baad")} ₹${listPricePaise / 100}/month.`
      : `${offer.label} — ${t("subscription.checkout.offerNote", "abhi sirf")} ₹${(listPricePaise - discountPaise) / 100}. ${t("subscription.checkout.discountThereafter", "Uske baad")} ₹${listPricePaise / 100}/month.`;
  }

  const payablePaise = listPricePaise - discountPaise;

  return {
    planCode,
    listPricePaise,
    discountPaise,
    payablePaise,
    discountNote,
    offerLabel,
    isFree: payablePaise === 0,
  };
}

export type CheckoutResult =
  | { ok: true; paymentId: string; checkoutUrl: string; quote: CheckoutQuote; isTest: boolean }
  | { ok: false; message: string };

export async function createCheckout(
  userId: string,
  planCode: PlanCode,
  t: Translate = noopT,
): Promise<CheckoutResult> {
  const quote = await quoteCheckout(userId, planCode, t);
  if (!quote) return { ok: false, message: t("subscription.checkout.planUnavailable", "Ye plan abhi available nahi hai.") };

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

  /*
   * A fully-discounted plan never reaches the gateway.
   *
   * Razorpay will not create a ₹0 order, so a 100%-off offer would fail at the
   * point of sale if this were left to the normal path. It is granted here
   * instead — but *not* by a second activation routine. The row gets a
   * synthetic order id and is then fed through `handleGatewayEvent`, the same
   * function the webhook calls, so a free month creates the subscription,
   * writes the partner commission and syncs the boost through exactly the code
   * a paid month does. A parallel "grant access" path is how the two drift
   * until only one of them writes commissions.
   *
   * The Payment row is kept rather than skipped: `discountPaise` records the
   * full list price, so "why does this user have Premium" stays answerable, and
   * a percentage commission on ₹0 is correctly ₹0.
   */
  if (quote.isFree) {
    const orderId = `free_${payment.id}`;
    await prisma.payment.update({ where: { id: payment.id }, data: { externalOrderId: orderId } });

    const outcome = await handleGatewayEvent({
      orderId,
      paymentId: orderId,
      status: "CAPTURED",
      amountPaise: 0,
    });
    if (!outcome.handled) {
      console.error(`[payments] free grant failed for ${payment.id}: ${outcome.reason}`);
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED", failureReason: "Free plan activate nahi ho paya." },
      });
      return { ok: false, message: t("subscription.checkout.startFailed", "Payment shuru nahi ho payi — thodi der me dobara try karein.") };
    }

    return {
      ok: true,
      paymentId: payment.id,
      // Straight to the subscription page: there is no payment to make, so a
      // checkout screen showing ₹0 would be a step that exists only to be
      // dismissed.
      checkoutUrl: "/user/subscription?activated=1",
      quote,
      isTest: isTestGateway(),
    };
  }

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
    return { ok: false, message: t("subscription.checkout.startFailed", "Payment shuru nahi ho payi — thodi der me dobara try karein.") };
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
      await tx.partnerCommission.create({
        data: {
          partnerId: referral.partner.id,
          paymentId: payment.id,
          userId: payment.userId,
          ...commission,
          // Withdrawable immediately. This was PENDING with a `maturesAt` a
          // week out (D-14's refund window) until 2026-08-26, when the hold
          // was removed by product decision — see payoutService's header for
          // what that trades away. `maturesAt` is left null rather than
          // backdated so old rows stay distinguishable from new ones.
          status: "APPROVED",
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
export async function cancelSubscription(
  userId: string,
  t: Translate = noopT,
): Promise<{ ok: boolean; endsAt?: Date; message?: string }> {
  const sub = await getActiveSubscription(userId);
  if (!sub) return { ok: false, message: t("subscription.cancel.noActive", "Koi active subscription nahi hai.") };
  if (sub.cancelledAt) return { ok: true, endsAt: sub.currentPeriodEnd };

  const updated = await prisma.subscription.update({
    where: { id: sub.id },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  return { ok: true, endsAt: updated.currentPeriodEnd };
}
