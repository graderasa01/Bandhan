import "server-only";
import { prisma } from "@/lib/db/prisma";

/**
 * Phase F — the "Shaadi Ready" badge.
 *
 * ## Earned by attending, not by paying and not by claiming
 *
 * This is the only badge in the app that cannot be bought. `awardBadge` is
 * called from exactly one place — an event completing, for participants whose
 * `CircleEntry` reached ATTENDED. That single call site is the whole integrity
 * story: if the badge could be granted anywhere else it would immediately
 * become another thing to sell, and its only value is that it isn't.
 *
 * ## Why it expires
 *
 * 30 days. A permanent badge starts lying the moment someone gets engaged
 * elsewhere and stops logging in — and a badge that can lie is strictly worse
 * than no badge, because every other profile's honest signal gets discounted
 * along with it. Re-earning it means showing up again, which is exactly the
 * behaviour the feature exists to produce.
 *
 * ## Why ghosting suspends it
 *
 * Without a penalty, the Circle decays into the normal app within a month:
 * showing up, collecting five introductions, and answering none of them would
 * cost nothing. Suspension is deliberately *not* deletion — the user keeps
 * their `eventsAttended` history and the badge returns on its own. The message
 * is "reply to people", not "you are banned".
 */

export const BADGE_VALID_DAYS = 30;
export const BADGE_SUSPEND_DAYS = 14;
/** How long a connected pair has to say something before it counts as ghosting. */
export const GHOSTING_GRACE_HOURS = 48;

const DAY_MS = 86_400_000;

export interface BadgeState {
  active: boolean;
  earnedAt: Date | null;
  expiresAt: Date | null;
  suspendedUntil: Date | null;
  suspendReason: string | null;
  eventsAttended: number;
}

export const NO_BADGE: BadgeState = {
  active: false,
  earnedAt: null,
  expiresAt: null,
  suspendedUntil: null,
  suspendReason: null,
  eventsAttended: 0,
};

export async function getBadgeState(userId: string, now = new Date()): Promise<BadgeState> {
  const row = await prisma.seriousBadge.findUnique({ where: { userId } });
  if (!row) return NO_BADGE;

  const suspended = row.suspendedUntil !== null && row.suspendedUntil > now;
  return {
    active: row.expiresAt > now && !suspended,
    earnedAt: row.earnedAt,
    expiresAt: row.expiresAt,
    suspendedUntil: row.suspendedUntil,
    suspendReason: row.suspendReason,
    eventsAttended: row.eventsAttended,
  };
}

/** Bulk variant for list surfaces (reel cards, circle roster) — one query, not N. */
export async function getActiveBadgeUserIds(userIds: string[], now = new Date()): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await prisma.seriousBadge.findMany({
    where: {
      userId: { in: userIds },
      expiresAt: { gt: now },
      OR: [{ suspendedUntil: null }, { suspendedUntil: { lte: now } }],
    },
    select: { userId: true },
  });
  return new Set(rows.map((r) => r.userId));
}

/**
 * Grants (or renews) the badge. Clears any live suspension — a user who served
 * their two weeks and then turned up again has demonstrably answered the
 * complaint, and carrying the penalty past that would make it a punishment
 * rather than a correction.
 */
export async function awardBadge(userId: string, now = new Date()): Promise<void> {
  const expiresAt = new Date(now.getTime() + BADGE_VALID_DAYS * DAY_MS);
  await prisma.seriousBadge.upsert({
    where: { userId },
    create: { userId, earnedAt: now, expiresAt, eventsAttended: 1 },
    update: {
      earnedAt: now,
      expiresAt,
      suspendedUntil: null,
      suspendReason: null,
      eventsAttended: { increment: 1 },
    },
  });
}

/**
 * Darkens the badge for `BADGE_SUSPEND_DAYS`. No-op if the user never had one
 * — there is nothing to take away from someone who never attended, and
 * creating a suspended badge row for them would show a penalty for a rule they
 * were never subject to.
 */
export async function suspendBadge(userId: string, reason: string, now = new Date()): Promise<void> {
  const existing = await prisma.seriousBadge.findUnique({ where: { userId }, select: { userId: true } });
  if (!existing) return;

  await prisma.seriousBadge.update({
    where: { userId },
    data: {
      suspendedUntil: new Date(now.getTime() + BADGE_SUSPEND_DAYS * DAY_MS),
      suspendReason: reason,
    },
  });
}
