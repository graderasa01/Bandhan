import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { refreshSession } from "@/lib/auth/session";
import { bulkAcceptOrdinary } from "@/lib/services/managedProfile/ownerReviewService";

export const runtime = "nodejs";

/**
 * "Confirm all ordinary details".
 *
 * Takes **no body at all**. The list of fields to accept is read from the
 * database by `bulkAcceptOrdinary` and filtered against the sensitive policy
 * there, so there is no input to this endpoint that could name a field — which
 * is what makes "sensitive values cannot be bulk-confirmed" a property of the
 * shape of the API rather than of a validation branch someone could weaken.
 */
export async function POST(req: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { draftId } = await params;
  const result = await bulkAcceptOrdinary(user.id, user.fullName, draftId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }

  if (result.data.justActivated) {
    await refreshSession({ id: user.id, role: user.role, status: "ACTIVE" }, req);
  }

  return NextResponse.json(result.data);
}
