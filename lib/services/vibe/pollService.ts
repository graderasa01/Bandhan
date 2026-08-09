import "server-only";
import { prisma } from "@/lib/db/prisma";
import { todayUTCDate } from "@/lib/services/match/reelGenerator";
import { ageFromDate } from "@/lib/services/match/age";
import { isBlockedEitherWay } from "@/lib/services/safety/blockService";
import { deriveVibeBadge, type VibeBadgeKey } from "@/lib/vibe/vibeBadges";
import { THEME_TAGLINE, themeForDate } from "@/lib/vibe/pollThemes";
import { getOrCreateBlurDerivative, BLIND_VIBE_UNLOCK_THRESHOLD } from "@/lib/services/media/blurDerivative";
import { noopT, type Translate } from "@/lib/i18n/translate";
import type { Poll } from "@prisma/client";

/**
 * Phase C's Mindset Arena — "aaj ka poll" (10_engagement_and_monetization_
 * architecture.md §3.7's `getOrCreateTodayPoll()`). No scheduler: the pool of
 * seeded polls (prisma/seed.ts) sits with `publishedOn = null` until the
 * first request of the day picks one and stamps today's date on it — same
 * lazy-daily pattern `getOrCreateTodayReel` already uses.
 */

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002";
}

/**
 * The next never-shown poll *in today's theme* (see lib/vibe/pollThemes.ts).
 *
 * Laps are now per-theme rather than global. That matters more than it looks:
 * with one shared pool, a bank of N polls repeated every N days, so a user saw
 * the same question again within a month. Split seven ways, each theme only
 * comes round once a week, so a theme holding ~9 polls does not repeat for
 * about two months — which is what makes the accumulated `PollVote` history
 * dense enough for `sochFit` to mean something.
 */
async function pickPoolPoll(now: Date): Promise<{ id: string }> {
  const theme = themeForDate(now);

  const next = await prisma.poll.findFirst({
    where: { publishedOn: null, theme, retiredAt: null },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  if (next) return next;

  // This theme's lap is done — restart just this theme rather than requiring an
  // ever-growing bank. Safe to clear: `PollVote` rows key off `pollId`, and
  // `getVibeStreak` reads `PollVote.votedAt`, not this field, so no vote or
  // streak history is lost. Scoped to the theme so resetting Shukravaar never
  // re-opens Somvaar's already-shown questions.
  const reset = await prisma.poll.updateMany({
    where: { theme, retiredAt: null },
    data: { publishedOn: null },
  });
  if (reset.count > 0) {
    const restarted = await prisma.poll.findFirst({
      where: { theme, retiredAt: null },
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    });
    if (restarted) return restarted;
  }

  // The theme is empty entirely — a content gap, not a user-facing failure.
  // Fall back to any poll at all so the Arena still has something today, and
  // say so loudly enough that someone notices in the logs.
  console.error(`[vibe] no polls seeded for theme ${theme} — falling back to any poll.`);
  const anyPoll =
    (await prisma.poll.findFirst({
      where: { publishedOn: null, retiredAt: null },
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    })) ??
    (await prisma.poll.findFirst({ where: { retiredAt: null }, orderBy: { sortOrder: "asc" }, select: { id: true } }));
  if (!anyPoll) throw new Error("No polls seeded — run prisma/seed.ts.");
  return anyPoll;
}

export async function getOrCreateTodayPoll(now = new Date()): Promise<Poll> {
  const periodKey = dateKey(todayUTCDate());

  const existing = await prisma.poll.findUnique({ where: { publishedOn: periodKey } });
  if (existing) return existing;

  const candidate = await pickPoolPoll(now);

  try {
    return await prisma.poll.update({ where: { id: candidate.id }, data: { publishedOn: periodKey } });
  } catch (err) {
    // Two requests can both see no poll published for today and both reach
    // here — the loser just re-reads what the winner published, same
    // catch-P2002-and-refetch shape as `getOrCreateTodayReel`.
    if (!isUniqueViolation(err)) throw err;
    const winner = await prisma.poll.findUnique({ where: { publishedOn: periodKey } });
    if (!winner) throw err;
    return winner;
  }
}

export interface VoteResult {
  ok: boolean;
  message?: string;
  optionIndex?: number;
}

/**
 * Locked in on first cast — a repeat vote is a harmless no-op (`update: {}`),
 * not a way to change your answer after seeing the running results. C7's
 * Soch Board makes these public, so "what did you actually think" has to
 * stay the honest first answer.
 */
export async function castVote(
  userId: string,
  pollId: string,
  optionIndex: number,
  t: Translate = noopT,
): Promise<VoteResult> {
  const poll = await prisma.poll.findUnique({ where: { id: pollId }, select: { options: true } });
  if (!poll) return { ok: false, message: t("vibe.poll.error.notFound", "Poll nahi mila.") };
  if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= poll.options.length) {
    return { ok: false, message: t("vibe.poll.error.invalidOption", "Ye option valid nahi hai.") };
  }

  const vote = await prisma.pollVote.upsert({
    where: { pollId_userId: { pollId, userId } },
    create: { pollId, userId, optionIndex },
    update: {},
  });

  return { ok: true, optionIndex: vote.optionIndex };
}

export interface PollResultRow {
  optionIndex: number;
  count: number;
  percent: number;
}

export interface SameVoteLead {
  profileId: string;
  displayName: string;
  age: number | null;
  city: string | null;
  /** Phase E — Blind Vibe Zone. Null while below BLIND_VIBE_UNLOCK_THRESHOLD and no derivative exists yet. */
  blindVibe: { revealed: true; photoUrl: string } | { revealed: false; blurredMediaId: string | null };
}

/**
 * C4 — "in logon ne bhi yahi choose kiya". Same trust-by-design default the
 * reel already uses for an un-matched stranger: name/age/city, no photo (that
 * stays locked until a real mutual interest exists — see reelData.ts's own
 * comment on why a URL never ships for a locked card). Opposite-gender only,
 * same as `partnerPreferences.lookingForGender` derivation elsewhere.
 * Excludes anyone already blocked either way, and anyone already sent a
 * POLL_ICEBREAKER note — repeating a lead you already reached out to isn't a
 * new suggestion.
 */
/**
 * Blind Vibe Zone's counter — every poll ever, both sides picking the same
 * option, not just today's. A single lucky match on today's question
 * shouldn't be worth the same as five separate moments of actually thinking
 * alike; counting across history is what makes the number mean something.
 */
async function countSharedVotes(userIdA: string, userIdB: string): Promise<number> {
  const [votesA, votesB] = await Promise.all([
    prisma.pollVote.findMany({ where: { userId: userIdA }, select: { pollId: true, optionIndex: true } }),
    prisma.pollVote.findMany({ where: { userId: userIdB }, select: { pollId: true, optionIndex: true } }),
  ]);
  const byPollA = new Map(votesA.map((v) => [v.pollId, v.optionIndex]));
  return votesB.filter((v) => byPollA.get(v.pollId) === v.optionIndex).length;
}

async function getSameVoteLeads(
  viewerUserId: string,
  pollId: string,
  optionIndex: number,
  limit = 3,
  t: Translate = noopT,
): Promise<SameVoteLead[]> {
  const viewer = await prisma.profile.findUnique({ where: { userId: viewerUserId }, select: { gender: true } });
  const lookingForGender = viewer?.gender === "Ladka" ? "Ladki" : viewer?.gender === "Ladki" ? "Ladka" : undefined;

  const alreadyContacted = await prisma.voiceNote.findMany({
    where: { fromUserId: viewerUserId, context: "POLL_ICEBREAKER" },
    select: { toUserId: true },
  });
  const excludeUserIds = [
    viewerUserId,
    ...alreadyContacted.map((v) => v.toUserId).filter((id): id is string => id !== null),
  ];

  const candidates = await prisma.profile.findMany({
    where: {
      isVisible: true,
      profileStatus: { in: ["SUBMITTED", "VERIFIED"] },
      ...(lookingForGender ? { gender: lookingForGender } : {}),
      userId: { notIn: excludeUserIds },
      user: { pollVotes: { some: { pollId, optionIndex } } },
    },
    select: {
      id: true,
      userId: true,
      displayName: true,
      dateOfBirth: true,
      currentCity: true,
      photos: {
        where: { isPrimary: true, verificationStatus: "APPROVED", deletedAt: null },
        select: { fileUrl: true },
        take: 1,
      },
    },
    orderBy: { trustScore: "desc" },
    take: limit * 3, // headroom for the block-filter pass below
  });

  const leads: SameVoteLead[] = [];
  for (const c of candidates) {
    if (leads.length >= limit) break;
    if (await isBlockedEitherWay(viewerUserId, c.userId)) continue;

    const sharedVotes = await countSharedVotes(viewerUserId, c.userId);
    const blindVibe: SameVoteLead["blindVibe"] =
      sharedVotes >= BLIND_VIBE_UNLOCK_THRESHOLD && c.photos[0]
        ? { revealed: true, photoUrl: c.photos[0].fileUrl }
        : { revealed: false, blurredMediaId: await getOrCreateBlurDerivative(c.userId) };

    leads.push({
      profileId: c.id,
      displayName: c.displayName ?? t("vibe.sameVoteLead.fallbackName", "Profile"),
      age: ageFromDate(c.dateOfBirth),
      city: c.currentCity,
      blindVibe,
    });
  }
  return leads;
}

export interface PollView {
  id: string;
  question: string;
  /** Today's rotation slot — "Shukravaar — jo rishta tod sakta hai". */
  themeTagline: string;
  options: string[];
  votedOptionIndex: number | null;
  /** null until the viewer has voted — results reveal after answering, not before (avoid anchoring the tap). */
  results: PollResultRow[] | null;
  totalVotes: number;
  /** Empty until voted — same reveal-after-answering rule as `results`. */
  sameVoteLeads: SameVoteLead[];
  /** C7 — whether today's vote already carries a voice explanation. */
  hasAnswerNote: boolean;
  /** C7's master toggle — shapes the vote-time disclosure copy (D-61: state the truth, don't bury it). */
  sochBoardVisible: boolean;
}

export async function getTodayPollView(userId: string, t: Translate = noopT): Promise<PollView> {
  const [poll, profile] = await Promise.all([
    getOrCreateTodayPoll(),
    prisma.profile.findUnique({ where: { userId }, select: { sochBoardVisible: true } }),
  ]);
  const sochBoardVisible = profile?.sochBoardVisible ?? true;
  const myVote = await prisma.pollVote.findUnique({ where: { pollId_userId: { pollId: poll.id, userId } } });

  if (!myVote) {
    return {
      id: poll.id,
      question: poll.question,
      themeTagline: THEME_TAGLINE[poll.theme],
      options: poll.options,
      votedOptionIndex: null,
      results: null,
      totalVotes: 0,
      sameVoteLeads: [],
      hasAnswerNote: false,
      sochBoardVisible,
    };
  }

  const [counts, sameVoteLeads] = await Promise.all([
    prisma.pollVote.groupBy({ by: ["optionIndex"], where: { pollId: poll.id }, _count: { _all: true } }),
    getSameVoteLeads(userId, poll.id, myVote.optionIndex, 3, t),
  ]);
  const totalVotes = counts.reduce((sum, c) => sum + c._count._all, 0);
  const results: PollResultRow[] = poll.options.map((_, i) => {
    const count = counts.find((c) => c.optionIndex === i)?._count._all ?? 0;
    return { optionIndex: i, count, percent: totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0 };
  });

  return {
    id: poll.id,
    question: poll.question,
    themeTagline: THEME_TAGLINE[poll.theme],
    options: poll.options,
    votedOptionIndex: myVote.optionIndex,
    results,
    hasAnswerNote: myVote.voiceNoteMediaId !== null,
    sochBoardVisible,
    totalVotes,
    sameVoteLeads,
  };
}

export interface VibeBadgeView {
  key: VibeBadgeKey;
  label: string;
  description: string;
}

/**
 * C5 — one query for every candidate on the reel, never one per card (D-33's
 * "no DB round-trips in the scoring loop" applies here too, even though a
 * badge isn't part of ranking). `reelData.ts` calls this once with every
 * candidate's `userId` and threads the result into `toCard()`.
 */
export async function getVibeBadgesForUsers(userIds: string[]): Promise<Map<string, VibeBadgeView>> {
  if (userIds.length === 0) return new Map();

  const votes = await prisma.pollVote.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, optionIndex: true, votedAt: true, poll: { select: { slug: true } } },
    orderBy: { votedAt: "asc" },
  });

  const byUser = new Map<string, { optionIndex: number; pollSlug: string }[]>();
  for (const v of votes) {
    const list = byUser.get(v.userId) ?? [];
    list.push({ optionIndex: v.optionIndex, pollSlug: v.poll.slug });
    byUser.set(v.userId, list);
  }

  const result = new Map<string, VibeBadgeView>();
  for (const [userId, userVotes] of byUser) {
    const badge = deriveVibeBadge(userVotes);
    if (badge) result.set(userId, badge);
  }
  return result;
}

/**
 * Consecutive calendar days (UTC) this user has cast a poll vote, counting
 * back from today. Derived from `PollVote.votedAt` rather than
 * `Poll.publishedOn` on purpose — the poll pool recycles (see
 * `pickPoolPoll`), but a vote's own timestamp never changes, so the streak
 * survives a rotation restart untouched.
 */
export async function getVibeStreak(userId: string): Promise<number> {
  const votes = await prisma.pollVote.findMany({
    where: { userId },
    select: { votedAt: true },
    orderBy: { votedAt: "desc" },
    take: 120,
  });
  const days = new Set(votes.map((v) => dateKey(v.votedAt)));

  let streak = 0;
  const cursor = todayUTCDate();
  // Today not voted yet doesn't zero the streak — it's still "alive" through
  // yesterday until the day actually ends.
  if (!days.has(dateKey(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  while (days.has(dateKey(cursor))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}
