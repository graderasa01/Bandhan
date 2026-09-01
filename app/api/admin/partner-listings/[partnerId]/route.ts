import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { reviewListing } from "@/lib/services/marketplace/partnerListingService";

export const runtime = "nodejs";

const BodySchema = z.object({
  approve: z.boolean(),
  note: z.string().max(500).nullable().optional(),
});

/** Approve or reject a partner's public listing. Rejection requires a reason —
 *  the partner has to be able to fix whatever it was. */
export async function POST(req: Request, { params }: { params: Promise<{ partnerId: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const { partnerId } = await params;
  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "Galat input." }, { status: 422 });
  }

  const result = await reviewListing({
    partnerId,
    approve: parsed.data.approve,
    note: parsed.data.note ?? null,
    actorId: user.id,
    actorRole: user.role,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
