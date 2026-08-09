import { NextResponse } from "next/server";
import { requireFamilyMember } from "@/lib/auth/requireFamilyMember";
import { getFamilyProfileDetail } from "@/lib/services/family/familyPortalActions";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";

/** The "poori profile" expand — PARENT/SIBLING only, and only for a profile already in the owner's matches/shortlist. */
export async function GET(_req: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const { member, response } = await requireFamilyMember();
  if (!member) return response;
  const { profileId } = await params;

  const t = await getT();
  const result = await getFamilyProfileDetail(member, profileId, t);
  if (!result.ok) return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  return NextResponse.json({ ok: true, profile: result.profile });
}
