import "server-only";
import { prisma } from "@/lib/db/prisma";
import { createNotice } from "@/lib/services/notice/noticeService";
import { refundRequest } from "./verificationRequestService";
import {
  MAX_EVIDENCE_NOTE_CHARS,
  MAX_RESULT_NOTE_CHARS,
  catalogFor,
} from "./verificationCatalog";
import type { VerificationKind, VerificationOutcome } from "@prisma/client";

/**
 * The staff queue — and the only place in the product that writes a
 * verification result.
 *
 * ## Why that matters more than anything else in this phase
 *
 * "Paying does not change the verification result" is an acceptance rule, and a
 * rule of that kind is only as good as the number of places that could break
 * it. There is exactly one function below that sets `outcome`, it requires an
 * admin actor and an evidence note, and it never reads a payment row. The
 * payment path, correspondingly, can create an empty check and move a status —
 * and has no branch that could fill one in.
 *
 * ## The only reader of evidence
 *
 * `evidenceNote` is selected in this file and nowhere else. Member-facing
 * services list their columns explicitly rather than spreading the row, so
 * adding a field to `VerificationCheck` cannot leak it into somebody's profile
 * screen by default.
 *
 * ## What staff never hold
 *
 * A document. `VerificationCheck` has no column for one, on purpose — see the
 * model note. The queue records what a checker concluded, not what they were
 * shown, which is what makes "raw identity documents never reach another
 * member" true by construction rather than by access control.
 */

export interface QueueRow {
  checkId: string;
  kind: VerificationKind;
  kindLabel: string;
  subjectUserId: string;
  subjectName: string;
  /** Who asked, when somebody did. A check can also be opened by staff. */
  requesterName: string | null;
  requestMessage: string | null;
  assignedToUserId: string | null;
  assignedToName: string | null;
  /** Admin-only. */
  evidenceNote: string | null;
  outcome: VerificationOutcome | null;
  resultNote: string | null;
  checkedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export async function getVerificationQueue(limit = 60): Promise<{ open: QueueRow[]; decided: QueueRow[] }> {
  const rows = await prisma.verificationCheck.findMany({
    orderBy: [{ outcome: "asc" }, { createdAt: "asc" }],
    take: limit,
    include: {
      subject: { select: { fullName: true } },
      request: {
        select: { message: true, requester: { select: { fullName: true } } },
      },
    },
  });

  const assigneeIds = [...new Set(rows.map((r) => r.assignedToUserId).filter((x): x is string => Boolean(x)))];
  const assignees = assigneeIds.length
    ? await prisma.user.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, fullName: true } })
    : [];
  const nameOf = new Map(assignees.map((a) => [a.id, a.fullName]));

  const view = (r: (typeof rows)[number]): QueueRow => ({
    checkId: r.id,
    kind: r.kind,
    kindLabel: catalogFor(r.kind).label,
    subjectUserId: r.subjectUserId,
    subjectName: r.subject.fullName,
    requesterName: r.request?.requester.fullName ?? null,
    requestMessage: r.request?.message ?? null,
    assignedToUserId: r.assignedToUserId,
    assignedToName: r.assignedToUserId ? (nameOf.get(r.assignedToUserId) ?? null) : null,
    evidenceNote: r.evidenceNote,
    outcome: r.outcome,
    resultNote: r.resultNote,
    checkedAt: r.checkedAt?.toISOString() ?? null,
    expiresAt: r.expiresAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  });

  return {
    open: rows.filter((r) => !r.outcome).map(view),
    decided: rows.filter((r) => r.outcome).map(view),
  };
}

export type QueueResult = { ok: true } | { ok: false; error: string; message: string; status: number };

/** Taking one, or putting it back. Unassigned is a visible state, not a backlog. */
export async function assignCheck(checkId: string, adminUserId: string | null): Promise<QueueResult> {
  const check = await prisma.verificationCheck.findUnique({ where: { id: checkId }, select: { outcome: true } });
  if (!check) return { ok: false, error: "NOT_FOUND", message: "Ye check nahi mila.", status: 404 };
  if (check.outcome) {
    return { ok: false, error: "ALREADY_DECIDED", message: "Ye check poora ho chuka hai.", status: 409 };
  }
  await prisma.verificationCheck.update({ where: { id: checkId }, data: { assignedToUserId: adminUserId } });
  return { ok: true };
}

export interface RecordResultInput {
  checkId: string;
  adminUserId: string;
  outcome: VerificationOutcome;
  /** What staff saw and concluded. Required — a result with no reasoning is a guess. */
  evidenceNote: string;
  /** The one line the two members may read. Safe on a shared screen. */
  resultNote?: string | null;
}

/**
 * The result.
 *
 * Writes the outcome, freezes the catalog's scope sentence onto the row and
 * sets the expiry from the catalog's validity period — the three things that
 * let a badge say what was checked and when, for as long as it is entitled to.
 *
 * A check that could not be completed refunds the money. That is the one place
 * a result touches money, and the direction is the safe one: an unfinished
 * check gives money back, and no outcome ever earns any.
 */
export async function recordResult(input: RecordResultInput): Promise<QueueResult> {
  const evidence = input.evidenceNote.trim();
  if (evidence.length < 10) {
    return {
      ok: false,
      error: "NO_EVIDENCE",
      message: "Kya dekha aur kya nikla — ye likhna zaroori hai.",
      status: 422,
    };
  }

  const check = await prisma.verificationCheck.findUnique({
    where: { id: input.checkId },
    include: { request: { select: { id: true, requesterUserId: true } } },
  });
  if (!check) return { ok: false, error: "NOT_FOUND", message: "Ye check nahi mila.", status: 404 };
  if (check.outcome) {
    return { ok: false, error: "ALREADY_DECIDED", message: "Is par nateeja pehle hi darj hai.", status: 409 };
  }

  const catalog = catalogFor(check.kind);
  const now = new Date();
  const expiresAt = catalog.validityDays ? new Date(now.getTime() + catalog.validityDays * 86_400_000) : null;

  await prisma.$transaction(async (tx) => {
    await tx.verificationCheck.update({
      where: { id: input.checkId },
      data: {
        outcome: input.outcome,
        // Frozen here, not read from the catalog later — a badge must keep
        // meaning what it meant on the day it was granted.
        scopeText: catalog.scope,
        evidenceNote: evidence.slice(0, MAX_EVIDENCE_NOTE_CHARS),
        resultNote: input.resultNote?.trim().slice(0, MAX_RESULT_NOTE_CHARS) || null,
        checkedAt: now,
        expiresAt,
        assignedToUserId: check.assignedToUserId ?? input.adminUserId,
      },
    });

    if (check.request) {
      await tx.verificationRequest.update({
        where: { id: check.request.id },
        data: { status: "COMPLETED" },
      });
    }

    await tx.adminAuditLog.create({
      data: {
        actorId: input.adminUserId,
        actorRole: "ADMIN",
        actionType: "VERIFICATION_RESULT",
        targetType: "VerificationCheck",
        targetId: input.checkId,
        newValue: input.outcome,
        // The audit log is staff-facing, but it is still not the place to
        // re-store what the evidence said — the check already holds that once.
        reason: catalog.label,
      },
    });
  });

  if (input.outcome === "COULD_NOT_COMPLETE" && check.request) {
    await refundRequest(check.request.id, now);
  }

  // Both sides are told the check finished; neither is told the outcome here.
  // A result belongs on the screen where its scope sentence sits beside it —
  // "identity mismatch" on a lock screen is a sentence about a person that
  // whoever is holding the phone was never meant to read.
  const body = `${catalog.label} — nateeja aapki verification screen par hai.`;
  await createNotice({
    userId: check.subjectUserId,
    kind: "VERIFICATION_UPDATE",
    title: "Aapka verification poora hua",
    body,
    href: "/user/verification",
    relatedId: input.checkId,
  });
  if (check.request) {
    await createNotice({
      userId: check.request.requesterUserId,
      kind: "VERIFICATION_UPDATE",
      title: "Jo verification aapne maanga tha, wo poora hua",
      body,
      href: "/user/verification",
      relatedId: input.checkId,
      actorMasked: true,
    });
  }

  return { ok: true };
}

/**
 * Staff opening a check nobody asked for — a spot audit, or a member who asked
 * support directly. Deliberately available: verification is not only a thing
 * one member buys about another.
 */
export async function openCheck(subjectUserId: string, kind: VerificationKind): Promise<{ checkId: string }> {
  const check = await prisma.verificationCheck.create({
    data: { subjectUserId, kind },
    select: { id: true },
  });
  return { checkId: check.id };
}
