import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { revokeOverride } from "@/lib/services/plans/entitlementOverrides";

export const runtime = "nodejs";

const RevokeSchema = z.object({ reason: z.string().max(300).optional() });

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const { id } = await params;
  const parsed = RevokeSchema.safeParse(await req.json().catch(() => ({})));

  const result = await revokeOverride({
    overrideId: id,
    actorId: user.id,
    actorRole: user.role,
    reason: parsed.success ? (parsed.data.reason ?? "") : "",
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
