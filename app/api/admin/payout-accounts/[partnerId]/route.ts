import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { revealPayoutDestination, verifyPayoutAccount } from "@/lib/services/payouts/payoutService";

export const runtime = "nodejs";

const PatchSchema = z.object({
  approve: z.boolean(),
  note: z.string().trim().max(300).optional().nullable(),
});

/** The one check standing between a typo in an account number and money going to a stranger. */
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

  const result = await verifyPayoutAccount({
    partnerId,
    approve: parsed.data.approve,
    note: parsed.data.note,
    actorId: user.id,
    actorRole: user.role,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}

/**
 * Reveal the full account number / UPI id for one partner, before it has been
 * verified.
 *
 * The withdrawal-side reveal (`/api/admin/payouts/[id]/destination`) covers the
 * moment of paying. This covers the moment of *checking* — an admin asked to
 * approve `••••7890` is being asked to confirm digits they cannot see, which
 * is the same empty click the KYC gate used to be blamed for. Same audited
 * path underneath: `revealPayoutDestination` writes an AdminAuditLog row with
 * only the last four, so every look is recorded without duplicating the
 * secret into the log.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ partnerId: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const { partnerId } = await params;
  const result = await revealPayoutDestination({ partnerId, actorId: user.id, actorRole: user.role });
  if (!result.ok) {
    return NextResponse.json({ error: "REVEAL_FAILED", message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true, destination: result.destination });
}
