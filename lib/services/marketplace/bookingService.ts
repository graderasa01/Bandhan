import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getPaymentGateway, isTestGateway } from "@/lib/services/payments/gateway";
import { createNotice } from "@/lib/services/notice/noticeService";
import { getCapacity } from "./partnerListingService";
import {
  ACTIVE_BOOKING_STATUSES,
  ADMIN_REFUNDABLE_STATUSES,
  DEFAULT_ACCEPT_SLA_HOURS,
  DEFAULT_PLATFORM_FEE_BPS,
  DEFAULT_REFUND_WINDOW_DAYS,
  NO_GUARANTEE_NOTE,
  REFUNDABLE_STATUSES,
  SERVICE_KIND_BY_KEY,
  buyerMayCancelFreely,
  rupees,
  splitBooking,
} from "./servicePolicy";
import type { Payment, Prisma, Role, ServiceBooking, ServiceBookingStatus } from "@prisma/client";

/**
 * A booking's whole life: quote, pay, accept, deliver, settle — or refund.
 *
 * ## Why this is not the item flow
 *
 * `fulfilItemPayment` grants what was bought inside the capture transaction,
 * because an entitlement is a row and a row can be written instantly. A human
 * service cannot be: at capture, nothing has been delivered and the person who
 * has to do the work has not even agreed yet. So capture here does exactly one
 * thing — it starts a clock. Everything of value happens afterwards, and the
 * partner's money sits in `ServicePaymentAllocation` as HELD until it does.
 *
 * ## No cron, again
 *
 * Two deadlines matter: the partner's acceptance SLA, and the buyer's refund
 * window after delivery. Neither is driven by a scheduler — this codebase has
 * none (`DailyReel`, `Poll`, `CircleEvent` all made the same call, and Phase 1's
 * draft expiry did too). `settleBooking` computes both on read and writes the
 * result through, so a deployment with zero workers still auto-refunds a
 * missed SLA and still releases a partner's earnings on time. Every read path
 * in this file goes through it.
 *
 * ## Refunds are recorded here and moved by hand
 *
 * `PaymentGateway` has no refund method — the payout side is the same
 * (`payoutProvider()` is manual until RazorpayX keys exist). So an admin
 * refund flips `Payment.status` to REFUNDED, reverses the allocation and
 * notifies the buyer; the actual money leaves through Razorpay's dashboard.
 * That is honest about where the boundary is instead of pretending the button
 * moved money.
 *
 * ## Paying a partner never grants them anything
 *
 * There is deliberately no write to `ProfileDelegation` anywhere in this file.
 * A booking buys work; access to a profile is a separate consent the owner
 * gives on `/user/profile/access`. "Payment never silently grants data
 * permissions" is true here by there being no code path, not by a check.
 */

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

export async function getServiceConfig() {
  const row = await prisma.partnerCommissionConfig.findUnique({ where: { id: "default" } });
  return {
    platformFeeBps: row?.servicePlatformFeeBps ?? DEFAULT_PLATFORM_FEE_BPS,
    acceptSlaHours: row?.serviceAcceptSlaHours ?? DEFAULT_ACCEPT_SLA_HOURS,
    refundWindowDays: row?.serviceRefundWindowDays ?? DEFAULT_REFUND_WINDOW_DAYS,
  };
}

function addHours(from: Date, hours: number): Date {
  return new Date(from.getTime() + hours * 3_600_000);
}

function addDays(from: Date, days: number): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d;
}

export type BookingResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string; message: string; status: number };

function fail(error: string, message: string, status = 422) {
  return { ok: false as const, error, message, status };
}

/* ------------------------------------------------------------------ */
/* Quote                                                               */
/* ------------------------------------------------------------------ */

export interface BookingQuote {
  serviceId: string;
  partnerId: string;
  partnerName: string;
  kindLabel: string;
  promise: string;
  deliveryProof: string;
  name: string;
  scope: string | null;
  deliverables: string[];
  pricePaise: number;
  /** Shown in full at checkout — the plan requires list price, total and what
   *  the partner receives to be visible before paying. */
  platformFeePaise: number;
  partnerAmountPaise: number;
  deliveryDays: number;
  acceptSlaHours: number;
  refundWindowDays: number;
  cancellationPolicy: string | null;
  noGuaranteeNote: string;
  /** Exactly what the partner will be able to see once this is booked. */
  dataSharedNote: string;
}

/**
 * The one sentence that answers "what does the partner get to see about me?".
 *
 * A booking hands over the buyer's name and what they typed into the booking
 * form. Nothing else — not their profile, not their matches, not their
 * contact. Said plainly at checkout because a marketplace where that is
 * ambiguous is a marketplace where people assume the worst (or, worse, assume
 * the best).
 */
export const DATA_SHARED_NOTE =
  "Booking ke baad partner ko sirf aapka naam aur aapne jo likha hai wo dikhega. Aapki profile, matches, chat ya number nahi — uske liye alag se aapki permission chahiye hogi.";

export async function quoteBooking(serviceId: string): Promise<BookingResult<{ quote: BookingQuote }>> {
  const service = await prisma.partnerService.findUnique({
    where: { id: serviceId },
    include: {
      partner: {
        select: {
          id: true,
          fullName: true,
          organizationName: true,
          status: true,
          marketplaceProfile: { select: { isListed: true, approvedAt: true } },
        },
      },
    },
  });

  if (!service || !service.isActive) return fail("NOT_FOUND", "Ye service abhi available nahi hai.", 404);
  const listed = service.partner.marketplaceProfile;
  if (!listed?.isListed || !listed.approvedAt) {
    return fail("NOT_LISTED", "Ye partner abhi marketplace par nahi hai.", 404);
  }
  if (service.partner.status !== "ACTIVE" && service.partner.status !== "APPROVED") {
    return fail("NOT_LISTED", "Ye partner abhi bookings nahi le rahe.", 409);
  }

  const config = await getServiceConfig();
  const split = splitBooking(service.priceInPaise, config.platformFeeBps);
  const spec = SERVICE_KIND_BY_KEY[service.kind];

  return {
    ok: true,
    quote: {
      serviceId: service.id,
      partnerId: service.partnerId,
      partnerName: service.partner.organizationName?.trim() || service.partner.fullName,
      kindLabel: spec.label,
      promise: spec.promise,
      deliveryProof: spec.deliveryProof,
      name: service.name,
      scope: service.scope,
      deliverables: service.deliverables,
      pricePaise: service.priceInPaise,
      platformFeePaise: split.platformFeePaise,
      partnerAmountPaise: split.partnerAmountPaise,
      deliveryDays: service.deliveryDays,
      acceptSlaHours: service.acceptSlaHours ?? config.acceptSlaHours,
      refundWindowDays: config.refundWindowDays,
      cancellationPolicy: service.cancellationPolicy,
      noGuaranteeNote: NO_GUARANTEE_NOTE,
      dataSharedNote: DATA_SHARED_NOTE,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Create                                                              */
/* ------------------------------------------------------------------ */

export interface CreateBookingInput {
  buyerUserId: string;
  serviceId: string;
  /** Defaults to the buyer. A parent buying for their adult child is why this
   *  exists — see the schema note on why it is not a relation. */
  beneficiaryUserId?: string | null;
  buyerNote?: string | null;
  preferredSlots?: string | null;
}

export type CreateBookingResult =
  | { ok: true; bookingId: string; paymentId: string; checkoutUrl: string; isTest: boolean }
  | { ok: false; error: string; message: string; status: number };

export async function createBookingCheckout(input: CreateBookingInput): Promise<CreateBookingResult> {
  const quoted = await quoteBooking(input.serviceId);
  if (!quoted.ok) return quoted;
  const { quote } = quoted;

  const partner = await prisma.partner.findUnique({
    where: { id: quote.partnerId },
    select: { userId: true },
  });

  /*
   * "Self-funded / circular booking does not create commission" — enforced by
   * refusing the booking outright rather than by suppressing the earning
   * afterwards. A partner paying themselves through the platform is not a sale
   * with an awkward ledger entry; it is a way to manufacture completed-booking
   * count, review eligibility and payout volume out of their own money. The
   * cleanest place to stop that is before the order exists.
   */
  if (partner?.userId === input.buyerUserId) {
    return fail("SELF_BOOKING", "Apni hi service khud nahi kharid sakte.", 403);
  }
  const beneficiaryUserId = input.beneficiaryUserId?.trim() || input.buyerUserId;
  if (partner?.userId === beneficiaryUserId) {
    return fail("SELF_BOOKING", "Ye booking apne hi liye nahi ho sakti.", 403);
  }

  const capacity = await getCapacity(quote.partnerId);
  if (!capacity.accepting) {
    return fail("NOT_ACCEPTING", "Ye partner abhi nayi bookings nahi le rahe.", 409);
  }
  if (capacity.full) {
    return fail("AT_CAPACITY", "Ye partner abhi full hain. Thodi der baad dekhiye.", 409);
  }

  // One live booking per buyer per service. A second one before the first is
  // even accepted is almost always a double-tap, and refunding it costs the
  // buyer more trust than refusing it.
  const existing = await prisma.serviceBooking.findFirst({
    where: {
      buyerUserId: input.buyerUserId,
      serviceId: input.serviceId,
      status: { in: [...ACTIVE_BOOKING_STATUSES] },
    },
    select: { id: true },
  });
  if (existing) {
    return fail("ALREADY_BOOKED", "Is service ki ek booking pehle se chal rahi hai.", 409);
  }

  const config = await getServiceConfig();

  // Booking row before the order, same ordering as every other checkout here:
  // what was bought is on record before it is paid for.
  const created = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        userId: input.buyerUserId,
        kind: "SERVICE_BOOKING",
        planCode: null,
        amountPaise: quote.pricePaise,
        status: "CREATED",
        isTest: isTestGateway(),
      },
    });

    const booking = await tx.serviceBooking.create({
      data: {
        partnerId: quote.partnerId,
        serviceId: input.serviceId,
        buyerUserId: input.buyerUserId,
        beneficiaryUserId,
        status: "PENDING_PAYMENT",
        pricePaise: quote.pricePaise,
        platformFeeBps: config.platformFeeBps,
        platformFeePaise: quote.platformFeePaise,
        partnerAmountPaise: quote.partnerAmountPaise,
        paymentId: payment.id,
        buyerNote: input.buyerNote?.trim()?.slice(0, 1000) || null,
        preferredSlots: input.preferredSlots?.trim()?.slice(0, 300) || null,
      },
    });

    return { payment, booking };
  });

  try {
    const order = await getPaymentGateway().createOrder({
      amountPaise: quote.pricePaise,
      receipt: created.payment.id,
      notes: { userId: input.buyerUserId, bookingId: created.booking.id },
    });
    await prisma.payment.update({
      where: { id: created.payment.id },
      data: { externalOrderId: order.orderId },
    });

    return {
      ok: true,
      bookingId: created.booking.id,
      paymentId: created.payment.id,
      checkoutUrl: order.checkoutUrl,
      isTest: isTestGateway(),
    };
  } catch (err) {
    console.error("[bookings] order creation failed:", err instanceof Error ? err.message : String(err));
    await prisma.$transaction([
      prisma.payment.update({
        where: { id: created.payment.id },
        data: { status: "FAILED", failureReason: "Order banane me dikkat aayi." },
      }),
      prisma.serviceBooking.update({
        where: { id: created.booking.id },
        data: { status: "CANCELLED", cancelledAt: new Date(), cancellationReason: "Payment shuru nahi ho payi." },
      }),
    ]);
    return fail("CHECKOUT_FAILED", "Payment shuru nahi ho payi — thodi der me dobara try karein.", 502);
  }
}

/* ------------------------------------------------------------------ */
/* Capture (called from handleGatewayEvent)                            */
/* ------------------------------------------------------------------ */

export interface BookingFulfilment {
  bookingId: string;
  buyerUserId: string;
  partnerUserId: string;
  partnerName: string;
  serviceName: string;
  acceptBySla: Date;
}

/**
 * What a captured booking payment actually does: nothing is delivered, a clock
 * starts.
 *
 * Runs inside `handleGatewayEvent`'s transaction, so the allocation, the
 * milestones and the CAPTURED flip are one atomic thing. Throws rather than
 * returning a soft failure, for the same reason `fulfilItemPayment` does — the
 * caller's transaction must roll back and the webhook must retry, instead of
 * recording money taken against a booking with no milestones.
 */
export async function fulfilServiceBookingPayment(
  tx: Prisma.TransactionClient,
  payment: Payment,
  now: Date,
): Promise<BookingFulfilment> {
  const booking = await tx.serviceBooking.findUnique({
    where: { paymentId: payment.id },
    include: {
      service: { select: { name: true, kind: true, deliverables: true, deliveryDays: true, acceptSlaHours: true } },
      partner: { select: { userId: true, fullName: true, organizationName: true } },
    },
  });
  if (!booking) throw new Error(`[bookings] payment ${payment.id} has no booking.`);

  const config = await tx.partnerCommissionConfig.findUnique({ where: { id: "default" } });
  const slaHours = booking.service.acceptSlaHours ?? config?.serviceAcceptSlaHours ?? DEFAULT_ACCEPT_SLA_HOURS;
  const acceptBySla = addHours(now, slaHours);

  await tx.serviceBooking.update({
    where: { id: booking.id },
    data: { status: "PAID", acceptBySla },
  });

  // The deliverables become milestones here, at purchase, frozen from the
  // service as it was priced. A partner editing their deliverables tomorrow
  // must not change what an already-paid booking owes.
  await tx.serviceMilestone.createMany({
    data: booking.service.deliverables.map((title, i) => ({
      bookingId: booking.id,
      position: i,
      title,
    })),
  });

  await tx.servicePaymentAllocation.create({
    data: {
      bookingId: booking.id,
      partnerId: booking.partnerId,
      grossPaise: booking.pricePaise,
      platformFeePaise: booking.platformFeePaise,
      partnerAmountPaise: booking.partnerAmountPaise,
      // HELD, not RELEASED. The partner has been paid *into the platform*, not
      // by it — nothing is withdrawable until the work settles.
      status: "HELD",
    },
  });

  return {
    bookingId: booking.id,
    buyerUserId: booking.buyerUserId,
    partnerUserId: booking.partner.userId,
    partnerName: booking.partner.organizationName?.trim() || booking.partner.fullName,
    serviceName: booking.service.name,
    acceptBySla,
  };
}

/** The booking half of a FAILED payment — mirrors the Spotlight draft cleanup. */
export async function cancelBookingForFailedPayment(paymentId: string): Promise<void> {
  await prisma.serviceBooking.updateMany({
    where: { paymentId, status: "PENDING_PAYMENT" },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancellationReason: "Payment poora nahi hua.",
    },
  });
}

/* ------------------------------------------------------------------ */
/* Lazy settlement — the two deadlines                                 */
/* ------------------------------------------------------------------ */

/**
 * Applies whichever deadline has passed, and writes the result through.
 *
 * Called from every read path in this file. Two transitions live here:
 *
 *  - **PAID past `acceptBySla`** → `EXPIRED_UNACCEPTED`, allocation REVERSED,
 *    payment REFUNDED. This is the plan's "missed SLA can credit/refund
 *    automatically" — the buyer does not have to notice, complain or wait for
 *    an admin.
 *  - **DELIVERED past `refundWindowEndsAt`** → `COMPLETED`, allocation
 *    RELEASED. The partner gets paid without the buyer having to click
 *    anything, which is what stops a silent buyer from freezing an honest
 *    partner's money forever.
 */
export async function settleBooking(booking: ServiceBooking, now = new Date()): Promise<ServiceBooking> {
  if (booking.status === "PAID" && booking.acceptBySla && booking.acceptBySla <= now) {
    return expireUnaccepted(booking, now);
  }
  if (booking.status === "DELIVERED" && booking.refundWindowEndsAt && booking.refundWindowEndsAt <= now) {
    return completeBooking(booking, now, "auto");
  }
  return booking;
}

async function expireUnaccepted(booking: ServiceBooking, now: Date): Promise<ServiceBooking> {
  const updated = await prisma.$transaction(async (tx) => {
    // Guarded by status so two concurrent readers cannot both refund it.
    const changed = await tx.serviceBooking.updateMany({
      where: { id: booking.id, status: "PAID" },
      data: {
        status: "EXPIRED_UNACCEPTED",
        refundedAt: now,
        cancellationReason: "Partner ne tay time me accept nahi kiya.",
      },
    });
    if (changed.count === 0) return null;

    await tx.servicePaymentAllocation.updateMany({
      where: { bookingId: booking.id, status: "HELD" },
      data: { status: "REVERSED", reversedAt: now, refundedPaise: booking.pricePaise },
    });
    if (booking.paymentId) {
      await tx.payment.updateMany({
        where: { id: booking.paymentId, status: "CAPTURED" },
        data: { status: "REFUNDED", refundedAt: now },
      });
    }
    return tx.serviceBooking.findUnique({ where: { id: booking.id } });
  });

  if (!updated) return booking;

  await createNotice({
    userId: booking.buyerUserId,
    kind: "SERVICE_UPDATE",
    title: "Booking cancel — poora refund",
    body: `Partner ne tay time me accept nahi kiya, isliye ${rupees(booking.pricePaise)} refund kar diya gaya hai.`,
    href: "/user/services",
    relatedId: booking.id,
  });

  return updated;
}

async function completeBooking(
  booking: ServiceBooking,
  now: Date,
  by: "buyer" | "auto",
): Promise<ServiceBooking> {
  const updated = await prisma.$transaction(async (tx) => {
    const changed = await tx.serviceBooking.updateMany({
      where: { id: booking.id, status: "DELIVERED" },
      data: { status: "COMPLETED", completedAt: now },
    });
    if (changed.count === 0) return null;

    await tx.servicePaymentAllocation.updateMany({
      where: { bookingId: booking.id, status: "HELD" },
      data: { status: "RELEASED", releasedAt: now },
    });
    return tx.serviceBooking.findUnique({ where: { id: booking.id } });
  });

  if (!updated) return booking;

  const partner = await prisma.partner.findUnique({
    where: { id: booking.partnerId },
    select: { userId: true },
  });
  if (partner) {
    await createNotice({
      userId: partner.userId,
      kind: "SERVICE_UPDATE",
      title: "Booking poori hui — earning taiyaar",
      body: `${rupees(booking.partnerAmountPaise)} ab withdraw kiya ja sakta hai.${
        by === "auto" ? " (Refund window khatam ho gaya.)" : ""
      }`,
      href: "/partner/payouts",
      relatedId: booking.id,
    });
  }

  return updated;
}

/* ------------------------------------------------------------------ */
/* Partner actions                                                     */
/* ------------------------------------------------------------------ */

export async function acceptBooking(partnerId: string, bookingId: string): Promise<BookingResult> {
  const booking = await loadForPartner(partnerId, bookingId);
  if (!booking) return fail("NOT_FOUND", "Ye booking nahi mili.", 404);

  const settled = await settleBooking(booking);
  if (settled.status !== "PAID") {
    return fail("BAD_STATE", `Ab is booking ko accept nahi kiya ja sakta (${settled.status}).`, 409);
  }

  const service = await prisma.partnerService.findUnique({
    where: { id: settled.serviceId },
    select: { deliveryDays: true, name: true },
  });
  const now = new Date();
  const dueAt = addDays(now, service?.deliveryDays ?? 7);

  await prisma.$transaction(async (tx) => {
    await tx.serviceBooking.update({
      where: { id: bookingId },
      data: { status: "ACCEPTED", acceptedAt: now, startedAt: now },
    });
    // Every milestone shares the delivery deadline. Per-milestone staggering
    // was the alternative and it invents a schedule the partner never agreed
    // to; the deadline they did agree to is the delivery window.
    await tx.serviceMilestone.updateMany({ where: { bookingId }, data: { dueAt } });
  });

  await createNotice({
    userId: settled.buyerUserId,
    kind: "SERVICE_UPDATE",
    title: "Partner ne booking accept kar li",
    body: `${service?.name ?? "Aapki service"} par kaam shuru ho gaya hai.`,
    href: "/user/services",
    relatedId: bookingId,
  });

  return { ok: true };
}

/** The partner declining, before or after accepting. Always a full refund. */
export async function partnerDeclineBooking(
  partnerId: string,
  bookingId: string,
  reason: string,
): Promise<BookingResult> {
  const booking = await loadForPartner(partnerId, bookingId);
  if (!booking) return fail("NOT_FOUND", "Ye booking nahi mili.", 404);
  if (!reason.trim()) return fail("REASON_REQUIRED", "Reason likhna zaroori hai.");

  const settled = await settleBooking(booking);
  if (!REFUNDABLE_STATUSES.includes(settled.status)) {
    return fail("BAD_STATE", "Is booking par ab ye action nahi ho sakta.", 409);
  }

  await refundBooking(settled, `Partner ne cancel kiya: ${reason.trim()}`, "partner");
  return { ok: true };
}

export async function submitMilestone(
  partnerId: string,
  milestoneId: string,
  note: string | null,
): Promise<BookingResult> {
  const milestone = await prisma.serviceMilestone.findUnique({
    where: { id: milestoneId },
    include: { booking: true },
  });
  if (!milestone || milestone.booking.partnerId !== partnerId) {
    return fail("NOT_FOUND", "Ye milestone nahi mila.", 404);
  }

  const settled = await settleBooking(milestone.booking);
  if (settled.status !== "ACCEPTED" && settled.status !== "IN_PROGRESS") {
    return fail("BAD_STATE", "Is booking par abhi kaam submit nahi kiya ja sakta.", 409);
  }
  if (milestone.status === "ACCEPTED") {
    return fail("BAD_STATE", "Ye milestone pehle hi accept ho chuka hai.", 409);
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.serviceMilestone.update({
      where: { id: milestoneId },
      data: { status: "SUBMITTED", submittedAt: now, submittedNote: note?.trim()?.slice(0, 800) || null, disputedAt: null, disputeNote: null },
    });
    await tx.serviceBooking.updateMany({
      where: { id: settled.id, status: "ACCEPTED" },
      data: { status: "IN_PROGRESS" },
    });
  });

  await maybeMarkDelivered(settled.id);

  await createNotice({
    userId: settled.buyerUserId,
    kind: "SERVICE_UPDATE",
    title: "Partner ne ek kaam poora bataya",
    body: `"${milestone.title}" — dekh kar confirm kar dijiye.`,
    href: "/user/services",
    relatedId: settled.id,
  });

  return { ok: true };
}

/**
 * Delivery is "every milestone has been submitted or accepted", not "the
 * partner pressed Done".
 *
 * Deriving it means a partner cannot mark a job delivered while a deliverable
 * they promised is still untouched — the refund window only starts once the
 * whole list has been answered for.
 */
async function maybeMarkDelivered(bookingId: string): Promise<void> {
  const [pending, booking, config] = await Promise.all([
    prisma.serviceMilestone.count({ where: { bookingId, status: { in: ["PENDING", "DISPUTED"] } } }),
    prisma.serviceBooking.findUnique({ where: { id: bookingId } }),
    getServiceConfig(),
  ]);
  if (pending > 0 || !booking) return;
  if (booking.status !== "IN_PROGRESS" && booking.status !== "ACCEPTED") return;

  const now = new Date();
  await prisma.serviceBooking.updateMany({
    where: { id: bookingId, status: { in: ["ACCEPTED", "IN_PROGRESS"] } },
    data: {
      status: "DELIVERED",
      deliveredAt: now,
      refundWindowEndsAt: addDays(now, config.refundWindowDays),
    },
  });
}

/* ------------------------------------------------------------------ */
/* Buyer actions                                                       */
/* ------------------------------------------------------------------ */

export async function acceptMilestone(buyerUserId: string, milestoneId: string): Promise<BookingResult> {
  const milestone = await prisma.serviceMilestone.findUnique({
    where: { id: milestoneId },
    include: { booking: true },
  });
  if (!milestone || milestone.booking.buyerUserId !== buyerUserId) {
    return fail("NOT_FOUND", "Ye milestone nahi mila.", 404);
  }
  if (milestone.status !== "SUBMITTED") {
    return fail("BAD_STATE", "Ye abhi accept karne layak nahi hai.", 409);
  }

  await prisma.serviceMilestone.update({
    where: { id: milestoneId },
    data: { status: "ACCEPTED", acceptedAt: new Date() },
  });
  await maybeMarkDelivered(milestone.bookingId);
  return { ok: true };
}

export async function disputeMilestone(
  buyerUserId: string,
  milestoneId: string,
  note: string,
): Promise<BookingResult> {
  const milestone = await prisma.serviceMilestone.findUnique({
    where: { id: milestoneId },
    include: { booking: true },
  });
  if (!milestone || milestone.booking.buyerUserId !== buyerUserId) {
    return fail("NOT_FOUND", "Ye milestone nahi mila.", 404);
  }
  if (!note.trim()) return fail("REASON_REQUIRED", "Kya kami hai, wo likhiye.");
  if (milestone.status !== "SUBMITTED") {
    return fail("BAD_STATE", "Is par abhi sawaal nahi uthaya ja sakta.", 409);
  }

  await prisma.serviceMilestone.update({
    where: { id: milestoneId },
    data: { status: "DISPUTED", disputedAt: new Date(), disputeNote: note.trim().slice(0, 800) },
  });

  const partner = await prisma.partner.findUnique({
    where: { id: milestone.booking.partnerId },
    select: { userId: true },
  });
  if (partner) {
    await createNotice({
      userId: partner.userId,
      kind: "SERVICE_UPDATE",
      title: "Client ne ek kaam par sawaal uthaya",
      body: `"${milestone.title}" — dobara dekh kar submit kariye.`,
      href: "/partner/bookings",
      relatedId: milestone.bookingId,
    });
  }

  return { ok: true };
}

/** "Sab theek hai" — completes early and releases the partner's money now. */
export async function acknowledgeBooking(buyerUserId: string, bookingId: string): Promise<BookingResult> {
  const booking = await prisma.serviceBooking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.buyerUserId !== buyerUserId) return fail("NOT_FOUND", "Ye booking nahi mili.", 404);

  const settled = await settleBooking(booking);
  if (settled.status === "COMPLETED") return { ok: true };
  if (settled.status !== "DELIVERED") return fail("BAD_STATE", "Ye booking abhi deliver nahi hui.", 409);

  await completeBooking(settled, new Date(), "buyer");
  return { ok: true };
}

export async function buyerCancelBooking(
  buyerUserId: string,
  bookingId: string,
  reason: string,
): Promise<BookingResult> {
  const booking = await prisma.serviceBooking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.buyerUserId !== buyerUserId) return fail("NOT_FOUND", "Ye booking nahi mili.", 404);

  const settled = await settleBooking(booking);
  if (!buyerMayCancelFreely(settled.status)) {
    return fail(
      "BAD_STATE",
      "Partner accept kar chuke hain — ab cancel ke liye complaint darj kariye, taaki koi insaan dekh sake.",
      409,
    );
  }

  await refundBooking(settled, reason.trim() || "Buyer ne cancel kiya.", "buyer");
  return { ok: true };
}

export async function disputeBooking(
  buyerUserId: string,
  bookingId: string,
  reason: string,
): Promise<BookingResult> {
  const booking = await prisma.serviceBooking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.buyerUserId !== buyerUserId) return fail("NOT_FOUND", "Ye booking nahi mili.", 404);
  if (!reason.trim()) return fail("REASON_REQUIRED", "Kya dikkat hai, wo likhiye.");

  const settled = await settleBooking(booking);
  if (!REFUNDABLE_STATUSES.includes(settled.status)) {
    return fail("BAD_STATE", "Is booking par ab complaint darj nahi ho sakti.", 409);
  }

  /*
   * A dispute freezes the refund window.
   *
   * Without clearing `refundWindowEndsAt`, `settleBooking` would keep counting
   * down and quietly COMPLETE a booking somebody is actively complaining
   * about — releasing the partner's money out from under an open case.
   */
  await prisma.serviceBooking.update({
    where: { id: bookingId },
    data: {
      status: "DISPUTED",
      disputedAt: new Date(),
      disputeReason: reason.trim().slice(0, 1000),
      refundWindowEndsAt: null,
    },
  });

  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Refund                                                              */
/* ------------------------------------------------------------------ */

/**
 * Records a refund and reverses the partner's claim on the money.
 *
 * The transfer itself is manual — `PaymentGateway` has no refund call, exactly
 * as `payoutProvider()` is manual until RazorpayX keys exist. What this
 * guarantees is the half that must never be wrong: after it runs, no code path
 * can pay the partner for this booking.
 */
async function refundBooking(
  booking: ServiceBooking,
  reason: string,
  by: "buyer" | "partner" | "admin",
): Promise<void> {
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // The superset: callers have already applied their own, narrower gate
    // (`REFUNDABLE_STATUSES` for a buyer/partner, `ADMIN_REFUNDABLE_STATUSES`
    // for an admin), so this one exists to make the write idempotent under a
    // double-click rather than to re-decide who may refund.
    await tx.serviceBooking.updateMany({
      where: { id: booking.id, status: { in: [...ADMIN_REFUNDABLE_STATUSES] } },
      data: {
        status: by === "buyer" ? "CANCELLED" : "REFUNDED",
        cancelledAt: by === "buyer" ? now : null,
        cancelledBy: by,
        cancellationReason: reason,
        refundedAt: now,
        resolvedAt: by === "admin" ? now : null,
      },
    });

    /*
     * Reversal covers HELD *and* RELEASED.
     *
     * A booking can be disputed after its refund window closed, by which point
     * the allocation is RELEASED and sitting in the partner's available
     * balance. Reversing only HELD rows would leave that money withdrawable
     * against a refunded booking. PAID is deliberately excluded and cannot be
     * clawed back — the same accepted risk the payout flow took when it
     * dropped the maturity hold on 2026-08-26.
     */
    await tx.servicePaymentAllocation.updateMany({
      where: { bookingId: booking.id, status: { in: ["HELD", "RELEASED"] } },
      data: { status: "REVERSED", reversedAt: now, refundedPaise: booking.pricePaise },
    });

    if (booking.paymentId) {
      await tx.payment.updateMany({
        where: { id: booking.paymentId, status: "CAPTURED" },
        data: { status: "REFUNDED", refundedAt: now },
      });
    }
  });

  const partner = await prisma.partner.findUnique({
    where: { id: booking.partnerId },
    select: { userId: true },
  });

  await createNotice({
    userId: booking.buyerUserId,
    kind: "SERVICE_UPDATE",
    title: "Booking cancel ho gayi — refund",
    body: `${rupees(booking.pricePaise)} wapas kiya ja raha hai. 5-7 working din lag sakte hain.`,
    href: "/user/services",
    relatedId: booking.id,
  });
  if (partner) {
    await createNotice({
      userId: partner.userId,
      kind: "SERVICE_UPDATE",
      title: "Ek booking cancel ho gayi",
      body: reason,
      href: "/partner/bookings",
      relatedId: booking.id,
    });
  }
}

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */

export async function adminResolveBooking(params: {
  bookingId: string;
  action: "refund" | "release" | "note";
  note: string;
  actorId: string;
  actorRole: Role;
}): Promise<BookingResult> {
  const { bookingId, action, note, actorId, actorRole } = params;
  if (!note.trim()) return fail("REASON_REQUIRED", "Faisle ka reason likhiye.");

  const booking = await prisma.serviceBooking.findUnique({ where: { id: bookingId } });
  if (!booking) return fail("NOT_FOUND", "Booking nahi mili.", 404);

  const previous = booking.status;
  const now = new Date();

  if (action === "refund") {
    if (!ADMIN_REFUNDABLE_STATUSES.includes(booking.status)) {
      return fail("BAD_STATE", "Is status me refund nahi ho sakta.", 409);
    }
    await refundBooking(booking, note.trim(), "admin");
  } else if (action === "release") {
    // Admin siding with the partner on a dispute: the work stands, the money
    // is theirs. Only reachable from DISPUTED — releasing a live booking early
    // would skip the buyer's window entirely.
    if (booking.status !== "DISPUTED") {
      return fail("BAD_STATE", "Sirf DISPUTED booking par ye action hai.", 409);
    }
    await prisma.$transaction(async (tx) => {
      await tx.serviceBooking.update({
        where: { id: bookingId },
        data: { status: "COMPLETED", completedAt: now, resolvedAt: now, resolutionNote: note.trim() },
      });
      await tx.servicePaymentAllocation.updateMany({
        where: { bookingId, status: "HELD" },
        data: { status: "RELEASED", releasedAt: now },
      });
    });
  } else {
    await prisma.serviceBooking.update({
      where: { id: bookingId },
      data: { resolutionNote: note.trim(), resolvedAt: now },
    });
  }

  await prisma.adminAuditLog.create({
    data: {
      actorId,
      actorRole,
      actionType: `SERVICE_BOOKING_${action.toUpperCase()}`,
      targetType: "service_booking",
      targetId: bookingId,
      previousValue: previous,
      newValue: action === "refund" ? "REFUNDED" : action === "release" ? "COMPLETED" : previous,
      reason: note.trim(),
    },
  });

  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

async function loadForPartner(partnerId: string, bookingId: string): Promise<ServiceBooking | null> {
  const booking = await prisma.serviceBooking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.partnerId !== partnerId) return null;
  return booking;
}

const BOOKING_INCLUDE = {
  service: { select: { name: true, kind: true, deliveryDays: true, cancellationPolicy: true } },
  milestones: { orderBy: { position: "asc" } },
  allocation: { select: { status: true, partnerAmountPaise: true } },
  review: { select: { id: true, rating: true } },
} as const;

/** Settle-on-read, then return. Every list in the product goes through here. */
async function settleAll<T extends ServiceBooking>(rows: T[]): Promise<T[]> {
  const now = new Date();
  return Promise.all(rows.map(async (row) => ({ ...row, ...(await settleBooking(row, now)) })));
}

export async function listBookingsForBuyer(buyerUserId: string) {
  const rows = await prisma.serviceBooking.findMany({
    where: { buyerUserId },
    orderBy: { createdAt: "desc" },
    include: {
      ...BOOKING_INCLUDE,
      partner: { select: { id: true, fullName: true, organizationName: true } },
    },
  });
  return settleAll(rows);
}

export async function listBookingsForPartner(partnerId: string) {
  const rows = await prisma.serviceBooking.findMany({
    where: { partnerId },
    orderBy: { createdAt: "desc" },
    include: { ...BOOKING_INCLUDE, buyer: { select: { fullName: true } } },
  });
  return settleAll(rows);
}

export type BookingViewer = { kind: "buyer"; userId: string } | { kind: "partner"; partnerId: string };

export async function getBookingDetail(viewer: BookingViewer, bookingId: string) {
  const row = await prisma.serviceBooking.findUnique({
    where: { id: bookingId },
    include: {
      ...BOOKING_INCLUDE,
      partner: { select: { id: true, fullName: true, organizationName: true } },
      buyer: { select: { fullName: true } },
    },
  });
  if (!row) return null;
  if (viewer.kind === "buyer" && row.buyerUserId !== viewer.userId) return null;
  if (viewer.kind === "partner" && row.partnerId !== viewer.partnerId) return null;

  const settled = await settleBooking(row);
  return { ...row, ...settled };
}

/** The admin console's queue — disputes first, then everything else. */
export async function listBookingsForAdmin(filter?: { status?: ServiceBookingStatus | null }) {
  const rows = await prisma.serviceBooking.findMany({
    where: filter?.status ? { status: filter.status } : {},
    orderBy: [{ disputedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: 100,
    include: {
      service: { select: { name: true, kind: true } },
      partner: { select: { fullName: true, organizationName: true } },
      buyer: { select: { fullName: true } },
      allocation: { select: { status: true, partnerAmountPaise: true } },
    },
  });
  return settleAll(rows);
}
