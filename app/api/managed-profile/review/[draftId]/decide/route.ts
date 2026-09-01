import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { refreshSession } from "@/lib/auth/session";
import { decideFields } from "@/lib/services/managedProfile/ownerReviewService";

export const runtime = "nodejs";

const BodySchema = z.object({
  decisions: z
    .array(
      z.object({
        fieldKey: z.string().min(1).max(64),
        action: z.enum(["accept", "reject", "replace"]),
        value: z.string().max(2000).optional(),
      }),
    )
    .min(1)
    .max(80),
});

/**
 * The owner's per-field decisions.
 *
 * The "sensitive facts are decided one at a time" rule is enforced in
 * `decideFields`, not here — a second copy of it in the route would be a
 * second place to get it wrong, and this route is not the only caller worth
 * protecting (the check script calls the service directly).
 *
 * `refreshSession` fires when a decision was the thing that completed the
 * required set: the JWT carries `status`, middleware reads only the JWT, and
 * without a re-sign an owner whose profile just went ACTIVE would keep being
 * bounced off `/user/reel` until they logged out. Same fix
 * `/api/profile/save-draft` already applies for the self-fill path.
 */
export async function POST(req: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { draftId } = await params;
  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "Decisions ka format galat hai." }, { status: 422 });
  }

  const result = await decideFields(user.id, user.fullName, draftId, parsed.data.decisions);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }

  if (result.data.justActivated) {
    await refreshSession({ id: user.id, role: user.role, status: "ACTIVE" }, req);
  }

  return NextResponse.json(result.data);
}
