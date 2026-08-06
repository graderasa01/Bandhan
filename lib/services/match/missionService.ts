import { prisma } from "@/lib/db/prisma";
import { todayUTCDate } from "./reelGenerator";

/**
 * The daily-mission decision — Phase G9.
 *
 * Until 2026-08-06 this lived only inside `lib/data/reelData.ts`: a private
 * counter that picked "the first two candidates that clear the floor" while
 * building reel cards. That was fine when the reel was the only screen that
 * showed it. Grio's deck (`lib/services/grio/deck.ts`) now wants to say the
 * same thing — and a second, independently-written copy of "score >= 85, cap
 * at 2" is exactly the kind of drift doc 10 §7.1 warns about: the day one
 * surface's count disagrees with the other's, a user notices, and the whole
 * mechanic reads as scripted rather than real.
 *
 * So the decision moved here, and both callers read it from the same place:
 *
 *   - `reelData.ts` already has the day's full candidate list in memory (it
 *     just fetched it for the cards themselves), so it calls
 *     `selectMissionEligible` directly against that list — no extra query.
 *   - `deck.ts` has not fetched anything reel-shaped, so it calls
 *     `getTodayMissionEligible`, a read-only, no-profile-join query that
 *     costs one indexed read and creates nothing.
 *
 * Neither the floor nor the cap changed. This is a "read from one place"
 * refactor, not a loosening.
 */

/** A card must score at least this to earn a mission prompt. Doc 10 §7.1. */
export const MISSION_SCORE_FLOOR = 85;
/** Per day, per user, across every surface that can show one — not per screen. Two reads as "AI noticed something"; five reads as a nag. */
export const MISSION_MAX_PER_DAY = 2;

/**
 * Which of today's rank-ordered candidates earn a mission prompt.
 *
 * Callers must already have their candidates in rank order (best-scored
 * first) — this does not sort. Both real callers already hold a
 * `DailyReelProfile.rank`-ordered list; re-sorting here would be a second
 * place that order could disagree with the one actually shown on screen.
 */
export function selectMissionEligible<T extends { finalScore: number }>(rankedCandidates: T[]): T[] {
  const eligible: T[] = [];
  for (const c of rankedCandidates) {
    if (eligible.length >= MISSION_MAX_PER_DAY) break;
    if (Math.round(c.finalScore) >= MISSION_SCORE_FLOOR) eligible.push(c);
  }
  return eligible;
}

/**
 * Today's mission-eligible scores, for a caller that has not otherwise
 * fetched the reel.
 *
 * Deliberately `findUnique`, never `getOrCreateTodayReel` — the same
 * discipline `lib/services/grio/context.ts` already applies to its own reel
 * signal (see that file's header): reading whether a mission exists must
 * never be the thing that generates a day's reel, with its AI-explanation
 * calls, just because someone opened a chat panel. And deliberately no
 * `profile` include — the caller only needs the score, not the candidate.
 */
export async function getTodayMissionEligible(userId: string): Promise<{ finalScore: number }[]> {
  const reel = await prisma.dailyReel.findUnique({
    where: { userId_reelDate: { userId, reelDate: todayUTCDate() } },
    select: { candidates: { select: { finalScore: true }, orderBy: { rank: "asc" } } },
  });
  return selectMissionEligible(reel?.candidates ?? []);
}

/** The one sentence a mission ever leads with — every surface uses this exact wording, never its own paraphrase. */
export function buildMissionHeadline(compatibility: number): string {
  return `${compatibility}% match — aaj ke sabse strong rishton me se ek`;
}
