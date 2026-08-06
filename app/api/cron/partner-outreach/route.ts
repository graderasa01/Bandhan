import { NextResponse } from "next/server";
import { runAutomatedOutreach } from "@/lib/services/outreach/outreachJob";

export const runtime = "nodejs";
/** Never cached and never statically evaluated — this one has side effects. */
export const dynamic = "force-dynamic";

/**
 * The scheduled nudge run. Point a cron at it once a day:
 *
 *   curl -X POST https://bandhantak.com/api/cron/partner-outreach \
 *     -H "Authorization: Bearer $CRON_SECRET"
 *
 * Daily is the right cadence, not hourly: every real brake lives in
 * `runAutomatedOutreach` and the per-template cooldowns are measured in days,
 * so firing more often only burns queries. Running it twice by accident is
 * harmless for the same reason — the cooldown check is what actually decides
 * whether anything goes out, not the schedule.
 *
 * `CRON_SECRET` is mandatory. An unauthenticated endpoint that messages real
 * families on demand is not something to leave open because the URL looks
 * obscure — and if the secret is unset, this refuses to run rather than
 * defaulting to open.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[outreach:cron] CRON_SECRET not set — refusing to run.");
    return NextResponse.json(
      { error: "NOT_CONFIGURED", message: "Cron secret set nahi hai." },
      { status: 503 },
    );
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const summary = await runAutomatedOutreach();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error("[outreach:cron] run failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "RUN_FAILED", message: "Job fail ho gaya." }, { status: 500 });
  }
}
