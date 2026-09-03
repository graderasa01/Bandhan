import "server-only";
import { prisma } from "@/lib/db/prisma";
import { isReserved, normalizeCode, randomCodeWithPrefix } from "./code";

/**
 * A member's own share code.
 *
 * ## Why a different prefix
 *
 * `BM…` for a member, `BT…` for a partner. Both live in their own table with
 * their own unique index, so nothing would *break* if they collided — but
 * `/i/<code>` and `/r/<code>` are two links people paste into the same
 * WhatsApp thread, and support has to be able to tell at a glance which
 * mechanism a screenshot is about. One character does that.
 */
const MEMBER_PREFIX = "BM";
const DEFAULT_LENGTH = 6;
const MAX_COLLISION_RETRIES = 5;

/**
 * Allocated lazily, the first time the member opens the refer screen.
 *
 * Not at registration: most accounts never share a link, and issuing a code to
 * every signup means a table the size of `users` where the overwhelming
 * majority of rows have never been read. The upsert-on-conflict path below is
 * what makes "lazy" safe against two tabs opening the page at once.
 */
export async function getOrCreateMemberReferralCode(userId: string): Promise<string> {
  const existing = await prisma.memberReferralCode.findUnique({ where: { userId } });
  if (existing) return existing.code;

  for (let attempt = 0; attempt < MAX_COLLISION_RETRIES; attempt++) {
    const candidate = randomCodeWithPrefix(MEMBER_PREFIX, DEFAULT_LENGTH);
    if (isReserved(candidate)) continue;
    try {
      const created = await prisma.memberReferralCode.create({ data: { userId, code: candidate } });
      return created.code;
    } catch {
      // Either the code collided or another request for this same user won the
      // race. Both are unique-constraint violations and both are handled by
      // looking again: if the user now has a row, that row is the answer.
      const raced = await prisma.memberReferralCode.findUnique({ where: { userId } });
      if (raced) return raced.code;
    }
  }

  throw new Error("Member referral code allocation failed after retries.");
}

/**
 * Resolves a shared code to its owner. Null for unknown or retired codes.
 *
 * The one place that decides whether a member's link still works, so the
 * landing route, the register-page banner and the attribution at signup can
 * never disagree about it. They did briefly: an INCOMPLETE member's link
 * attributed correctly but the banner called it invalid, which reads to the
 * person clicking it as "this friend's link is broken".
 *
 * INCOMPLETE deliberately passes. Somebody who has just signed up and shared
 * the link with their family before finishing the interview is the *normal*
 * first user of this feature, and dropping their attribution would be silent
 * and unrecoverable. Whether they have finished their own profile is a
 * question for payout time (`checkReferrerBar`), not for the link.
 *
 * `ownerFirstName` is returned here rather than fetched again by the caller so
 * the "kisne bulaya" banner and this gate read the same row.
 */
export async function resolveMemberReferralCode(
  raw: string,
): Promise<{ code: string; userId: string; ownerFirstName: string } | null> {
  const code = normalizeCode(raw);
  const row = await prisma.memberReferralCode.findUnique({
    where: { code },
    include: { user: { select: { id: true, fullName: true, status: true, deletedAt: true } } },
  });
  if (!row || !row.active) return null;
  // A suspended or deleted member's link stops attributing. It still resolves
  // to the register page (see app/i/[code]) rather than 404ing, because the
  // person who clicked it did nothing wrong and should still be able to join.
  if (row.user.deletedAt) return null;
  if (row.user.status === "SUSPENDED" || row.user.status === "BLOCKED" || row.user.status === "DELETED") {
    return null;
  }
  const fullName = row.user.fullName.trim();
  return {
    code: row.code,
    userId: row.userId,
    ownerFirstName: fullName.split(/\s+/)[0] ?? fullName,
  };
}
