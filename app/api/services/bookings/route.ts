import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { createBookingCheckout, listBookingsForBuyer } from "@/lib/services/marketplace/bookingService";

export const runtime = "nodejs";

const CreateSchema = z.object({
  serviceId: z.string().uuid(),
  buyerNote: z.string().max(1000).optional(),
  preferredSlots: z.string().max(300).optional(),
  /** Phase 4 — set when the buyer started this from inside a Rishta Room. */
  rishtaOtherUserId: z.string().uuid().optional(),
});

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;
  return NextResponse.json({ bookings: await listBookingsForBuyer(user.id) });
}

/**
 * Start a booking.
 *
 * `buyerUserId` is the session's, never the body's. `beneficiaryUserId` is
 * deliberately NOT accepted from the client in Phase 2: naming a beneficiary is
 * a claim about somebody else, and the only person who can make that claim
 * safely is the owner granting a delegation (Phase 1). Until a booking can be
 * attached to a delegation, the buyer is the beneficiary — which is what the
 * service defaults to.
 */
export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = CreateSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "Booking ki detail theek nahi hai." }, { status: 422 });
  }

  const result = await createBookingCheckout({
    buyerUserId: user.id,
    serviceId: parsed.data.serviceId,
    buyerNote: parsed.data.buyerNote,
    preferredSlots: parsed.data.preferredSlots,
    // Safe to take from the body: the service verifies it against the buyer's
    // own journeys and drops anything else, so the worst a crafted id does is
    // fail to tag the booking.
    rishtaOtherUserId: parsed.data.rishtaOtherUserId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({
    bookingId: result.bookingId,
    checkoutUrl: result.checkoutUrl,
    isTest: result.isTest,
    // A free booking is already booked; the client sends them to their bookings
    // page instead of a payment screen.
    free: result.free,
  });
}
