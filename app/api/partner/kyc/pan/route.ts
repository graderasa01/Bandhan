import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { requirePartner } from "@/lib/auth/requirePartner";
import { savePanDetails } from "@/lib/services/payouts/kycService";

export const runtime = "nodejs";

/**
 * A partner's PAN and the name printed beside it.
 *
 * There is no GET. The page is server-rendered with only the last four (see
 * `getPartnerKycView`), and nothing sends a stored PAN back to a browser — not
 * even to the person who typed it, which is the same rule the payout account
 * follows.
 */
const BodySchema = z.object({
  pan: z.string().trim().min(10).max(12),
  legalName: z.string().trim().min(2, "PAN card wala naam likhiye.").max(120),
});

export async function PUT(req: Request) {
  const { partner, response } = await requirePartner(["APPROVED", "ACTIVE", "INACTIVE"]);
  if (!partner) return response;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Details sahi se bhariye." },
      { status: 422 },
    );
  }

  const result = await savePanDetails(partner.id, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
