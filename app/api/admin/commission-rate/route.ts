import { NextResponse } from "next/server";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { updateCommissionConfig } from "@/lib/services/plans/planService";

export const runtime = "nodejs";

/**
 * Percentages arrive as percent (12.5), not basis points — the admin form
 * shows a "%" field and nobody should have to think in bps to use it. The
 * conversion happens here, once, at the boundary; everything inward of this
 * point is integer bps.
 *
 * `.partial()` rather than all-required: the form saves one control at a time,
 * and `updateCommissionConfig` validates the merged result so a single-field
 * edit still can't leave Gold ranked below Silver.
 */
const PatchSchema = z
  .object({
    basePercent: z.number().min(0).max(100),
    silverBonusPercent: z.number().min(0).max(100),
    goldBonusPercent: z.number().min(0).max(100),
    silverThreshold: z.number().int().min(0),
    goldThreshold: z.number().int().min(0),
    /** Payout controls. Rupees on the wire for the same reason percent is — nobody types paise. */
    maturityDays: z.number().int().min(0),
    minWithdrawalRupees: z.number().min(0),
    autoApproveAfterMaturity: z.boolean(),
  })
  .partial();

/** 12.5 → 1250. Rounded because a float percent can land a hair off an integer bps. */
function toBps(percent: number): number {
  return Math.round(percent * 100);
}

export async function PATCH(req: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = PatchSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Value valid nahi hai." },
      { status: 422 },
    );
  }

  const {
    basePercent,
    silverBonusPercent,
    goldBonusPercent,
    silverThreshold,
    goldThreshold,
    maturityDays,
    minWithdrawalRupees,
    autoApproveAfterMaturity,
  } = parsed.data;

  const result = await updateCommissionConfig({
    patch: {
      ...(basePercent !== undefined && { baseBps: toBps(basePercent) }),
      ...(silverBonusPercent !== undefined && { silverBonusBps: toBps(silverBonusPercent) }),
      ...(goldBonusPercent !== undefined && { goldBonusBps: toBps(goldBonusPercent) }),
      ...(silverThreshold !== undefined && { silverThreshold }),
      ...(goldThreshold !== undefined && { goldThreshold }),
      ...(maturityDays !== undefined && { maturityDays }),
      ...(minWithdrawalRupees !== undefined && { minWithdrawalPaise: Math.round(minWithdrawalRupees * 100) }),
      ...(autoApproveAfterMaturity !== undefined && { autoApproveAfterMaturity }),
    },
    actorId: user.id,
    actorRole: user.role,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }

  return NextResponse.json({ ok: true, config: result.config });
}
