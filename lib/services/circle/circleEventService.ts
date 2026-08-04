import "server-only";
import { prisma } from "@/lib/db/prisma";
import { upcomingSlots } from "@/lib/circle/schedule";
import { generatePairings } from "./pairingService";
import { awardBadge, suspendBadge } from "./badgeService";
import { createNotice } from "@/lib/services/notice/noticeService";
import type { CircleEvent, CircleEventStatus } from "@prisma/client";

/**
 * Phase F — the event's clock, without a clock.
 *
 * ## No scheduler, on purpose
 *
 * This app runs no cron, no queue, no background worker — `DailyReel.reelDate`
 * and `Poll.publishedOn` already solve "something must happen at midnight" by
 * simply not happening until someone asks. Serious Circle needs four
 * transitions instead of one, but the principle holds: **status is a function
 * of `now`, and the write is a memo of a transition that was already true.**
 *
 * Concretely, `syncEvent` is called on every read. If nobody opens the app
 * between Sunday 8pm and Monday, the event still transitions correctly — the
 * first Monday reader performs SCHEDULED → LOCKED → LIVE → COMPLETED in one
 * pass, and every side effect (pairings, badges) is guarded by a unique
 * constraint so it happens exactly once regardless of how many readers race.
 *
 * The one thing this costs: side effects fire late when traffic is zero. For
 * badges and notices that is acceptable. It would not be for anything a user
 * is owed money over, which is why nothing here touches billing.
 */

/**
 * The majority gender may outnumber the minority by at most this much on a
 * locked roster.
 *
 * A passive feed survives an 80:20 skew — everyone just scrolls. A live,
 * time-boxed room does not: the 80 get nobody and the 20 get mobbed, and both
 * halves conclude the event is broken. Capping the ratio means turning real,
 * fully-eligible people away, which is genuinely unpleasant — it is still much
 * better than running the event that teaches everyone it doesn't work.
 */
export const MAX_GENDER_RATIO = 2;

/** How far ahead events are provisioned. Two = "this one and the next one". */
const PROVISION_AHEAD = 2;

/**
 * Ensures a `CircleEvent` row exists for each upcoming slot.
 *
 * `slug` is unique and `createMany` skips duplicates, so two concurrent
 * requests provisioning the same slot produce one row — the same lazy-daily
 * idempotency guard `getOrCreateTodayPoll` uses.
 */
export async function ensureUpcomingEvents(now = new Date()): Promise<void> {
  const slots = upcomingSlots(now, PROVISION_AHEAD);
  if (slots.length === 0) return;

  await prisma.circleEvent.createMany({
    data: slots.map((s) => ({
      slug: s.slug,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      registrationClosesAt: s.registrationClosesAt,
    })),
    skipDuplicates: true,
  });
}

/** What `status` *should* be right now, ignoring what the row says. */
function dueStatus(event: CircleEvent, now: Date): CircleEventStatus {
  if (event.status === "CANCELLED") return "CANCELLED";
  if (now >= event.endsAt) return "COMPLETED";
  if (now >= event.startsAt) return "LIVE";
  if (now >= event.registrationClosesAt) return "LOCKED";
  return "SCHEDULED";
}

const ORDER: CircleEventStatus[] = ["SCHEDULED", "LOCKED", "LIVE", "COMPLETED"];

/**
 * Advances an event to the status `now` implies, running each transition's
 * side effects on the way. Returns the up-to-date row.
 *
 * Walks the ladder one rung at a time rather than jumping straight to the due
 * status: an event that sat untouched from Sunday 7pm to Monday morning must
 * still *lock* (which is what computes the pairings) before it can complete,
 * or the first reader would produce a completed event that never had any.
 */
export async function syncEvent(event: CircleEvent, now = new Date()): Promise<CircleEvent> {
  let current = event;
  const target = dueStatus(current, now);
  if (target === current.status) return current;

  let guard = 0;
  while (current.status !== target && guard++ < ORDER.length) {
    const idx = ORDER.indexOf(current.status);
    const next = ORDER[idx + 1];
    if (!next) break;

    if (next === "LOCKED") {
      current = await lockRoster(current, now);
      // Locking may cancel the event outright, which ends the walk.
      if (current.status === "CANCELLED") return current;
      continue;
    }

    if (next === "COMPLETED") {
      current = await completeEvent(current, now);
      continue;
    }

    current = await prisma.circleEvent.update({ where: { id: current.id }, data: { status: next } });
  }

  return current;
}

/**
 * SCHEDULED → LOCKED (or CANCELLED).
 *
 * Three things happen here and nowhere else: ratio balancing, the
 * minimum-headcount decision, and pairing generation. All three need a frozen
 * roster, which is precisely what this transition creates.
 */
async function lockRoster(event: CircleEvent, now: Date): Promise<CircleEvent> {
  // `updateMany` with a status precondition is the lock itself: whichever
  // concurrent reader wins this write does the side effects, the others see
  // count 0 and re-read.
  const claimed = await prisma.circleEvent.updateMany({
    where: { id: event.id, status: "SCHEDULED" },
    data: { status: "LOCKED", lockedAt: now },
  });
  if (claimed.count === 0) {
    return (await prisma.circleEvent.findUniqueOrThrow({ where: { id: event.id } }));
  }

  const entries = await prisma.circleEntry.findMany({
    where: { eventId: event.id, status: "REGISTERED" },
    orderBy: { registeredAt: "asc" },
    select: { id: true, userId: true, gender: true },
  });

  // First-come, first-confirmed within each gender. Not "highest trust score"
  // or "most complete profile" — those would make the Circle a leaderboard for
  // people who are already doing well, when the thing being rewarded here is
  // simply committing early.
  const byGender = new Map<string, typeof entries>();
  for (const e of entries) {
    const list = byGender.get(e.gender) ?? [];
    list.push(e);
    byGender.set(e.gender, list);
  }

  const counts = [...byGender.entries()].map(([gender, list]) => ({ gender, size: list.length }));
  const smallest = counts.length > 0 ? Math.min(...counts.map((c) => c.size)) : 0;
  const cap = smallest * MAX_GENDER_RATIO;

  const confirmedIds: string[] = [];
  const waitlistedIds: string[] = [];
  for (const [, list] of byGender) {
    list.forEach((entry, i) => {
      // `counts.length < 2` means only one gender registered at all — nobody
      // can be paired, so everyone waits rather than being confirmed into an
      // event that would produce zero introductions.
      if (counts.length < 2 || i >= cap) waitlistedIds.push(entry.id);
      else confirmedIds.push(entry.id);
    });
  }

  if (confirmedIds.length < event.minParticipants) {
    await prisma.$transaction([
      prisma.circleEntry.updateMany({
        where: { eventId: event.id, status: "REGISTERED" },
        data: { status: "WAITLISTED" },
      }),
      prisma.circleEvent.update({ where: { id: event.id }, data: { status: "CANCELLED" } }),
    ]);
    const carried = await carryForward(event, entries, now);
    await notifyAll(entries.map((e) => e.userId), {
      title: "Circle is baar nahi ho paya",
      body: carried
        ? "Itne log tayyar nahi hue. Aapka naam agle Circle me apne aap laga diya gaya hai — kuch karne ki zaroorat nahi."
        : "Itne log tayyar nahi hue. Agla Circle schedule hote hi aap dobara register kar sakte hain.",
    });
    return prisma.circleEvent.findUniqueOrThrow({ where: { id: event.id } });
  }

  await prisma.$transaction([
    prisma.circleEntry.updateMany({ where: { id: { in: confirmedIds } }, data: { status: "CONFIRMED" } }),
    ...(waitlistedIds.length
      ? [prisma.circleEntry.updateMany({ where: { id: { in: waitlistedIds } }, data: { status: "WAITLISTED" } })]
      : []),
  ]);

  await generatePairings(event.id);

  const confirmedUserIds = entries.filter((e) => confirmedIds.includes(e.id)).map((e) => e.userId);
  await notifyAll(confirmedUserIds, {
    title: "Aapki Circle seat pakki hai",
    body: "Registration band ho gaya. Event ke waqt aakar apne 5 log dekhiye.",
  });

  const waitlistedUserIds = entries.filter((e) => waitlistedIds.includes(e.id)).map((e) => e.userId);
  await notifyAll(waitlistedUserIds, {
    title: "Is baar waiting list me",
    body: "Seats balance karne ke liye kuch log agle Circle me shift hue hain. Agli baar aapka number pehle hai.",
  });

  return prisma.circleEvent.findUniqueOrThrow({ where: { id: event.id } });
}

/**
 * Moves a cancelled event's registrations onto the next scheduled one.
 *
 * A cancellation is the platform's failure, not the user's — making someone
 * re-register because *we* couldn't fill the room is the fastest way to lose
 * the exact people this feature is trying to keep. Their `registeredAt` on the
 * new event is the moment of the carry, which puts them ahead of anyone who
 * signs up afterwards; that is the intended reward for having committed first.
 *
 * Returns false when there is no next event yet, so the notice can say
 * something true rather than promising a seat that was never created.
 */
async function carryForward(
  event: CircleEvent,
  entries: { userId: string; gender: string }[],
  now: Date,
): Promise<boolean> {
  if (entries.length === 0) return false;

  const next = await prisma.circleEvent.findFirst({
    where: { status: "SCHEDULED", startsAt: { gt: event.startsAt } },
    orderBy: { startsAt: "asc" },
  });
  if (!next) return false;

  const timelines = await prisma.profile.findMany({
    where: { userId: { in: entries.map((e) => e.userId) }, marriageTimeline: { not: null } },
    select: { userId: true, marriageTimeline: true },
  });
  const byUser = new Map(timelines.map((t) => [t.userId, t.marriageTimeline!]));

  const rows = entries
    .filter((e) => byUser.has(e.userId))
    .map((e) => ({
      eventId: next.id,
      userId: e.userId,
      gender: e.gender,
      timeline: byUser.get(e.userId)!,
      status: "REGISTERED" as const,
      registeredAt: now,
    }));
  if (rows.length === 0) return false;

  // `skipDuplicates` covers the user who already signed up for the next event
  // themselves — their own earlier registration wins, which is the better of
  // the two positions anyway.
  await prisma.circleEntry.createMany({ data: rows, skipDuplicates: true });
  return true;
}

/**
 * LIVE → COMPLETED. Confirmed-but-absent becomes NO_SHOW; everyone who turned
 * up gets the badge.
 */
async function completeEvent(event: CircleEvent, now: Date): Promise<CircleEvent> {
  const claimed = await prisma.circleEvent.updateMany({
    where: { id: event.id, status: "LIVE" },
    data: { status: "COMPLETED", completedAt: now },
  });
  if (claimed.count === 0) {
    return prisma.circleEvent.findUniqueOrThrow({ where: { id: event.id } });
  }

  await prisma.circleEntry.updateMany({
    where: { eventId: event.id, status: "CONFIRMED" },
    data: { status: "NO_SHOW" },
  });

  const attended = await prisma.circleEntry.findMany({
    where: { eventId: event.id, status: "ATTENDED" },
    select: { userId: true },
  });

  // Sequential rather than Promise.all: this is an upsert-per-user on a table
  // with a single-column primary key, and a burst of concurrent upserts on the
  // same key space is the classic way to earn deadlocks for no gain.
  for (const entry of attended) {
    await awardBadge(entry.userId, now);
  }

  await notifyAll(attended.map((e) => e.userId), {
    title: "Shaadi Ready badge mil gaya",
    body: "Aapki profile par 30 din ke liye badge lag gaya hai. Jinse connect hua, unhe jawab dena mat bhooliye.",
  });

  return prisma.circleEvent.findUniqueOrThrow({ where: { id: event.id } });
}

async function notifyAll(userIds: string[], msg: { title: string; body: string }): Promise<void> {
  for (const userId of userIds) {
    await createNotice({
      userId,
      kind: "MATCHMAKER_UPDATE",
      title: msg.title,
      body: msg.body,
      href: "/user/circle",
    });
  }
}

/**
 * The next event a user should be looking at, already synced.
 *
 * "Next" means the earliest event whose window has not closed — so during the
 * two live hours it returns the event happening right now, not the one three
 * days away.
 */
export async function getCurrentEvent(now = new Date()): Promise<CircleEvent | null> {
  await ensureUpcomingEvents(now);
  await sweepGhosting(now);

  const candidates = await prisma.circleEvent.findMany({
    where: { endsAt: { gt: now } },
    orderBy: { startsAt: "asc" },
    take: 2,
  });
  if (candidates.length === 0) return null;

  // Sync any *past* event that never got closed out, so badges from last
  // Sunday are not still pending when this Wednesday's page loads.
  const stale = await prisma.circleEvent.findMany({
    where: { endsAt: { lte: now }, status: { in: ["SCHEDULED", "LOCKED", "LIVE"] } },
    orderBy: { startsAt: "asc" },
    take: 4,
  });
  for (const event of stale) await syncEvent(event, now);

  const synced = await syncEvent(candidates[0], now);
  // A cancelled event is not something to show a countdown for — fall through
  // to the next one, which is still SCHEDULED and accepting registrations.
  if (synced.status === "CANCELLED" && candidates[1]) return syncEvent(candidates[1], now);
  return synced;
}

/**
 * Penalises Circle connections whose window closed with silence.
 *
 * Runs lazily on Circle page loads, same as every other transition here. The
 * rule is symmetric on purpose: whoever sent zero messages is suspended,
 * which means a pair where *neither* wrote suspends both. There is no
 * "he should have gone first" — both people accepted an introduction and
 * neither honoured it.
 *
 * A suspension is 14 days and it lifts by itself. It is a correction, not a
 * ban, and `awardBadge` clears it early for anyone who turns up again.
 */
export async function sweepGhosting(now = new Date()): Promise<number> {
  const due = await prisma.circleConnection.findMany({
    where: { connectedAt: { not: null }, windowEndsAt: { lt: now }, ghostSweptAt: null, matchId: { not: null } },
    select: { id: true, matchId: true, userAId: true, userBId: true },
    take: 50,
  });
  if (due.length === 0) return 0;

  let penalised = 0;
  for (const conn of due) {
    const senders = await prisma.message.findMany({
      where: { matchId: conn.matchId! },
      select: { senderId: true },
      distinct: ["senderId"],
    });
    const spoke = new Set(senders.map((s) => s.senderId));

    for (const userId of [conn.userAId, conn.userBId]) {
      if (spoke.has(userId)) continue;
      await suspendBadge(userId, "Circle me connect hone ke baad koi jawab nahi diya", now);
      await createNotice({
        userId,
        kind: "CHAT_NUDGE",
        title: "Shaadi Ready badge 2 hafte ke liye band",
        body: "Circle me connect hone ke baad aapne koi message nahi bheja. Badge apne aap wapas aa jayega — agle Circle me aakar pehle bhi.",
        href: "/user/circle",
      });
      penalised++;
    }

    await prisma.circleConnection.update({ where: { id: conn.id }, data: { ghostSweptAt: now } });
  }
  return penalised;
}

/** Live headcount for the anticipation counter. Confirmed once locked, registered before that. */
export async function getRosterCounts(eventId: string): Promise<{ total: number; byGender: Record<string, number> }> {
  const rows = await prisma.circleEntry.groupBy({
    by: ["gender"],
    where: { eventId, status: { in: ["REGISTERED", "CONFIRMED", "ATTENDED"] } },
    _count: { _all: true },
  });
  const byGender: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    byGender[r.gender] = r._count._all;
    total += r._count._all;
  }
  return { total, byGender };
}
