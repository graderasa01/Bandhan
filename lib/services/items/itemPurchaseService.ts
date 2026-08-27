import "server-only";
import type { Payment, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getPaymentGateway, isTestGateway } from "@/lib/services/payments/gateway";
import { getPlanContext } from "@/lib/services/plans/entitlements";
import { getPlanCatalog, planFeaturesOf } from "@/lib/services/plans/planCatalog";
import { PLAN_FEATURE_LABELS, PLAN_FEATURE_TYPES, type PlanFeatureSet } from "@/lib/constants/plans";
import { type EntitlementWindowConfig } from "@/lib/constants/serviceItems";
import { noopT, type Translate } from "@/lib/i18n/translate";
import { getItemCatalog, itemOf, purchasableItems, type ServiceItemEntry } from "./itemCatalog";

/**
 * Buying one thing, once.
 *
 * The sibling of `subscriptionService` and it obeys the same single rule:
 * **only a CAPTURED payment changes anything.** Creating an order grants
 * nothing. That is why the only function here that writes an entitlement —
 * `fulfilItemPayment` — takes a transaction client it did not open, and is
 * reachable from exactly one caller: `handleGatewayEvent`.
 *
 * ## Why fulfilment lives here and the capture path lives there
 *
 * There is one webhook, one `Payment` table and one "money landed" moment. A
 * second capture path for items would be a second place replay-safety, amount
 * checking and the CAPTURED/REFUNDED guard all have to be got right. So
 * `handleGatewayEvent` keeps every one of those checks and branches on
 * `payment.kind` at the last possible moment.
 *
 * ## Partner commission is deliberately not written for items
 *
 * Devesh decided on 2026-08-27 that partner commission applies to
 * subscriptions only. That is a product decision, not an oversight — see the
 * branch in `handleGatewayEvent`, which says so at the point where the
 * commission would otherwise be written, so nobody "fixes" it later.
 */

/**
 * `UserEntitlementOverride.grantedBy` for a row a purchase created.
 *
 * A sentinel rather than a user id, because nobody granted it — the money did.
 * The admin override list renders this verbatim, which is the point: an
 * override that appeared without an admin doing anything must be visibly
 * distinguishable from one that did.
 */
export const PURCHASE_GRANTED_BY = "purchase";

function addDays(from: Date, days: number): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d;
}

// ------------------------------------------------------- can this be bought

export interface ItemAvailability {
  buyable: boolean;
  /** Why not, in the buyer's words. Null when it is buyable. */
  reason: string | null;
}

/**
 * Does the user's *plan* already include what this item sells?
 *
 * Read off the plan baseline (`planFeaturesOf`) rather than off
 * `planCtx.features`, and the distinction is the whole point.
 * `planCtx.features` folds in overrides, so a user halfway through a Discovery
 * Week they already bought would be told they cannot buy another one — when
 * extending is exactly what they want. Only the plan itself makes the purchase
 * pointless.
 *
 * (Same trap as `planCtx.features.boost` reading true off a reward credit —
 * for a plan-only question, read the plan.)
 */
function planAlreadyCovers(baseline: PlanFeatureSet, config: EntitlementWindowConfig): boolean {
  const current = baseline[config.capabilityKey];
  const type = PLAN_FEATURE_TYPES[config.capabilityKey];
  if (type === "boolean") return current === true;
  // null is unlimited on a nullableNumber key, so it covers any finite amount.
  if (current === null) return true;
  if (config.value === null) return false;
  return Number(current ?? 0) >= Number(config.value ?? 0);
}

/**
 * Pure, so the buy grid and the checkout call cannot disagree about whether
 * something is for sale. Every "no" carries a sentence the buyer can act on —
 * a greyed-out card with no explanation is the thing support gets asked about.
 */
function availabilityOf(item: ServiceItemEntry, baseline: PlanFeatureSet, t: Translate): ItemAvailability {
  if (!item.isActive || !item.isPublic || !item.configValid) {
    return { buyable: false, reason: t("items.quote.unavailable", "Ye cheez abhi available nahi hai.") };
  }

  /*
   * A ₹0 item is refused rather than granted.
   *
   * The subscription path handles a 100%-off plan by feeding a synthetic order
   * through `handleGatewayEvent`, so the free month walks the same code a paid
   * one does. Items cannot borrow that trick without this module importing
   * `subscriptionService`, which imports this one — and the alternative, a
   * second "just grant it" path, is precisely the parallel activation routine
   * that file warns about.
   *
   * Nothing is lost: giving someone a capability for free already has a
   * purpose-built, audited home in /admin/features.
   */
  if (item.priceInPaise <= 0) {
    return { buyable: false, reason: t("items.quote.freeNotSupported", "Ye cheez kharidi nahi ja sakti — admin se poochein.") };
  }

  if (item.kind !== "ENTITLEMENT_WINDOW") {
    // SPOTLIGHT_CAMPAIGN and AI_DELIVERABLE have no fulfilment yet. Selling one
    // would take money for something `fulfilItemPayment` cannot deliver, which
    // is worse than the item not existing.
    return { buyable: false, reason: t("items.quote.notReady", "Ye cheez abhi taiyaar nahi hai.") };
  }

  const config = item.config as EntitlementWindowConfig;
  if (planAlreadyCovers(baseline, config)) {
    const label = PLAN_FEATURE_LABELS[config.capabilityKey] ?? config.capabilityKey;
    return {
      buyable: false,
      reason: `${label} aapke plan me pehle se shaamil hai — iske liye alag se paise dene ki zaroorat nahi.`,
    };
  }

  return { buyable: true, reason: null };
}

/** The plan's own feature set, with no overrides or credits folded in. */
async function planBaseline(userId: string): Promise<PlanFeatureSet> {
  const [ctx, catalog] = await Promise.all([getPlanContext(userId), getPlanCatalog()]);
  return planFeaturesOf(catalog, ctx.effectivePlanCode);
}

export interface ItemOffer {
  item: ServiceItemEntry;
  availability: ItemAvailability;
}

/**
 * Everything a member may see on the buy grid, each with its own verdict.
 *
 * Takes the plan baseline rather than a user id on purpose: every screen
 * that renders this grid has already resolved a plan context for something
 * else on the page, and `planFeaturesOf(catalog, effectivePlanCode)` is the
 * one line that turns it into what this needs. Asking for a user id would
 * have meant a second `getPlanContext` per page load, for an answer the
 * caller was already holding.
 */
export async function listItemOffers(baseline: PlanFeatureSet, t: Translate = noopT): Promise<ItemOffer[]> {
  const catalog = await getItemCatalog();
  return purchasableItems(catalog).map((item) => ({ item, availability: availabilityOf(item, baseline, t) }));
}

export interface ItemQuote {
  item: ServiceItemEntry;
  payablePaise: number;
}

export type ItemQuoteResult = { ok: true; quote: ItemQuote } | { ok: false; message: string };

export async function quoteItem(userId: string, itemCode: string, t: Translate = noopT): Promise<ItemQuoteResult> {
  const item = itemOf(await getItemCatalog(), itemCode);
  if (!item) return { ok: false, message: t("items.quote.unavailable", "Ye cheez abhi available nahi hai.") };

  const availability = availabilityOf(item, await planBaseline(userId), t);
  if (!availability.buyable) {
    return { ok: false, message: availability.reason ?? t("items.quote.unavailable", "Ye cheez abhi available nahi hai.") };
  }

  return { ok: true, quote: { item, payablePaise: item.priceInPaise } };
}

// ------------------------------------------------------------------ buying

export type ItemCheckoutResult =
  | { ok: true; paymentId: string; checkoutUrl: string; item: ServiceItemEntry; isTest: boolean }
  | { ok: false; message: string };

export async function createItemCheckout(
  userId: string,
  itemCode: string,
  t: Translate = noopT,
): Promise<ItemCheckoutResult> {
  const quoted = await quoteItem(userId, itemCode, t);
  if (!quoted.ok) return { ok: false, message: quoted.message };
  const { item, payablePaise } = quoted.quote;

  // Same ordering as `createCheckout`: the Payment row exists before the order
  // does, so its id can be the gateway's receipt.
  const payment = await prisma.payment.create({
    data: {
      userId,
      kind: "ITEM",
      planCode: null,
      itemCode: item.code,
      amountPaise: payablePaise,
      status: "CREATED",
      isTest: isTestGateway(),
    },
  });

  try {
    const order = await getPaymentGateway().createOrder({
      amountPaise: payablePaise,
      receipt: payment.id,
      notes: { userId, itemCode: item.code },
    });
    await prisma.payment.update({ where: { id: payment.id }, data: { externalOrderId: order.orderId } });

    return { ok: true, paymentId: payment.id, checkoutUrl: order.checkoutUrl, item, isTest: isTestGateway() };
  } catch (err) {
    console.error("[items] order creation failed:", err instanceof Error ? err.message : String(err));
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", failureReason: "Order banane me dikkat aayi." },
    });
    return {
      ok: false,
      message: t("items.checkout.startFailed", "Payment shuru nahi ho payi — thodi der me dobara try karein."),
    };
  }
}

// -------------------------------------------------------------- fulfilment

/**
 * What a fulfilled item wants said to the buyer, handed back rather than sent.
 *
 * The notice is a consequence of the purchase, not part of what makes it
 * valid — exactly like the boost sync after a subscription capture. Firing it
 * inside the transaction would let a push failure roll back an entitlement the
 * user has already paid for.
 */
export interface ItemFulfilment {
  /** Goes on `Payment.itemRefId` when the item created a row of its own. */
  refId: string | null;
  noticeTitle: string;
  noticeBody: string;
  href: string;
}

/**
 * Grants what an ITEM payment bought. Runs inside `handleGatewayEvent`'s
 * transaction, so every write here is undone if the capture is.
 *
 * Throws on an unfulfillable item rather than returning a soft failure: the
 * caller's transaction must roll back, leaving the payment un-captured and the
 * webhook free to retry, instead of recording money taken for nothing
 * delivered.
 */
export async function fulfilItemPayment(
  tx: Prisma.TransactionClient,
  payment: Payment,
  item: ServiceItemEntry,
  now: Date,
): Promise<ItemFulfilment> {
  if (item.kind !== "ENTITLEMENT_WINDOW") {
    throw new Error(`[items] no fulfilment implemented for ${item.kind} (${item.code}).`);
  }

  const config = item.config as EntitlementWindowConfig;

  /*
   * Buying again extends rather than restarts.
   *
   * The same rule the subscription renewal follows — "paying early doesn't
   * burn days". Without this, someone who buys a second week on day five
   * silently throws away the two days they already own.
   *
   * `expiresAt: { gt: now }` excludes null-expiry rows on purpose: a permanent
   * grant means the purchase adds nothing, and that case is already refused at
   * `quoteItem` through the plan-baseline check.
   */
  const existing = await tx.userEntitlementOverride.findFirst({
    where: {
      userId: payment.userId,
      capabilityKey: config.capabilityKey,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { expiresAt: "desc" },
    select: { expiresAt: true },
  });

  const base = existing?.expiresAt && existing.expiresAt > now ? existing.expiresAt : now;
  const expiresAt = addDays(base, config.days);

  const row = await tx.userEntitlementOverride.create({
    data: {
      userId: payment.userId,
      capabilityKey: config.capabilityKey,
      value: JSON.stringify(config.value),
      // `reason` is mandatory on this table and is read by admins, not users.
      // The payment id is in it so "why does this user have Advanced
      // Discovery" is answerable in one lookup.
      reason: `Purchase: ${item.name} (payment ${payment.id})`,
      grantedBy: PURCHASE_GRANTED_BY,
      expiresAt,
    },
    select: { id: true },
  });

  const label = PLAN_FEATURE_LABELS[config.capabilityKey] ?? config.capabilityKey;
  const until = expiresAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  return {
    refId: row.id,
    noticeTitle: `${item.name} chalu ho gaya`,
    noticeBody: `${label} ab aapke liye khula hai — ${until} tak.`,
    href: "/user/subscription",
  };
}
