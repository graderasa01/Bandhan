import { NextResponse } from "next/server";
import { runOpsSweep } from "@/lib/services/pilot/opsSweep";

export const runtime = "nodejs";
/** Never cached and never statically evaluated — this one has side effects. */
export const dynamic = "force-dynamic";

/**
 * The Phase 7 sweep. Point a cron at it, same shape as the other two:
 *
 *   curl -X POST https://bandhantak.com/api/cron/ops \
 *     -H "Authorization: Bearer $CRON_SECRET"
 *
 * **Hourly**, and unlike the other two jobs that is not a preference. This one
 * carries deadlines: an acceptance clock that ran out at 2pm should refund the
 * buyer at 3, not at midnight, and a "6 hours left" warning delivered on a
 * daily schedule is a warning that lands anywhere between 6 and 30 hours out.
 * Running it more often than hourly only burns queries — every step is guarded
 * by a stored timestamp, so a double run is a no-op rather than a double
 * message.
 *
 * `CRON_SECRET` is mandatory. This endpoint moves money — it refunds buyers and
 * releases partner earnings — and is not something to leave open because the
 * URL looks obscure. If the secret is unset it refuses to run rather than
 * defaulting to open.
 *
 * `?dryRun=1` runs the booking queries and reports what would have gone out
 * without writing anything, and deliberately skips the two member-facing steps
 * entirely — see `runOpsSweep`.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[ops:cron] CRON_SECRET not set — refusing to run.");
    return NextResponse.json({ error: "NOT_CONFIGURED", message: "Cron secret set nahi hai." }, { status: 503 });
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";

  try {
    const summary = await runOpsSweep({ dryRun });
    return NextResponse.json({ ok: true, dryRun, summary });
  } catch (err) {
    console.error("[ops:cron] run failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "RUN_FAILED", message: "Job fail ho gaya." }, { status: 500 });
  }
}
