import "./_env";
import { prisma } from "../lib/db/prisma";
import {
  BUILTIN_SERVICE_ITEMS,
  itemPromiseLine,
  parseItemConfig,
  type EntitlementWindowConfig,
} from "../lib/constants/serviceItems";
import { getItemCatalog, itemOf, purchasableItems } from "../lib/services/items/itemCatalog";
import { listItemOffers, quoteItem, PURCHASE_GRANTED_BY } from "../lib/services/items/itemPurchaseService";
import { handleGatewayEvent } from "../lib/services/payments/subscriptionService";
import { getPlanContext } from "../lib/services/plans/entitlements";
import { getPlanCatalog, planFeaturesOf } from "../lib/services/plans/planCatalog";

/**
 * À-la-carte items — catalog, the ITEM branch of the capture path, and what a
 * captured purchase actually grants.
 *
 * Goes through `handleGatewayEvent` rather than calling `fulfilItemPayment`
 * directly, because the thing worth proving is the *branch*: that an ITEM
 * payment grants an entitlement and creates no subscription and no commission,
 * and that a redelivered webhook grants it exactly once.
 *
 * Never touches a gateway — a Payment row is written straight into the local DB
 * with a synthetic order id, which is what the webhook keys on anyway. No
 * order is created at Razorpay and no money is involved.
 *
 * Run: `npx tsx scripts/items-check.ts`
 */

let failures = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const ITEM_CODE = "DISCOVERY_WEEK";

function daysBetween(a: Date, b: Date): number {
  return (a.getTime() - b.getTime()) / 86_400_000;
}

async function capture(paymentId: string, orderId: string, amountPaise: number) {
  return handleGatewayEvent({
    orderId,
    paymentId: `pay_test_${paymentId.slice(0, 8)}`,
    status: "CAPTURED",
    amountPaise,
  });
}

async function main() {
  console.log("\nCatalog — the built-in item is well-formed");

  const builtin = BUILTIN_SERVICE_ITEMS.find((i) => i.code === ITEM_CODE);
  check("DISCOVERY_WEEK is a built-in item", builtin !== undefined);
  check("its config parses against its kind", builtin ? parseItemConfig(builtin.kind, builtin.config).ok : false);
  check("it has a one-line promise", builtin ? itemPromiseLine(builtin.kind, builtin.config).length > 5 : false);

  const catalog = await getItemCatalog();
  const item = itemOf(catalog, ITEM_CODE);
  check("the live catalog serves it with no DB row", item !== null);
  check("it is purchasable", purchasableItems(catalog).some((i) => i.code === ITEM_CODE));
  check("an unknown code resolves to null, never a guess", itemOf(catalog, "NO_SUCH_ITEM") === null);

  if (!item) throw new Error("catalog missing the built-in item — nothing else can be checked");
  const config = item.config as EntitlementWindowConfig;

  const user = await prisma.user.create({
    data: {
      fullName: "Items Check",
      email: `items-check+${Date.now()}@local.test`,
      passwordHash: "x",
      status: "ACTIVE",
    },
  });

  try {
    console.log("\nA FREE user is offered it, and the offer is honest");

    const planCatalog = await getPlanCatalog();
    const freeCtx = await getPlanContext(user.id);
    const freeBaseline = planFeaturesOf(planCatalog, freeCtx.effectivePlanCode);
    check("the test user starts without the capability", freeBaseline[config.capabilityKey] !== true);

    const offers = await listItemOffers(freeBaseline);
    const offer = offers.find((o) => o.item.code === ITEM_CODE);
    check("it appears on the buy grid", offer !== undefined);
    check("and is buyable", offer?.availability.buyable === true, offer?.availability.reason ?? "");

    const quote = await quoteItem(user.id, ITEM_CODE);
    check("quoteItem agrees", quote.ok === true, quote.ok ? "" : quote.message);
    check("priced from the catalog", quote.ok && quote.quote.payablePaise === item.priceInPaise);

    console.log("\nA captured ITEM payment grants the entitlement");

    const orderId = `test_order_${Date.now()}`;
    const payment = await prisma.payment.create({
      data: {
        userId: user.id,
        kind: "ITEM",
        planCode: null,
        itemCode: ITEM_CODE,
        amountPaise: item.priceInPaise,
        status: "CREATED",
        externalOrderId: orderId,
        isTest: true,
      },
    });

    const before = new Date();
    const outcome = await capture(payment.id, orderId, item.priceInPaise);
    check("the webhook handled it", outcome.handled === true);
    check("as a capture", outcome.handled && outcome.action === "captured");

    const captured = await prisma.payment.findUnique({ where: { id: payment.id } });
    check("payment is CAPTURED", captured?.status === "CAPTURED");
    check("itemRefId points at what it created", Boolean(captured?.itemRefId));

    const overrides = await prisma.userEntitlementOverride.findMany({ where: { userId: user.id } });
    check("exactly one entitlement row was written", overrides.length === 1, `got ${overrides.length}`);
    check("stamped as a purchase, not an admin", overrides[0]?.grantedBy === PURCHASE_GRANTED_BY);
    check("it names the payment in its reason", overrides[0]?.reason.includes(payment.id) === true);
    check("it grants the item's capability", overrides[0]?.capabilityKey === config.capabilityKey);
    check(
      `it expires in about ${config.days} days`,
      overrides[0]?.expiresAt ? Math.abs(daysBetween(overrides[0].expiresAt, before) - config.days) < 0.1 : false,
    );

    const afterCtx = await getPlanContext(user.id);
    check("the capability now reads true through the real plan gate", afterCtx.features[config.capabilityKey] === true);
    check("the billed plan did not change", afterCtx.billedPlanCode === freeCtx.billedPlanCode);
    check("planSource stays BILLED — nobody granted this by hand", afterCtx.planSource === "BILLED");

    console.log("\nAn ITEM payment creates no subscription and no commission");

    check("no subscription row", (await prisma.subscription.count({ where: { userId: user.id } })) === 0);
    check("no commission row", (await prisma.partnerCommission.count({ where: { userId: user.id } })) === 0);

    console.log("\nThe buyer is told");

    const notices = await prisma.notice.findMany({ where: { userId: user.id } });
    check("one notice was created", notices.length === 1, `got ${notices.length}`);
    check("it points back at the subscription page", notices[0]?.href === "/user/subscription");
    check("it is tied to the payment", notices[0]?.relatedId === payment.id);

    console.log("\nA redelivered webhook grants nothing twice");

    const replay = await capture(payment.id, orderId, item.priceInPaise);
    check("the replay is recognised as a duplicate", replay.handled && replay.action === "duplicate");
    check(
      "still exactly one entitlement row",
      (await prisma.userEntitlementOverride.count({ where: { userId: user.id } })) === 1,
    );

    console.log("\nBuying again extends rather than restarts");

    const secondOrder = `test_order_${Date.now()}_b`;
    const second = await prisma.payment.create({
      data: {
        userId: user.id,
        kind: "ITEM",
        planCode: null,
        itemCode: ITEM_CODE,
        amountPaise: item.priceInPaise,
        status: "CREATED",
        externalOrderId: secondOrder,
        isTest: true,
      },
    });
    const beforeSecond = new Date();
    await capture(second.id, secondOrder, item.priceInPaise);

    const latest = await prisma.userEntitlementOverride.findFirst({
      where: { userId: user.id },
      orderBy: { expiresAt: "desc" },
    });
    check(
      `the window now runs about ${config.days * 2} days out, not ${config.days}`,
      latest?.expiresAt ? Math.abs(daysBetween(latest.expiresAt, beforeSecond) - config.days * 2) < 0.1 : false,
      latest?.expiresAt ? `${daysBetween(latest.expiresAt, beforeSecond).toFixed(2)} days` : "no row",
    );

    console.log("\nA plan that already includes it refuses the sale");

    await prisma.subscription.create({
      data: {
        userId: user.id,
        planCode: "BASIC",
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    const paidCtx = await getPlanContext(user.id);
    const paidBaseline = planFeaturesOf(planCatalog, paidCtx.effectivePlanCode);

    if (paidBaseline[config.capabilityKey] === true) {
      const refused = await quoteItem(user.id, ITEM_CODE);
      check("quoteItem refuses it", refused.ok === false);
      check(
        "and says why, in words the buyer can act on",
        refused.ok === false && refused.message.includes("pehle se shaamil"),
        refused.ok === false ? refused.message : "",
      );
      const paidOffers = await listItemOffers(paidBaseline);
      check(
        "the grid shows it blocked rather than hiding it",
        paidOffers.find((o) => o.item.code === ITEM_CODE)?.availability.buyable === false,
      );
    } else {
      console.log("  skip BASIC does not include this capability in the live catalog — nothing to refuse");
    }

    console.log("\nA subscription payment with no plan is refused, not defaulted");

    const brokenOrder = `test_order_${Date.now()}_c`;
    const broken = await prisma.payment.create({
      data: {
        userId: user.id,
        kind: "SUBSCRIPTION",
        planCode: null,
        amountPaise: 100,
        status: "CREATED",
        externalOrderId: brokenOrder,
        isTest: true,
      },
    });
    const brokenOutcome = await capture(broken.id, brokenOrder, 100);
    check("it is not handled", brokenOutcome.handled === false);
    check(
      "and no second subscription appeared",
      (await prisma.subscription.count({ where: { userId: user.id } })) === 1,
    );

    console.log(`\n${failures === 0 ? "PASS" : `FAIL — ${failures} check(s)`}`);
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  }
}

main()
  .catch((err) => {
    console.error(err);
    failures++;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(failures === 0 ? 0 : 1);
  });
