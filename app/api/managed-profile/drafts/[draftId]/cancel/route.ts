import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { cancelDraft } from "@/lib/services/managedProfile/managedDraftService";
import { resolveCreatorContext } from "@/lib/services/managedProfile/managedEligibility";

export const runtime = "nodejs";

/**
 * Close an unclaimed draft. Refused once somebody has claimed it — at that
 * point the data is theirs, and a helper walking away must not be able to take
 * it with them. What the helper *can* do after a claim is nothing; what the
 * owner can do is revoke, on `/user/profile/access`.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { draftId } = await params;
  const contextResult = await resolveCreatorContext(user);
  const label = contextResult.ok ? contextResult.context.label : user.fullName;

  const result = await cancelDraft(draftId, user.id, label);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
