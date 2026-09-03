import { NextResponse } from "next/server";
import { requirePartner } from "@/lib/auth/requirePartner";
import { getT } from "@/lib/i18n/server";
import { parseJsonBody } from "@/app/api/_shared/responses";
import {
  getParticipantRoomView,
  resolveRoomAccess,
} from "@/lib/services/rishta/roomParticipantService";
import { HelperActionSchema, runHelperAction } from "@/lib/services/rishta/roomHelperActions";

export const runtime = "nodejs";

/**
 * A partner's side of one Rishta Room.
 *
 * The gate is two-layered and both layers matter: `requirePartner` proves the
 * caller is an approved partner *right now*, and `resolveRoomAccess` proves
 * this particular participant row belongs to that partner and still has a live
 * delegation behind it. A participant id from another bureau's room resolves to
 * null and returns the same 404 as one that does not exist.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ participantId: string }> }) {
  const { partner, response } = await requirePartner(["APPROVED", "ACTIVE"]);
  if (!partner) return response;

  const { participantId } = await ctx.params;
  const t = await getT();
  const access = await resolveRoomAccess({ participantId, partnerId: partner.id });
  if (!access) {
    return NextResponse.json({ error: "NOT_FOUND", message: t("rishtaRoom.api.roomNotYours", "Ye rishta aapke paas nahi hai.") }, { status: 404 });
  }
  return NextResponse.json({ ok: true, room: await getParticipantRoomView(access) });
}

export async function POST(req: Request, ctx: { params: Promise<{ participantId: string }> }) {
  const { user, partner, response } = await requirePartner(["APPROVED", "ACTIVE"]);
  if (!partner) return response;

  const { participantId } = await ctx.params;
  const t = await getT();
  const access = await resolveRoomAccess({ participantId, partnerId: partner.id });
  if (!access) {
    return NextResponse.json({ error: "NOT_FOUND", message: t("rishtaRoom.api.roomNotYours", "Ye rishta aapke paas nahi hai.") }, { status: 404 });
  }

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = HelperActionSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? t("verification.api.invalidRequest", "Request theek nahi hai.") },
      { status: 422 },
    );
  }

  const result = await runHelperAction(access, parsed.data, user.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true, room: await getParticipantRoomView(access) });
}
