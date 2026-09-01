import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { getThreadForUser, sendEnquiryMessage } from "@/lib/services/marketplace/enquiryService";

export const runtime = "nodejs";

const BodySchema = z.object({
  body: z.string().trim().min(1).max(1000),
  serviceId: z.string().uuid().optional(),
  requestCall: z.boolean().optional(),
});

/** This member's thread with this partner. Keyed by the session, so there is
 *  no id a caller could substitute to read somebody else's conversation. */
export async function GET(_req: Request, { params }: { params: Promise<{ partnerId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { partnerId } = await params;
  const thread = await getThreadForUser(user.id, partnerId);
  return NextResponse.json({ thread });
}

/**
 * Ask a question before booking, optionally requesting a call.
 *
 * The body is scrubbed of phone numbers and emails inside the service, at write
 * time — see `redactContactDetails`. `redacted` comes back so the UI can tell
 * the sender what happened rather than leaving them to notice their own number
 * has vanished.
 */
export async function POST(req: Request, { params }: { params: Promise<{ partnerId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { partnerId } = await params;
  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "Message theek nahi hai." }, { status: 422 });
  }

  const result = await sendEnquiryMessage({
    partnerId,
    userId: user.id,
    author: "USER",
    body: parsed.data.body,
    serviceId: parsed.data.serviceId ?? null,
    requestCall: parsed.data.requestCall,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ enquiryId: result.enquiryId, redacted: result.redacted });
}
