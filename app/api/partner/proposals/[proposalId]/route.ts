import { NextResponse } from "next/server";
import { requirePartner } from "@/lib/auth/requirePartner";
import { withdrawProposal } from "@/lib/services/clientDesk/proposalService";

export const runtime = "nodejs";

/** Take back a suggestion the client has not answered yet. The only thing a
 *  partner may do to a proposal after making it. */
export async function POST(_req: Request, { params }: { params: Promise<{ proposalId: string }> }) {
  const { user, partner, response } = await requirePartner(["APPROVED", "ACTIVE"]);
  if (!partner || !user) return response;

  const { proposalId } = await params;
  const result = await withdrawProposal(
    user.id,
    partner.id,
    partner.organizationName?.trim() || partner.fullName,
    proposalId,
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
