import { prisma } from "@/lib/db/prisma";

/**
 * Upserts the Match row for a pair (sorted ids, per the compound unique key)
 * — shared by the Reel swipe RIGHT path (reciprocal PENDING interest found)
 * and the direct Interest-accept path (accepting a received interest IS the
 * reciprocation, no second Interest row needed). Each caller decides when a
 * match is actually warranted; this just does the idempotent creation.
 */
export async function createMatch(userId1: string, userId2: string) {
  const [userAId, userBId] = [userId1, userId2].sort();
  return prisma.match.upsert({
    where: { userAId_userBId: { userAId, userBId } },
    create: { userAId, userBId },
    update: {},
  });
}
