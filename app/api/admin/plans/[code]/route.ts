import { NextResponse } from "next/server";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { updatePlanPrice, updatePlanReelPerDay } from "@/lib/services/plans/planService";
import { rupeesToPaise } from "@/lib/utils/money";

export const runtime = "nodejs";

/**
 * Exactly one control per request — the form saves one field at a time and
 * each field has its own service function, validation range and audit action.
 * `reelPerDay: null` is meaningful (hand the plan back to D-11's code ladder),
 * so it is `.nullable()` rather than merely optional, and the two keys are a
 * union so a body carrying both can't silently apply only one.
 */
const PatchSchema = z.union([
  z.object({ priceRupees: z.number().positive() }).strict(),
  z.object({ reelPerDay: z.number().int().nullable() }).strict(),
]);

const VALID_CODES = ["FREE", "BASIC", "STANDARD", "PREMIUM"] as const;

export async function PATCH(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const { code } = await params;
  if (!VALID_CODES.includes(code as (typeof VALID_CODES)[number])) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Plan nahi mila." }, { status: 404 });
  }

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = PatchSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Value valid nahi hai." },
      { status: 422 },
    );
  }

  const planCode = code as (typeof VALID_CODES)[number];
  const result =
    "priceRupees" in parsed.data
      ? await updatePlanPrice({
          planCode,
          priceInPaise: rupeesToPaise(parsed.data.priceRupees),
          actorId: user.id,
          actorRole: user.role,
        })
      : await updatePlanReelPerDay({
          planCode,
          reelPerDay: parsed.data.reelPerDay,
          actorId: user.id,
          actorRole: user.role,
        });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }

  return NextResponse.json({ ok: true, plan: result.plan });
}
