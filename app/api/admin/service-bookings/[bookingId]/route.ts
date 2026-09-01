import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { adminResolveBooking } from "@/lib/services/marketplace/bookingService";

export const runtime = "nodejs";

const BodySchema = z.object({
  action: z.enum(["refund", "release", "note"]),
  note: z.string().trim().min(3).max(1000),
});

/**
 * The complaint desk.
 *
 * `requireAdmin` — not SUPPORT: refunding money and releasing a partner's
 * earnings are the same class of decision as approving a commission, which is
 * already ADMIN-only. Every branch writes an `AdminAuditLog` row inside
 * `adminResolveBooking`, and a reason is mandatory on all three.
 */
export async function POST(req: Request, { params }: { params: Promise<{ bookingId: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const { bookingId } = await params;
  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "Reason likhna zaroori hai." }, { status: 422 });
  }

  const result = await adminResolveBooking({
    bookingId,
    action: parsed.data.action,
    note: parsed.data.note,
    actorId: user.id,
    actorRole: user.role,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
