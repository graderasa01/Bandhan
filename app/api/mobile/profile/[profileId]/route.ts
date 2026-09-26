import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getProfileView } from "@/lib/data/profileViewData";
import { getT } from "@/lib/i18n/server";
import { requireMember } from "../../_shared/member";

export const runtime = "nodejs";

/**
 * One profile as this member may see it — `getProfileView`, the function
 * behind the web's profile page, so the visibility level, the photo gate and
 * the locked-section hints are decided in exactly one place.
 *
 * `me` is the member's own profile, which an unfinished account may preview
 * (it is how they check what they have filled). Anybody else's needs a live
 * profile of their own, as on the web.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  const own = profileId === "me";

  const { user, response } = await requireMember({ allowIncomplete: own });
  if (!user) return response;

  const id = own
    ? (await prisma.profile.findUnique({ where: { userId: user.id }, select: { id: true } }))?.id
    : profileId;
  if (!id) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Profile nahi mila." }, { status: 404 });
  }

  const profile = await getProfileView(user.id, id, await getT());
  if (!profile) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Profile nahi mila." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, profile });
}
