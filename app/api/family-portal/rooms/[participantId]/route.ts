import { NextResponse } from "next/server";
import { requireFamilyMember } from "@/lib/auth/requireFamilyMember";
import { getT } from "@/lib/i18n/server";
import { parseJsonBody } from "@/app/api/_shared/responses";
import {
  getParticipantRoomView,
  resolveRoomAccess,
} from "@/lib/services/rishta/roomParticipantService";
import { HelperActionSchema, runHelperAction } from "@/lib/services/rishta/roomHelperActions";

export const runtime = "nodejs";

/**
 * A family member's side of one Rishta Room.
 *
 * Same two layers as the partner route, against the family cookie world:
 * `requireFamilyMember` proves the portal session, `resolveRoomAccess` proves
 * this room was granted to *that* family member.
 *
 * `actorUserId` is null here and that is not an oversight — a family member is
 * a `FamilyMember` row, not an account (see the model note on why
 * `delegateUserId` is nullable). The request records `raisedByLabel`, which is
 * what the owner actually reads.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ participantId: string }> }) {
  const { member, response } = await requireFamilyMember();
  if (!member) return response;

  const { participantId } = await ctx.params;
  const t = await getT();
  const access = await resolveRoomAccess({ participantId, familyMemberId: member.id });
  if (!access) {
    return NextResponse.json({ error: "NOT_FOUND", message: t("rishtaRoom.api.roomNotYours", "Ye rishta aapke paas nahi hai.") }, { status: 404 });
  }
  return NextResponse.json({ ok: true, room: await getParticipantRoomView(access) });
}

export async function POST(req: Request, ctx: { params: Promise<{ participantId: string }> }) {
  const { member, response } = await requireFamilyMember();
  if (!member) return response;

  const { participantId } = await ctx.params;
  const t = await getT();
  const access = await resolveRoomAccess({ participantId, familyMemberId: member.id });
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

  const result = await runHelperAction(access, parsed.data, null);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true, room: await getParticipantRoomView(access) });
}
