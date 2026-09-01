import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { reviewPartnerKyc } from "@/lib/services/payouts/kycService";

export const runtime = "nodejs";

const PatchSchema = z.object({
  approve: z.boolean(),
  note: z.string().trim().max(300).optional().nullable(),
  /** Which uploads to send back, so a rejection names the file to redo. */
  rejectDocumentIds: z.array(z.string().uuid()).max(3).optional(),
});

/**
 * Approve or reject a partner's identity — the check that gives
 * `verifyPayoutAccount` something to compare an account holder name against.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ partnerId: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const { partnerId } = await params;
  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = PatchSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Input valid nahi hai." },
      { status: 422 },
    );
  }

  const result = await reviewPartnerKyc({
    partnerId,
    approve: parsed.data.approve,
    note: parsed.data.note,
    rejectDocumentIds: parsed.data.rejectDocumentIds,
    actorId: user.id,
    actorRole: user.role,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
