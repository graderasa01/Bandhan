import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePartner } from "@/lib/auth/requirePartner";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { acceptBooking, partnerDeclineBooking } from "@/lib/services/marketplace/bookingService";

export const runtime = "nodejs";

const ActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept") }),
  z.object({ action: z.literal("decline"), reason: z.string().trim().min(5).max(500) }),
]);

/**
 * The partner accepting or declining a paid booking.
 *
 * Declining always refunds in full — there is no partial-decline. A partner who
 * has taken money and then decided not to do the work has not earned any part
 * of it, and a "partial" here would be a negotiation happening inside a status
 * enum instead of between two people.
 */
export async function POST(req: Request, { params }: { params: Promise<{ bookingId: string }> }) {
  const { partner, response } = await requirePartner(["APPROVED", "ACTIVE"]);
  if (!partner) return response;

  const { bookingId } = await params;
  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = ActionSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "Ye action theek nahi hai." }, { status: 422 });
  }

  const result =
    parsed.data.action === "accept"
      ? await acceptBooking(partner.id, bookingId)
      : await partnerDeclineBooking(partner.id, bookingId, parsed.data.reason);

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
