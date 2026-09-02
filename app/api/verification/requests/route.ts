import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { parseJsonBody } from "@/app/api/_shared/responses";
import {
  createVerificationRequest,
  listVerificationRequests,
} from "@/lib/services/verification/verificationRequestService";
import { MAX_REQUEST_MESSAGE_CHARS, REQUESTABLE_KINDS } from "@/lib/services/verification/verificationCatalog";
import type { VerificationKind } from "@prisma/client";

export const runtime = "nodejs";

/**
 * Asking somebody to prove one thing about themselves.
 *
 * `requesterUserId` is the session's, never the body's — the body names the
 * subject, and the service refuses any subject the caller has no rishta with.
 * That gate is the difference between a verification feature and a way to
 * demand identity documents from strangers.
 */
const CreateSchema = z.object({
  subjectUserId: z.string().uuid(),
  kind: z.enum(REQUESTABLE_KINDS as [VerificationKind, ...VerificationKind[]]),
  payer: z.enum(["REQUESTER", "SUBJECT", "SPLIT"]),
  message: z.string().max(MAX_REQUEST_MESSAGE_CHARS).optional(),
});

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;
  return NextResponse.json({ ok: true, ...(await listVerificationRequests(user.id)) });
}

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = CreateSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Request theek nahi hai." },
      { status: 422 },
    );
  }

  const result = await createVerificationRequest({
    requesterUserId: user.id,
    subjectUserId: parsed.data.subjectUserId,
    kind: parsed.data.kind,
    payer: parsed.data.payer,
    message: parsed.data.message,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({
    ok: true,
    requestId: result.requestId,
    checkoutUrl: result.checkoutUrl,
    isTest: result.isTest,
  });
}
