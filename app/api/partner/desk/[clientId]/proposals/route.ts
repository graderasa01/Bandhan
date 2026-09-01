import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePartner } from "@/lib/auth/requirePartner";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { openClientDesk } from "@/lib/services/clientDesk/clientDeskService";
import { listProposalsForPartner, proposeCandidate } from "@/lib/services/clientDesk/proposalService";

export const runtime = "nodejs";

const ProposeSchema = z.object({
  candidateProfileId: z.string().uuid(),
  reason: z.string().trim().min(15).max(700),
  source: z.enum(["PARTNER_SEARCH", "PARTNER_OFFLINE"]),
  draftMessage: z.string().max(600).nullable().optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const { partner, response } = await requirePartner(["APPROVED", "ACTIVE"]);
  if (!partner) return response;

  const { clientId } = await params;
  const desk = await openClientDesk(partner.id, clientId);
  if (!desk.ok) return NextResponse.json({ error: desk.error, message: desk.message }, { status: desk.status });

  return NextResponse.json({ proposals: await listProposalsForPartner(partner.id, clientId) });
}

/**
 * Put one candidate in front of the client.
 *
 * Proposing only. This route imports nothing that could send an interest or a
 * message, and the service it calls does not either — "approval required
 * before external effect" is a property of what is reachable from here, not a
 * flag somebody checks.
 */
export async function POST(req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const { user, partner, response } = await requirePartner(["APPROVED", "ACTIVE"]);
  if (!partner || !user) return response;

  const { clientId } = await params;
  const desk = await openClientDesk(partner.id, clientId);
  if (!desk.ok) return NextResponse.json({ error: desk.error, message: desk.message }, { status: desk.status });

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = ProposeSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: "Wajah kam se kam 15 characters ki likhiye." },
      { status: 422 },
    );
  }

  const result = await proposeCandidate({
    partnerUserId: user.id,
    partnerId: partner.id,
    partnerLabel: partner.organizationName?.trim() || partner.fullName,
    ownerUserId: clientId,
    candidateProfileId: parsed.data.candidateProfileId,
    reason: parsed.data.reason,
    source: parsed.data.source,
    draftMessage: parsed.data.draftMessage ?? null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ proposalId: result.proposalId }, { status: 201 });
}
