import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getOverview } from "@/lib/services/marketing/taskService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The whole screen in one read: connection strip + work queue. The page
 * server-renders it once and the console polls this while a task is WORKING.
 */
export async function GET() {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const overview = await getOverview();
  return NextResponse.json({ ok: true, overview });
}
