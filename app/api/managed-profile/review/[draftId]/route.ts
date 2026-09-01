import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { getReviewView } from "@/lib/services/managedProfile/ownerReviewService";

export const runtime = "nodejs";

/** The owner's review queue. Owner-only: `getReviewView` matches
 *  `claimedByUserId` against the session and 404s otherwise, so a creator
 *  cannot read the queue they filled. */
export async function GET(_req: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { draftId } = await params;
  const result = await getReviewView(user.id, draftId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json(result.data);
}
