import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { computeAndStoreScores } from "@/lib/services/deepProfile/deepProfileService";

export const runtime = "nodejs";

/**
 * User-triggered. This is the one AI call on this feature the user explicitly
 * asked for and is waiting on — same UX contract as the profile interview's
 * extraction call, not a background job.
 */
export async function POST() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const result = await computeAndStoreScores(user.id);
  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: 422 });
  }
  return NextResponse.json({ ok: true, computed: result.computed });
}
