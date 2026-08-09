import "server-only";
import { prisma } from "@/lib/db/prisma";
import { noopT, type Translate } from "@/lib/i18n/translate";
import type { ReportTargetType, Role } from "@prisma/client";

/**
 * Reporting.
 *
 * Unlike a block, a report is a claim about someone's behaviour and goes to a
 * human. Two design choices worth stating:
 *
 * 1. **Reporting always blocks too.** Nobody who has just reported harassment
 *    should have to take a second action to stop receiving it, and nobody
 *    should have to wait for a review to get relief. The caller does the block
 *    — this service only records the claim — but the API route does both.
 *
 * 2. **The reported content is never deleted on report.** A report that
 *    destroys its own evidence cannot be reviewed. Voice notes stay readable
 *    by admins (see `resolveMediaAccess`) precisely so the queue has something
 *    to listen to.
 */

export { REPORT_REASONS, isReportReason, type ReportReason } from "@/lib/constants/reportReasons";

export async function createReport(
  params: {
    reporterUserId: string;
    reportedUserId: string;
    targetType: ReportTargetType;
    targetId: string;
    reason: string;
    details?: string | null;
  },
  t: Translate = noopT,
): Promise<{ ok: boolean; message?: string }> {
  const { reporterUserId, reportedUserId } = params;
  if (reporterUserId === reportedUserId) {
    return { ok: false, message: t("safety.report.error.self", "Khud ki report nahi kar sakte.") };
  }

  await prisma.contentReport.create({
    data: {
      reporterUserId,
      reportedUserId,
      targetType: params.targetType,
      targetId: params.targetId,
      reason: params.reason,
      details: params.details?.trim() || null,
    },
  });

  return { ok: true };
}

export interface ReportQueueRow {
  id: string;
  reporterName: string;
  reportedName: string;
  reportedUserId: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  details: string | null;
  createdAt: Date;
  /** How many open reports this person already has — the signal that matters most. */
  reportedUserOpenCount: number;
}

export async function getOpenReports(limit = 50): Promise<ReportQueueRow[]> {
  const rows = await prisma.contentReport.findMany({
    where: { status: "OPEN" },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: {
      reporter: { select: { fullName: true } },
      reported: { select: { fullName: true } },
    },
  });

  const counts = await prisma.contentReport.groupBy({
    by: ["reportedUserId"],
    where: { status: "OPEN", reportedUserId: { in: rows.map((r) => r.reportedUserId) } },
    _count: { _all: true },
  });
  const countByUser = new Map(counts.map((c) => [c.reportedUserId, c._count._all]));

  return rows.map((r) => ({
    id: r.id,
    reporterName: r.reporter.fullName,
    reportedName: r.reported.fullName,
    reportedUserId: r.reportedUserId,
    targetType: r.targetType,
    targetId: r.targetId,
    reason: r.reason,
    details: r.details,
    createdAt: r.createdAt,
    reportedUserOpenCount: countByUser.get(r.reportedUserId) ?? 0,
  }));
}

export async function resolveReport(
  params: {
    reportId: string;
    status: "REVIEWED" | "ACTIONED" | "DISMISSED";
    actorId: string;
    actorRole: Role;
    note?: string | null;
  },
  t: Translate = noopT,
): Promise<{ ok: boolean; message?: string }> {
  const report = await prisma.contentReport.findUnique({ where: { id: params.reportId } });
  if (!report) return { ok: false, message: t("safety.report.error.notFound", "Report nahi mili.") };

  await prisma.$transaction(async (tx) => {
    await tx.contentReport.update({
      where: { id: params.reportId },
      data: { status: params.status, reviewedBy: params.actorId, reviewedAt: new Date() },
    });
    await tx.adminAuditLog.create({
      data: {
        actorId: params.actorId,
        actorRole: params.actorRole,
        actionType: "CONTENT_REPORT_RESOLVED",
        targetType: "content_report",
        targetId: params.reportId,
        previousValue: report.status,
        newValue: params.status,
        reason: params.note ?? null,
      },
    });
  });

  return { ok: true };
}
