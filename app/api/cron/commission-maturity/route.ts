import { NextResponse } from "next/server";
import { runCommissionMaturity } from "@/lib/services/payouts/maturityJob";

export const runtime = "nodejs";
/** Never cached and never statically evaluated — this one has side effects. */
export const dynamic = "force-dynamic";

/**
 * Approves commissions whose refund window has closed. Point a cron at it once
 * a day:
 *
 *   curl -X POST https://bandhantak.com/api/cron/commission-maturity \
 *     -H "Authorization: Bearer $CRON_SECRET"
 *
 * Daily is enough — the window is measured in days, and running it twice is
 * harmless (see runCommissionMaturity). Same `CRON_SECRET` discipline as
 * /api/cron/partner-outreach: an endpoint that marks money payable is not left
 * open because the URL looks obscure, and an unset secret refuses rather than
 * defaulting to open.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[payouts:cron] CRON_SECRET not set — refusing to run.");
    return NextResponse.json({ error: "NOT_CONFIGURED", message: "Cron secret set nahi hai." }, { status: 503 });
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const summary = await runCommissionMaturity();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error("[payouts:cron] run failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "RUN_FAILED", message: "Job fail ho gaya." }, { status: 500 });
  }
}
