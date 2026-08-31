import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ageFromDate } from "@/lib/services/match/age";
import { canViewerUnlockPhotos, photoUnlockedFor } from "@/lib/services/plans/photoAccess";
import {
  RISHTA_STAGE_LABEL,
  RISHTA_OUTCOME_LABEL,
  deriveStage,
  effectiveStage,
  stageRank,
} from "@/lib/profile/rishtaStages";
import { nextStepFor, type RishtaNextStep } from "@/lib/profile/rishtaNextStep";
import type { RishtaOutcome, RishtaStage } from "@prisma/client";

/**
 * Every rishta the user has, in one read.
 *
 * ## Why this exists next to `getRishtaSummary` instead of calling it
 *
 * `getRishtaSummary` is eight indexed queries for one person, which is right
 * for the Room and catastrophic for a board: twenty rishtey would be a hundred
 * and sixty round trips to render one screen. So this asks the same questions
 * in bulk — nine queries total, no matter how many rishtey — and hands the
 * counts to the *same* pure functions (`deriveStage`, `effectiveStage`,
 * `nextStepFor`).
 *
 * That last part is the whole design. The two paths must never be able to
 * disagree about what stage a rishta is at, and the only way to guarantee that
 * is for neither of them to contain the rule. They fetch; `lib/profile/*`
 * decides.
 *
 * ## What counts as a rishta
 *
 * Exactly what `getRishtaSummary` calls `hasAnything`: an interest either way,
 * a match, a journey row, or a question asked. Deliberately *not* a shortlist —
 * saving someone is a private bookmark, and a board that filled up with people
 * who have no idea you exist would bury the handful that are real.
 *
 * ## The photo rule is not re-derived here
 *
 * Sixth call site of `photoUnlockedFor`, and it asks rather than re-stating the
 * condition — see `photoAccess.ts` for why that file exists at all.
 */

export interface RishtaBoardEntry {
  otherUserId: string;
  profileId: string | null;
  name: string;
  age: number | null;
  city: string | null;
  photoUrl: string | null;
  verified: boolean;
  trustScore: number;

  matchId: string | null;
  stage: RishtaStage;
  stageLabel: string;
  /** True when the user said so, false when it was read off events. */
  stageConfirmed: boolean;
  outcome: RishtaOutcome | null;
  outcomeLabel: string | null;

  nextStep: RishtaNextStep;

  totalMessages: number;
  unresolvedTopics: number;
  familyInvolved: boolean;
  lastInteractionAt: string | null;
}

/** Sections the board renders, in this order. */
export type RishtaBucket = "you" | "live" | "closed";

export const RISHTA_BUCKET_LABEL: Record<RishtaBucket, string> = {
  you: "Aap par hai",
  live: "Chal rahe hain",
  closed: "Poore ho chuke",
};

export const RISHTA_BUCKET_NOTE: Record<RishtaBucket, string> = {
  you: "In rishton mein agla kadam aapko uthana hai.",
  live: "Ye chal rahe hain — abhi aapko kuch karna nahi hai.",
  closed: "Ye khatam ho chuke hain. Kaise khatam hue, wo yahin darj hai.",
};

/**
 * Which section a rishta belongs in.
 *
 * Three buckets and not ten, because the question the board answers is "kis par
 * mera kaam baaki hai" — and a screen that split that answer across ten stage
 * headings would make the user do the sorting the app was supposed to do.
 * The stage still shows, on the card, where it belongs.
 */
export function bucketOf(entry: RishtaBoardEntry): RishtaBucket {
  if (entry.stage === "CLOSED") return "closed";
  return entry.nextStep.who === "you" ? "you" : "live";
}

/**
 * Within a bucket: late things first, then the rishta that has come furthest,
 * then the one that moved most recently.
 *
 * Furthest-first rather than newest-first is the one non-obvious call. A rishta
 * at MET is worth more of the user's attention than one at INTERESTED no matter
 * which had a message this morning, and a board sorted purely by recency would
 * put a stranger's new interest above a family meeting.
 */
function compareEntries(a: RishtaBoardEntry, b: RishtaBoardEntry): number {
  if (a.nextStep.overdue !== b.nextStep.overdue) return a.nextStep.overdue ? -1 : 1;
  const rank = stageRank(b.stage) - stageRank(a.stage);
  if (rank !== 0) return rank;
  const at = a.lastInteractionAt ? Date.parse(a.lastInteractionAt) : 0;
  const bt = b.lastInteractionAt ? Date.parse(b.lastInteractionAt) : 0;
  return bt - at;
}

export interface RishtaBoard {
  buckets: { bucket: RishtaBucket; label: string; note: string; entries: RishtaBoardEntry[] }[];
  total: number;
  /** How many need the user. Rendered as the one number at the top. */
  needsYou: number;
}

const PROFILE_SELECT = {
  id: true,
  userId: true,
  displayName: true,
  dateOfBirth: true,
  currentCity: true,
  trustScore: true,
  photos: { where: { isPrimary: true, deletedAt: null }, take: 1, select: { fileUrl: true, verificationStatus: true } },
} as const;

export async function listRishtey(userId: string, now: Date = new Date()): Promise<RishtaBoard> {
  // A withdrawn interest is not a rishta. Same filter `shortlistData` uses, and
  // the same one `loadSignals` uses — the three have to agree or the board and
  // the Room will show different stages for the same person.
  const liveInterest = { status: { not: "WITHDRAWN" } } as const;

  const [sent, received, matches, journeys, questions, famShortlists, famNotes, canUnlockAll] =
    await Promise.all([
      prisma.interest.findMany({
        where: { fromUserId: userId, ...liveInterest },
        select: { toUserId: true, createdAt: true },
      }),
      prisma.interest.findMany({
        where: { toUserId: userId, ...liveInterest },
        select: { fromUserId: true, createdAt: true },
      }),
      prisma.match.findMany({
        where: { OR: [{ userAId: userId }, { userBId: userId }] },
        select: { id: true, userAId: true, userBId: true, createdAt: true },
      }),
      prisma.rishtaJourney.findMany({
        where: { userId },
        select: {
          otherUserId: true,
          confirmedStage: true,
          outcome: true,
          topics: { where: { resolved: false }, select: { id: true } },
          meetings: { select: { scheduledFor: true, happenedAt: true } },
        },
      }),
      prisma.profileQuestion.findMany({
        where: { OR: [{ fromUserId: userId }, { toUserId: userId }] },
        select: { fromUserId: true, toUserId: true },
      }),
      prisma.shortlist.findMany({
        where: { userId, addedByFamilyMemberId: { not: null } },
        select: { targetProfile: { select: { userId: true } } },
      }),
      prisma.familyNote.findMany({
        where: { familyMember: { ownerUserId: userId } },
        select: { targetProfile: { select: { userId: true } } },
      }),
      canViewerUnlockPhotos(userId),
    ]);

  const sentTo = new Set(sent.map((i) => i.toUserId));
  const receivedFrom = new Set(received.map((i) => i.fromUserId));
  const matchByOther = new Map<string, { id: string; createdAt: Date }>();
  for (const m of matches) {
    const other = m.userAId === userId ? m.userBId : m.userAId;
    matchByOther.set(other, { id: m.id, createdAt: m.createdAt });
  }
  const familyTouched = new Set(
    [...famShortlists, ...famNotes].map((r) => r.targetProfile.userId),
  );

  const others = new Set<string>([
    ...sentTo,
    ...receivedFrom,
    ...matchByOther.keys(),
    ...journeys.map((j) => j.otherUserId),
    ...questions.map((q) => (q.fromUserId === userId ? q.toUserId : q.fromUserId)),
  ]);
  others.delete(userId);
  if (others.size === 0) return { buckets: [], total: 0, needsYou: 0 };

  // Message counts for every match at once. `groupBy` on (matchId, senderId)
  // gives both directions and both last-spoke times in a single query — the
  // per-pair version of this is four queries each.
  const matchIds = [...matchByOther.values()].map((m) => m.id);
  const [msgRows, profiles] = await Promise.all([
    matchIds.length > 0
      ? prisma.message.groupBy({
          by: ["matchId", "senderId"],
          where: { matchId: { in: matchIds } },
          _count: { _all: true },
          _max: { createdAt: true },
        })
      : Promise.resolve([] as { matchId: string; senderId: string; _count: { _all: number }; _max: { createdAt: Date | null } }[]),
    prisma.profile.findMany({ where: { userId: { in: [...others] } }, select: PROFILE_SELECT }),
  ]);

  type Msg = { fromUser: number; fromOther: number; lastAt: Date | null; lastSenderId: string | null };
  const msgByMatch = new Map<string, Msg>();
  for (const row of msgRows) {
    const cur = msgByMatch.get(row.matchId) ?? { fromUser: 0, fromOther: 0, lastAt: null, lastSenderId: null };
    const count = row._count._all;
    if (row.senderId === userId) cur.fromUser += count;
    else cur.fromOther += count;
    const at = row._max.createdAt;
    if (at && (!cur.lastAt || at > cur.lastAt)) {
      cur.lastAt = at;
      cur.lastSenderId = row.senderId;
    }
    msgByMatch.set(row.matchId, cur);
  }

  const profileByUser = new Map(profiles.map((p) => [p.userId, p]));
  const journeyByOther = new Map(journeys.map((j) => [j.otherUserId, j]));

  const entries: RishtaBoardEntry[] = [];
  for (const otherUserId of others) {
    const profile = profileByUser.get(otherUserId);
    const match = matchByOther.get(otherUserId) ?? null;
    const journey = journeyByOther.get(otherUserId) ?? null;
    const msg = match ? msgByMatch.get(match.id) : undefined;

    const interestSent = sentTo.has(otherUserId);
    const interestReceived = receivedFrom.has(otherUserId);
    const matched = match !== null;
    const messagesFromUser = msg?.fromUser ?? 0;
    const messagesFromOther = msg?.fromOther ?? 0;

    const derived = deriveStage({
      interestSent,
      interestReceived,
      matched,
      messagesFromUser,
      messagesFromOther,
      familyTouched: familyTouched.has(otherUserId),
    });
    const stage = effectiveStage(derived, journey?.confirmedStage ?? null);
    const outcome = stage === "CLOSED" ? (journey?.outcome ?? null) : null;

    // No message yet? Then the last thing that happened is the match itself.
    // Without this, a freshly matched pair reads as "0 din" forever and the
    // "nobody has spoken in a while" nudge never fires.
    const lastAt = msg?.lastAt ?? match?.createdAt ?? null;
    const meetings = journey?.meetings ?? [];
    const photo = profile?.photos[0];
    const photoOpen = photoUnlockedFor({ matched, viewerCanUnlockAll: canUnlockAll });

    const base = {
      otherUserId,
      profileId: profile?.id ?? null,
      name: profile?.displayName?.trim() || "Profile",
      age: profile ? ageFromDate(profile.dateOfBirth) : null,
      city: profile?.currentCity ?? null,
      // Same rule as the reel and the shortlist: a locked card must not even
      // carry the address, because the URL itself is the secret.
      photoUrl: photoOpen ? (photo?.fileUrl ?? null) : null,
      verified: photo?.verificationStatus === "APPROVED",
      trustScore: profile?.trustScore ?? 0,
      matchId: match?.id ?? null,
      stage,
      stageLabel: stage === "CLOSED" && outcome ? RISHTA_OUTCOME_LABEL[outcome] : RISHTA_STAGE_LABEL[stage],
      stageConfirmed:
        journey?.confirmedStage != null && stageRank(journey.confirmedStage) >= stageRank(derived),
      outcome,
      outcomeLabel: outcome ? RISHTA_OUTCOME_LABEL[outcome] : null,
      totalMessages: messagesFromUser + messagesFromOther,
      unresolvedTopics: journey?.topics.length ?? 0,
      familyInvolved:
        familyTouched.has(otherUserId) || stageRank(stage) >= stageRank("FAMILY_INVOLVED"),
      lastInteractionAt: lastAt?.toISOString() ?? null,
    };

    entries.push({
      ...base,
      nextStep: nextStepFor(
        {
          stage,
          outcome,
          interestSent,
          interestReceived,
          matched,
          totalMessages: base.totalMessages,
          awaitingReplyFrom:
            msg?.lastSenderId == null ? null : msg.lastSenderId === userId ? "other" : "user",
          unresolvedTopics: base.unresolvedTopics,
          hasUpcomingMeeting: meetings.some((m) => !m.happenedAt && m.scheduledFor),
          hasPastMeeting: meetings.some((m) => m.happenedAt),
          familyInvolved: base.familyInvolved,
          lastInteractionAt: base.lastInteractionAt,
        },
        now,
      ),
    });
  }

  const order: RishtaBucket[] = ["you", "live", "closed"];
  const grouped = new Map<RishtaBucket, RishtaBoardEntry[]>(order.map((b) => [b, []]));
  for (const e of entries) grouped.get(bucketOf(e))!.push(e);
  for (const list of grouped.values()) list.sort(compareEntries);

  return {
    buckets: order
      .filter((b) => grouped.get(b)!.length > 0)
      .map((b) => ({
        bucket: b,
        label: RISHTA_BUCKET_LABEL[b],
        note: RISHTA_BUCKET_NOTE[b],
        entries: grouped.get(b)!,
      })),
    total: entries.length,
    needsYou: grouped.get("you")!.length,
  };
}
