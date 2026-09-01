import "server-only";
import { prisma } from "@/lib/db/prisma";
import { MAX_REVIEW_CHARS, REVIEW_PROMPT } from "./servicePolicy";
import type { Role } from "@prisma/client";

/**
 * Reviews of the *work*, by the person who paid for it, on a booking that
 * actually completed.
 *
 * ## Three gates, and each one is load-bearing
 *
 *  1. **Only the buyer.** `authorUserId` comes from the session and is matched
 *     against `booking.buyerUserId`. A beneficiary who did not pay cannot
 *     review, and neither can anyone else — which is what stops a partner
 *     seeding praise from a second account.
 *  2. **Only COMPLETED.** Not delivered, not refunded, not cancelled. A review
 *     attached to a refunded booking would let someone pay, cancel, and still
 *     leave a one-star review that costs them nothing.
 *  3. **Only once.** `@@unique([bookingId])` makes that structural rather than
 *     a check somebody could route around with a second endpoint.
 *
 * ## What a review may not be about
 *
 * The prompt asks about the service, never about whether a marriage happened —
 * D-61 bans the claim and rating someone on it would smuggle it back in
 * through the reviews. There is no field here that could hold that answer, and
 * `REVIEW_PROMPT` is the wording the form actually shows.
 */

/** Re-exported so server callers have one import for the whole review surface. */
export { REVIEW_PROMPT };

export type ReviewResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string; message: string; status: number };

function fail(error: string, message: string, status = 422) {
  return { ok: false as const, error, message, status };
}

export async function createReview(params: {
  bookingId: string;
  authorUserId: string;
  rating: number;
  body?: string | null;
}): Promise<ReviewResult<{ reviewId: string }>> {
  const rating = Math.round(params.rating);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return fail("VALIDATION_FAILED", "Rating 1 se 5 ke beech deni hogi.");
  }

  const booking = await prisma.serviceBooking.findUnique({
    where: { id: params.bookingId },
    select: { id: true, buyerUserId: true, partnerId: true, status: true, review: { select: { id: true } } },
  });

  if (!booking || booking.buyerUserId !== params.authorUserId) {
    return fail("NOT_FOUND", "Ye booking nahi mili.", 404);
  }
  if (booking.status !== "COMPLETED") {
    return fail("NOT_COMPLETED", "Review sirf poori hui booking par diya ja sakta hai.", 409);
  }
  if (booking.review) {
    return fail("ALREADY_REVIEWED", "Is booking ka review pehle hi diya ja chuka hai.", 409);
  }

  const body = params.body?.trim()?.slice(0, MAX_REVIEW_CHARS) || null;

  const row = await prisma.serviceReview.create({
    data: {
      bookingId: booking.id,
      partnerId: booking.partnerId,
      authorUserId: params.authorUserId,
      rating,
      body,
    },
    select: { id: true },
  });

  return { ok: true, reviewId: row.id };
}

export interface ReviewView {
  id: string;
  rating: number;
  body: string | null;
  authorFirstName: string;
  serviceName: string;
  at: string;
}

/**
 * A partner's public reviews.
 *
 * First name only — the reviewer is a member of a matrimony site, and a full
 * name beside "I hired a matchmaker" is a disclosure nobody signed up for.
 * Hidden reviews are excluded here but not deleted, so the average stays
 * explainable to an admin.
 */
export async function listPartnerReviews(partnerId: string, limit = 20): Promise<ReviewView[]> {
  const rows = await prisma.serviceReview.findMany({
    where: { partnerId, hiddenAt: null },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      author: { select: { fullName: true } },
      booking: { select: { service: { select: { name: true } } } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    body: r.body,
    authorFirstName: r.author.fullName.split(" ")[0],
    serviceName: r.booking.service.name,
    at: r.createdAt.toISOString(),
  }));
}

export async function hideReview(params: {
  reviewId: string;
  hide: boolean;
  note: string;
  actorId: string;
  actorRole: Role;
}): Promise<ReviewResult> {
  const { reviewId, hide, note, actorId, actorRole } = params;
  if (hide && !note.trim()) return fail("REASON_REQUIRED", "Chhupane ka reason likhiye.");

  const review = await prisma.serviceReview.findUnique({ where: { id: reviewId } });
  if (!review) return fail("NOT_FOUND", "Review nahi mila.", 404);

  await prisma.$transaction(async (tx) => {
    await tx.serviceReview.update({
      where: { id: reviewId },
      data: hide
        ? { hiddenAt: new Date(), hiddenBy: actorId, hiddenNote: note.trim() }
        : { hiddenAt: null, hiddenBy: null, hiddenNote: null },
    });
    await tx.adminAuditLog.create({
      data: {
        actorId,
        actorRole,
        actionType: hide ? "SERVICE_REVIEW_HIDDEN" : "SERVICE_REVIEW_RESTORED",
        targetType: "service_review",
        targetId: reviewId,
        previousValue: review.hiddenAt ? "HIDDEN" : "VISIBLE",
        newValue: hide ? "HIDDEN" : "VISIBLE",
        reason: note.trim() || null,
      },
    });
  });

  return { ok: true };
}

/** Bookings this buyer completed and has not reviewed yet. */
export async function reviewableBookings(buyerUserId: string) {
  return prisma.serviceBooking.findMany({
    where: { buyerUserId, status: "COMPLETED", review: null },
    orderBy: { completedAt: "desc" },
    select: {
      id: true,
      completedAt: true,
      service: { select: { name: true } },
      partner: { select: { fullName: true, organizationName: true } },
    },
  });
}
