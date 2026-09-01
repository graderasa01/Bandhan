import "./_env";
import { existsSync, readFileSync } from "node:fs";
import { prisma } from "../lib/db/prisma";
import {
  reviewListing,
  setAvailability,
  setServiceAreas,
  saveListing,
  upsertService,
} from "../lib/services/marketplace/partnerListingService";
import { getPartnerCard, getPartnerStats, searchPartners } from "../lib/services/marketplace/marketplaceSearchService";
import {
  acceptBooking,
  acceptMilestone,
  acknowledgeBooking,
  adminResolveBooking,
  buyerCancelBooking,
  createBookingCheckout,
  disputeBooking,
  getServiceConfig,
  listBookingsForBuyer,
  quoteBooking,
  settleBooking,
  submitMilestone,
} from "../lib/services/marketplace/bookingService";
import { sendEnquiryMessage, getThreadForUser } from "../lib/services/marketplace/enquiryService";
import { createReview, listPartnerReviews } from "../lib/services/marketplace/reviewService";
import { redactContactDetails, SERVICE_KIND_BY_KEY, splitBooking } from "../lib/services/marketplace/servicePolicy";
import { handleGatewayEvent } from "../lib/services/payments/subscriptionService";
import { getPartnerBalance, requestWithdrawal, transitionWithdrawal } from "../lib/services/payouts/payoutService";
import type { User } from "@prisma/client";

/**
 * Partner Marketplace + bookings — Phase 2.
 *
 * Walks a real booking end to end against the real database: a partner lists,
 * an admin approves, a member finds them, asks a question, pays, the partner
 * accepts and delivers, the member confirms, and the earning becomes
 * withdrawable. Then the unhappy paths — SLA miss, cancel, dispute, refund.
 *
 * **Never touches a gateway.** `createBookingCheckout` would reach Razorpay
 * (this machine has live keys), so it is exercised only through its refusals,
 * which return before an order exists. The happy path writes the `Payment` row
 * and the booking directly and hands a synthetic order to `handleGatewayEvent`
 * — the same trick `items-check.ts` and `spotlight-check.ts` use, and it still
 * exercises the real capture branch.
 *
 * Run: `npx tsx scripts/marketplace-check.ts`
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
const CITY = "MarketpurTest";

async function makeUser(name: string, role: "USER" | "PARTNER" = "USER"): Promise<User> {
  const user = await prisma.user.create({
    data: {
      fullName: `${name} Testkumar`,
      email: `mkt-${name}-${stamp}@local.test`,
      passwordHash: "x",
      role,
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });
  userIds.push(user.id);
  return user;
}

async function makePartner(user: User, status: "ACTIVE" | "SUSPENDED" = "ACTIVE") {
  return prisma.partner.create({
    data: {
      userId: user.id,
      fullName: `${user.fullName} Bureau`,
      organizationName: `${user.fullName} Rishta Seva`,
      mobileNumber: `9100${Math.floor(Math.random() * 900000 + 100000)}`,
      email: user.email,
      mobileVerifiedAt: new Date(),
      emailVerifiedAt: new Date(),
      city: CITY,
      state: "Rajasthan",
      partnerType: "MARRIAGE_BUREAU",
      status,
    },
  });
}

/** Writes the booking + payment the way `createBookingCheckout` does, minus the
 *  gateway call, then captures it through the real webhook path. */
async function bookAndCapture(buyerId: string, serviceId: string, note = "Test booking") {
  const quoted = await quoteBooking(serviceId);
  if (!quoted.ok) throw new Error(`quote failed: ${quoted.message}`);
  const config = await getServiceConfig();
  const split = splitBooking(quoted.quote.pricePaise, config.platformFeeBps);
  const orderId = `order_test_${Math.random().toString(36).slice(2, 12)}`;

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
      buyerNote: note,
    },
  });

  const outcome = await handleGatewayEvent({
    orderId,
    paymentId: `pay_test_${payment.id.slice(0, 8)}`,
    status: "CAPTURED",
    amountPaise: quoted.quote.pricePaise,
  });

  return { bookingId: booking.id, paymentId: payment.id, outcome, price: quoted.quote.pricePaise };
}

async function cleanup() {
  const partners = await prisma.partner.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
  const partnerIds = partners.map((p) => p.id);
  // Withdrawals do not cascade from a partner's User row via allocations, so
  // they are cleared explicitly before the users go.
  await prisma.partnerWithdrawal.deleteMany({ where: { partnerId: { in: partnerIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function main() {
  console.log("\nPartner Marketplace + bookings — Phase 2\n");

  /* ---------------------------------------------------------------- */
  console.log("Listing & visibility");
  /* ---------------------------------------------------------------- */

  const partnerUser = await makeUser("Pandit", "PARTNER");
  const partner = await makePartner(partnerUser);
  const buyer = await makeUser("Riya");
  const other = await makeUser("Vikas");

  await saveListing(partner.id, {
    isListed: true,
    headline: "18 saal se Jaipur me rishte",
    about: "Hum parivaar se milkar kaam karte hain.",
    languages: ["Hindi", "Marwari"],
  });
  await setServiceAreas(partner.id, [{ city: CITY }]);
  await setAvailability(partner.id, { acceptingBookings: true, weeklyCapacity: 3 });

  const spec = SERVICE_KIND_BY_KEY.CURATED_SHORTLIST;
  const noDeliverables = await upsertService(partner.id, {
    kind: "CURATED_SHORTLIST",
    name: "Shortlist",
    scope: null,
    deliverables: [],
    priceInPaise: spec.minPricePaise,
    deliveryDays: 7,
    acceptSlaHours: null,
    cancellationPolicy: null,
    isActive: true,
  });
  check(
    "2. a service with no deliverable cannot be created",
    !noDeliverables.ok && noDeliverables.error === "NO_DELIVERABLES",
  );

  const underpriced = await upsertService(partner.id, {
    kind: "CURATED_SHORTLIST",
    name: "Shortlist",
    scope: null,
    deliverables: ["10 profiles"],
    priceInPaise: 100,
    deliveryDays: 7,
    acceptSlaHours: null,
    cancellationPolicy: null,
    isActive: true,
  });
  check("13. a price outside the band is refused", !underpriced.ok && underpriced.error === "PRICE_OUT_OF_BAND");

  const created = await upsertService(partner.id, {
    kind: "CURATED_SHORTLIST",
    name: "Curated Shortlist — Jaipur",
    scope: "10 profiles, har ek par wajah.",
    deliverables: ["10 eligible profiles", "Har profile par ek wajah"],
    // Priced well above the band floor on purpose: the partner's 85% share has
    // to clear the real ₹500 withdrawal minimum, and mutating the global
    // `PartnerCommissionConfig` row to dodge that would leave the check
    // rewriting production config to make itself pass.
    priceInPaise: 2_00_000,
    deliveryDays: 7,
    acceptSlaHours: 48,
    cancellationPolicy: "Accept se pehle poora refund.",
    isActive: true,
  });
  check("2b. a valid service is created", created.ok);
  if (!created.ok) throw new Error("no service");
  const serviceId = created.serviceId;

  const beforeApproval = await searchPartners();
  check(
    "11. an unapproved listing does not appear publicly",
    !beforeApproval.some((p) => p.partnerId === partner.id),
  );

  const admin = await makeUser("Adminish");
  await reviewListing({ partnerId: partner.id, approve: true, actorId: admin.id, actorRole: "ADMIN" });

  const listed = await searchPartners();
  check("11b. an approved listing appears", listed.some((p) => p.partnerId === partner.id));

  const byCity = await searchPartners({ city: CITY.toLowerCase() });
  check("11c. the city filter matches case-insensitively", byCity.some((p) => p.partnerId === partner.id));
  const byWrongKind = await searchPartners({ kind: "ASSISTED_SEARCH" });
  check("11d. the service filter excludes what a partner does not offer", !byWrongKind.some((p) => p.partnerId === partner.id));
  const byWrongCity = await searchPartners({ city: "NowhereCity" });
  check("11e. the city filter still applies the listed/status floor", byWrongCity.length === 0);

  const card = await getPartnerCard(partner.id);
  const cardJson = JSON.stringify(card);
  const contactLeaks = [partner.mobileNumber, partner.email ?? "@@none@@"].filter((v) => cardJson.includes(v));
  check("1. the public card carries no contact detail", contactLeaks.length === 0, contactLeaks.join(", "));
  check(
    "1b. and no field on it could hold one",
    card !== null && !Object.keys(card).some((k) => /phone|mobile|email|contact|address/i.test(k)),
  );

  check(
    "17. stats stay null below the evidence threshold",
    card?.stats.completionRatePercent === null && card?.stats.medianAcceptHours === null,
  );

  /* ---------------------------------------------------------------- */
  console.log("\nPre-booking messaging");
  /* ---------------------------------------------------------------- */

  const scrub = redactContactDetails("Mera number 98765 43210 hai, mail bhi kar dijiye a.b@c.com par");
  check(
    "1c. the scrubber removes a phone and an email",
    scrub.redacted && !/98765/.test(scrub.body) && !/a\.b@c\.com/.test(scrub.body),
  );
  const priceKept = redactContactDetails("Ye ₹2,49,900 ka package hai");
  check("1d. and leaves a price alone", !priceKept.redacted && priceKept.body.includes("2,49,900"));

  const msg = await sendEnquiryMessage({
    partnerId: partner.id,
    userId: buyer.id,
    author: "USER",
    body: "Namaste, mera number 9876543210 hai — call kar lijiye",
  });
  check("1e. an enquiry is accepted", msg.ok);
  const thread = await getThreadForUser(buyer.id, partner.id);
  check(
    "1f. and what is *stored* is already redacted",
    thread !== null && !thread.messages[0].body.includes("9876543210") && thread.messages[0].redacted,
  );

  /* ---------------------------------------------------------------- */
  console.log("\nCheckout disclosure");
  /* ---------------------------------------------------------------- */

  const quoted = await quoteBooking(serviceId);
  check(
    "10. the quote carries price, split, deliverables, SLA, refund window and cancellation",
    quoted.ok &&
      quoted.quote.pricePaise > 0 &&
      quoted.quote.platformFeePaise + quoted.quote.partnerAmountPaise === quoted.quote.pricePaise &&
      quoted.quote.deliverables.length > 0 &&
      quoted.quote.acceptSlaHours > 0 &&
      quoted.quote.refundWindowDays > 0 &&
      Boolean(quoted.quote.cancellationPolicy),
  );
  check(
    "10b. and the no-guarantee line plus what the partner will see",
    quoted.ok && quoted.quote.noGuaranteeNote.length > 0 && quoted.quote.dataSharedNote.length > 0,
  );

  const selfBooking = await createBookingCheckout({ buyerUserId: partnerUser.id, serviceId });
  check(
    "6. a partner cannot buy their own service (circular booking refused)",
    !selfBooking.ok && selfBooking.error === "SELF_BOOKING",
  );

  /* ---------------------------------------------------------------- */
  console.log("\nHappy path");
  /* ---------------------------------------------------------------- */

  const first = await bookAndCapture(buyer.id, serviceId);
  check("3a. capture is handled", first.outcome.handled);

  const afterCapture = await prisma.serviceBooking.findUnique({
    where: { id: first.bookingId },
    include: { milestones: true, allocation: true },
  });
  check("3b. capture moves the booking to PAID and starts the SLA clock", afterCapture?.status === "PAID" && afterCapture.acceptBySla !== null);
  check(
    "2c. every deliverable became a milestone",
    afterCapture?.milestones.length === 2,
    String(afterCapture?.milestones.length),
  );
  check("5a. the partner's share is HELD, not available", afterCapture?.allocation?.status === "HELD");

  const noCommission = await prisma.partnerCommission.findFirst({ where: { paymentId: first.paymentId } });
  check("5b. a booking writes no referral commission", noCommission === null);

  const noDelegation = await prisma.profileDelegation.findFirst({
    where: { ownerUserId: buyer.id, partnerId: partner.id },
  });
  check("9. paying a partner grants them no profile access", noDelegation === null);

  const heldBalance = await getPartnerBalance(partner.id);
  check("5c. HELD money is not in the partner's available balance", heldBalance.availablePaise === 0);

  check("4a. a not-yet-completed booking cannot be reviewed", !(await createReview({
    bookingId: first.bookingId,
    authorUserId: buyer.id,
    rating: 5,
  })).ok);

  check("3c. the partner accepts", (await acceptBooking(partner.id, first.bookingId)).ok);

  const milestones = await prisma.serviceMilestone.findMany({ where: { bookingId: first.bookingId }, orderBy: { position: "asc" } });
  for (const m of milestones) {
    await submitMilestone(partner.id, m.id, "Ho gaya");
  }
  const afterSubmit = await prisma.serviceBooking.findUnique({ where: { id: first.bookingId } });
  check(
    "3d. all milestones submitted marks the booking DELIVERED and opens the refund window",
    afterSubmit?.status === "DELIVERED" && afterSubmit.refundWindowEndsAt !== null,
  );

  const stillHeld = await prisma.servicePaymentAllocation.findUnique({ where: { bookingId: first.bookingId } });
  check("5d. delivery alone does not release the money", stillHeld?.status === "HELD");

  for (const m of milestones) await acceptMilestone(buyer.id, m.id);
  check("3e. the buyer acknowledges", (await acknowledgeBooking(buyer.id, first.bookingId)).ok);

  const completed = await prisma.serviceBooking.findUnique({
    where: { id: first.bookingId },
    include: { allocation: true },
  });
  check("3f. the booking completes", completed?.status === "COMPLETED");
  check("5e. and only then is the earning RELEASED", completed?.allocation?.status === "RELEASED");

  const balance = await getPartnerBalance(partner.id);
  check(
    "15. a released service earning reaches the partner's available balance",
    balance.availablePaise === completed!.partnerAmountPaise,
    `${balance.availablePaise} vs ${completed!.partnerAmountPaise}`,
  );

  /* ---------------------------------------------------------------- */
  console.log("\nReviews");
  /* ---------------------------------------------------------------- */

  const wrongAuthor = await createReview({ bookingId: first.bookingId, authorUserId: other.id, rating: 5 });
  check("4b. somebody who did not pay cannot review", !wrongAuthor.ok);

  const review = await createReview({ bookingId: first.bookingId, authorUserId: buyer.id, rating: 5, body: "Bahut madad ki." });
  check("4. the buyer can review a completed booking", review.ok);

  const twice = await createReview({ bookingId: first.bookingId, authorUserId: buyer.id, rating: 1 });
  check("4c. and only once", !twice.ok && twice.error === "ALREADY_REVIEWED");

  const publicReviews = await listPartnerReviews(partner.id);
  check(
    "4d. the public review shows a first name only",
    publicReviews.length === 1 && publicReviews[0].authorFirstName === "Riya" && !publicReviews[0].authorFirstName.includes("Testkumar"),
  );

  /* ---------------------------------------------------------------- */
  console.log("\nSLA miss auto-refunds");
  /* ---------------------------------------------------------------- */

  const slaBooking = await bookAndCapture(other.id, serviceId, "SLA test");
  await prisma.serviceBooking.update({
    where: { id: slaBooking.bookingId },
    data: { acceptBySla: new Date(Date.now() - 60_000) },
  });

  const stale = await prisma.serviceBooking.findUnique({ where: { id: slaBooking.bookingId } });
  const settled = await settleBooking(stale!);
  check("3. a missed acceptance SLA auto-refunds on the next read", settled.status === "EXPIRED_UNACCEPTED");

  const slaAlloc = await prisma.servicePaymentAllocation.findUnique({ where: { bookingId: slaBooking.bookingId } });
  check("5f. and reverses the partner's earning", slaAlloc?.status === "REVERSED");
  const slaPayment = await prisma.payment.findUnique({ where: { id: slaBooking.paymentId } });
  check("5g. and marks the payment REFUNDED", slaPayment?.status === "REFUNDED");

  const lateAccept = await acceptBooking(partner.id, slaBooking.bookingId);
  check("3g. the partner cannot accept after the clock ran out", !lateAccept.ok);

  /* ---------------------------------------------------------------- */
  console.log("\nCancel, dispute, refund");
  /* ---------------------------------------------------------------- */

  const cancelBooking = await bookAndCapture(buyer.id, serviceId, "Cancel test");
  const cancelled = await buyerCancelBooking(buyer.id, cancelBooking.bookingId, "Galti se ho gaya");
  check("7a. the buyer can cancel before the partner accepts", cancelled.ok);
  const cancelAlloc = await prisma.servicePaymentAllocation.findUnique({ where: { bookingId: cancelBooking.bookingId } });
  check("7b. cancelling reverses the earning", cancelAlloc?.status === "REVERSED");

  const disputeBookingRow = await bookAndCapture(other.id, serviceId, "Dispute test");
  await acceptBooking(partner.id, disputeBookingRow.bookingId);
  const lateCancel = await buyerCancelBooking(other.id, disputeBookingRow.bookingId, "ab nahi chahiye");
  check("7c. after acceptance the buyer must dispute rather than self-cancel", !lateCancel.ok);

  const disputed = await disputeBooking(other.id, disputeBookingRow.bookingId, "Kaam bilkul nahi hua");
  check("3h. a dispute is recorded", disputed.ok);
  const disputedRow = await prisma.serviceBooking.findUnique({ where: { id: disputeBookingRow.bookingId } });
  check(
    "3i. and freezes the refund window so nothing auto-completes under it",
    disputedRow?.status === "DISPUTED" && disputedRow.refundWindowEndsAt === null,
  );

  const adminRefund = await adminResolveBooking({
    bookingId: disputeBookingRow.bookingId,
    action: "refund",
    note: "Client sahi hai — kaam nahi hua.",
    actorId: admin.id,
    actorRole: "ADMIN",
  });
  check("7. an admin can refund a disputed booking", adminRefund.ok);
  const refundedAlloc = await prisma.servicePaymentAllocation.findUnique({ where: { bookingId: disputeBookingRow.bookingId } });
  check("7d. which reverses the earning", refundedAlloc?.status === "REVERSED");
  const auditRow = await prisma.adminAuditLog.findFirst({
    where: { targetType: "service_booking", targetId: disputeBookingRow.bookingId },
  });
  check("7e. and writes an audit row with a reason", auditRow !== null && Boolean(auditRow?.reason));

  /* ---------------------------------------------------------------- */
  console.log("\nRefund after release claws the money back");
  /* ---------------------------------------------------------------- */

  const lateDispute = await bookAndCapture(buyer.id, serviceId, "Late dispute");
  await acceptBooking(partner.id, lateDispute.bookingId);
  const lateMilestones = await prisma.serviceMilestone.findMany({ where: { bookingId: lateDispute.bookingId } });
  for (const m of lateMilestones) await submitMilestone(partner.id, m.id, "done");
  await acknowledgeBooking(buyer.id, lateDispute.bookingId);

  const releasedBefore = await getPartnerBalance(partner.id);
  const lateRow = await prisma.serviceBooking.findUnique({ where: { id: lateDispute.bookingId } });
  const lateRefund = await adminResolveBooking({
    bookingId: lateDispute.bookingId,
    action: "refund",
    note: "Baad me pata chala kaam nakli tha.",
    actorId: admin.id,
    actorRole: "ADMIN",
  });
  check("7f. an admin can refund even a COMPLETED booking", lateRefund.ok);
  const releasedAfter = await getPartnerBalance(partner.id);
  check(
    "7g. and the already-RELEASED earning leaves the balance exactly",
    releasedAfter.availablePaise === releasedBefore.availablePaise - lateRow!.partnerAmountPaise,
    `${releasedBefore.availablePaise} → ${releasedAfter.availablePaise}, expected -${lateRow!.partnerAmountPaise}`,
  );

  /* ---------------------------------------------------------------- */
  console.log("\nWithdrawal settles both earning streams");
  /* ---------------------------------------------------------------- */

  await prisma.partnerPayoutAccount.create({
    data: {
      partnerId: partner.id,
      method: "UPI",
      accountHolderName: "Pandit Testkumar",
      upiCipher: "x",
      upiIv: "x",
      upiTag: "x",
      upiLast4: "1234",
      verifiedAt: new Date(),
      verifiedBy: admin.id,
    },
  });
  const balanceForWithdrawal = await getPartnerBalance(partner.id);
  const withdrawal = await requestWithdrawal(partner.id);
  check(
    "15b. a withdrawal picks up the released service earning",
    withdrawal.ok && withdrawal.amountPaise === balanceForWithdrawal.availablePaise,
    withdrawal.ok ? `${withdrawal.amountPaise} vs ${balanceForWithdrawal.availablePaise}` : withdrawal.message,
  );

  if (withdrawal.ok) {
    const attached = await prisma.servicePaymentAllocation.count({
      where: { withdrawalId: withdrawal.withdrawalId, status: "RELEASED" },
    });
    check("15c. and attaches the allocation to it", attached > 0);

    const inFlight = await getPartnerBalance(partner.id);
    check("15d. attached money leaves the available balance", inFlight.availablePaise === 0 && inFlight.inFlightPaise > 0);

    await transitionWithdrawal({
      withdrawalId: withdrawal.withdrawalId,
      action: "approve",
      actorId: admin.id,
      actorRole: "ADMIN",
    });
    await transitionWithdrawal({
      withdrawalId: withdrawal.withdrawalId,
      action: "markPaid",
      utr: "UTRTEST123",
      actorId: admin.id,
      actorRole: "ADMIN",
    });
    const paidAlloc = await prisma.servicePaymentAllocation.findFirst({
      where: { withdrawalId: withdrawal.withdrawalId },
    });
    check("15e. marking the withdrawal paid settles the allocation", paidAlloc?.status === "PAID");
  }

  /* ---------------------------------------------------------------- */
  console.log("\nCapacity, suspension and buyer view");
  /* ---------------------------------------------------------------- */

  await setAvailability(partner.id, { acceptingBookings: false, weeklyCapacity: 3 });
  const paused = await createBookingCheckout({ buyerUserId: other.id, serviceId });
  check("14. a paused partner refuses new bookings", !paused.ok && paused.error === "NOT_ACCEPTING");
  const pausedSearch = await searchPartners({ availableOnly: true });
  check("14b. and drops out of an availability-filtered search", !pausedSearch.some((p) => p.partnerId === partner.id));
  await setAvailability(partner.id, { acceptingBookings: true, weeklyCapacity: 3 });

  await prisma.partner.update({ where: { id: partner.id }, data: { status: "SUSPENDED" } });
  const suspendedSearch = await searchPartners();
  check("12. a suspended partner disappears from the marketplace immediately", !suspendedSearch.some((p) => p.partnerId === partner.id));
  const suspendedQuote = await quoteBooking(serviceId);
  check("12b. and their services can no longer be quoted", !suspendedQuote.ok);
  await prisma.partner.update({ where: { id: partner.id }, data: { status: "ACTIVE" } });

  const buyerView = await listBookingsForBuyer(buyer.id);
  check("16. the buyer's own list reads back", buyerView.length >= 3);

  const stats = await getPartnerStats(partner.id);
  check(
    "17b. stats appear once there is enough evidence",
    stats.completionRatePercent !== null && stats.averageRating === 5,
    `${stats.completionRatePercent} / ${stats.averageRating}`,
  );

  /* ---------------------------------------------------------------- */
  console.log("\nOther money paths untouched");
  /* ---------------------------------------------------------------- */

  const subUser = await makeUser("Subscriber");
  const subOrder = `order_sub_${stamp}`;
  const subPayment = await prisma.payment.create({
    data: {
      userId: subUser.id,
      kind: "SUBSCRIPTION",
      planCode: "BASIC",
      amountPaise: 99900,
      status: "CREATED",
      isTest: true,
      externalOrderId: subOrder,
    },
  });
  const subOutcome = await handleGatewayEvent({
    orderId: subOrder,
    paymentId: `pay_sub_${stamp}`,
    status: "CAPTURED",
    amountPaise: 99900,
  });
  const sub = await prisma.subscription.findFirst({ where: { userId: subUser.id } });
  check(
    "16b. the subscription capture path still creates a subscription",
    subOutcome.handled && sub?.planCode === "BASIC",
  );
  void subPayment;

  /* ---------------------------------------------------------------- */
  console.log("\nClient bundle boundary");
  /* ---------------------------------------------------------------- */

  const leaks = clientModulesReachingServerOnly([
    "components/marketplace/PartnerBrowser.tsx",
    "components/marketplace/EnquiryPanel.tsx",
    "components/marketplace/BookingCheckout.tsx",
    "components/marketplace/MyServicesClient.tsx",
    "components/marketplace/ListingEditor.tsx",
    "components/marketplace/PartnerBookingsClient.tsx",
    "components/marketplace/PartnerEnquiriesClient.tsx",
    "components/marketplace/AdminServiceConsole.tsx",
  ]);
  check("18. no marketplace client component value-imports a server-only module", leaks.length === 0, leaks.join("; "));

  console.log(failures === 0 ? "\nAll marketplace checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
}

/**
 * Same walker `managed-profile-check.ts` uses, and here for the same reason:
 * this environment cannot run `next build` (no network → `next/font` fails), so
 * the one build error that would otherwise go unnoticed — a `"use client"`
 * module value-importing something marked `server-only` — is asserted directly.
 */
function clientModulesReachingServerOnly(entries: string[]): string[] {
  const problems: string[] = [];

  function resolve(spec: string, fromFile: string): string | null {
    let base: string;
    if (spec.startsWith("@/")) base = spec.slice(2);
    else if (spec.startsWith(".")) base = pathJoin(dirname(fromFile), spec);
    else return null;
    for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
      const candidate = `${base}${ext}`;
      if (existsSync(candidate)) return candidate;
    }
    return existsSync(base) ? base : null;
  }

  function walk(file: string, trail: string[], seen: Set<string>) {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(file, "utf8");
    if (/^\s*import\s+["']server-only["']/m.test(src) && trail.length > 0) {
      problems.push(`${trail[0]} → ${[...trail.slice(1), file].join(" → ")}`);
      return;
    }
    const importRe = /import\s+(type\s+)?([\s\S]*?)from\s+["']([^"']+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(src))) {
      const [, typeKeyword, clause, spec] = m;
      if (typeKeyword) continue;
      const bindings = clause.trim();
      if (
        bindings.startsWith("{") &&
        bindings
          .replace(/[{}]/g, "")
          .split(",")
          .every((b) => !b.trim() || b.trim().startsWith("type "))
      ) {
        continue;
      }
      const resolved = resolve(spec, file);
      if (resolved) walk(resolved, [...trail, file], seen);
    }
  }

  for (const entry of entries) walk(entry, [], new Set());
  return problems;
}

function dirname(p: string): string {
  return p.slice(0, p.lastIndexOf("/"));
}

function pathJoin(dir: string, rel: string): string {
  const parts = `${dir}/${rel}`.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

main()
  .catch((err) => {
    failures++;
    console.error("\nUNCAUGHT:", err);
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
    process.exit(failures === 0 ? 0 : 1);
  });
