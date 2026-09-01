import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createOffer } from "@/lib/services/plans/planOfferService";
import { rupeesToPaise } from "@/lib/utils/money";

export const runtime = "nodejs";

/**
 * Create a time-boxed offer on a plan.
 *
 * `value` arrives in the unit the kind implies — a percentage for PERCENT,
 * rupees for FLAT, ignored for FREE — and is normalised to paise here, the
 * same split `/api/admin/plans` uses: the form speaks rupees, the database
 * speaks paise, and the conversion happens once at the boundary.
 */
const BodySchema = z.object({
  planCode: z.string().trim().min(2).max(24),
  kind: z.enum(["PERCENT", "FLAT", "FREE"]),
  /** Percent (1–100) for PERCENT, rupees for FLAT, absent for FREE. */
  value: z.number().min(0).optional(),
  label: z.string().trim().min(1).max(40),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
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

  const { planCode, kind, label, startsAt, endsAt } = parsed.data;
  const raw = parsed.data.value ?? 0;
  const value = kind === "FLAT" ? rupeesToPaise(raw) : Math.round(raw);

  const result = await createOffer({
    planCode,
    kind,
    value,
    label,
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt),
    actorId: user.id,
    actorRole: user.role,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true, offerId: result.offerId }, { status: 201 });
}
