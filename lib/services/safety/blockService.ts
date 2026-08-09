import "server-only";
import { prisma } from "@/lib/db/prisma";
import { noopT, type Translate } from "@/lib/i18n/translate";

/**
 * Blocking.
 *
 * ## Asymmetric in intent, symmetric in effect
 *
 * Only the blocker chooses. The blocked person is never told — being informed
 * you were blocked is itself a message, and the point of blocking is to stop
 * receiving them.
 *
 * But *discovery* is filtered in both directions. If A blocks B, neither
 * appears in the other's reel. Hiding B from A only would leave B able to send
 * A an interest or a voice note from a card A can no longer even see, which is
 * the exact situation the block existed to end.
 *
 * ## Blocks are not reports
 *
 * A block is a private preference and takes effect instantly with no review. A
 * report asks us to look at someone's behaviour. Users routinely want the
 * first without the second, and forcing them to accuse someone in order to
 * stop hearing from them is how platforms end up with unreported harassment.
 * The UI offers both; only report goes to a queue.
 */

export async function blockUser(
  params: {
    blockerUserId: string;
    blockedUserId: string;
    reason?: string | null;
  },
  t: Translate = noopT,
): Promise<{ ok: boolean; message?: string }> {
  const { blockerUserId, blockedUserId, reason } = params;
  if (blockerUserId === blockedUserId) {
    return { ok: false, message: t("safety.block.error.self", "Khud ko block nahi kar sakte.") };
  }

  const target = await prisma.user.findFirst({
    where: { id: blockedUserId, deletedAt: null },
    select: { id: true },
  });
  if (!target) return { ok: false, message: t("safety.block.error.userNotFound", "User nahi mila.") };

  await prisma.userBlock.upsert({
    where: { blockerUserId_blockedUserId: { blockerUserId, blockedUserId } },
    create: { blockerUserId, blockedUserId, reason: reason ?? null },
    update: {},
  });

  return { ok: true };
}

export async function unblockUser(blockerUserId: string, blockedUserId: string): Promise<void> {
  await prisma.userBlock.deleteMany({ where: { blockerUserId, blockedUserId } });
}

/** True if either side has blocked the other — the check every send path makes. */
export async function isBlockedEitherWay(a: string, b: string): Promise<boolean> {
  const row = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerUserId: a, blockedUserId: b },
        { blockerUserId: b, blockedUserId: a },
      ],
    },
    select: { id: true },
  });
  return row !== null;
}

/**
 * Every user id this viewer must not see, in either direction.
 * Used by the matching pipeline's L0 filter.
 */
export async function getBlockedUserIds(userId: string): Promise<string[]> {
  const rows = await prisma.userBlock.findMany({
    where: { OR: [{ blockerUserId: userId }, { blockedUserId: userId }] },
    select: { blockerUserId: true, blockedUserId: true },
  });
  const ids = new Set<string>();
  for (const r of rows) {
    ids.add(r.blockerUserId === userId ? r.blockedUserId : r.blockerUserId);
  }
  return [...ids];
}

export interface BlockedPersonView {
  userId: string;
  displayName: string;
  blockedAt: Date;
}

/** The blocker's own list, so a block is reversible from the UI. */
export async function listBlocked(userId: string): Promise<BlockedPersonView[]> {
  const rows = await prisma.userBlock.findMany({
    where: { blockerUserId: userId },
    orderBy: { createdAt: "desc" },
    include: { blocked: { select: { fullName: true, profile: { select: { displayName: true } } } } },
  });
  return rows.map((r) => ({
    userId: r.blockedUserId,
    displayName: r.blocked.profile?.displayName ?? r.blocked.fullName,
    blockedAt: r.createdAt,
  }));
}
