import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePartner } from "@/lib/auth/requirePartner";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { addClientNote, deleteClientNote, listClientNotes } from "@/lib/services/clientDesk/clientDeskService";

export const runtime = "nodejs";

const AddSchema = z.object({ body: z.string().trim().min(1).max(2000) });
const DeleteSchema = z.object({ noteId: z.string().uuid() });

/** The partner's private working notes. Never reachable by the member — there
 *  is no member-facing route into this table anywhere in the codebase. */
export async function GET(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const { partner, response } = await requirePartner(["APPROVED", "ACTIVE"]);
  if (!partner) return response;
  const { clientId } = await params;
  return NextResponse.json({ notes: await listClientNotes(partner.id, clientId) });
}

export async function POST(req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const { user, partner, response } = await requirePartner(["APPROVED", "ACTIVE"]);
  if (!partner || !user) return response;

  const { clientId } = await params;
  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = AddSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "Note theek nahi hai." }, { status: 422 });
  }

  const result = await addClientNote({
    partnerId: partner.id,
    authorUserId: user.id,
    ownerUserId: clientId,
    body: parsed.data.body,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ noteId: result.noteId }, { status: 201 });
}

export async function DELETE(req: Request) {
  const { partner, response } = await requirePartner(["APPROVED", "ACTIVE"]);
  if (!partner) return response;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = DeleteSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "Galat note." }, { status: 422 });
  }

  const result = await deleteClientNote(partner.id, parsed.data.noteId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
