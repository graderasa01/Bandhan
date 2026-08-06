import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { prisma } from "@/lib/db/prisma";
import { getUnreadCount } from "@/lib/services/notice/noticeService";

export const runtime = "nodejs";

/**
 * Every badge the nav can show, in one round trip.
 *
 * Only four things earn a badge, and the bar is the same for each: *someone
 * else acted and it is now the user's turn*. Counting things the user could
 * merely look at (new profiles in the Reel, poll of the day) would make every
 * badge lit permanently, which teaches people to ignore all of them.
 *
 * `matches` is deliberately "matched but not yet talked to" rather than "new
 * this week" — Match has no seenAt column, and a time window would keep
 * re-lighting a badge for something the user already dealt with. Zero messages
 * is a state the user can actually clear, by sending one.
 *
 * Fetched once per navigation (see `useNavCounts`), never polled — the same
 * reasoning NoticeBell already documents.
 */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const mine = { OR: [{ userAId: user.id }, { userBId: user.id }] };

  const [matches, interests, messages, inbox] = await Promise.all([
    prisma.match.count({ where: { ...mine, messages: { none: {} } } }),
    prisma.interest.count({ where: { toUserId: user.id, status: "PENDING" } }),
    prisma.message.count({
      where: { match: mine, senderId: { not: user.id }, readAt: null },
    }),
    getUnreadCount(user.id),
  ]);

  return NextResponse.json({ ok: true, counts: { matches, interests, messages, inbox } });
}
