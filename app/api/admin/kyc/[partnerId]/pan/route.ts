import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { revealPan } from "@/lib/services/payouts/kycService";

export const runtime = "nodejs";

/**
 * The full PAN, for the one place it is legitimately needed: filing TDS on
 * commission.
 *
 * POST, not GET — it has a side effect (the audit row) and must never fire on
 * a prefetch. Kept apart from the document route so that reading a number and
 * looking at a photo are two different, separately logged acts.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ partnerId: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const { partnerId } = await params;
  const result = await revealPan({ partnerId, actorId: user.id, actorRole: user.role });
  if (!result.ok) {
    return NextResponse.json({ error: "REVEAL_FAILED", message: result.message }, { status: result.status });
  }

  return NextResponse.json({ ok: true, pan: result.pan, legalName: result.legalName });
}
