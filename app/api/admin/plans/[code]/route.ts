import { NextResponse } from "next/server";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { deletePlan, updatePlan, updatePlanPrice } from "@/lib/services/plans/planService";
import { rupeesToPaise } from "@/lib/utils/money";

export const runtime = "nodejs";

/**
 * Edit one plan.
 *
 * Price keeps its own branch: it has a dedicated service function and a
 * dedicated audit action (`PLAN_PRICE_UPDATED`, old → new), which is the row a
 * revenue question actually wants. Everything else — name, rank, visibility,
 * and any capability in the feature set — goes through `updatePlan`.
 *
 * `features` is a *partial* patch merged over what is stored, so saving one
 * capability never resets the other twenty. Values are validated against
 * `PLAN_FEATURE_TYPES` server-side; `z.unknown()` here only gets them past the
 * HTTP boundary.
 */
const PatchSchema = z.union([
  z.object({ priceRupees: z.number().positive() }).strict(),
  z
    .object({
      name: z.string().trim().min(2).max(40).optional(),
      durationLabel: z.string().trim().min(2).max(40).optional(),
      rank: z.number().int().min(0).max(999).optional(),
      displayOrder: z.number().int().min(0).max(999).optional(),
      isActive: z.boolean().optional(),
      isPublic: z.boolean().optional(),
      features: z.record(z.string(), z.unknown()).optional(),
    })
    .strict(),
]);

export async function PATCH(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const { code } = await params;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = PatchSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Value valid nahi hai." },
      { status: 422 },
    );
  }

  const result =
    "priceRupees" in parsed.data
      ? await updatePlanPrice({
          planCode: code,
          priceInPaise: rupeesToPaise(parsed.data.priceRupees),
          actorId: user.id,
          actorRole: user.role,
        })
      : await updatePlan({
          planCode: code,
          patch: parsed.data,
          actorId: user.id,
          actorRole: user.role,
        });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }

  return NextResponse.json({ ok: true, plan: result.plan });
}

/** Only ever a plan nobody has ever been on — see `deletePlan` for why. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const { code } = await params;
  const result = await deletePlan({ planCode: code, actorId: user.id, actorRole: user.role });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
