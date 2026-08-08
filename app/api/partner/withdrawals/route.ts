import { NextResponse } from "next/server";
import { requirePartner } from "@/lib/auth/requirePartner";
import { requestWithdrawal } from "@/lib/services/payouts/payoutService";

export const runtime = "nodejs";

/**
 * "Mera paisa bhej do."
 *
 * No body: a withdrawal always takes the partner's whole available balance
 * (see `requestWithdrawal` for why a partial amount would need the ledger to
 * split a commission row). Every eligibility rule — verified account, the
 * minimum, no other request already open — is re-checked server-side, so the
 * disabled button on the page is a courtesy, not the gate.
 */
export async function POST() {
  const { partner, response } = await requirePartner(["APPROVED", "ACTIVE"]);
  if (!partner) return response;

  const result = await requestWithdrawal(partner.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json(result, { status: 201 });
}
