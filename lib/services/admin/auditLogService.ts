import "server-only";
import { prisma } from "@/lib/db/prisma";

/**
 * Reading the audit trail.
 *
 * Eighteen services have been writing `AdminAuditLog` rows since M10 —
 * pricing, theme, flags, entitlements, partner status, commissions, polls,
 * photo review, moderation, AI config — and nothing has ever read one back. A
 * write-only audit log is a compliance decoration: it costs a row on every
 * admin action and answers no question until someone can see it.
 *
 * `actionType` is a free-text string chosen by each writer (`PLAN_PRICE_UPDATED`,
 * `THEME_CHANGED`, `USER_SUSPEND`…). The filter list is therefore built from
 * what is actually in the table rather than from a hardcoded enum that would
 * drift the moment a new writer appears.
 */

export interface AuditLogRow {
  id: string;
  actorName: string;
  actorRole: string;
  actionType: string;
  targetType: string;
  targetId: string;
  previousValue: string | null;
  newValue: string | null;
  reason: string | null;
  createdAt: string;
}

const PAGE_SIZE = 40;

export async function getAuditLogs(params: {
  actionType?: string;
  page?: number;
}): Promise<{
  rows: AuditLogRow[];
  total: number;
  page: number;
  pageSize: number;
  actionTypes: string[];
}> {
  const page = Math.max(1, params.page ?? 1);
  const where = params.actionType ? { actionType: params.actionType } : {};

  const [logs, total, distinct] = await Promise.all([
    prisma.adminAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.adminAuditLog.count({ where }),
    prisma.adminAuditLog.groupBy({ by: ["actionType"], _count: { _all: true } }),
  ]);

  // `actorId` is a plain column, not a relation — the log has to survive the
  // actor's account being deleted, which a foreign key would prevent. So names
  // are resolved separately, and an id with no surviving user is shown as-is
  // rather than dropped.
  const actorIds = [...new Set(logs.map((l) => l.actorId))];
  const actors = await prisma.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, fullName: true },
  });
  const nameById = new Map(actors.map((a) => [a.id, a.fullName]));

  return {
    rows: logs.map((l) => ({
      id: l.id,
      actorName: nameById.get(l.actorId) ?? `(deleted admin ${l.actorId.slice(0, 8)})`,
      actorRole: l.actorRole as string,
      actionType: l.actionType,
      targetType: l.targetType,
      targetId: l.targetId,
      previousValue: l.previousValue,
      newValue: l.newValue,
      reason: l.reason,
      createdAt: l.createdAt.toISOString().slice(0, 16).replace("T", " "),
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
    actionTypes: distinct
      .sort((a, b) => b._count._all - a._count._all)
      .map((d) => d.actionType),
  };
}
