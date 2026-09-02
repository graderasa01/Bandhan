import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getOpsSettings } from "@/lib/services/pilot/opsSettings";
import { playbookFor, type Playbook } from "./playbooks";
import type { Role, SafetyCaseSource, SafetyCaseStatus } from "@prisma/client";

/**
 * The queue that exists so a safety signal reaches a person.
 *
 * ## What happened before this
 *
 * Two signals were being collected carefully and going nowhere. A rishta closed
 * as `SAFETY_CONCERN` wrote an enum on a journey row. A meeting marked
 * `FELT_UNSAFE` wrote three columns on a meeting row and opened the report
 * sheet — and if the member did not have the energy to fill that in, which is a
 * completely ordinary thing after a bad evening, nobody at BandhanTak ever knew
 * it happened. The schema even said these "route to safety". There was no
 * safety to route to.
 *
 * ## What a case may contain
 *
 * The fact, not the words. `RishtaMeeting.checkpointNote` and
 * `RishtaJourney.closedReason` stay unread — see `SafetyCase` in the schema and
 * `playbooks.ts` for why that promise is load-bearing rather than squeamish. A
 * case says who, about whom, from which surface, and when. If the member wants
 * to say more, they file a report, and `attachReportToOpenCase` ties their
 * words — written to be read by support — to the case.
 *
 * A service dispute is the exception and is treated as one: the buyer wrote
 * their complaint *to the platform*, so support reads it directly.
 *
 * ## Why opening a case never fails the caller
 *
 * These functions are called from the middle of a member's own action —
 * closing a rishta, answering a checkpoint, filing a dispute. If the case row
 * cannot be written, the member's action must still succeed: losing a queue
 * entry is bad, and losing somebody's closure because a queue was down is
 * worse. So every open path swallows its error into a log line.
 */

/* ------------------------------------------------------------------ */
/* Opening                                                             */
/* ------------------------------------------------------------------ */

export async function openSafetyCase(params: {
  source: SafetyCaseSource;
  sourceId: string;
  raisedByUserId: string;
  aboutUserId?: string | null;
  partnerId?: string | null;
}): Promise<void> {
  try {
    await prisma.safetyCase.upsert({
      // One case per signal: a member re-answering the same checkpoint, or a
      // backfill running twice, must not produce two cases about one event.
      where: { source_sourceId: { source: params.source, sourceId: params.sourceId } },
      create: {
        source: params.source,
        sourceId: params.sourceId,
        raisedByUserId: params.raisedByUserId,
        aboutUserId: params.aboutUserId ?? null,
        partnerId: params.partnerId ?? null,
      },
      // Deliberately empty: a case somebody is already working on must not be
      // reset to OPEN because the same signal was written again.
      update: {},
    });
  } catch (err) {
    console.error("[safety] could not open case:", err instanceof Error ? err.message : String(err));
  }
}

/**
 * Ties a member's report to the case their signal already opened.
 *
 * Matched on the two people rather than on an explicit id, because the report
 * sheet the checkpoint opens does not know about cases and should not have to:
 * the member's job is to describe what happened, not to file it against the
 * right row. Newest open case wins, and only one report attaches — a second
 * report about the same person is its own row in the moderation queue, which is
 * where a second report belongs.
 */
export async function attachReportToOpenCase(
  reporterUserId: string,
  reportedUserId: string,
  reportId: string,
): Promise<void> {
  try {
    const openCase = await prisma.safetyCase.findFirst({
      where: {
        raisedByUserId: reporterUserId,
        aboutUserId: reportedUserId,
        reportId: null,
        status: { in: ["OPEN", "IN_REVIEW"] },
      },
      orderBy: { openedAt: "desc" },
      select: { id: true },
    });
    if (!openCase) return;
    await prisma.safetyCase.update({ where: { id: openCase.id }, data: { reportId } });
  } catch (err) {
    console.error("[safety] could not attach report:", err instanceof Error ? err.message : String(err));
  }
}

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

export interface SafetyCaseRow {
  id: string;
  source: SafetyCaseSource;
  sourceId: string;
  status: SafetyCaseStatus;
  openedAt: string;
  /** Hours since it was opened, so the screen can sort by urgency without doing date maths. */
  ageHours: number;
  escalated: boolean;
  claimedBy: string | null;
  claimedAt: string | null;
  stepsDone: string[];
  resolutionNote: string | null;
  /** The person to reach out to. */
  raisedBy: { id: string; name: string };
  about: { id: string; name: string } | null;
  partner: { id: string; name: string } | null;
  /** Their own words, only when they chose to file them. */
  report: { id: string; reason: string; details: string | null } | null;
  /** A dispute's complaint — written to the platform, so readable. */
  disputeReason: string | null;
  playbook: Playbook;
}

export async function listSafetyCases(params: { includeClosed?: boolean; limit?: number } = {}): Promise<SafetyCaseRow[]> {
  const rows = await prisma.safetyCase.findMany({
    where: params.includeClosed ? {} : { status: { in: ["OPEN", "IN_REVIEW"] } },
    orderBy: [{ escalatedAt: { sort: "desc", nulls: "last" } }, { openedAt: "asc" }],
    take: params.limit ?? 50,
    include: {
      raisedBy: { select: { id: true, fullName: true } },
      about: { select: { id: true, fullName: true } },
      partner: { select: { id: true, fullName: true, organizationName: true } },
    },
  });
  if (rows.length === 0) return [];

  // Two side loads rather than relations: `reportId` is a plain column (a
  // report can be deleted with its user without taking the case's history with
  // it) and a dispute's reason lives on the booking the case points at.
  const reportIds = rows.map((r) => r.reportId).filter((id): id is string => Boolean(id));
  const bookingIds = rows.filter((r) => r.source === "SERVICE_DISPUTE").map((r) => r.sourceId);

  const [reports, bookings] = await Promise.all([
    reportIds.length
      ? prisma.contentReport.findMany({
          where: { id: { in: reportIds } },
          select: { id: true, reason: true, details: true },
        })
      : Promise.resolve([]),
    bookingIds.length
      ? prisma.serviceBooking.findMany({
          where: { id: { in: bookingIds } },
          select: { id: true, disputeReason: true },
        })
      : Promise.resolve([]),
  ]);

  const reportById = new Map(reports.map((r) => [r.id, r]));
  const bookingById = new Map(bookings.map((b) => [b.id, b]));
  const now = Date.now();

  return rows.map((row) => ({
    id: row.id,
    source: row.source,
    sourceId: row.sourceId,
    status: row.status,
    openedAt: row.openedAt.toISOString(),
    ageHours: Math.max(0, Math.round((now - row.openedAt.getTime()) / 3_600_000)),
    escalated: row.escalatedAt !== null,
    claimedBy: row.claimedBy,
    claimedAt: row.claimedAt?.toISOString() ?? null,
    stepsDone: row.stepsDone,
    resolutionNote: row.resolutionNote,
    raisedBy: { id: row.raisedBy.id, name: row.raisedBy.fullName },
    about: row.about ? { id: row.about.id, name: row.about.fullName } : null,
    partner: row.partner
      ? { id: row.partner.id, name: row.partner.organizationName?.trim() || row.partner.fullName }
      : null,
    report: reportById.get(row.reportId ?? "") ?? null,
    disputeReason: bookingById.get(row.sourceId)?.disputeReason ?? null,
    playbook: playbookFor(row.source),
  }));
}

/** The number the admin dashboard badges: cases nobody has picked up. */
export async function countOpenSafetyCases(): Promise<number> {
  return prisma.safetyCase.count({ where: { status: "OPEN" } });
}

/* ------------------------------------------------------------------ */
/* Working a case                                                      */
/* ------------------------------------------------------------------ */

export type SafetyCaseResult = { ok: true } | { ok: false; error: string; message: string; status: number };

interface Actor {
  actorId: string;
  actorRole: Role;
}

/**
 * Claim it, tick steps on it, close it.
 *
 * One function rather than three because they are one screen's worth of edits
 * and share every guard. Claiming is implicit in touching a case at all: a
 * second admin opening it sees a name and a time, which is what stops two
 * people phoning the same frightened member half an hour apart.
 */
export async function updateSafetyCase(
  caseId: string,
  input: { stepsDone?: string[]; status?: SafetyCaseStatus; resolutionNote?: string | null },
  actor: Actor,
): Promise<SafetyCaseResult> {
  const current = await prisma.safetyCase.findUnique({ where: { id: caseId } });
  if (!current) return { ok: false, error: "NOT_FOUND", message: "Ye case nahi mila.", status: 404 };

  const closing = input.status === "ACTION_TAKEN" || input.status === "CLOSED_NO_ACTION";
  const note = input.resolutionNote?.trim() ?? current.resolutionNote?.trim() ?? "";
  if (closing && !note) {
    // The one required field in the whole flow. A case closed with no sentence
    // is a case nobody can learn from the next time this name appears.
    return { ok: false, error: "NOTE_REQUIRED", message: "Band karne se pehle likhiye ki kya kiya.", status: 422 };
  }

  if (input.stepsDone) {
    const valid = new Set(playbookFor(current.source).steps.map((s) => s.id));
    if (input.stepsDone.some((id) => !valid.has(id))) {
      return { ok: false, error: "UNKNOWN_STEP", message: "Ye step is playbook me nahi hai.", status: 422 };
    }
  }

  const now = new Date();
  await prisma.safetyCase.update({
    where: { id: caseId },
    data: {
      ...(input.stepsDone ? { stepsDone: input.stepsDone } : {}),
      ...(input.resolutionNote !== undefined ? { resolutionNote: input.resolutionNote?.trim() || null } : {}),
      // Touching a case claims it, and the first claim is the one that stands —
      // a later editor does not overwrite who took responsibility for it.
      ...(current.claimedBy ? {} : { claimedBy: actor.actorId, claimedAt: now }),
      status: input.status ?? (current.status === "OPEN" ? "IN_REVIEW" : current.status),
      ...(closing ? { closedBy: actor.actorId, closedAt: now } : {}),
    },
  });

  await prisma.adminAuditLog.create({
    data: {
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      actionType: closing ? "SAFETY_CASE_CLOSED" : "SAFETY_CASE_UPDATED",
      targetType: "safety_case",
      targetId: caseId,
      previousValue: current.status,
      newValue: input.status ?? "IN_REVIEW",
      reason: input.resolutionNote?.trim() || null,
    },
  });

  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* The clock                                                           */
/* ------------------------------------------------------------------ */

/**
 * Marks cases nobody picked up inside the first-response window.
 *
 * The mark is the whole mechanism, and that is honest about what this product
 * can do: there is nobody to page at 3am. What it can do is make sure the case
 * is at the top of the list, visibly late, the moment somebody opens the
 * console — rather than sitting in the same order it arrived in, indistinguishable
 * from a dispute about a ₹99 call.
 */
export async function escalateStaleSafetyCases(now = new Date()): Promise<number> {
  const settings = await getOpsSettings();
  const cutoff = new Date(now.getTime() - settings.safetyFirstResponseHours * 3_600_000);

  const result = await prisma.safetyCase.updateMany({
    where: { status: "OPEN", claimedAt: null, escalatedAt: null, openedAt: { lte: cutoff } },
    data: { escalatedAt: now },
  });
  return result.count;
}
