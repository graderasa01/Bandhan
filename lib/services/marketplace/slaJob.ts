import "server-only";
import { prisma } from "@/lib/db/prisma";
import { createNotice } from "@/lib/services/notice/noticeService";
import { getOpsSettings } from "@/lib/services/pilot/opsSettings";
import { settleBooking } from "./bookingService";
import { rupees } from "./servicePolicy";
import type { ServiceBooking } from "@prisma/client";

/**
 * The job that watches the clocks nobody was watching.
 *
 * ## What was actually broken
 *
 * Every deadline in `bookingService` settles **on read**: `settleBooking` runs
 * when somebody opens a page that touches the booking. That is correct as far
 * as it goes — it means no state is ever stale when it is looked at — but it
 * quietly made two promises conditional on somebody looking:
 *
 *  - A buyer whose partner never accepted is owed an automatic refund. Until
 *    the buyer opened `/user/services`, the refund did not exist. The one buyer
 *    least likely to open it is the one who gave up on the app after being
 *    ignored.
 *  - A partner who delivered is owed their money when the refund window closes.
 *    Nothing released it until *somebody* read that booking.
 *
 * And before either deadline, nothing at all warned anyone. The acceptance
 * clock ran out in silence on a partner who was on a train.
 *
 * ## Why reminders are stamped rather than counted
 *
 * Each reminder writes its own timestamp on the booking, so running this job
 * twice in a minute cannot send the same warning twice. The alternative — a
 * counter, or a "last chased at" — either loses which message went out or has
 * to encode it, and a partner who receives the same warning twice stops reading
 * the third.
 *
 * ## Why escalation is a brake and not a punishment
 *
 * Two missed acceptance clocks inside a month pauses new bookings to that
 * partner (if the dial says so) and puts them on the admin's escalation list.
 * The partner can switch themselves back on — see `setAvailability` — because a
 * bureau that was ill for a week should not need an admin's afternoon to start
 * working again. What they cannot undo is the record.
 *
 * ## Idempotence
 *
 * Safe to run twice, safe to run late, safe to run after a week of not running.
 * Every step is guarded by a stored timestamp or a status transition, not by
 * "how long since the last run".
 */

export interface SlaSweepOptions {
  /** Runs every query and every brake, writes nothing. */
  dryRun?: boolean;
  /** Injected by the checker so deadlines can be moved around in a test. */
  now?: Date;
}

export interface SlaSweepSummary {
  /** First "your clock is running" to the partner. */
  acceptReminders: number;
  /** Last warning before the booking auto-refunds. */
  acceptFinalReminders: number;
  /** Bookings the partner never accepted, refunded without waiting for a page view. */
  expired: number;
  /** Delivered bookings past their refund window, released to the partner. */
  released: number;
  /** Buyers told their refund window is about to close. */
  ackReminders: number;
  /** Partners chased about an overdue milestone. */
  milestoneReminders: number;
  /** Partners who crossed the miss threshold in this run. */
  escalated: number;
  /** Of those, the ones whose new bookings were paused. */
  autoPaused: number;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** One run's ceiling per step. A misconfiguration costs one batch, not the inbox of everyone who ever booked. */
const BATCH_LIMIT = 500;

export async function runServiceSlaSweep(options: SlaSweepOptions = {}): Promise<SlaSweepSummary> {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun ?? false;
  const settings = await getOpsSettings();

  const summary: SlaSweepSummary = {
    acceptReminders: 0,
    acceptFinalReminders: 0,
    expired: 0,
    released: 0,
    ackReminders: 0,
    milestoneReminders: 0,
    escalated: 0,
    autoPaused: 0,
  };

  /* ---------------- 1. Deadlines that have already passed ---------------- */

  // Settled first, so a booking that is already dead is not also reminded about
  // in the same run.
  const overdue = await prisma.serviceBooking.findMany({
    where: {
      OR: [
        { status: "PAID", acceptBySla: { lte: now } },
        { status: "DELIVERED", refundWindowEndsAt: { lte: now } },
      ],
    },
    take: BATCH_LIMIT,
  });

  for (const booking of overdue) {
    if (dryRun) {
      if (booking.status === "PAID") summary.expired += 1;
      else summary.released += 1;
      continue;
    }

    const settled = await settleBooking(booking, now);
    if (settled.status === "EXPIRED_UNACCEPTED" && booking.status === "PAID") {
      summary.expired += 1;
      await notifyPartnerOfMiss(booking);
      const escalation = await escalatePartner(booking, settings, now);
      if (escalation.escalated) summary.escalated += 1;
      if (escalation.paused) summary.autoPaused += 1;
    } else if (settled.status === "COMPLETED" && booking.status === "DELIVERED") {
      summary.released += 1;
    }
  }

  /* ---------------- 2. Acceptance reminders ---------------- */

  const finalCutoff = new Date(now.getTime() + settings.slaFinalReminderHours * HOUR_MS);
  const firstCutoff = new Date(now.getTime() + settings.slaFirstReminderHours * HOUR_MS);

  // Deliberately excludes anything already inside the final window: without
  // that, a booking whose service has a short SLA would match both queries in
  // one run and the partner would get two different warnings in one second.
  const firstDue = await prisma.serviceBooking.findMany({
    where: {
      status: "PAID",
      acceptReminderAt: null,
      acceptBySla: { gt: finalCutoff, lte: firstCutoff },
    },
    take: BATCH_LIMIT,
    include: bookingContext,
  });

  for (const booking of firstDue) {
    summary.acceptReminders += 1;
    if (dryRun) continue;
    await createNotice({
      userId: booking.partner.userId,
      kind: "SERVICE_UPDATE",
      title: "Ek booking aapke jawab ka intezaar kar rahi hai",
      body: `${booking.service.name} — ${formatDeadline(booking.acceptBySla)} tak accept kijiye, warna buyer ko poora refund chala jayega.`,
      href: "/partner/bookings",
      relatedId: booking.id,
    });
    await prisma.serviceBooking.update({ where: { id: booking.id }, data: { acceptReminderAt: now } });
  }

  const finalDue = await prisma.serviceBooking.findMany({
    where: {
      status: "PAID",
      acceptFinalReminderAt: null,
      acceptBySla: { gt: now, lte: finalCutoff },
    },
    take: BATCH_LIMIT,
    include: bookingContext,
  });

  for (const booking of finalDue) {
    summary.acceptFinalReminders += 1;
    if (dryRun) continue;
    await createNotice({
      userId: booking.partner.userId,
      kind: "SERVICE_UPDATE",
      title: "Aakhri chetavni — booking abhi accept kijiye",
      body: `${booking.service.name} ${formatDeadline(booking.acceptBySla)} tak accept nahi hui to apne aap cancel ho jayegi aur poora paisa buyer ko wapas.`,
      href: "/partner/bookings",
      relatedId: booking.id,
    });
    await prisma.serviceBooking.update({
      where: { id: booking.id },
      // Both stamps, so a booking that first surfaced inside the final window
      // never receives the gentler first reminder afterwards.
      data: { acceptFinalReminderAt: now, acceptReminderAt: booking.acceptReminderAt ?? now },
    });
  }

  /* ---------------- 3. The buyer's closing window ---------------- */

  const ackCutoff = new Date(now.getTime() + settings.ackReminderHours * HOUR_MS);
  const ackDue = await prisma.serviceBooking.findMany({
    where: {
      status: "DELIVERED",
      ackReminderAt: null,
      refundWindowEndsAt: { gt: now, lte: ackCutoff },
    },
    take: BATCH_LIMIT,
    include: bookingContext,
  });

  for (const booking of ackDue) {
    summary.ackReminders += 1;
    if (dryRun) continue;
    await createNotice({
      userId: booking.buyerUserId,
      kind: "SERVICE_UPDATE",
      title: "Kaam dekh lijiye — window band hone wali hai",
      body: `${booking.service.name} deliver ho chuka hai. ${formatDeadline(booking.refundWindowEndsAt)} tak aap shikayat kar sakte hain; uske baad ${rupees(booking.partnerAmountPaise)} partner ko chala jayega.`,
      href: "/user/services",
      relatedId: booking.id,
    });
    await prisma.serviceBooking.update({ where: { id: booking.id }, data: { ackReminderAt: now } });
  }

  /* ---------------- 4. Overdue milestones ---------------- */

  const graceCutoff = new Date(now.getTime() - settings.milestoneOverdueGraceDays * DAY_MS);
  const overdueMilestones = await prisma.serviceMilestone.findMany({
    where: {
      status: "PENDING",
      overdueReminderAt: null,
      dueAt: { lte: graceCutoff },
      booking: { status: { in: ["ACCEPTED", "IN_PROGRESS"] } },
    },
    take: BATCH_LIMIT,
    include: { booking: { include: bookingContext } },
  });

  for (const milestone of overdueMilestones) {
    summary.milestoneReminders += 1;
    if (dryRun) continue;
    await createNotice({
      userId: milestone.booking.partner.userId,
      kind: "SERVICE_UPDATE",
      title: "Ek milestone ki tareekh nikal gayi",
      body: `${milestone.booking.service.name} — "${milestone.title}" ki tareekh nikal chuki hai. Poora kar ke proof daal dijiye, ya buyer ko nayi tareekh bata dijiye.`,
      href: "/partner/bookings",
      relatedId: milestone.bookingId,
    });
    await prisma.serviceMilestone.update({ where: { id: milestone.id }, data: { overdueReminderAt: now } });
  }

  return summary;
}

/* ------------------------------------------------------------------ */
/* Escalation                                                          */
/* ------------------------------------------------------------------ */

const bookingContext = {
  service: { select: { name: true } },
  partner: { select: { id: true, userId: true, fullName: true, organizationName: true } },
} as const;

async function notifyPartnerOfMiss(booking: ServiceBooking): Promise<void> {
  const partner = await prisma.partner.findUnique({
    where: { id: booking.partnerId },
    select: { userId: true },
  });
  if (!partner) return;

  await createNotice({
    userId: partner.userId,
    kind: "SERVICE_UPDATE",
    title: "Ek booking nikal gayi",
    body: `Tay time me accept nahi hua, isliye booking cancel ho gayi aur buyer ko ${rupees(booking.pricePaise)} wapas kar diya gaya.`,
    href: "/partner/bookings",
    relatedId: booking.id,
  });
}

/**
 * Counts this partner's misses inside the window and, past the threshold, puts
 * the brake on.
 *
 * `slaEscalatedAt` is stamped on the booking that tipped it, so the same miss
 * cannot escalate the same partner on every subsequent run — the count would
 * stay above the threshold for a month otherwise, and an admin would get a new
 * "escalated" row every night for one bad Tuesday.
 */
async function escalatePartner(
  booking: ServiceBooking,
  settings: { slaBreachEscalationCount: number; slaBreachWindowDays: number; slaAutoPauseOnEscalation: boolean },
  now: Date,
): Promise<{ escalated: boolean; paused: boolean }> {
  const windowStart = new Date(now.getTime() - settings.slaBreachWindowDays * DAY_MS);

  const misses = await prisma.serviceBooking.count({
    where: {
      partnerId: booking.partnerId,
      status: "EXPIRED_UNACCEPTED",
      refundedAt: { gte: windowStart },
    },
  });
  if (misses < settings.slaBreachEscalationCount) return { escalated: false, paused: false };

  await prisma.serviceBooking.update({ where: { id: booking.id }, data: { slaEscalatedAt: now } });

  if (!settings.slaAutoPauseOnEscalation) return { escalated: true, paused: false };

  const reason = `${misses} booking ${settings.slaBreachWindowDays} din me accept nahi hui.`;
  await prisma.partnerAvailability.upsert({
    where: { partnerId: booking.partnerId },
    create: { partnerId: booking.partnerId, acceptingBookings: false, autoPausedAt: now, autoPauseReason: reason },
    update: { acceptingBookings: false, autoPausedAt: now, autoPauseReason: reason },
  });

  const partner = await prisma.partner.findUnique({
    where: { id: booking.partnerId },
    select: { userId: true },
  });
  if (partner) {
    await createNotice({
      userId: partner.userId,
      kind: "SERVICE_UPDATE",
      title: "Nayi booking filhaal rok di gayi hai",
      body: `${reason} Jab aap dobara taiyar hon, apni availability wapas on kar lijiye — hum aapko turant list par le aayenge.`,
      href: "/partner/listing",
      relatedId: booking.partnerId,
    });
  }

  return { escalated: true, paused: true };
}

/* ------------------------------------------------------------------ */
/* The admin's read of all this                                        */
/* ------------------------------------------------------------------ */

export interface SlaEscalationRow {
  partnerId: string;
  partnerName: string;
  city: string;
  misses: number;
  lastMissAt: string;
  autoPausedAt: string | null;
  acceptingBookings: boolean;
}

/**
 * Partners who missed the acceptance clock often enough to be worth a phone
 * call, newest miss first.
 *
 * A list rather than a notification: this product has no machinery for telling
 * an admin something, and inventing one for this would mean either a fake actor
 * row in the audit log or a notice to every ADMIN account. A queue on the
 * screen that already carries the SLA dials is a thing somebody opens; a
 * notification nobody built a home for is a thing somebody ignores.
 */
export async function getSlaEscalations(limit = 20): Promise<SlaEscalationRow[]> {
  const settings = await getOpsSettings();
  const windowStart = new Date(Date.now() - settings.slaBreachWindowDays * DAY_MS);

  const misses = await prisma.serviceBooking.groupBy({
    by: ["partnerId"],
    where: { status: "EXPIRED_UNACCEPTED", refundedAt: { gte: windowStart } },
    _count: { _all: true },
    _max: { refundedAt: true },
  });

  const breaching = misses
    .filter((m) => m._count._all >= settings.slaBreachEscalationCount)
    .sort((a, b) => (b._max.refundedAt?.getTime() ?? 0) - (a._max.refundedAt?.getTime() ?? 0))
    .slice(0, limit);
  if (breaching.length === 0) return [];

  const partners = await prisma.partner.findMany({
    where: { id: { in: breaching.map((b) => b.partnerId) } },
    select: {
      id: true,
      fullName: true,
      organizationName: true,
      city: true,
      availability: { select: { acceptingBookings: true, autoPausedAt: true } },
    },
  });
  const byId = new Map(partners.map((p) => [p.id, p]));

  return breaching.flatMap((row) => {
    const partner = byId.get(row.partnerId);
    if (!partner) return [];
    return [
      {
        partnerId: partner.id,
        partnerName: partner.organizationName?.trim() || partner.fullName,
        city: partner.city,
        misses: row._count._all,
        lastMissAt: (row._max.refundedAt ?? new Date()).toISOString(),
        autoPausedAt: partner.availability?.autoPausedAt?.toISOString() ?? null,
        acceptingBookings: partner.availability?.acceptingBookings ?? true,
      },
    ];
  });
}

/** "2 September, 4:30 pm" — the same locale the booking screens already print. */
function formatDeadline(at: Date | null): string {
  if (!at) return "tay waqt";
  return at.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}
