import { NextResponse } from "next/server";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { changePartnerStatus, REASON_MAX, REASON_MIN } from "@/lib/services/partner/statusService";

export const runtime = "nodejs";

const PatchSchema = z.object({
  action: z.enum(["approve", "reject", "activate", "inactivate", "suspend", "reactivate"]),
  reason: z.string().trim().min(REASON_MIN).max(REASON_MAX).optional(),
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
      {
        error: "VALIDATION_FAILED",
        message: parsed.error.issues[0]?.message ?? `Reason ${REASON_MIN}–${REASON_MAX} characters ka hona chahiye.`,
      },
      { status: 422 },
    );
  }

  const result = await changePartnerStatus({
    partnerId: id,
    action: parsed.data.action,
    actorId: user.id,
    actorRole: user.role,
    reason: parsed.data.reason,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }

  return NextResponse.json({ ok: true, status: result.partner.status, issuedCode: result.issuedCode });
}
