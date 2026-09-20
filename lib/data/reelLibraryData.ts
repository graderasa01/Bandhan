import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { ageBoundsToDobRange } from "@/lib/services/match/pipeline";
import { PROFILE_FULL_INCLUDE } from "@/lib/services/profile/profileInclude";
import { buildCards, type CardSource } from "@/lib/data/reelData";
import { getBlockedUserIds } from "@/lib/services/safety/blockService";
import { daysAgoLabel } from "@/lib/profile/rishtaTime";
import { noopT, type Translate } from "@/lib/i18n/translate";
import type { DiscoverFilters } from "@/lib/discovery/contract";
import type { ReelLane, ReelLaneCounts, ReelLibraryCard, ReelLibraryPage } from "@/lib/contracts/reelLibrary";

/**
 * Meri List — the four backward-looking lanes of the reel (D-91b).
 *
 * ## Why this is not the reel's card builder
 *
 * `reelData.buildCards` re-scores every card it touches: preference match,
 * soch fit, guna milan, "why this match". All of that is a statement about a
 * *ranking decision*, and none of it is true of a row that is here because the
 * member swiped past this person on Tuesday. So these lanes build a plain,
 * honest card — who they are, one line of provable context, and the actions
 * that still make sense — and cost one page of rows rather than a re-scoring
 * pass over someone's entire history.
 *
 * ## What every lane still obeys
 *
 * The photo gate (`photoLockFor`), blocks in both directions, and deleted or
 * hidden profiles. A person who blocked this member disappears from their
 * history too — history is not a loophole.
 */

/** One page. Small, because these are browsed on a phone over a photograph. */
export const LIBRARY_PAGE_SIZE = 12;

/**
 * The filters the reel's own search sheet produces, applied to a history lane.
 *
 * Same vocabulary as `/api/discover/search` (a `DiscoverFilters` subset), so
 * "Jaipur, 26–30, Verified" means one thing in this app rather than two. Age
 * goes through the reel's own `ageBoundsToDobRange` for the same reason.
 */
function filterWhere(filters: DiscoverFilters): Prisma.ProfileWhereInput {
  const { minDob, maxDob } = ageBoundsToDobRange(filters.minAge, filters.maxAge);
  return {
    ...(filters.name ? { displayName: { contains: filters.name, mode: "insensitive" } } : {}),
    ...(minDob || maxDob ? { dateOfBirth: { gte: minDob, lte: maxDob } } : {}),
    ...(filters.cities?.length
      ? { OR: filters.cities.map((c) => ({ currentCity: { equals: c, mode: "insensitive" as const } })) }
      : {}),
    ...(filters.verifiedOnly ? { profileStatus: "VERIFIED" as const } : {}),
  };
}

/** Alive and still visible — a lane never resurrects a profile the app would otherwise hide. */
function visibleWhere(blockedUserIds: string[]): Prisma.ProfileWhereInput {
  return {
    deletedAt: null,
    isVisible: true,
    profileStatus: { in: ["SUBMITTED", "VERIFIED"] },
    ...(blockedUserIds.length ? { userId: { notIn: blockedUserIds } } : {}),
  };
}

/**
 * Which profile ids belong to each lane, newest activity first.
 *
 * Returned as an ordered id list rather than a join, because three of the four
 * lanes are defined by a row in a *different* table (a swipe, a like, an
 * interest) and the order that matters is that row's, not the profile's.
 */
async function laneProfileIds(userId: string, lane: ReelLane): Promise<{ ids: string[]; at: Map<string, Date>; meta: Map<string, string> }> {
  const at = new Map<string, Date>();
  const meta = new Map<string, string>();

  if (lane === "LIKED") {
    const rows = await prisma.profileLike.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { targetProfileId: true, createdAt: true },
    });
    for (const r of rows) at.set(r.targetProfileId, r.createdAt);
    return { ids: rows.map((r) => r.targetProfileId), at, meta };
  }

  if (lane === "INTEREST") {
    // Sent only. Received interest is answered on /user/interests, and a second
    // accept button in a browsing list is how two screens start disagreeing
    // about what a rishta's state is.
    const rows = await prisma.interest.findMany({
      where: { fromUserId: userId, status: { not: "WITHDRAWN" } },
      orderBy: { createdAt: "desc" },
      select: { toUserId: true, status: true, createdAt: true },
    });
    const profiles = await prisma.profile.findMany({
      where: { userId: { in: rows.map((r) => r.toUserId) } },
      select: { id: true, userId: true },
    });
    const byUser = new Map(profiles.map((p) => [p.userId, p.id]));
    const ids: string[] = [];
    for (const r of rows) {
      const pid = byUser.get(r.toUserId);
      if (!pid) continue;
      ids.push(pid);
      at.set(pid, r.createdAt);
      meta.set(pid, r.status);
    }
    return { ids, at, meta };
  }

  if (lane === "MESSAGE") {
    const matches = await prisma.match.findMany({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
        messages: { some: {} },
      },
      select: {
        id: true,
        userAId: true,
        userBId: true,
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      },
    });
    const otherIds = matches.map((m) => (m.userAId === userId ? m.userBId : m.userAId));
    const profiles = await prisma.profile.findMany({
      where: { userId: { in: otherIds } },
      select: { id: true, userId: true },
    });
    const byUser = new Map(profiles.map((p) => [p.userId, p.id]));
    const rows = matches
      .flatMap((m) => {
        const pid = byUser.get(m.userAId === userId ? m.userBId : m.userAId);
        return pid ? [{ pid, matchId: m.id, last: m.messages[0]?.createdAt ?? null }] : [];
      })
      .sort((a, b) => (b.last?.getTime() ?? 0) - (a.last?.getTime() ?? 0));
    for (const r of rows) {
      if (r.last) at.set(r.pid, r.last);
      meta.set(r.pid, r.matchId);
    }
    return { ids: rows.map((r) => r.pid), at, meta };
  }

  // VIEWED — swiped past, and nothing else ever happened. The exclusions are
  // the definition the member gave: "only dekhe hai, koi interest nahi kiya
  // nahi diya", plus the two saves, because a liked or shortlisted person
  // belongs to their own lane rather than to both.
  const [swipes, interests, likes, shortlists] = await Promise.all([
    prisma.swipeAction.findMany({
      where: { actorUserId: userId },
      orderBy: { createdAt: "desc" },
      distinct: ["targetProfileId"],
      select: { targetProfileId: true, createdAt: true },
    }),
    prisma.interest.findMany({
      where: { OR: [{ fromUserId: userId }, { toUserId: userId }] },
      select: { fromUserId: true, toUserId: true },
    }),
    prisma.profileLike.findMany({ where: { userId }, select: { targetProfileId: true } }),
    prisma.shortlist.findMany({ where: { userId }, select: { targetProfileId: true } }),
  ]);

  const otherUserIds = interests.map((i) => (i.fromUserId === userId ? i.toUserId : i.fromUserId));
  const interestProfiles = otherUserIds.length
    ? await prisma.profile.findMany({ where: { userId: { in: otherUserIds } }, select: { id: true } })
    : [];

  const excluded = new Set([
    ...interestProfiles.map((p) => p.id),
    ...likes.map((l) => l.targetProfileId),
    ...shortlists.map((s) => s.targetProfileId),
  ]);

  const ids: string[] = [];
  for (const s of swipes) {
    if (excluded.has(s.targetProfileId)) continue;
    ids.push(s.targetProfileId);
    at.set(s.targetProfileId, s.createdAt);
  }
  return { ids, at, meta };
}

function noteFor(
  lane: ReelLane,
  profileId: string,
  at: Map<string, Date>,
  meta: Map<string, string>,
  t: Translate,
): string {
  const when = at.get(profileId);
  const ago = when ? daysAgoLabel(when.toISOString()) : null;

  if (lane === "INTEREST") {
    const status = meta.get(profileId);
    if (status === "ACCEPTED") return t("reel.library.note.interestAccepted", "Interest accept ho gaya");
    if (status === "DECLINED") return t("reel.library.note.interestDeclined", "Inhone abhi nahi kaha");
    return `${t("reel.library.note.interestSent", "Interest bheja")}${ago ? ` — ${ago}` : ""}`;
  }
  if (lane === "MESSAGE") {
    return ago
      ? `${t("reel.library.note.lastMessage", "Aakhri message")} ${ago}`
      : t("reel.library.note.chatOpen", "Chat khuli hai");
  }
  if (lane === "LIKED") {
    return ago ? `${t("reel.library.note.liked", "Like kiya")} — ${ago}` : t("reel.library.note.liked", "Like kiya");
  }
  return ago ? `${t("reel.library.note.viewed", "Dekha")} — ${ago}` : t("reel.library.note.viewed", "Dekha");
}

/** The number on each Meri List pill. Four indexed counts, no profile rows loaded. */
export async function getLaneCounts(userId: string): Promise<ReelLaneCounts> {
  const [liked, interest, message, viewed] = await Promise.all([
    prisma.profileLike.count({ where: { userId } }),
    prisma.interest.count({ where: { fromUserId: userId, status: { not: "WITHDRAWN" } } }),
    prisma.match.count({ where: { OR: [{ userAId: userId }, { userBId: userId }], messages: { some: {} } } }),
    laneProfileIds(userId, "VIEWED").then((r) => r.ids.length),
  ]);
  return { VIEWED: viewed, LIKED: liked, INTEREST: interest, MESSAGE: message };
}

/**
 * One filtered page of a lane.
 *
 * The lane decides *who* and in what order; the filters and the visibility
 * rules then run as one query over that id set, and the page is sliced after
 * both. Slicing before filtering would produce the bug every "filtered history"
 * screen has: page two arrives mostly empty because page one's twelve rows
 * were filtered away after they were chosen.
 */
export async function getLibraryPage(
  userId: string,
  lane: ReelLane,
  filters: DiscoverFilters,
  cursor: string | null,
  t: Translate = noopT,
): Promise<ReelLibraryPage> {
  const offset = Math.max(0, Number.parseInt(cursor ?? "0", 10) || 0);

  const [{ ids, at, meta }, blockedUserIds, viewer] = await Promise.all([
    laneProfileIds(userId, lane),
    getBlockedUserIds(userId),
    prisma.profile.findUnique({ where: { userId }, include: PROFILE_FULL_INCLUDE }),
  ]);

  if (ids.length === 0) {
    return { ok: true, lane, cards: [], nextCursor: null, total: 0 };
  }

  // Everything in the lane that also survives the filters and the visibility
  // rules — ids only, so the ordering below stays the lane's own.
  const eligible = await prisma.profile.findMany({
    where: { AND: [{ id: { in: ids } }, visibleWhere(blockedUserIds), filterWhere(filters)] },
    select: { id: true },
  });
  const eligibleIds = new Set(eligible.map((p) => p.id));
  const ordered = ids.filter((id) => eligibleIds.has(id));
  const pageIds = ordered.slice(offset, offset + LIBRARY_PAGE_SIZE);

  if (pageIds.length === 0) {
    return { ok: true, lane, cards: [], nextCursor: null, total: ordered.length };
  }

  // Full profiles, because these are real reel cards: the same ring, the same
  // "why this match", the same photo gate. One page at a time, never the whole
  // history.
  const profiles = await prisma.profile.findMany({
    where: { id: { in: pageIds } },
    include: PROFILE_FULL_INCLUDE,
  });
  const byId = new Map(profiles.map((p) => [p.id, p]));

  // No persisted pair scores exist for a history card — there may never have
  // been a reel row for this person. `buildCards` re-scores every card from
  // the live profiles anyway, so nulls here are replaced before anything is
  // shown; what they are *not* is a made-up number.
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

  const [built, matches] = await Promise.all([
    // `allowMissions: false` — a history lane never spends one of the day's two.
    buildCards(userId, viewer, sources, t, undefined, false),
    prisma.match.findMany({
      where: {
        OR: [
          { userAId: userId, userBId: { in: profiles.map((p) => p.userId) } },
          { userBId: userId, userAId: { in: profiles.map((p) => p.userId) } },
        ],
      },
      select: { id: true, userAId: true, userBId: true },
    }),
  ]);

  const matchIdByUser = new Map(matches.map((m) => [m.userAId === userId ? m.userBId : m.userAId, m.id]));
  const userIdByProfile = new Map(profiles.map((p) => [p.id, p.userId]));

  const cards: ReelLibraryCard[] = built.map((card) => ({
    ...card,
    laneNote: noteFor(lane, card.id, at, meta, t),
    matchId: matchIdByUser.get(userIdByProfile.get(card.id) ?? "") ?? null,
  }));

  const nextOffset = offset + pageIds.length;
  return {
    ok: true,
    lane,
    cards,
    nextCursor: nextOffset < ordered.length ? String(nextOffset) : null,
    total: ordered.length,
  };
}
