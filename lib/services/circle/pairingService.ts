import "server-only";
import { prisma } from "@/lib/db/prisma";
import { PROFILE_FULL_INCLUDE } from "@/lib/services/profile/profileInclude";
import { loadMatchSignals, scoreCandidates, type MatchSignals } from "@/lib/services/match/pipeline";
import { describeSochFit } from "@/lib/services/match/sochFit";
import { ageFromDate } from "@/lib/services/match/age";
import type { ProfileWithSubTables } from "@/lib/services/profile/completionService";

/**
 * Phase F — who gets put in front of whom, once the roster is locked.
 *
 * ## Five, and mutual
 *
 * Each participant sees at most `PAIRS_PER_USER` people, and every pairing is
 * visible from *both* sides simultaneously. That is two decisions:
 *
 * - **Five, not fifty.** The reel already exists for volume. An event whose
 *   value proposition is "everyone here is serious" is destroyed by infinite
 *   scroll — with fifty cards nobody is memorable and the two hours produce
 *   nothing. Scarcity is the product.
 * - **Mutual, not one-way.** Elsewhere in the app discovery is asymmetric (you
 *   swipe, they never know). Here both sides opted into the same room at the
 *   same hour, so showing each side to the other costs no privacy that entry
 *   didn't already concede — and it is the only way "dono ek dusre ko dekh
 *   sakte hain" can be true.
 *
 * ## Why greedy over the global ranking
 *
 * Pairs are scored globally, sorted once, then taken top-down while both
 * people still have a free slot. This is not a maximum-weight matching, and
 * deliberately so: an optimal matching would hand someone their 4th-best
 * partner to raise a stranger's score, which is impossible to explain to the
 * user whose card got worse. Greedy is explainable — "you got the best
 * available people who also had room for you" — and explainable beats optimal
 * in a product where the output is shown to both parties.
 *
 * `rank` is the pair's position in that global sort, so `rank = 1` is the
 * event's single best-scoring pair — the "sabse achhi jodi" prize.
 */

export const PAIRS_PER_USER = 5;

/**
 * Below this, we would be introducing people the pipeline itself thinks are a
 * poor fit. Lowered 40→30 (2026-08-04) alongside `scorePreferenceMatch`
 * widening to score real religion/caste/manglik preferences — a stated
 * preference can now legitimately pull a pair's score down further than
 * before, and an empty room is a worse outcome than an honest 30.
 */
export const MIN_PAIR_SCORE = 30;

type Rosterer = { userId: string; profile: ProfileWithSubTables };

/**
 * Hard filters, checked in *both* directions before a pair may exist.
 *
 * The reel applies these in SQL via `getCandidates`; here the candidate set is
 * the locked roster rather than a query, so the same rules have to be applied
 * in TS. Doing it one-directionally would be the bug that lets a 45-year-old
 * be shown to someone whose stated range stops at 30 — precisely the failure
 * that would end the feature's credibility on day one.
 */
function passesHardFilters(viewer: ProfileWithSubTables, candidate: ProfileWithSubTables): boolean {
  const prefs = viewer.partnerPreferences;
  if (prefs?.lookingForGender && candidate.gender !== prefs.lookingForGender) return false;

  const age = ageFromDate(candidate.dateOfBirth);
  if (age !== null) {
    if (prefs?.minAge != null && age < prefs.minAge) return false;
    if (prefs?.maxAge != null && age > prefs.maxAge) return false;
  }
  return true;
}

export interface ComputedPair {
  userAId: string;
  userBId: string;
  score: number;
  /** Verifiable "why", or null when only the inferred dimensions contributed. */
  sochReason: string | null;
}

/**
 * Pure — no DB, no AI. Takes the roster and returns the pairs to write.
 * Exported separately from `generatePairings` so the greedy rule is testable
 * without standing up an event.
 */
export function computePairs(
  roster: Rosterer[],
  blockedPairs: Set<string>,
  signals: MatchSignals = {},
): ComputedPair[] {
  // Directional scores first: `scoreCandidates` answers "how good is X for
  // viewer V", which is not symmetric — V's preferences are baked in. One call
  // per viewer, then averaged, so a pair's score reflects both people wanting
  // it rather than one person's filters winning.
  const directional = new Map<string, number>();
  // The soch breakdown is symmetric (both agreement counts and the dimension
  // distance are), so whichever direction is seen first is the pair's reason —
  // no need to reconcile two versions of the same counts.
  const reasons = new Map<string, string | null>();

  for (const viewer of roster) {
    const candidates = roster
      .filter((r) => r.userId !== viewer.userId && passesHardFilters(viewer.profile, r.profile))
      .map((r) => r.profile);
    if (candidates.length === 0) continue;

    for (const scored of scoreCandidates(viewer.profile, candidates, signals)) {
      const otherId = scored.profile.userId;
      directional.set(`${viewer.userId}|${otherId}`, scored.finalScore);

      const [x, y] = viewer.userId < otherId ? [viewer.userId, otherId] : [otherId, viewer.userId];
      const pairKey = `${x}|${y}`;
      if (!reasons.has(pairKey)) {
        reasons.set(pairKey, scored.sochFit ? describeSochFit(scored.sochFit) : null);
      }
    }
  }

  const pairs: ComputedPair[] = [];
  const seen = new Set<string>();

  for (const a of roster) {
    for (const b of roster) {
      if (a.userId === b.userId) continue;
      const [userAId, userBId] = a.userId < b.userId ? [a.userId, b.userId] : [b.userId, a.userId];
      const key = `${userAId}|${userBId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (blockedPairs.has(key)) continue;

      // Both directions must survive the hard filters *and* have produced a
      // score. A one-sided score means the other person's preferences ruled
      // this out, which is a no, not a lower number.
      const ab = directional.get(`${userAId}|${userBId}`);
      const ba = directional.get(`${userBId}|${userAId}`);
      if (ab === undefined || ba === undefined) continue;

      const score = Math.round((ab + ba) / 2);
      if (score < MIN_PAIR_SCORE) continue;
      pairs.push({ userAId, userBId, score, sochReason: reasons.get(key) ?? null });
    }
  }

  pairs.sort((x, y) => y.score - x.score || (x.userAId < y.userAId ? -1 : 1));

  const slots = new Map<string, number>();
  const taken: ComputedPair[] = [];
  const takenKeys = new Set<string>();

  for (const pair of pairs) {
    const usedA = slots.get(pair.userAId) ?? 0;
    const usedB = slots.get(pair.userBId) ?? 0;
    if (usedA >= PAIRS_PER_USER || usedB >= PAIRS_PER_USER) continue;
    slots.set(pair.userAId, usedA + 1);
    slots.set(pair.userBId, usedB + 1);
    taken.push(pair);
    takenKeys.add(`${pair.userAId}|${pair.userBId}`);
  }

  // Nobody who turned up leaves with an empty room.
  //
  // Pure greedy has a real failure mode here: someone whose best pair scores
  // below everyone else's fifth can be squeezed out entirely, and "you came on
  // a Sunday night and we gave you nobody" is the single worst outcome this
  // feature can produce — attendance is the exact behaviour it exists to
  // reward. So after the main pass, anyone left at zero gets their best
  // remaining option among people who still have room.
  //
  // `MIN_PAIR_SCORE` is deliberately NOT relaxed for this pass. Introducing
  // two people the pipeline thinks are a poor fit is worse than the honest
  // empty state — the backfill is for people the ranking overlooked, not for
  // manufacturing a match that shouldn't exist.
  for (const person of roster) {
    if ((slots.get(person.userId) ?? 0) > 0) continue;

    const bestWithCap = (cap: number) =>
      pairs.find((p) => {
        if (p.userAId !== person.userId && p.userBId !== person.userId) return false;
        if (takenKeys.has(`${p.userAId}|${p.userBId}`)) return false;
        const other = p.userAId === person.userId ? p.userBId : p.userAId;
        return (slots.get(other) ?? 0) < cap;
      });

    // Prefer a partner who still has room; only if literally everyone viable is
    // full does the rescue push one person to PAIRS_PER_USER + 1. On a tight
    // roster every slot can legitimately be taken (12 people × 5 = 60 slot-ends
    // = 30 pairs), and in that state a strict cap means somebody who showed up
    // gets nothing. A sixth card for one person is a rounding error; a zero for
    // another is the thing that stops them coming back.
    const rescue = bestWithCap(PAIRS_PER_USER) ?? bestWithCap(PAIRS_PER_USER + 1);
    if (!rescue) continue;

    slots.set(rescue.userAId, (slots.get(rescue.userAId) ?? 0) + 1);
    slots.set(rescue.userBId, (slots.get(rescue.userBId) ?? 0) + 1);
    taken.push(rescue);
    takenKeys.add(`${rescue.userAId}|${rescue.userBId}`);
  }

  // Re-sorted so `rank` still reflects score order after the backfill — rank 1
  // must remain the event's genuinely best pair, since that is what the
  // 7-day-window prize is awarded on.
  return taken.sort((x, y) => y.score - x.score || (x.userAId < y.userAId ? -1 : 1));
}

/**
 * Computes and persists this event's pairings. Called once, from the roster
 * lock — never on read. `createMany` with `skipDuplicates` plus the
 * `(eventId, userAId, userBId)` unique constraint makes a concurrent second
 * call a no-op rather than a double set of cards.
 */
export async function generatePairings(eventId: string): Promise<number> {
  const entries = await prisma.circleEntry.findMany({
    where: { eventId, status: "CONFIRMED" },
    select: { userId: true },
  });
  if (entries.length < 2) return 0;

  const userIds = entries.map((e) => e.userId);

  const [profiles, blocks] = await Promise.all([
    prisma.profile.findMany({
      where: { userId: { in: userIds }, deletedAt: null },
      include: PROFILE_FULL_INCLUDE,
    }),
    prisma.userBlock.findMany({
      where: { OR: [{ blockerUserId: { in: userIds } }, { blockedUserId: { in: userIds } }] },
      select: { blockerUserId: true, blockedUserId: true },
    }),
  ]);

  const roster: Rosterer[] = profiles.map((p) => ({ userId: p.userId, profile: p }));

  // Blocks are symmetric for discovery purposes — same rule `getCandidates`
  // applies in the reel. Normalised to the same ordered key the pairs use.
  const blockedPairs = new Set<string>();
  for (const b of blocks) {
    const [x, y] =
      b.blockerUserId < b.blockedUserId
        ? [b.blockerUserId, b.blockedUserId]
        : [b.blockedUserId, b.blockerUserId];
    blockedPairs.add(`${x}|${y}`);
  }

  // Poll answers matter more here than anywhere else in the app: a Circle
  // roster is people who all showed up on the same evening, so "who thinks
  // like me" is most of what is left to distinguish them once the hard
  // filters have run.
  const signals = await loadMatchSignals(profiles);

  const pairs = computePairs(roster, blockedPairs, signals);
  if (pairs.length === 0) return 0;

  const result = await prisma.circleConnection.createMany({
    data: pairs.map((p, i) => ({
      eventId,
      userAId: p.userAId,
      userBId: p.userBId,
      score: p.score,
      rank: i + 1,
      sochReason: p.sochReason,
    })),
    skipDuplicates: true,
  });

  return result.count;
}
