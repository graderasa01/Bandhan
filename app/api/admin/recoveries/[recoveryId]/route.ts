import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { waiveRecovery } from "@/lib/services/payouts/recoveryService";

export const runtime = "nodejs";

/**
 * Writing off what a partner owes.
 *
 * The only action here, and deliberately: there is no way to *create* a debt
 * from the admin panel. A recovery exists because a refund happened, and
 * inventing one by hand would make the ledger unanswerable — "why do I owe
 * this?" has to be answerable by pointing at a booking.
 */
const BodySchema = z.object({ action: z.literal("waive"), reason: z.string().min(3).max(500) });

export async function PATCH(req: Request, ctx: { params: Promise<{ recoveryId: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const { recoveryId } = await ctx.params;
  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "Waive ka reason likhiye." }, { status: 422 });
  }

  const result = await waiveRecovery({
    recoveryId,
    adminUserId: user.id,
    reason: parsed.data.reason,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
