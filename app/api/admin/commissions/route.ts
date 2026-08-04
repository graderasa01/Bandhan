import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { transitionCommission } from "@/lib/services/payments/commissionService";

export const runtime = "nodejs";

const BodySchema = z.object({
  commissionId: z.string().min(1),
  action: z.enum(["approve", "markPaid", "reverse"]),
  reason: z.string().max(300).optional(),
});

export async function POST(req: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 422 });
  }

  const result = await transitionCommission({
    commissionId: parsed.data.commissionId,
    action: parsed.data.action,
    actorId: user.id,
    actorRole: user.role,
    reason: parsed.data.reason ?? null,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: 422 });
  }
  return NextResponse.json({ ok: true });
}
