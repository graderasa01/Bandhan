import "./_env";
import { prisma } from "../lib/db/prisma";
import {
  acceptBooking,
  acknowledgeBooking,
  adminResolveBooking,
  createBookingCheckout,
  getServiceConfig,
  quoteBooking,
  submitMilestone,
} from "../lib/services/marketplace/bookingService";
import { splitBooking } from "../lib/services/marketplace/servicePolicy";
import {
  reviewListing,
  saveListing,
  setAvailability,
  setServiceAreas,
  upsertService,
} from "../lib/services/marketplace/partnerListingService";
import { handleGatewayEvent } from "../lib/services/payments/subscriptionService";
import {
  getPartnerBalance,
  requestWithdrawal,
  savePayoutAccount,
  transitionWithdrawal,
  verifyPayoutAccount,
} from "../lib/services/payouts/payoutService";
import { getEarningsStatement } from "../lib/services/payouts/earningsStatement";
import {
  getVerificationFee,
  setServiceBand,
  setServicePriceOverride,
  setVerificationFee,
} from "../lib/services/marketplace/pricingControl";
import { createVerificationRequest } from "../lib/services/verification/verificationRequestService";
import { listRecoveries, waiveRecovery } from "../lib/services/payouts/recoveryService";
import { Prisma, type User } from "@prisma/client";

/**
 * Service earnings and the recovery ledger — Phase 6.
 *
 * Run: `npx tsx scripts/service-earnings-check.ts`
 *
 * Phase 2 built this money and its own checker covers the happy path. What this
 * one protects is the arithmetic nobody sees until something goes wrong:
 *
 *   1. **Nothing is earned before the work settles.** HELD money is not a
 *      balance, and no path releases it early.
 *
 *   2. **The two earning streams stay separate.** A service booking never
 *      writes a referral commission row — one transaction, one ledger.
 *
 *   3. **A refund always lands somewhere.** Reversible while the money is
 *      still here; recorded as a debt once it has left; netted off the next
 *      payout; never a negative balance on a partner's screen.
 */

let failures = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const stamp = Date.now();
const userIds: string[] = [];
const CITY = "EarnpurTest";
const PRICE = 2_00_000; // ₹2,000 — clears the ₹500 withdrawal minimum on the partner's share.

async function makeUser(name: string, role: "USER" | "PARTNER" | "ADMIN" = "USER"): Promise<User> {
  const user = await prisma.user.create({
    data: {
      fullName: `${name} Earnkumar`,
      email: `earn-${name}-${stamp}@local.test`,
      passwordHash: "x",
      role,
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });
  userIds.push(user.id);
  return user;
}

/**
 * The pricing section below edits the *global* config row, which every other
 * partner and member reads. `marketplace-check` refuses to touch that row at
 * all for exactly this reason — a check that rewrites production pricing to
 * make itself pass is worse than no check. This one does touch it, so it puts
 * back byte-for-byte what it found, whatever happens.
 */
let originalPricing: { bands: unknown; fees: unknown } | null = null;

async function stashPricing() {
  const row = await prisma.partnerCommissionConfig.findUnique({
    where: { id: "default" },
    select: { serviceBandOverrides: true, verificationFeeOverrides: true },
  });
  originalPricing = { bands: row?.serviceBandOverrides ?? null, fees: row?.verificationFeeOverrides ?? null };
}

async function cleanup() {
  if (originalPricing) {
    await prisma.partnerCommissionConfig
      .update({
        where: { id: "default" },
        data: {
          serviceBandOverrides: (originalPricing.bands ?? Prisma.DbNull) as Prisma.InputJsonValue,
          verificationFeeOverrides: (originalPricing.fees ?? Prisma.DbNull) as Prisma.InputJsonValue,
        },
      })
      .catch(() => {
        /* a config row that vanished mid-run is not worth failing cleanup over */
      });
  }
  await prisma.adminAuditLog.deleteMany({ where: { actorId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

/** The booking + capture path, minus the gateway call — same shape marketplace-check uses. */
async function bookAndCapture(buyerId: string, serviceId: string) {
  const quoted = await quoteBooking(serviceId);
  if (!quoted.ok) throw new Error(`quote failed: ${quoted.message}`);
  const config = await getServiceConfig();
  const split = splitBooking(quoted.quote.pricePaise, config.platformFeeBps);
  const orderId = `order_earn_${Math.random().toString(36).slice(2, 12)}`;

  const payment = await prisma.payment.create({
    data: {
      userId: buyerId,
      kind: "SERVICE_BOOKING",
      amountPaise: quoted.quote.pricePaise,
      status: "CREATED",
      isTest: true,
      externalOrderId: orderId,
    },
  });
  const booking = await prisma.serviceBooking.create({
    data: {
      partnerId: quoted.quote.partnerId,
      serviceId,
      buyerUserId: buyerId,
      beneficiaryUserId: buyerId,
      status: "PENDING_PAYMENT",
      pricePaise: quoted.quote.pricePaise,
      platformFeeBps: config.platformFeeBps,
      platformFeePaise: split.platformFeePaise,
      partnerAmountPaise: split.partnerAmountPaise,
      paymentId: payment.id,
    },
  });

  await handleGatewayEvent({
    orderId,
    paymentId: `pay_earn_${payment.id.slice(0, 8)}`,
    status: "CAPTURED",
    amountPaise: quoted.quote.pricePaise,
  });
  return { bookingId: booking.id, partnerSharePaise: split.partnerAmountPaise };
}

/** Accept -> deliver every milestone -> buyer acknowledges. The full happy path. */
async function deliverAndComplete(partnerId: string, buyerId: string, bookingId: string) {
  await acceptBooking(partnerId, bookingId);
  const milestones = await prisma.serviceMilestone.findMany({ where: { bookingId } });
  for (const m of milestones) await submitMilestone(partnerId, m.id, "Ho gaya");
  await acknowledgeBooking(buyerId, bookingId);
}

async function main() {
  console.log("\nService earnings and the recovery ledger — Phase 6\n");
  await stashPricing();

  const partnerUser = await makeUser("Bureau", "PARTNER");
  const buyer = await makeUser("Buyer");
  const admin = await makeUser("Admin", "ADMIN");

  const partner = await prisma.partner.create({
    data: {
      userId: partnerUser.id,
      fullName: "Earnkumar Bureau",
      organizationName: "Earnkumar Rishta Seva",
      mobileNumber: `9500${Math.floor(Math.random() * 900000 + 100000)}`,
      email: partnerUser.email,
      mobileVerifiedAt: new Date(),
      emailVerifiedAt: new Date(),
      city: CITY,
      state: "Rajasthan",
      partnerType: "MARRIAGE_BUREAU",
      status: "ACTIVE",
    },
  });

  await saveListing(partner.id, { isListed: true, headline: "Test", about: "Test", languages: ["Hindi"] });
  await setServiceAreas(partner.id, [{ city: CITY }]);
  await setAvailability(partner.id, { acceptingBookings: true, weeklyCapacity: 20 });

  const created = await upsertService(partner.id, {
    kind: "CURATED_SHORTLIST",
    name: "Curated Shortlist",
    scope: "10 profiles",
    deliverables: ["10 eligible profiles"],
    priceInPaise: PRICE,
    deliveryDays: 7,
    acceptSlaHours: 48,
    cancellationPolicy: "Accept se pehle poora refund.",
    isActive: true,
  });
  if (!created.ok) throw new Error("no service");
  const serviceId = created.serviceId;

  // A listing only becomes bookable once an admin approves it — the same gate
  // the marketplace checker walks through.
  await reviewListing({ partnerId: partner.id, approve: true, actorId: admin.id, actorRole: "ADMIN" });

  // A verified payout account, so withdrawal eligibility is about money rather
  // than about paperwork.
  await savePayoutAccount(partner.id, {
    method: "UPI",
    accountHolderName: "Earnkumar",
    upiId: `earn${stamp}@upi`,
  });
  await verifyPayoutAccount({ partnerId: partner.id, approve: true, actorId: admin.id, actorRole: "ADMIN" });

  /* ---------------------------------------------------------------- */
  console.log("Nothing is earned before the work settles");
  /* ---------------------------------------------------------------- */

  const first = await bookAndCapture(buyer.id, serviceId);
  let balance = await getPartnerBalance(partner.id);
  check("money captured, and none of it is a balance yet", balance.availablePaise === 0, String(balance.availablePaise));
  check(
    "the allocation is holding it",
    (await prisma.servicePaymentAllocation.findFirstOrThrow({ where: { bookingId: first.bookingId } })).status ===
      "HELD",
  );

  await acceptBooking(partner.id, first.bookingId);
  const firstMilestones = await prisma.serviceMilestone.findMany({ where: { bookingId: first.bookingId } });
  for (const m of firstMilestones) await submitMilestone(partner.id, m.id, "Ho gaya");
  balance = await getPartnerBalance(partner.id);
  check("delivered but not acknowledged is still not a balance", balance.availablePaise === 0);

  await acknowledgeBooking(buyer.id, first.bookingId);
  balance = await getPartnerBalance(partner.id);
  check(
    "acknowledgement is what makes it withdrawable",
    balance.availablePaise === first.partnerSharePaise,
    `${balance.availablePaise} vs ${first.partnerSharePaise}`,
  );

  /* ---------------------------------------------------------------- */
  console.log("\nThe two earning streams stay separate");
  /* ---------------------------------------------------------------- */

  check(
    "a service booking writes no referral commission",
    (await prisma.partnerCommission.count({ where: { partnerId: partner.id } })) === 0,
  );
  const statement = await getEarningsStatement(partner.id);
  check(
    "and the statement shows it as a service line",
    statement.lines.some((l) => l.kind === "SERVICE" && l.netPaise === first.partnerSharePaise),
  );
  check("with the platform's cut on the same line", statement.lines[0]?.platformFeePaise > 0);

  /* ---------------------------------------------------------------- */
  console.log("\nA refund before payout simply reverses");
  /* ---------------------------------------------------------------- */

  const second = await bookAndCapture(buyer.id, serviceId);
  await deliverAndComplete(partner.id, buyer.id, second.bookingId);
  balance = await getPartnerBalance(partner.id);
  check("two completed bookings, both withdrawable", balance.availablePaise === first.partnerSharePaise * 2);

  const refunded = await adminResolveBooking({
    bookingId: second.bookingId,
    action: "refund",
    note: "Buyer ne shikayat ki, kaam nahi hua.",
    actorId: admin.id,
    actorRole: "ADMIN",
  });
  check("an admin can refund a completed booking", refunded.ok);
  check(
    "the allocation is reversed",
    (await prisma.servicePaymentAllocation.findFirstOrThrow({ where: { bookingId: second.bookingId } })).status ===
      "REVERSED",
  );
  balance = await getPartnerBalance(partner.id);
  check("the money leaves the balance", balance.availablePaise === first.partnerSharePaise);
  check("and no debt was invented — it was still here", balance.owedPaise === 0);

  /* ---------------------------------------------------------------- */
  console.log("\nA refund after payout becomes a debt");
  /* ---------------------------------------------------------------- */

  const preW = await getPartnerBalance(partner.id);
  const w1 = await requestWithdrawal(partner.id);
  check(
    "the partner withdraws what they earned",
    w1.ok,
    w1.ok ? "" : `${w1.message} | available=${preW.availablePaise} blocked=${preW.blockedReason}`,
  );
  if (!w1.ok) throw new Error("no withdrawal");
  check("for exactly the released amount", w1.amountPaise === first.partnerSharePaise);

  await transitionWithdrawal({ withdrawalId: w1.withdrawalId, action: "approve", actorId: admin.id, actorRole: "ADMIN" });
  await transitionWithdrawal({
    withdrawalId: w1.withdrawalId,
    action: "markPaid",
    utr: "UTR123456",
    actorId: admin.id,
    actorRole: "ADMIN",
  });
  check(
    "and the allocation is marked paid",
    (await prisma.servicePaymentAllocation.findFirstOrThrow({ where: { bookingId: first.bookingId } })).status ===
      "PAID",
  );

  const lateRefund = await adminResolveBooking({
    bookingId: first.bookingId,
    action: "refund",
    note: "Baad me pata chala ki kaam farzi tha.",
    actorId: admin.id,
    actorRole: "ADMIN",
  });
  check("the paid-out booking can still be refunded", lateRefund.ok);

  let recoveries = await listRecoveries(partner.id);
  check("a debt is recorded", recoveries.length === 1);
  check(
    "for the partner's share, not the whole price",
    recoveries[0]?.outstandingPaise === first.partnerSharePaise,
    String(recoveries[0]?.outstandingPaise),
  );

  balance = await getPartnerBalance(partner.id);
  check("the balance shows what is owed", balance.owedPaise === first.partnerSharePaise);
  check("and never goes negative", balance.availablePaise === 0, String(balance.availablePaise));

  // Refunding twice must not charge twice.
  await adminResolveBooking({
    bookingId: first.bookingId,
    action: "refund",
    note: "Dobara.",
    actorId: admin.id,
    actorRole: "ADMIN",
  });
  check("refunding twice does not double the debt", (await listRecoveries(partner.id)).length === 1);

  /* ---------------------------------------------------------------- */
  console.log("\nThe next earnings pay it back");
  /* ---------------------------------------------------------------- */

  const third = await bookAndCapture(buyer.id, serviceId);
  await deliverAndComplete(partner.id, buyer.id, third.bookingId);
  balance = await getPartnerBalance(partner.id);
  check(
    "a new earning is netted against the debt",
    balance.availablePaise === 0,
    `${balance.availablePaise} available, ${balance.owedPaise} owed`,
  );

  const fourth = await bookAndCapture(buyer.id, serviceId);
  await deliverAndComplete(partner.id, buyer.id, fourth.bookingId);
  balance = await getPartnerBalance(partner.id);
  check(
    "once the debt is covered the rest is theirs",
    balance.availablePaise === first.partnerSharePaise,
    String(balance.availablePaise),
  );

  const w2 = await requestWithdrawal(partner.id);
  check("they can withdraw again", w2.ok);
  if (!w2.ok) throw new Error("no second withdrawal");
  check(
    "and the transfer is the earnings minus the debt",
    w2.amountPaise === first.partnerSharePaise,
    String(w2.amountPaise),
  );
  recoveries = await listRecoveries(partner.id);
  check("the debt is settled", recoveries[0]?.status === "SETTLED");
  check("with nothing outstanding", recoveries[0]?.outstandingPaise === 0);

  // Close it out: only one withdrawal may be open at a time, and the next
  // section needs to open its own.
  await transitionWithdrawal({ withdrawalId: w2.withdrawalId, action: "approve", actorId: admin.id, actorRole: "ADMIN" });
  await transitionWithdrawal({
    withdrawalId: w2.withdrawalId,
    action: "markPaid",
    utr: "UTR222222",
    actorId: admin.id,
    actorRole: "ADMIN",
  });

  /* ---------------------------------------------------------------- */
  console.log("\nA refund mid-request shrinks the request instead");
  /* ---------------------------------------------------------------- */

  const fifth = await bookAndCapture(buyer.id, serviceId);
  await deliverAndComplete(partner.id, buyer.id, fifth.bookingId);
  const sixth = await bookAndCapture(buyer.id, serviceId);
  await deliverAndComplete(partner.id, buyer.id, sixth.bookingId);

  const w3 = await requestWithdrawal(partner.id);
  if (!w3.ok) throw new Error("no third withdrawal");
  check("a request covering two bookings", w3.amountPaise === first.partnerSharePaise * 2);

  await adminResolveBooking({
    bookingId: fifth.bookingId,
    action: "refund",
    note: "Ek booking galat thi.",
    actorId: admin.id,
    actorRole: "ADMIN",
  });
  const shrunk = await prisma.partnerWithdrawal.findUniqueOrThrow({ where: { id: w3.withdrawalId } });
  check(
    "the pending transfer shrinks rather than creating a debt",
    shrunk.amountPaise === first.partnerSharePaise,
    String(shrunk.amountPaise),
  );
  check(
    "no new debt was created",
    (await prisma.partnerRecovery.count({ where: { partnerId: partner.id, status: "OPEN" } })) === 0,
  );

  /* ---------------------------------------------------------------- */
  console.log("\nWaiving");
  /* ---------------------------------------------------------------- */

  const seventh = await bookAndCapture(buyer.id, serviceId);
  await deliverAndComplete(partner.id, buyer.id, seventh.bookingId);
  const alloc = await prisma.servicePaymentAllocation.findFirstOrThrow({ where: { bookingId: seventh.bookingId } });
  // Simulate the money having left, without running a whole payout.
  await prisma.servicePaymentAllocation.update({ where: { id: alloc.id }, data: { status: "PAID", paidAt: new Date() } });
  await adminResolveBooking({
    bookingId: seventh.bookingId,
    action: "refund",
    note: "Refund ke baad pata chala.",
    actorId: admin.id,
    actorRole: "ADMIN",
  });

  const open = (await listRecoveries(partner.id)).find((r) => r.status === "OPEN");
  check("that debt is open", Boolean(open));

  const noReason = await waiveRecovery({ recoveryId: open!.id, adminUserId: admin.id, reason: "  " });
  check("waiving needs a reason", !noReason.ok && noReason.error === "REASON_REQUIRED");

  const waived = await waiveRecovery({
    recoveryId: open!.id,
    adminUserId: admin.id,
    reason: "Partner ki galti nahi thi, platform ne booking galat dikhayi.",
  });
  check("an admin can write it off", waived.ok);
  balance = await getPartnerBalance(partner.id);
  check("and the balance stops carrying it", balance.owedPaise === 0);
  check(
    "the write-off is in the admin audit log",
    (await prisma.adminAuditLog.count({ where: { actionType: "PARTNER_RECOVERY_WAIVED", targetId: open!.id } })) === 1,
  );

  /* ---------------------------------------------------------------- */
  console.log("\nAn admin can move every price");
  /* ---------------------------------------------------------------- */

  const actor = { actorId: admin.id, actorRole: "ADMIN" as const };

  // A band low enough for a cheap service, then a service priced inside it.
  const bandSet = await setServiceBand("INTRO_CALL", { minPricePaise: 0, maxPricePaise: 50_000 }, actor);
  check("the price band can be widened downwards", bandSet.ok);
  const cheap = await upsertService(partner.id, {
    kind: "INTRO_CALL",
    name: "Intro call",
    scope: null,
    deliverables: ["Ek 15 minute ki call"],
    priceInPaise: 5_000,
    deliveryDays: 3,
    acceptSlaHours: 48,
    cancellationPolicy: null,
    isActive: true,
  });
  check("and a price under the old code floor is now accepted", cheap.ok, cheap.ok ? "" : cheap.error);
  if (!cheap.ok) throw new Error("no cheap service");

  const overrideNoReason = await setServicePriceOverride(cheap.serviceId, 0, "  ", actor);
  check(
    "an override without a reason is refused",
    !overrideNoReason.ok && overrideNoReason.error === "REASON_REQUIRED",
  );

  const freeSet = await setServicePriceOverride(
    cheap.serviceId,
    0,
    "Pilot city — pehle 50 calls free.",
    actor,
  );
  check("an admin can make one partner's service free", freeSet.ok);

  const freeQuote = await quoteBooking(cheap.serviceId);
  check("the quote is now zero", freeQuote.ok && freeQuote.quote.pricePaise === 0);
  check(
    "and it still shows the partner's own price beside it",
    freeQuote.ok && freeQuote.quote.listPricePaise === 5_000,
  );

  const freeBooking = await createBookingCheckout({ buyerUserId: buyer.id, serviceId: cheap.serviceId });
  check("a free booking is created", freeBooking.ok);
  if (!freeBooking.ok) throw new Error("no free booking");
  check("without going near a gateway", freeBooking.free && freeBooking.paymentId === null);

  const freeRow = await prisma.serviceBooking.findUniqueOrThrow({ where: { id: freeBooking.bookingId } });
  check("it is already paid for", freeRow.status === "PAID");
  check("it has an acceptance clock", Boolean(freeRow.acceptBySla));
  check(
    "its deliverables became milestones",
    (await prisma.serviceMilestone.count({ where: { bookingId: freeBooking.bookingId } })) === 1,
  );
  const freeAlloc = await prisma.servicePaymentAllocation.findFirstOrThrow({
    where: { bookingId: freeBooking.bookingId },
  });
  check("and the partner earns nothing from it — honestly", freeAlloc.partnerAmountPaise === 0);

  const before = (await getPartnerBalance(partner.id)).availablePaise;
  await deliverAndComplete(partner.id, buyer.id, freeBooking.bookingId);
  check(
    "completing a free booking moves no money",
    (await getPartnerBalance(partner.id)).availablePaise === before,
  );

  const cleared = await setServicePriceOverride(cheap.serviceId, null, "Pilot khatam", actor);
  check("clearing the override is allowed", cleared.ok);
  const backQuote = await quoteBooking(cheap.serviceId);
  check(
    "and the partner's own price comes back untouched",
    backQuote.ok && backQuote.quote.pricePaise === 5_000 && backQuote.quote.listPricePaise === null,
  );

  /* ---- verification fees ---- */
  const feeSet = await setVerificationFee("IDENTITY", 0, actor);
  check("a verification can be made free", feeSet.ok);
  check("and the new fee is what the app reads", (await getVerificationFee("IDENTITY")) === 0);

  await prisma.interest.create({ data: { fromUserId: buyer.id, toUserId: admin.id, status: "PENDING" } });
  const askedFree = await createVerificationRequest({
    requesterUserId: buyer.id,
    subjectUserId: admin.id,
    kind: "IDENTITY",
    payer: "REQUESTER",
  });
  check("so asking for it costs nothing", askedFree.ok && askedFree.checkoutUrl === null);
  if (askedFree.ok) {
    const askedRow = await prisma.verificationRequest.findUniqueOrThrow({ where: { id: askedFree.requestId } });
    check("and the request froze the admin's fee, not the catalog's", askedRow.feePaise === 0);
  }

  check(
    "every price change is in the admin audit log",
    (await prisma.adminAuditLog.count({
      where: { actorId: admin.id, actionType: { startsWith: "PRICING_" } },
    })) >= 4,
  );

  console.log(`\n${failures === 0 ? "PASS" : `FAIL — ${failures} check(s)`}`);
}

main()
  .catch((err) => {
    console.error(err);
    failures++;
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
    process.exit(failures === 0 ? 0 : 1);
  });
