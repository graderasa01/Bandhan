import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { listDelegationsForOwner } from "@/lib/services/managedProfile/delegationService";
import { getConsentHistory } from "@/lib/services/managedProfile/consentLog";

export const runtime = "nodejs";

/** Who currently has access to my profile, and what has happened to it. Always
 *  the signed-in user's own — there is no id parameter to substitute. */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const [delegations, history] = await Promise.all([
    listDelegationsForOwner(user.id),
    getConsentHistory(user.id),
  ]);

  return NextResponse.json({ delegations, history });
}
