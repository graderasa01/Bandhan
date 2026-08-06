import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { runLifecycleNudges } from "@/lib/services/lifecycle/lifecycleJob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Preview. Runs every campaign query, every ranking and every brake, and
 * returns the exact sentences that would go out — writing nothing.
 *
 * Deliberately the *only* verb that is safe by default here: an admin should
 * be able to look at what an automated messaging job would say to real
 * families without that act itself messaging them.
 */
export async function GET() {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const summary = await runLifecycleNudges({ dryRun: true });
  return NextResponse.json({ ok: true, summary });
}

/**
 * Send now — the manual run, for when the cron isn't wired yet or an admin
 * wants today's batch to go out early.
 *
 * Writes an `AdminAuditLog` row before returning: this is the one admin action
 * in the app whose effect lands on hundreds of other people's phones, so "who
 * pressed it, when, and how many went out" has to be answerable later. Same
 * discipline as a price change or a partner approval.
 *
 * Every brake still applies — this button cannot bypass quiet hours, the
 * weekly cap or any cooldown. It is the same function the cron calls.
 */
export async function POST() {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const summary = await runLifecycleNudges({ dryRun: false });

  await prisma.adminAuditLog.create({
    data: {
      actorId: user.id,
      actorRole: user.role,
      actionType: "LIFECYCLE_RUN_MANUAL",
      targetType: "LIFECYCLE",
      targetId: summary.ranAt,
      newValue: JSON.stringify({
        sent: summary.sent,
        selected: summary.selected,
        withinSendWindow: summary.withinSendWindow,
      }),
    },
  });

  return NextResponse.json({ ok: true, summary });
}
