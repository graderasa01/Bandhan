import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { PROFILE_FULL_INCLUDE } from "@/lib/services/profile/profileInclude";
import { buildCards, type CardSource } from "@/lib/data/reelData";
import { getBlockedUserIds } from "@/lib/services/safety/blockService";
import { oppositeGender } from "@/lib/discovery/contract";
import { noopT, type Translate } from "@/lib/i18n/translate";
import type { ReelCardViewModel } from "@/lib/contracts/reel";
import type { ProfileWithSubTables } from "@/lib/services/profile/completionService";

/**
 * The other half of "For You" — the people this member has already seen (D-92).
 *
 * ## Why this exists
 *
 * The reel is scrolled like a feed now, up and down, and a feed that hides
 * everything you have already looked at runs out in a few minutes and then has
 * nothing to say. Devesh's ask (2026-09-22) was exactly this: "sare dekhe
 * reels — jo dekhe hain aur jo naye hain — sab ek hi For You tab me". So the
 * deck the screen receives is two streams mixed: the ranked pool of people
 * nobody has met yet (`pipeline.getCandidates`, which since D-92 excludes
 * anybody with a swipe row), and this one.
 *
 * ## Why it is not the Viewed lane
 *
 * `reelLibraryData.laneProfileIds("VIEWED")` answers a narrower question —
 * "sirf dekha, aur kuch nahi kiya" — so it also drops anybody liked or
 * shortlisted. This stream is the wider one: *every* person who has been on
 * this member's screen and is still a rishta they could act on. A like or a
 * shortlist is a reason to see somebody again, not a reason to hide them.
 *
 * Since D-92b it also leads with the **matches** (see `knownProfileIds`), on
 * the same principle — the strongest thing that ever happened between two
 * people is the last thing a feed should hide. What stays out is an interest
 * still waiting for an answer: that has an open question on another screen.
 *
 * Everything else the reel obeys, this obeys: blocks both ways, hidden and
 * deleted profiles, and — for everyone except a match — the gender floor.
 */

/** One page of the seen stream. Small — it is mixed into a batch, not browsed. */
export const SEEN_DECK_PAGE_SIZE = 8;

/**
 * How long a face stays out of the feed after being looked at.
 *
 * Thirty minutes, and it is what makes the feed able to *end*. Without it the
 * loop is exact: every card scrolled past is written as a view, which puts
 * that person into this same stream, which hands them back a few batches
 * later — the screen drops them as duplicates, so the member sits on "aur
 * dikhaiye" while the server keeps insisting there is more. One browsing
 * session is well inside half an hour, so this says the honest thing instead:
 * the people you have just been through are not new material.
 */
const SEEN_COOLDOWN_MS = 30 * 60 * 1000;

type SeenViewer = ProfileWithSubTables | null;

/** Alive, visible and not blocked either way — a seen card is never a loophole. */
function visibleWhere(blockedUserIds: string[]): Prisma.ProfileWhereInput {
  return {
    deletedAt: null,
    isVisible: true,
    profileStatus: { in: ["SUBMITTED", "VERIFIED"] },
    ...(blockedUserIds.length ? { userId: { notIn: blockedUserIds } } : {}),
  };
}

/**
 * The same floor `candidateWhere` applies, applied again here.
 *
 * Not optional and not cosmetic: a member whose account predates the floor
 * (`lookingForGender` unwritten) has swipe rows for every gender, and without
 * this their own history would put back exactly the cards the deck refuses to
 * deal them today.
 */
function genderWhere(viewer: SeenViewer): Prisma.ProfileWhereInput {
  const want = viewer?.partnerPreferences?.lookingForGender ?? oppositeGender(viewer?.gender ?? null);
  return want ? { gender: want } : {};
}

/**
 * Everybody this member already knows, in the order the feed should bring them
 * back: **matches first (newest first), then the merely-seen (oldest first).**
 *
 * ### Matches lead
 *
 * "Jab match ho jaye to wah reels bhi dikhani chahiye" (Devesh, 2026-09-22).
 * A match is the strongest thing that has ever happened between these two, so
 * it is the one face worth seeing again first — and the card it produces is a
 * different card: no interest to send, a Message button instead, and the chat
 * one tap away (`ReelCardViewModel.matchId`).
 *
 * A matched person is here whether or not this member ever swiped them: an
 * interest they *received* and accepted from `/user/interests` never wrote a
 * swipe row, and leaving them out would be the reel refusing to show somebody
 * the member is already talking to.
 *
 * ### The rest, oldest first
 *
 * Ordered by the swipe rather than by the profile, because "dekhe hue" is a
 * fact about an event — and oldest-first for two reasons that happen to agree:
 *
 *   - The face you scrolled past ninety seconds ago coming straight back is
 *     the one version of this feature that reads as a bug. Walking from the
 *     far end gives every returning rishta the longest possible gap.
 *   - It keeps the cursor honest. New views land at the *end* of this list, so
 *     an offset handed out a minute ago still points at the same person;
 *     newest-first shifted every offset by one on every scroll, which quietly
 *     skipped people.
 *
 * And anybody looked at inside `SEEN_COOLDOWN_MS` is held back entirely, which
 * is what lets the feed reach an end at all. Matches are exempt: there are a
 * handful of them, they lead the list, and they are the one set of people a
 * member is not browsing *past*.
 *
 * Left out of both halves: an interest that is still waiting for an answer,
 * either direction. That rishta has an open question on another screen
 * (`/user/interests`), and a browsing deck must not become a second place to
 * answer it.
 */
async function knownProfileIds(userId: string): Promise<{ ids: string[]; matched: Set<string> }> {
  const [swipes, interests, matches] = await Promise.all([
    // Grouped rather than `distinct`, because this needs both ends of each
    // person's history: the *first* time they were seen (the order this stream
    // walks) and the *last* (the cooldown above).
    prisma.swipeAction.groupBy({
      by: ["targetProfileId"],
      where: { actorUserId: userId },
      _min: { createdAt: true },
      _max: { createdAt: true },
    }),
    prisma.interest.findMany({
      where: { OR: [{ fromUserId: userId }, { toUserId: userId }] },
      select: { fromUserId: true, toUserId: true },
    }),
    prisma.match.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      orderBy: { createdAt: "desc" },
      select: { userAId: true, userBId: true },
    }),
  ]);

  const otherUserIds = [
    ...interests.map((i) => (i.fromUserId === userId ? i.toUserId : i.fromUserId)),
    ...matches.map((m) => (m.userAId === userId ? m.userBId : m.userAId)),
  ];
  if (swipes.length === 0 && otherUserIds.length === 0) return { ids: [], matched: new Set() };

  // userId → profileId for everyone named by a row above, in one read.
  const profiles = otherUserIds.length
    ? await prisma.profile.findMany({
        where: { userId: { in: otherUserIds } },
        select: { id: true, userId: true },
      })
    : [];
  const profileByUser = new Map(profiles.map((p) => [p.userId, p.id]));

  const matchedIds: string[] = [];
  for (const m of matches) {
    const id = profileByUser.get(m.userAId === userId ? m.userBId : m.userAId);
    if (id && !matchedIds.includes(id)) matchedIds.push(id);
  }
  const matched = new Set(matchedIds);

  // A match *is* an accepted interest, so the interest exclusion has to let
  // those through — otherwise the lead half of this list would delete itself.
  const pendingInterest = new Set(
    interests
      .map((i) => profileByUser.get(i.fromUserId === userId ? i.toUserId : i.fromUserId))
      .filter((id): id is string => Boolean(id) && !matched.has(id as string)),
  );

  const cutoff = Date.now() - SEEN_COOLDOWN_MS;
  const seen = swipes
    .filter((s) => (s._max.createdAt?.getTime() ?? 0) < cutoff)
    .sort((a, b) => (a._min.createdAt?.getTime() ?? 0) - (b._min.createdAt?.getTime() ?? 0))
    .map((s) => s.targetProfileId)
    .filter((id) => !matched.has(id) && !pendingInterest.has(id));

  return { ids: [...matchedIds, ...seen], matched };
}

/**
 * One page of seen cards, built by the reel's own builder.
 *
 * `buildCards` re-scores every card from the live profiles, so a person met
 * three weeks ago comes back with today's ring, today's "why this match" and
 * today's photo gate — nothing stale is carried forward. The stored pair
 * scores are passed as nulls rather than zeros for the same reason: there may
 * never have been a reel row for this person, and a made-up number would look
 * exactly like a real one.
 *
 * `allowMissions: false` — the day's two prompts belong to the cards the
 * ranking chose, never to a face coming round again.
 */
export async function getSeenDeckPage(
  userId: string,
  viewer: SeenViewer,
  cursor: string | null,
  limit: number = SEEN_DECK_PAGE_SIZE,
  t: Translate = noopT,
): Promise<{ cards: ReelCardViewModel[]; nextCursor: string | null }> {
  const offset = Math.max(0, Number.parseInt(cursor ?? "0", 10) || 0);

  const [{ ids, matched }, blockedUserIds] = await Promise.all([
    knownProfileIds(userId),
    getBlockedUserIds(userId),
  ]);
  if (ids.length === 0) return { cards: [], nextCursor: null };

  // Eligibility over the whole id set before slicing — the other order is how
  // "page two is mostly empty" bugs happen, because a page is chosen and then
  // most of it is filtered away.
  //
  // The gender floor is asked as a second, narrower question rather than
  // folded into the first, because a **match** does not answer to it. The lanes
  // draw the same line (`reelLibraryData.genderWhere`): Viewed and Liked are
  // re-decision surfaces and obey the floor, while a rishta that actually
  // happened between two people is a record, and hiding a live chat behind a
  // preference filter would be rewriting the member's history rather than
  // fixing a feed.
  const [visible, genderOk] = await Promise.all([
    prisma.profile.findMany({
      where: { AND: [{ id: { in: ids } }, visibleWhere(blockedUserIds)] },
      select: { id: true },
    }),
    prisma.profile.findMany({
      where: { AND: [{ id: { in: ids } }, genderWhere(viewer)] },
      select: { id: true },
    }),
  ]);
  const allowed = new Set(visible.map((p) => p.id));
  const rightGender = new Set(genderOk.map((p) => p.id));
  const ordered = ids.filter((id) => allowed.has(id) && (matched.has(id) || rightGender.has(id)));
  const pageIds = ordered.slice(offset, offset + limit);
  if (pageIds.length === 0) return { cards: [], nextCursor: null };

  const profiles = await prisma.profile.findMany({
    where: { id: { in: pageIds } },
    include: PROFILE_FULL_INCLUDE,
  });
  const byId = new Map(profiles.map((p) => [p.id, p]));

  const sources: CardSource[] = pageIds.flatMap((id) => {
    const profile = byId.get(id);
    return profile
      ? [
          {
            profile,
            aiReasonText: null,
            aiConcernText: null,
            aiFactsHash: null,
            spotlightDelivery: null,
            finalScore: 0,
            preferenceScore: null,
            deepProfileFit: null,
            trustScoreFactor: profile.trustScore ?? 50,
            recentActivityScore: 0,
          },
        ]
      : [];
  });

  const cards = await buildCards(userId, viewer, sources, t, undefined, false);
  const nextOffset = offset + pageIds.length;
  return { cards, nextCursor: nextOffset < ordered.length ? String(nextOffset) : null };
}
