import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { decideProposal } from "@/lib/services/clientDesk/proposalService";

export const runtime = "nodejs";

const BodySchema = z.object({
  decision: z.enum(["accept", "reject"]),
  note: z.string().max(500).nullable().optional(),
});

/**
 * The owner's tap — the only thing in Phase 3 that has an external effect, and
 * even then only on the owner's own shortlist.
 *
 * Ownership is re-checked in `decideProposal` against `ownerUserId`, so a
 * proposal id belonging to someone else is a 404 rather than a decision made
 * on a stranger's behalf.
 */
export async function POST(req: Request, { params }: { params: Promise<{ proposalId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { proposalId } = await params;
  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "Ye faisla theek nahi hai." }, { status: 422 });
  }

  const result = await decideProposal(user.id, proposalId, parsed.data.decision, parsed.data.note ?? null);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true, shortlistId: result.shortlistId });
}
