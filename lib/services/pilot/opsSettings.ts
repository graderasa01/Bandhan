import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Role } from "@prisma/client";

/**
 * The dials for how hard the platform chases work that has gone quiet.
 *
 * ## Why these are settings and not constants
 *
 * Same argument the prices got, and the same answer: every number here is a
 * guess until a pilot city has run for a month. "Remind the partner 6 hours
 * before the clock runs out" is right for a bureau with an office and wrong for
 * a pandit ji who reads WhatsApp at night, and finding that out should cost an
 * afternoon's observation, not a deploy.
 *
 * What is *not* editable from here, deliberately: the acceptance SLA itself,
 * the refund window and the platform's cut. Those are money and they live in
 * `pricingControl.ts`. This file only decides who gets told, and when.
 *
 * ## Why the defaults live in code as well as in the column
 *
 * The `@default`s in `schema.prisma` fill a row that exists; these fill the
 * absence of one. A fresh database — a developer's checkout, a restored backup
 * mid-migration — must produce a working chase job rather than a crash or, far
 * worse, a job that silently treats every threshold as zero and mails everybody.
 */

const SETTINGS_ID = "default";

export interface OpsSettingsValues {
  defaultCityPartnerCapacity: number;
  demandSignalThreshold: number;
  slaFirstReminderHours: number;
  slaFinalReminderHours: number;
  ackReminderHours: number;
  milestoneOverdueGraceDays: number;
  slaBreachEscalationCount: number;
  slaBreachWindowDays: number;
  slaAutoPauseOnEscalation: boolean;
  safetyFirstResponseHours: number;
}

/**
 * The starting values, chosen 2026-09-02. Each one's reasoning is on its column
 * in `schema.prisma`; this is only the copy of the number that survives a
 * missing row.
 */
export const DEFAULT_OPS_SETTINGS: OpsSettingsValues = {
  defaultCityPartnerCapacity: 12,
  demandSignalThreshold: 5,
  slaFirstReminderHours: 24,
  slaFinalReminderHours: 6,
  ackReminderHours: 24,
  milestoneOverdueGraceDays: 2,
  slaBreachEscalationCount: 2,
  slaBreachWindowDays: 30,
  slaAutoPauseOnEscalation: true,
  safetyFirstResponseHours: 4,
};

export async function getOpsSettings(): Promise<OpsSettingsValues> {
  const row = await prisma.opsSettings.findUnique({ where: { id: SETTINGS_ID } });
  if (!row) return { ...DEFAULT_OPS_SETTINGS };
  return {
    defaultCityPartnerCapacity: row.defaultCityPartnerCapacity,
    demandSignalThreshold: row.demandSignalThreshold,
    slaFirstReminderHours: row.slaFirstReminderHours,
    slaFinalReminderHours: row.slaFinalReminderHours,
    ackReminderHours: row.ackReminderHours,
    milestoneOverdueGraceDays: row.milestoneOverdueGraceDays,
    slaBreachEscalationCount: row.slaBreachEscalationCount,
    slaBreachWindowDays: row.slaBreachWindowDays,
    slaAutoPauseOnEscalation: row.slaAutoPauseOnEscalation,
    safetyFirstResponseHours: row.safetyFirstResponseHours,
  };
}

export type OpsSettingsResult = { ok: true } | { ok: false; error: string; message: string; status: number };

interface Actor {
  actorId: string;
  actorRole: Role;
}

/** Each field's own range, and the sentence an admin reads when they miss it. */
const RANGES: Record<keyof Omit<OpsSettingsValues, "slaAutoPauseOnEscalation">, { min: number; max: number; message: string }> = {
  defaultCityPartnerCapacity: { min: 0, max: 500, message: "Nayi city ki capacity 0 se 500 ke beech rakhiye." },
  demandSignalThreshold: { min: 1, max: 1000, message: "Demand ka threshold 1 se 1000 ke beech rakhiye." },
  slaFirstReminderHours: { min: 1, max: 168, message: "Pehla reminder 1 ghante se 7 din ke beech rakhiye." },
  slaFinalReminderHours: { min: 1, max: 168, message: "Aakhri reminder 1 ghante se 7 din ke beech rakhiye." },
  ackReminderHours: { min: 1, max: 168, message: "Buyer ka reminder 1 ghante se 7 din ke beech rakhiye." },
  milestoneOverdueGraceDays: { min: 0, max: 30, message: "Milestone ki chhoot 0 se 30 din ke beech rakhiye." },
  slaBreachEscalationCount: { min: 1, max: 20, message: "Escalation 1 se 20 miss ke beech rakhiye." },
  slaBreachWindowDays: { min: 1, max: 365, message: "Ginti ka window 1 se 365 din ke beech rakhiye." },
  safetyFirstResponseHours: { min: 1, max: 72, message: "Safety ka pehla jawab 1 se 72 ghante ke beech rakhiye." },
};

/**
 * Writes whichever dials were sent, validates each on its own terms, and audits
 * the change as one row.
 *
 * Upserts rather than updates: unlike `PartnerCommissionConfig`, which the seed
 * guarantees, this row may genuinely not exist yet — and an admin's first visit
 * to the screen should be able to change a number rather than report that the
 * settings are missing.
 */
export async function setOpsSettings(
  input: Partial<OpsSettingsValues>,
  actor: Actor,
): Promise<OpsSettingsResult> {
  const data: Record<string, number | boolean> = {};

  for (const [key, range] of Object.entries(RANGES) as [keyof typeof RANGES, (typeof RANGES)[keyof typeof RANGES]][]) {
    const value = input[key];
    if (value === undefined) continue;
    if (!Number.isInteger(value) || value < range.min || value > range.max) {
      return { ok: false, error: "OUT_OF_RANGE", message: range.message, status: 422 };
    }
    data[key] = value;
  }

  if (input.slaAutoPauseOnEscalation !== undefined) {
    data.slaAutoPauseOnEscalation = input.slaAutoPauseOnEscalation;
  }

  if (Object.keys(data).length === 0) {
    return { ok: false, error: "NOTHING_TO_DO", message: "Kuch badla nahi.", status: 422 };
  }

  // The final reminder has to land *after* the first one, or the pair reads
  // backwards to the partner receiving them: a "last chance" at 24 hours
  // followed by a gentle nudge at 6. Checked against the stored value, not just
  // the submitted one, so changing either field alone still cannot invert them.
  const current = await getOpsSettings();
  const first = (data.slaFirstReminderHours as number | undefined) ?? current.slaFirstReminderHours;
  const final = (data.slaFinalReminderHours as number | undefined) ?? current.slaFinalReminderHours;
  if (final >= first) {
    return {
      ok: false,
      error: "OUT_OF_ORDER",
      message: "Aakhri reminder pehle reminder se kam ghanton par hona chahiye.",
      status: 422,
    };
  }

  await prisma.opsSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...DEFAULT_OPS_SETTINGS, ...data, updatedBy: actor.actorId },
    update: { ...data, updatedBy: actor.actorId },
  });

  await prisma.adminAuditLog.create({
    data: {
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      actionType: "OPS_SETTINGS_UPDATED",
      targetType: "ops_settings",
      targetId: SETTINGS_ID,
      previousValue: JSON.stringify(current),
      newValue: JSON.stringify(data),
    },
  });

  return { ok: true };
}
