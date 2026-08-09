import "server-only";
import { prisma } from "@/lib/db/prisma";
import { createNotice } from "@/lib/services/notice/noticeService";
import type { MatchmakerRequestStatus, Role } from "@prisma/client";
import { noopT, type Translate } from "@/lib/i18n/translate";

/**
 * D-11's `assistedMatchmaker` — "a human helps you", PREMIUM only.
 *
 * This is deliberately the smallest thing that makes the promise real: an
 * intake form and a queue. It is not a CRM, not a scheduling system, not an
 * AI concierge (D-32 — this capability's entire value proposition is that a
 * *person*, not a model, is looking at the request). The actual matchmaking
 * conversation happens off-platform, by a human, exactly as it does at any
 * traditional relationship manager. This table only answers "did staff see
 * this yet."
 */

const OPEN_LIMIT = 3;

export type CreateRequestResult =
  | { ok: true; id: string }
  | { ok: false; message: string };

export async function createMatchmakerRequest(
  userId: string,
  note: string | null,
  t: Translate = noopT,
): Promise<CreateRequestResult> {
  const openCount = await prisma.matchmakerRequest.count({ where: { userId, status: "OPEN" } });
  if (openCount >= OPEN_LIMIT) {
    return {
      ok: false,
      message: t(
        "matchmaker.request.tooMany",
        "Aapke already kuch requests khuli hain — team unhe dekh rahi hai, nayi request abhi mat bhejiye.",
      ),
    };
  }

  const row = await prisma.matchmakerRequest.create({
    data: { userId, note: note?.trim() || null },
  });
  return { ok: true, id: row.id };
}

export interface MyMatchmakerRequestView {
  id: string;
  note: string | null;
  status: MatchmakerRequestStatus;
  createdAt: string;
}

export async function getMyMatchmakerRequests(userId: string): Promise<MyMatchmakerRequestView[]> {
  const rows = await prisma.matchmakerRequest.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  return rows.map((r) => ({ id: r.id, note: r.note, status: r.status, createdAt: r.createdAt.toISOString() }));
}

export interface MatchmakerQueueRow {
  id: string;
  userId: string;
  userName: string;
  note: string | null;
  status: MatchmakerRequestStatus;
  createdAt: string;
}

export async function getOpenMatchmakerRequests(limit = 50): Promise<MatchmakerQueueRow[]> {
  const rows = await prisma.matchmakerRequest.findMany({
    where: { status: { in: ["OPEN", "CONTACTED"] } },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: { user: { select: { fullName: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: r.user.fullName,
    note: r.note,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  }));
}

export type UpdateStatusResult = { ok: true } | { ok: false; message: string };

export async function updateMatchmakerRequestStatus(
  params: {
    requestId: string;
    status: "CONTACTED" | "RESOLVED";
    actorId: string;
    actorRole: Role;
  },
  t: Translate = noopT,
): Promise<UpdateStatusResult> {
  const { requestId, status, actorId, actorRole } = params;
  const existing = await prisma.matchmakerRequest.findUnique({ where: { id: requestId } });
  if (!existing) return { ok: false, message: "Request nahi mili." };

  await prisma.$transaction(async (tx) => {
    await tx.matchmakerRequest.update({
      where: { id: requestId },
      data: { status, handledBy: actorId, handledAt: new Date() },
    });
    await tx.adminAuditLog.create({
      data: {
        actorId,
        actorRole,
        actionType: `MATCHMAKER_REQUEST_${status}`,
        targetType: "matchmaker_request",
        targetId: requestId,
        previousValue: existing.status,
        newValue: status,
      },
    });
  });

  if (status === "CONTACTED") {
    await createNotice({
      userId: existing.userId,
      kind: "MATCHMAKER_UPDATE",
      title: t("matchmaker.notice.title", "Aapki matchmaker request par kaam shuru ho gaya hai"),
      body: t("matchmaker.notice.body", "Hamari team jald aapse contact karegi."),
      href: "/user/subscription",
    });
  }

  return { ok: true };
}
