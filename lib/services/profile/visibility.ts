import "server-only";
import { prisma } from "@/lib/db/prisma";

/**
 * How much of a profile a given viewer is allowed to see.
 *
 * Until now the app had no profile page at all, so "what does a match unlock?"
 * had never been answered anywhere: `getMatchesData` returned the same seven
 * fields before and after a match, and the only thing acceptance actually
 * changed was that chat opened. This module is that missing answer, and it is
 * the single place the question gets asked — a page or API that decides
 * visibility for itself is how a leak eventually ships.
 *
 * The three levels are not invented here. `/api/reel/ask`'s system prompt has
 * been telling users since it was written:
 *
 *   "Agar user private cheez poochta hai (income, phone, exact date of birth,
 *    caste/gotra) to bataiye ye private hai aur sirf mutual interest ke baad
 *    hi share hoti hai."
 *
 * So the app already promised, in its own words, that caste/gotra/income open
 * at mutual interest and not before. L3 is that promise, made structural.
 *
 * Never visible at any level, to anyone (`lib/profile/fields.ts` says so at the
 * moment the user types them):
 *   - birthTime, birthPlace — "Sirf kundli ke liye — kisi aur ko kabhi nahi dikhta"
 *   - the full date of birth  — "Doosron ko sirf age dikhti hai, poori date kabhi nahi"
 *   - mobile                  — mutual contact-share only, inside chat
 */

export type ProfileVisibilityLevel = "L1" | "L2" | "L3";

export interface ProfileVisibility {
  level: ProfileVisibilityLevel;
  /** The viewer looking at their own profile. Gets L3, but no interest/match actions. */
  isSelf: boolean;
  /** Present at L3 — lets the page link straight into the existing chat thread. */
  matchId: string | null;
  interestSent: boolean;
  interestReceived: boolean;
}

const SELF: Omit<ProfileVisibility, "isSelf"> = {
  level: "L3",
  matchId: null,
  interestSent: false,
  interestReceived: false,
};

/**
 * L2 opens on an interest in *either* direction, which is worth stating plainly
 * because only one of those is symmetric consent:
 *
 *  - Interest received — obvious. Someone asked to be considered; the viewer
 *    needs enough to decide, and that is the whole point of the request.
 *  - Interest sent — one-sided, and deliberately allowed anyway. L2 carries no
 *    photo, no contact, and nothing that identifies a person off-platform; it
 *    is family/lifestyle/background detail. Making serious intent the threshold
 *    for serious detail is the trade this product is built on.
 *
 * Anything that could identify or embarrass someone who never reciprocated —
 * photo, caste, gotra, income — stays at L3, where both sides have said yes.
 */
export async function getProfileVisibility(
  viewerUserId: string,
  targetUserId: string,
): Promise<ProfileVisibility> {
  if (viewerUserId === targetUserId) return { ...SELF, isSelf: true };

  const [match, interests] = await Promise.all([
    prisma.match.findFirst({
      where: {
        OR: [
          { userAId: viewerUserId, userBId: targetUserId },
          { userAId: targetUserId, userBId: viewerUserId },
        ],
      },
      select: { id: true },
    }),
    prisma.interest.findMany({
      where: {
        OR: [
          { fromUserId: viewerUserId, toUserId: targetUserId },
          { fromUserId: targetUserId, toUserId: viewerUserId },
        ],
      },
      select: { fromUserId: true },
    }),
  ]);

  const interestSent = interests.some((i) => i.fromUserId === viewerUserId);
  const interestReceived = interests.some((i) => i.fromUserId === targetUserId);

  if (match) {
    return { level: "L3", isSelf: false, matchId: match.id, interestSent, interestReceived };
  }

  return {
    level: interestSent || interestReceived ? "L2" : "L1",
    isSelf: false,
    matchId: null,
    interestSent,
    interestReceived,
  };
}

/** Ordering helper so callers can write `atLeast(level, "L2")` instead of comparing strings. */
const RANK: Record<ProfileVisibilityLevel, number> = { L1: 1, L2: 2, L3: 3 };

export function atLeast(level: ProfileVisibilityLevel, minimum: ProfileVisibilityLevel): boolean {
  return RANK[level] >= RANK[minimum];
}
