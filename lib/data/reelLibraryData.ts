import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { ageBoundsToDobRange } from "@/lib/services/match/pipeline";
import { PROFILE_FULL_INCLUDE } from "@/lib/services/profile/profileInclude";
import { buildCards, type CardSource } from "@/lib/data/reelData";
import { getBlockedUserIds } from "@/lib/services/safety/blockService";
import { daysAgoLabel } from "@/lib/profile/rishtaTime";
import { noopT, type Translate } from "@/lib/i18n/translate";
import { oppositeGender, type DiscoverFilters } from "@/lib/discovery/contract";
import { REEL_LANES, type ReelLane, type ReelLaneCounts, type ReelLibraryCard, type ReelLibraryPage } from "@/lib/contracts/reelLibrary";

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

/**
 * The deck's gender floor, applied to the two lanes that still offer a
 * decision (see `laneDecides` in `ReelStack`).
 *
 * Viewed, Liked and Shortlist are re-decision surfaces: full action bar,
 * interest included. Anyone the reel may not deal may not be offered here
 * either — and until the floor was fixed in `candidateWhere`, a member with no
 * stated `lookingForGender` was dealt every gender, so their own history holds
 * people the deck would refuse to show them today.
 *
 * Interest and Messages are deliberately left alone. Those are records of
 * something that actually happened between two people; hiding a live
 * conversation because of a filter would be rewriting the member's history
 * rather than fixing a feed.
 */
function genderWhere(lane: ReelLane, viewer: LaneViewer): Prisma.ProfileWhereInput {
  if (lane !== "VIEWED" && lane !== "LIKED" && lane !== "SHORTLIST") return {};
  const want = viewer?.partnerPreferences?.lookingForGender ?? oppositeGender(viewer?.gender);
  return want ? { gender: want } : {};
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

type LaneViewer = { gender: string | null; partnerPreferences?: { lookingForGender: string | null } | null } | null;

/**
 * Who, out of a lane's ids, this member may actually be shown.
 *
 * Extracted so the pill and the page cannot answer it differently, which is
 * the bug it was extracted for: `getLaneCounts` counted rows straight out of
 * the activity tables while the page ran them through the visibility rules and
 * the gender floor, so a member whose history predates that floor was told
 * "Viewed 6" and handed a lane of 4 — and where the whole history was the
 * wrong gender, a door labelled with a number that opened onto "abhi aisi koi
 * profile nahi". The pill is a count of rows the member can see, or it is not
 * worth printing.
 */
async function eligibleLaneIds(
  ids: string[],
  lane: ReelLane,
  blockedUserIds: string[],
  viewer: LaneViewer,
  extra?: Prisma.ProfileWhereInput,
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await prisma.profile.findMany({
    where: {
      AND: [
        { id: { in: ids } },
        visibleWhere(blockedUserIds),
        genderWhere(lane, viewer),
        ...(extra ? [extra] : []),
      ],
    },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
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

  if (lane === "SHORTLIST") {
    const rows = await prisma.shortlist.findMany({
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
  const [swipes, interests, likes, shortlists, chatted] = await Promise.all([
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
    // Somebody this member has actually talked to is the strongest thing that
    // can have happened, and "Viewed" claims nothing did. An accepted interest
    // usually covers it — but since D-90 a chat can be opened by paying for it
    // (`getChatAccess`), with no Interest row anywhere, so the message itself
    // has to be one of the exclusions. Messages owns these people.
    prisma.match.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }], messages: { some: {} } },
      select: { userAId: true, userBId: true },
    }),
  ]);

  const otherUserIds = [
    ...interests.map((i) => (i.fromUserId === userId ? i.toUserId : i.fromUserId)),
    ...chatted.map((m) => (m.userAId === userId ? m.userBId : m.userAId)),
  ];
  const excludedByUser = otherUserIds.length
    ? await prisma.profile.findMany({ where: { userId: { in: otherUserIds } }, select: { id: true } })
    : [];

  const excluded = new Set([
    ...excludedByUser.map((p) => p.id),
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
  if (lane === "SHORTLIST") {
    const label = t("reel.library.note.shortlisted", "Shortlist kiya");
    return ago ? `${label} — ${ago}` : label;
  }
  return ago ? `${t("reel.library.note.viewed", "Dekha")} — ${ago}` : t("reel.library.note.viewed", "Dekha");
}

/**
 * The number on each Meri List pill — and on the doors the dashboard and the
 * closing card offer.
 *
 * It costs more than the four bare `count()`s it replaced, because those were
 * counting a different thing from what the lane could open: the activity rows,
 * before visibility, blocks and the gender floor had their say. Ids, then one
 * eligibility pass per lane, all of it indexed and no profile row built — the
 * page-load price of a number that is true.
 */
export async function getLaneCounts(userId: string): Promise<ReelLaneCounts> {
  const [blockedUserIds, viewer] = await Promise.all([
    getBlockedUserIds(userId),
    prisma.profile.findUnique({
      where: { userId },
      select: { gender: true, partnerPreferences: { select: { lookingForGender: true } } },
    }),
  ]);

  const counts = await Promise.all(
    REEL_LANES.map(async (lane) => {
      const { ids } = await laneProfileIds(userId, lane);
      const eligible = await eligibleLaneIds(ids, lane, blockedUserIds, viewer);
      return [lane, eligible.size] as const;
    }),
  );
  return Object.fromEntries(counts) as ReelLaneCounts;
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
  // rules — ids only, so the ordering below stays the lane's own. Same
  // eligibility call the pill count makes, plus this screen's filters.
  const eligibleIds = await eligibleLaneIds(ids, lane, blockedUserIds, viewer, filterWhere(filters));
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

  // `allowMissions: false` — a history lane never spends one of the day's two.
  // The card's own `matchId` comes from `buildCards` (D-92b); this function
  // used to run a second match query of its own, which is one more place the
  // answer could drift from the photo gate's.
  const built = await buildCards(userId, viewer, sources, t, undefined, false);

  const cards: ReelLibraryCard[] = built.map((card) => ({
    ...card,
    laneNote: noteFor(lane, card.id, at, meta, t),
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
