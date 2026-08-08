import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { transitionWithdrawal } from "@/lib/services/payouts/payoutService";

export const runtime = "nodejs";

const PatchSchema = z.object({
  action: z.enum(["approve", "markPaid", "reject"]),
  /** Required for markPaid — a "paid" row without a bank reference is only a claim. */
  utr: z.string().trim().max(64).optional().nullable(),
  reason: z.string().trim().max(500).optional().nullable(),
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
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Action valid nahi hai." },
      { status: 422 },
    );
  }

  const result = await transitionWithdrawal({
    withdrawalId: id,
    action: parsed.data.action,
    utr: parsed.data.utr,
    reason: parsed.data.reason,
    actorId: user.id,
    actorRole: user.role,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
