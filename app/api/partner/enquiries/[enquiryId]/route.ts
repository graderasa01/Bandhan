import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePartner } from "@/lib/auth/requirePartner";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { closeThread, getThreadForPartner, sendEnquiryMessage } from "@/lib/services/marketplace/enquiryService";

export const runtime = "nodejs";

const ActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reply"), body: z.string().trim().min(1).max(1000) }),
  z.object({ action: z.literal("close") }),
]);

export async function GET(_req: Request, { params }: { params: Promise<{ enquiryId: string }> }) {
  const { partner, response } = await requirePartner(["APPROVED", "ACTIVE"]);
  if (!partner) return response;

  const { enquiryId } = await params;
  const thread = await getThreadForPartner(partner.id, enquiryId);
  if (!thread) return NextResponse.json({ error: "NOT_FOUND", message: "Baat-cheet nahi mili." }, { status: 404 });
  return NextResponse.json({ thread });
}

/** A partner's reply is scrubbed exactly like the member's — the off-platform
 *  jump is at least as likely to come from this side. */
export async function POST(req: Request, { params }: { params: Promise<{ enquiryId: string }> }) {
  const { partner, response } = await requirePartner(["APPROVED", "ACTIVE"]);
  if (!partner) return response;

  const { enquiryId } = await params;
  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = ActionSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "Ye action theek nahi hai." }, { status: 422 });
  }

  if (parsed.data.action === "close") {
    const closed = await closeThread(partner.id, enquiryId);
    if (!closed.ok) {
      return NextResponse.json({ error: closed.error, message: closed.message }, { status: closed.status });
    }
    return NextResponse.json({ ok: true });
  }

  // Re-read the thread to resolve its member — the enquiry id alone must never
  // be enough to address a message at somebody.
  const thread = await getThreadForPartner(partner.id, enquiryId);
  if (!thread) return NextResponse.json({ error: "NOT_FOUND", message: "Baat-cheet nahi mili." }, { status: 404 });

  const result = await sendEnquiryMessage({
    partnerId: partner.id,
    userId: thread.userId,
    author: "PARTNER",
    body: parsed.data.body,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true, redacted: result.redacted });
}
