import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { cancelRequest, subjectDecide } from "@/lib/services/verification/verificationRequestService";
import { MAX_DECLINE_REASON_CHARS } from "@/lib/services/verification/verificationCatalog";

export const runtime = "nodejs";

/**
 * The two answers a request can get, from the two people entitled to give them:
 * the subject decides (PATCH), the requester withdraws (DELETE). Both are
 * scoped inside the service against the session's own id, so a request id from
 * somebody else's conversation is a 404 either way.
 */
const DecideSchema = z.object({
  accept: z.boolean(),
  declineReason: z.string().max(MAX_DECLINE_REASON_CHARS).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ requestId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { requestId } = await ctx.params;
  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = DecideSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "Request theek nahi hai." }, { status: 422 });
  }

  const result = await subjectDecide(user.id, requestId, {
    accept: parsed.data.accept,
    declineReason: parsed.data.declineReason,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true, checkoutUrl: result.checkoutUrl });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ requestId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { requestId } = await ctx.params;
  const result = await cancelRequest(user.id, requestId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
