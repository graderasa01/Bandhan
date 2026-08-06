import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getGrowthSnapshot } from "@/lib/services/growth/growthService";
import { parseWindow } from "@/lib/contracts/growth";

export const runtime = "nodejs";
/** Every figure is "as of now" — a cached growth console is a wrong one. */
export const dynamic = "force-dynamic";

/**
 * The window switcher's endpoint. The page itself server-renders the default
 * 30-day snapshot; this exists so changing the window doesn't reload the page.
 *
 * `requireAdmin`, not `requireUser` — this is funnel, revenue and gate-pressure
 * data for the whole product.
 */
export async function GET(req: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const days = parseWindow(new URL(req.url).searchParams.get("days"));
  const snapshot = await getGrowthSnapshot(days);
  return NextResponse.json({ ok: true, snapshot });
}
