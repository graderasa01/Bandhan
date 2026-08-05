import { prisma } from "@/lib/db/prisma";
import { createMatch } from "@/lib/services/match/confirmMutual";
import { getEntitlements } from "@/lib/services/plans/entitlements";

/**
 * Sending an interest, from wherever the user happens to be standing.
 *
 * Extracted from the reel's RIGHT-swipe handler so the shortlist screen can
 * do the same thing without a second, subtly-different copy of the mutual
 * check. Behaviour is unchanged: upsert (never duplicate), and if the other
 * side already sent one, both rows flip to ACCEPTED and a Match appears.
 *
 * Deterministic, not an AI decision (D-32) — the user's tap is the consent,
 * and this only records its consequence.
 */

export type SendInterestResult =
  | { ok: true; matched: boolean; matchId: string | null }
  | { ok: false; error: "LIMIT_REACHED"; message: string };

/** First moment of the current calendar month, UTC — matches the daily-reel boundary's own UTC convention. */
export function monthStartUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
}

export async function sendInterest(fromUserId: string, toUserId: string): Promise<SendInterestResult> {
  const existing = await prisma.interest.findUnique({
    where: { fromUserId_toUserId: { fromUserId, toUserId } },
  });

  // The cap is on *new* sends this month — re-sending to someone already
  // interested-in (the upsert below is a no-op for them) can't be blocked by
  // a limit it never consumed in the first place.
  if (!existing) {
    const { interestsPerMonth } = await getEntitlements(fromUserId);
    if (interestsPerMonth != null) {
      const sentThisMonth = await prisma.interest.count({
        where: { fromUserId, createdAt: { gte: monthStartUTC() } },
      });
      if (sentThisMonth >= interestsPerMonth) {
        return {
          ok: false,
          error: "LIMIT_REACHED",
          message: `Is mahine ke ${interestsPerMonth} interest bhej diye hain. Agle mahine reset hoga, ya plan upgrade karke abhi aur bhejein.`,
        };
      }
    }
  }

  await prisma.interest.upsert({
    where: { fromUserId_toUserId: { fromUserId, toUserId } },
    create: { fromUserId, toUserId, status: "PENDING" },
    update: {},
  });

  const reciprocal = await prisma.interest.findUnique({
    where: { fromUserId_toUserId: { fromUserId: toUserId, toUserId: fromUserId } },
  });

  if (!reciprocal) return { ok: true, matched: false, matchId: null };

  await prisma.interest.updateMany({
    where: {
      OR: [
        { fromUserId, toUserId },
        { fromUserId: toUserId, toUserId: fromUserId },
      ],
    },
    data: { status: "ACCEPTED" },
  });

  const match = await createMatch(fromUserId, toUserId);
  return { ok: true, matched: true, matchId: match.id };
}
