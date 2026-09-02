import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { assignCheck, recordResult } from "@/lib/services/verification/humanVerificationQueue";
import {
  MAX_EVIDENCE_NOTE_CHARS,
  MAX_RESULT_NOTE_CHARS,
} from "@/lib/services/verification/verificationCatalog";

export const runtime = "nodejs";

/**
 * Assigning a check, and recording what was found.
 *
 * The result branch is the only writer of `VerificationCheck.outcome` in the
 * product. It takes an admin session and a mandatory evidence note, and it
 * reads no payment state — which is what makes "paying does not change the
 * result" a property of the code rather than a promise in a document.
 */
const BodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("assign"), toMe: z.boolean() }),
  z.object({
    action: z.literal("result"),
    outcome: z.enum(["MATCHED", "MISMATCH", "COULD_NOT_COMPLETE"]),
    evidenceNote: z.string().min(10).max(MAX_EVIDENCE_NOTE_CHARS),
    resultNote: z.string().max(MAX_RESULT_NOTE_CHARS).optional(),
  }),
]);

export async function PATCH(req: Request, ctx: { params: Promise<{ checkId: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const { checkId } = await ctx.params;
  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Request theek nahi hai." },
      { status: 422 },
    );
  }

  const result =
    parsed.data.action === "assign"
      ? await assignCheck(checkId, parsed.data.toMe ? user.id : null)
      : await recordResult({
          checkId,
          adminUserId: user.id,
          outcome: parsed.data.outcome,
          evidenceNote: parsed.data.evidenceNote,
          resultNote: parsed.data.resultNote,
        });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
