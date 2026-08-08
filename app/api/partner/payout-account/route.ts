import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { requirePartner } from "@/lib/auth/requirePartner";
import { savePayoutAccount } from "@/lib/services/payouts/payoutService";

export const runtime = "nodejs";

/**
 * A partner's own payout details. There is no GET returning the full value —
 * the page is server-rendered with only the last four (see
 * `getPayoutAccount`), and nothing sends a stored account number to a browser,
 * not even to the person who typed it.
 */
const BodySchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("UPI"),
    accountHolderName: z.string().trim().min(2, "Naam likhiye.").max(120),
    upiId: z.string().trim().min(3).max(120),
  }),
  z.object({
    method: z.literal("BANK"),
    accountHolderName: z.string().trim().min(2, "Naam likhiye.").max(120),
    accountNumber: z.string().trim().min(6).max(24),
    ifsc: z.string().trim().length(11, "IFSC 11 characters ka hota hai."),
    bankName: z.string().trim().max(120).optional().nullable(),
  }),
]);

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

  const result = await savePayoutAccount(partner.id, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
