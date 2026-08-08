import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createPlan } from "@/lib/services/plans/planService";
import { rupeesToPaise } from "@/lib/utils/money";

export const runtime = "nodejs";

/**
 * Create a plan. This endpoint is the whole point of the 2026-08-07 reversal —
 * before it, the four plans were an enum in the database and adding a cheaper
 * tier meant a migration and a deploy.
 *
 * `cloneFrom` defaults to FREE inside the service: a new plan starts from an
 * existing plan's capabilities so the worst an admin can forget is to *add*
 * something, never to accidentally ship a plan that grants everything.
 */
const BodySchema = z.object({
  code: z.string().trim().min(2).max(24),
  name: z.string().trim().min(2).max(40),
  priceRupees: z.number().min(0),
  durationLabel: z.string().trim().max(40).optional(),
  rank: z.number().int().min(0).max(999).optional(),
  cloneFrom: z.string().trim().optional(),
});

export async function POST(req: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Form sahi se bharein." },
      { status: 422 },
    );
  }

  const result = await createPlan({
    code: parsed.data.code,
    name: parsed.data.name,
    priceInPaise: rupeesToPaise(parsed.data.priceRupees),
    durationLabel: parsed.data.durationLabel,
    rank: parsed.data.rank,
    cloneFrom: parsed.data.cloneFrom,
    actorId: user.id,
    actorRole: user.role,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true, plan: result.plan }, { status: 201 });
}
