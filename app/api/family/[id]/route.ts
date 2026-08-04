import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { revokeFamilyMember } from "@/lib/services/family/familyService";

export const runtime = "nodejs";

/** Owner-only. Kills every bound session too — see revokeFamilyMember. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { id } = await params;

  const result = await revokeFamilyMember(user.id, id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
