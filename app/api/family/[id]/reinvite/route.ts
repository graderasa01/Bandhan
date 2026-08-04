import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { reinviteFamilyMember } from "@/lib/services/family/familyService";

export const runtime = "nodejs";

/** Owner-only. Fresh 48h invite token; any device already bound is signed out — see reinviteFamilyMember. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { id } = await params;

  const result = await reinviteFamilyMember(user.id, id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }

  const inviteUrl = new URL(`/f/${result.member.inviteToken}`, new URL(req.url).origin).toString();
  return NextResponse.json({ ok: true, member: { ...result.member, inviteUrl } });
}
