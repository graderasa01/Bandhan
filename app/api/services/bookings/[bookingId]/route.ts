import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { parseJsonBody } from "@/app/api/_shared/responses";
import {
  acknowledgeBooking,
  buyerCancelBooking,
  disputeBooking,
  getBookingDetail,
} from "@/lib/services/marketplace/bookingService";
import { createReview } from "@/lib/services/marketplace/reviewService";

export const runtime = "nodejs";

const ActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("acknowledge") }),
  z.object({ action: z.literal("cancel"), reason: z.string().max(500).optional() }),
  z.object({ action: z.literal("dispute"), reason: z.string().trim().min(5).max(1000) }),
  z.object({
    action: z.literal("review"),
    rating: z.number().int().min(1).max(5),
    body: z.string().max(700).optional(),
  }),
]);

export async function GET(_req: Request, { params }: { params: Promise<{ bookingId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { bookingId } = await params;
  const booking = await getBookingDetail({ kind: "buyer", userId: user.id }, bookingId);
  if (!booking) return NextResponse.json({ error: "NOT_FOUND", message: "Booking nahi mili." }, { status: 404 });
  return NextResponse.json({ booking });
}

/**
 * Everything the buyer can do to their own booking.
 *
 * One route with a discriminated action rather than four sibling routes: they
 * share the same authorisation (the booking is mine) and the same failure
 * shape, and splitting them would be four places to forget the ownership check.
 * The service re-checks ownership regardless — this route never passes an id
 * through without one.
 */
export async function POST(req: Request, { params }: { params: Promise<{ bookingId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { bookingId } = await params;
  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = ActionSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "Ye action theek nahi hai." }, { status: 422 });
  }

  const input = parsed.data;
  const result =
    input.action === "acknowledge"
      ? await acknowledgeBooking(user.id, bookingId)
      : input.action === "cancel"
        ? await buyerCancelBooking(user.id, bookingId, input.reason ?? "")
        : input.action === "dispute"
          ? await disputeBooking(user.id, bookingId, input.reason)
          : await createReview({
              bookingId,
              authorUserId: user.id,
              rating: input.rating,
              body: input.body,
            });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
