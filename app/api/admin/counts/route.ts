import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getAdminPendingCounts } from "@/lib/services/admin/adminOverviewService";

export const runtime = "nodejs";

/**
 * Every admin nav badge, in one round trip — the admin-side twin of
 * `/api/nav/counts`.
 *
 * `requireAdmin` and not `requireUser`: these numbers describe the moderation
 * backlog, and "how many reports are open right now" is not a thing a logged-in
 * member gets to ask.
 */
export async function GET() {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const counts = await getAdminPendingCounts();
  return NextResponse.json({ ok: true, counts });
}
