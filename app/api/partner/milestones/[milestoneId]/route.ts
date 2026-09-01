import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePartner } from "@/lib/auth/requirePartner";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { submitMilestone } from "@/lib/services/marketplace/bookingService";

export const runtime = "nodejs";

const BodySchema = z.object({ note: z.string().max(800).nullable().optional() });

/** The partner saying one promised deliverable is done. Ownership is re-checked
 *  in the service against the milestone's own booking. */
export async function POST(req: Request, { params }: { params: Promise<{ milestoneId: string }> }) {
  const { partner, response } = await requirePartner(["APPROVED", "ACTIVE"]);
  if (!partner) return response;

  const { milestoneId } = await params;
  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "Note theek nahi hai." }, { status: 422 });
  }

  const result = await submitMilestone(partner.id, milestoneId, parsed.data.note ?? null);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
