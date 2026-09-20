import "server-only";
import { prisma } from "@/lib/db/prisma";

/**
 * The private like — D-91b.
 *
 * ## The one rule
 *
 * A like belongs to the person who made it. Nobody else may learn who made it
 * unless that person says so. The target is allowed exactly two things:
 *
 *   1. **how many** likes they have received (`countLikesReceived`), and
 *   2. **who**, for the likes whose owner chose to reveal them
 *      (`getRevealedLikers`).
 *
 * There is deliberately no third function. Every other question about likes —
 * "who liked me", "did this person like me", "how many did X give out" — has
 * no implementation here, and adding one is the way this feature breaks. If a
 * screen wants an attributable save, that already exists and is called a
 * Shortlist (`admirerService`), which is visible by design.
 *
 * ## Why likes never touch matching
 *
 * A like is the quietest thing in the product: people use it while they are
 * still deciding, often before talking to family. Feeding it into ranking
 * would turn a private thought into an observable effect — the liked person's
 * reel would shift, and a careful user would be able to read it. So no
 * scoring, no boost, no "logon ko ye pasand aaye" row. It is a bookmark whose
 * only reader is its owner.
 */

/** Idempotent — a double tap is not an error, and it never changes `revealedAt`. */
export async function likeProfile(userId: string, targetProfileId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const target = await prisma.profile.findUnique({
    where: { id: targetProfileId },
    select: { userId: true, isVisible: true, profileStatus: true, deletedAt: true },
  });
  if (!target || target.deletedAt || !target.isVisible || target.profileStatus === "DRAFT") {
    return { ok: false, message: "Profile nahi mila." };
  }
  if (target.userId === userId) return { ok: false, message: "Apni hi profile like nahi kar sakte." };

  await prisma.profileLike.upsert({
    where: { userId_targetProfileId: { userId, targetProfileId } },
    create: { userId, targetProfileId },
    update: {},
  });
  return { ok: true };
}

/**
 * Unlike. Scoped to the caller, so one person can only ever remove their own
 * row — and it removes the reveal with it, because the row is the reveal.
 *
 * What it cannot do is un-tell anybody who was already told. The UI says so
 * rather than implying the reveal is reversible.
 */
export async function unlikeProfile(userId: string, targetProfileId: string): Promise<void> {
  await prisma.profileLike.deleteMany({ where: { userId, targetProfileId } });
}

/** The liker chooses to be named to this one person. One-way (see the schema note). */
export async function revealLike(userId: string, targetProfileId: string): Promise<{ ok: boolean }> {
  const updated = await prisma.profileLike.updateMany({
    where: { userId, targetProfileId, revealedAt: null },
    data: { revealedAt: new Date() },
  });
  return { ok: updated.count > 0 };
}

/** Which of these profiles the viewer has liked, and whether they revealed it. */
export async function getLikeStates(
  userId: string,
  targetProfileIds: string[],
): Promise<Map<string, { liked: true; revealed: boolean }>> {
  if (targetProfileIds.length === 0) return new Map();
  const rows = await prisma.profileLike.findMany({
    where: { userId, targetProfileId: { in: targetProfileIds } },
    select: { targetProfileId: true, revealedAt: true },
  });
  return new Map(rows.map((r) => [r.targetProfileId, { liked: true as const, revealed: r.revealedAt !== null }]));
}

/**
 * How many likes this profile has received — **owner-only**.
 *
 * The caller must already have established that `profileId` belongs to
 * `userId`; this function does not guess, because the only safe default for a
 * number nobody else may see is that the caller proves whose it is. It is a
 * count and never a list: `getRevealedLikers` is the only path to a name.
 */
export async function countLikesReceived(ownerUserId: string, profileId: string): Promise<number> {
  const profile = await prisma.profile.findUnique({ where: { id: profileId }, select: { userId: true } });
  if (!profile || profile.userId !== ownerUserId) return 0;
  return prisma.profileLike.count({ where: { targetProfileId: profileId } });
}

/** The likers who chose to be named to this owner. Same ownership proof as the count. */
export async function getRevealedLikers(
  ownerUserId: string,
  profileId: string,
  limit = 12,
): Promise<{ profileId: string; displayName: string; revealedAt: Date }[]> {
  const profile = await prisma.profile.findUnique({ where: { id: profileId }, select: { userId: true } });
  if (!profile || profile.userId !== ownerUserId) return [];

  const rows = await prisma.profileLike.findMany({
    where: { targetProfileId: profileId, revealedAt: { not: null } },
    orderBy: { revealedAt: "desc" },
    take: limit,
    select: { revealedAt: true, user: { select: { profile: { select: { id: true, displayName: true } } } } },
  });

  return rows.flatMap((r) =>
    r.user.profile && r.revealedAt
      ? [{ profileId: r.user.profile.id, displayName: r.user.profile.displayName ?? "Profile", revealedAt: r.revealedAt }]
      : [],
  );
}
