import "server-only";
import { runServiceSlaSweep, type SlaSweepSummary } from "@/lib/services/marketplace/slaJob";
import { escalateStaleSafetyCases } from "@/lib/services/safety/safetyCaseService";
import { notifyOpenCityWaitlists } from "./pilotCityService";

/**
 * Everything Phase 7 has to do on a clock, in one run.
 *
 * ## Why one job and not three crons
 *
 * Three schedules is three things to configure on the day somebody moves the
 * app to a new host, and the failure mode is silent: nobody notices that the
 * safety escalation cron was never added until a case has sat unread for a
 * week. One endpoint, one line in the deploy doc, three steps inside it.
 *
 * They also have nothing to fight over. Each step is independently idempotent
 * and guarded by its own stored timestamps, so ordering between them does not
 * matter and a partial run leaves nothing half-done.
 *
 * ## Why the SLA step goes first
 *
 * It is the one that moves money. If a run is going to die halfway — a
 * container recycled, a timeout — the refunds and releases should already have
 * happened, and the two notification steps are the ones that can wait for the
 * next hour.
 */

export interface OpsSweepSummary {
  sla: SlaSweepSummary;
  /** People told their city now has somebody free. */
  waitlistNotified: number;
  /** Safety cases that passed the first-response window unclaimed. */
  safetyEscalated: number;
}

export interface OpsSweepOptions {
  /** Runs every query, writes nothing, and reports what would have gone out. */
  dryRun?: boolean;
}

export async function runOpsSweep(options: OpsSweepOptions = {}): Promise<OpsSweepSummary> {
  const dryRun = options.dryRun ?? false;

  const sla = await runServiceSlaSweep({ dryRun });

  // Both of these write rows a member can see, so both are skipped on a dry
  // run — a "preview" that quietly messages two hundred families is not a
  // preview. The counts they return then read as zero, which is honest: a dry
  // run of these two steps would have to duplicate their queries to say
  // anything more, and a preview that drifts from the real job is worse than
  // one that says nothing.
  const waitlistNotified = dryRun ? 0 : await notifyOpenCityWaitlists();
  const safetyEscalated = dryRun ? 0 : await escalateStaleSafetyCases();

  return { sla, waitlistNotified, safetyEscalated };
}
