import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { updateCommissionRate } from "@/lib/services/plans/planService";
import { rupeesToPaise } from "@/lib/utils/money";

export const runtime = "nodejs";

const PatchSchema = z.object({
  amountRupees: z.number().positive(),
});

export async function PATCH(req: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Request JSON padha nahi ja saka." }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Amount valid nahi hai." },
      { status: 422 },
    );
  }

  const result = await updateCommissionRate({
    amountPaise: rupeesToPaise(parsed.data.amountRupees),
    actorId: user.id,
    actorRole: user.role,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }

  return NextResponse.json({ ok: true, config: result.config });
}
