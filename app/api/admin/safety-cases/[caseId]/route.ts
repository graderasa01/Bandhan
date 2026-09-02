import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { updateSafetyCase } from "@/lib/services/safety/safetyCaseService";

export const runtime = "nodejs";

const BodySchema = z.object({
  stepsDone: z.array(z.string().max(64)).max(20).optional(),
  status: z.enum(["OPEN", "IN_REVIEW", "ACTION_TAKEN", "CLOSED_NO_ACTION"]).optional(),
  resolutionNote: z.string().max(2000).nullable().optional(),
});

/**
 * Working one safety case: ticking a playbook step, writing what was done,
 * closing it.
 *
 * `requireAdmin` rather than admin-or-support. Support accounts exist and this
 * is arguably their queue — but the actions a case leads to (suspending a
 * member, pausing a partner, refunding a booking) are all ADMIN-gated already,
 * and a role that can close a safety case but cannot do anything about one is a
 * role that can only make cases disappear. Widening this is a deliberate
 * decision to make later, with the support role's other powers, not a default.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const { caseId } = await params;
  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Galat input." },
      { status: 422 },
    );
  }

  const result = await updateSafetyCase(caseId, parsed.data, { actorId: user.id, actorRole: user.role });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
