import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { setPartnerCommissionOverride } from "@/lib/services/partner/adminPartnerActions";
import { MAX_COMMISSION_BPS, MIN_COMMISSION_BPS } from "@/lib/services/plans/constants";

export const runtime = "nodejs";

/**
 * Percent on the wire, bps in the database — the same boundary
 * /api/admin/commission-rate already uses for the global rate, so the two
 * forms can't disagree about what "12.5" means.
 *
 * `percent: null` clears the override and hands the partner back to their tier.
 */
const PatchSchema = z.object({
  percent: z
    .number()
    .min(MIN_COMMISSION_BPS / 100)
    .max(MAX_COMMISSION_BPS / 100)
    .nullable(),
  reason: z.string().trim().min(1, "Reason likhna zaroori hai.").max(500),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const { id } = await params;
  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = PatchSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Rate valid nahi hai." },
      { status: 422 },
    );
  }

  const result = await setPartnerCommissionOverride({
    partnerId: id,
    bps: parsed.data.percent === null ? null : Math.round(parsed.data.percent * 100),
    reason: parsed.data.reason,
    actorId: user.id,
    actorRole: user.role,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
