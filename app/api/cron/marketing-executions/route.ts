import { NextResponse } from "next/server";
import { recoverDeployments } from "@/lib/services/marketing/execution/deploymentWorker";

export const runtime = "nodejs";
/** Never cached and never statically evaluated — this one has side effects. */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * MKT-2 recovery sweep (doc 13 §8, §17). Point a cron at it, same shape as
 * the other cron routes:
 *
 *   curl -X POST https://bandhantak.com/api/cron/marketing-executions \
 *     -H "Authorization: Bearer $CRON_SECRET"
 *
 * Every 10-15 minutes is right. What it does, in order: releases leases a
 * dead worker left behind (before a write → re-queued; during/after → marked
 * uncertain), runs queued deployments, reconciles uncertain ones by marker,
 * and refreshes provider status for paused/live campaigns older than six
 * hours. It never creates anything the approval path did not queue, and it
 * never resends a write whose outcome is unknown — reconciliation decides.
 *
 * `CRON_SECRET` is mandatory. This endpoint can carry an approved campaign
 * to the provider; if the secret is unset it refuses to run rather than
 * defaulting to open.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[marketing:cron] CRON_SECRET not set — refusing to run.");
    return NextResponse.json({ error: "NOT_CONFIGURED", message: "Cron secret set nahi hai." }, { status: 503 });
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const summary = await recoverDeployments({ workerId: "cron" });
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    console.error("[marketing:cron] sweep failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "RUN_FAILED", message: "Job fail ho gaya." }, { status: 500 });
  }
}
