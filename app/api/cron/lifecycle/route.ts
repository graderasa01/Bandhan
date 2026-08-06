import { NextResponse } from "next/server";
import { runLifecycleNudges } from "@/lib/services/lifecycle/lifecycleJob";

export const runtime = "nodejs";
/** Never cached and never statically evaluated — this one has side effects. */
export const dynamic = "force-dynamic";

/**
 * The lifecycle nudge run. Point a cron at it, same shape as
 * `/api/cron/partner-outreach`:
 *
 *   curl -X POST https://bandhantak.com/api/cron/lifecycle \
 *     -H "Authorization: Bearer $CRON_SECRET"
 *
 * Twice a day is the right cadence — say 10am and 6pm IST. Not hourly: every
 * real brake lives in `runLifecycleNudges` and they are measured in days, so
 * firing more often only burns queries. Running it twice by accident is
 * harmless for the same reason — the cooldown and the weekly cap decide what
 * goes out, not the schedule. Outside 9am-9pm IST it deliberately sends
 * nothing at all, so a misconfigured schedule cannot produce a 3am push.
 *
 * `CRON_SECRET` is mandatory. An endpoint that pushes a notification to the
 * whole member base is not something to leave open because the URL looks
 * obscure — and if the secret is unset, this refuses to run rather than
 * defaulting to open.
 *
 * `?dryRun=1` runs every query and every brake and returns exactly what would
 * have gone out, writing nothing. Safe to hit first.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[lifecycle:cron] CRON_SECRET not set — refusing to run.");
    return NextResponse.json(
      { error: "NOT_CONFIGURED", message: "Cron secret set nahi hai." },
      { status: 503 },
    );
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";

  try {
    const summary = await runLifecycleNudges({ dryRun });
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    console.error("[lifecycle:cron] run failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "RUN_FAILED", message: "Job fail ho gaya." }, { status: 500 });
  }
}
