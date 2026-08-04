import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { NoticeView } from "@/lib/contracts/notice";
import type { NoticeKind } from "@prisma/client";

/**
 * The app's one inbox.
 *
 * Before this existed, three separate features each needed a way to tell a
 * user that something happened to them — a locked voice note arrived, someone
 * asked them a question, a parent shortlisted a profile — and none of them had
 * one. The dashboard's `FamilyActivityCard` was the closest thing, and it only
 * ever knew about family.
 *
 * ## The masking rule
 *
 * `actorMasked` marks a notice whose *point* is that the sender is hidden
 * until the user does something (unlock the note, answer the question). The
 * flag drives the lock affordance in the UI — it does **not** perform the
 * redaction. Title and body must already be written without identifying
 * detail, because a masked notice is still a plain row in the API response,
 * and "the client will hide it" is not privacy.
 *
 * So this is right:
 *   "Delhi se 27 saal ki Software Engineer ne aapko voice note bheja"
 * and this is not:
 *   "Priya Sharma ne aapko voice note bheja"  ← with actorMasked: true
 */

export type { NoticeView } from "@/lib/contracts/notice";

export async function createNotice(params: {
  userId: string;
  kind: NoticeKind;
  title: string;
  body: string;
  href?: string | null;
  actorMasked?: boolean;
  relatedId?: string | null;
}): Promise<void> {
  try {
    await prisma.notice.create({
      data: {
        userId: params.userId,
        kind: params.kind,
        title: params.title,
        body: params.body,
        href: params.href ?? null,
        actorMasked: params.actorMasked ?? false,
        relatedId: params.relatedId ?? null,
      },
    });
  } catch (err) {
    // A notice is a side effect of something that already happened. Failing to
    // record it must never roll back the interest, match, or voice note that
    // caused it.
    console.error("[notice] create failed:", err instanceof Error ? err.message : String(err));
  }
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notice.count({ where: { userId, readAt: null } });
}

export async function getNotices(userId: string, limit = 50): Promise<NoticeView[]> {
  const rows = await prisma.notice.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 100),
  });
  return rows.map((n) => ({
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    href: n.href,
    actorMasked: n.actorMasked,
    relatedId: n.relatedId,
    read: n.readAt !== null,
    createdAt: n.createdAt.toISOString(),
  }));
}

/** Scoped by userId as well as id — an id alone must never address someone else's row. */
export async function markRead(userId: string, noticeId: string): Promise<void> {
  await prisma.notice.updateMany({
    where: { id: noticeId, userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllRead(userId: string): Promise<number> {
  const { count } = await prisma.notice.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return count;
}
