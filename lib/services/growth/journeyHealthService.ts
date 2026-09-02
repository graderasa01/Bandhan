import "server-only";
import { prisma } from "@/lib/db/prisma";
import { RISHTA_STAGE_LABEL } from "@/lib/profile/rishtaStages";
import type { JourneyHealth, StageDwellRow } from "@/lib/contracts/growth";
import type { RishtaStage } from "@prisma/client";

/**
 * The half of §14 that nothing reported.
 *
 * `growthService.buildRishtaProgress` counts rishtey *moving* — interests,
 * matches, meetings, outcomes. That answers "is the funnel filling". It cannot
 * answer the question the plan actually names as the north star: of the rishtey
 * that exist right now, how many have a clear next action, somebody responsible
 * for it, and any sign of movement. A product can have a healthy funnel and a
 * room full of stalled rishtey, and only one of those is the promise.
 *
 * ## The rule every number here obeys
 *
 * A count of rows that exist, or a median of two stored timestamps. Nothing is
 * modelled and nothing is estimated. Where a number cannot be measured
 * honestly, it is null and the screen says so — the plan's own "median time to
 * live profile" is measured from `Profile.submittedAt`, the timestamp written
 * by the one code path that makes a profile visible, rather than from a guess
 * at when somebody finished.
 *
 * ## Why the medians are computed in JS
 *
 * Postgres can do percentiles, but `prisma.$queryRaw` here would mean a
 * hand-written SQL string per metric, outside the schema's type checking, for a
 * dataset that is a pilot city's worth of rows. Each query below is capped, and
 * the cap is stated where it bites.
 */

/** Beyond this a median is not more accurate, only slower. Newest rows win. */
const MEDIAN_SAMPLE = 500;

/** Something moved in this many days, or the rishta is not moving. */
const PROGRESS_WINDOW_DAYS = 21;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** The stages a live rishta can be standing at. CLOSED is an ending, not a wait. */
const DWELL_STAGES: RishtaStage[] = [
  "MUTUAL_MATCH",
  "TALKING",
  "UNDERSTANDING",
  "FAMILY_INVOLVED",
  "MEETING_PLANNED",
  "MET",
  "DECISION",
];

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function round1(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10) / 10;
}

function pct(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.round((part / whole) * 1000) / 10;
}

export async function buildJourneyHealth(from: Date): Promise<JourneyHealth> {
  const window = { gte: from };

  const [northStar, live, managed, stageDwell, services, verification, safety] = await Promise.all([
    buildNorthStar(),
    buildTimeToLive(from),
    buildManaged(window),
    buildStageDwell(),
    buildServices(window),
    buildVerification(window),
    buildSafety(window),
  ]);

  return {
    northStar,
    medianDaysToLive: live.medianDays,
    liveInWindow: live.count,
    managed,
    stageDwell,
    services,
    verification,
    safety,
  };
}

/* ------------------------------------------------------------------ */
/* North star                                                          */
/* ------------------------------------------------------------------ */

/**
 * "Active serious rishte jinke paas clear next action, responsible person aur
 * recent progress hai."
 *
 * Each of the three is a separate query against the same set, so the screen can
 * show *which* of the three is missing rather than one number that only ever
 * goes down. A rishta with a next action nobody owns and a rishta nobody has
 * touched in a month are different failures with different fixes.
 *
 * "Active" means the owner confirmed a stage and has not closed it. Derived
 * stages are deliberately excluded: a rishta the app inferred from two swipes
 * is not one somebody is working, and counting it would inflate this number
 * with exactly the rishtey that need no attention.
 */
async function buildNorthStar(): Promise<JourneyHealth["northStar"]> {
  const activeWhere = { confirmedStage: { notIn: ["CLOSED"] as RishtaStage[] }, NOT: { confirmedStage: null } };
  const progressSince = new Date(Date.now() - PROGRESS_WINDOW_DAYS * DAY_MS);

  const [active, withNextAction, withResponsibleParty, withRecentProgress, healthy] = await Promise.all([
    prisma.rishtaJourney.count({ where: activeWhere }),
    prisma.rishtaJourney.count({
      where: {
        ...activeWhere,
        OR: [{ tasks: { some: { doneAt: null } } }, { topics: { some: { resolved: false } } }],
      },
    }),
    // A task always names the party that owes it (see `RishtaTask.party`), so
    // "has an open task" and "has somebody responsible" are the same row test.
    // An unresolved topic is a thing to talk about, not a thing somebody owes.
    prisma.rishtaJourney.count({ where: { ...activeWhere, tasks: { some: { doneAt: null } } } }),
    prisma.rishtaJourney.count({ where: { ...activeWhere, ...recentProgressWhere(progressSince) } }),
    prisma.rishtaJourney.count({
      where: {
        ...activeWhere,
        tasks: { some: { doneAt: null } },
        ...recentProgressWhere(progressSince),
      },
    }),
  ]);

  return {
    active,
    withNextAction,
    withResponsibleParty,
    withRecentProgress,
    healthy,
    progressWindowDays: PROGRESS_WINDOW_DAYS,
  };
}

/**
 * What counts as movement: the owner confirmed a stage, a meeting was recorded
 * or answered, or a task was finished.
 *
 * Deliberately not `RishtaJourney.updatedAt` — that column moves when a
 * reflection is saved or a topic is renamed, and "somebody typed something"
 * is not progress toward a marriage.
 */
function recentProgressWhere(since: Date) {
  return {
    OR: [
      { confirmedStageAt: { gte: since } },
      { meetings: { some: { OR: [{ happenedAt: { gte: since } }, { checkpointAt: { gte: since } }] } } },
      { tasks: { some: { doneAt: { gte: since } } } },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Time to live profile                                                */
/* ------------------------------------------------------------------ */

/**
 * Median days from signing up to the profile becoming visible.
 *
 * `submittedAt` is the right clock: `submitProfile` is the only path that sets
 * `isVisible`, and it stamps both in the same write. A profile that was made
 * visible some other way in future would need this comment revisited — which is
 * the point of saying it here.
 */
async function buildTimeToLive(from: Date): Promise<{ medianDays: number | null; count: number }> {
  const rows = await prisma.profile.findMany({
    where: { submittedAt: { gte: from }, isVisible: true },
    orderBy: { submittedAt: "desc" },
    take: MEDIAN_SAMPLE,
    select: { submittedAt: true, user: { select: { createdAt: true } } },
  });

  const days = rows
    .filter((r) => r.submittedAt)
    .map((r) => (r.submittedAt!.getTime() - r.user.createdAt.getTime()) / DAY_MS)
    // A profile submitted before its own account existed is a clock problem,
    // not a fast user. Dropped rather than averaged in as a negative.
    .filter((d) => d >= 0);

  return { medianDays: round1(median(days)), count: rows.length };
}

/* ------------------------------------------------------------------ */
/* Managed profiles                                                    */
/* ------------------------------------------------------------------ */

/**
 * The plan's "partner draft -> owner claim rate", and the consent number beside
 * it.
 *
 * Claims are counted by `claimedAt` inside the window rather than by the draft's
 * creation date: the question is how many claims *happened*, and a draft created
 * in March and claimed in April is an April claim. That makes `claimPct` a rate
 * over the window, not a cohort — said plainly on the screen, because the two
 * are easy to confuse and only one of them is cheap to compute.
 */
async function buildManaged(window: { gte: Date }): Promise<JourneyHealth["managed"]> {
  const [draftsCreated, draftsClaimed, delegationsGranted, delegationsRevoked] = await Promise.all([
    prisma.managedProfileDraft.count({ where: { createdAt: window } }),
    prisma.managedProfileDraft.count({ where: { claimedAt: window } }),
    prisma.profileDelegation.count({ where: { createdAt: window } }),
    prisma.profileDelegation.count({ where: { revokedAt: window } }),
  ]);

  return {
    draftsCreated,
    draftsClaimed,
    claimPct: pct(draftsClaimed, draftsCreated),
    delegationsGranted,
    delegationsRevoked,
  };
}

/* ------------------------------------------------------------------ */
/* Stage dwell                                                         */
/* ------------------------------------------------------------------ */

/**
 * How long people have been standing where they are.
 *
 * This is dwell *so far*, not time-to-next-stage: the schema keeps only the
 * latest confirmed stage and when it was confirmed, so the history of a journey
 * that has already moved on is not recoverable. Measuring what is stored means
 * this number answers "who is stuck right now", which is the more useful of the
 * two questions during a pilot anyway.
 */
async function buildStageDwell(): Promise<StageDwellRow[]> {
  const rows = await prisma.rishtaJourney.findMany({
    where: { confirmedStage: { in: DWELL_STAGES }, confirmedStageAt: { not: null } },
    orderBy: { confirmedStageAt: "desc" },
    take: MEDIAN_SAMPLE * 4,
    select: { confirmedStage: true, confirmedStageAt: true },
  });

  const now = Date.now();
  const byStage = new Map<RishtaStage, number[]>();
  for (const row of rows) {
    const stage = row.confirmedStage!;
    const list = byStage.get(stage) ?? [];
    list.push((now - row.confirmedStageAt!.getTime()) / DAY_MS);
    byStage.set(stage, list);
  }

  return DWELL_STAGES.map((stage) => {
    const days = byStage.get(stage) ?? [];
    return {
      stage,
      label: RISHTA_STAGE_LABEL[stage],
      people: days.length,
      medianDays: round1(median(days)),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Service operations                                                  */
/* ------------------------------------------------------------------ */

/**
 * Did the partner side keep its promises: answer, deliver, and not get
 * complained about.
 *
 * The accept median is measured from payment capture, not from booking
 * creation — the same clock `getPartnerStats` shows on a partner's public card,
 * because two different definitions of "how fast do they answer" on two screens
 * is how a marketplace loses an argument with its own partners.
 */
async function buildServices(window: { gte: Date }): Promise<JourneyHealth["services"]> {
  const [booked, accepted, completed, expiredUnaccepted, refunded, disputed, acceptRows] = await Promise.all([
    prisma.serviceBooking.count({ where: { createdAt: window, status: { not: "PENDING_PAYMENT" } } }),
    prisma.serviceBooking.count({ where: { acceptedAt: window } }),
    prisma.serviceBooking.count({ where: { completedAt: window } }),
    prisma.serviceBooking.count({ where: { createdAt: window, status: "EXPIRED_UNACCEPTED" } }),
    prisma.serviceBooking.count({ where: { refundedAt: window, status: "REFUNDED" } }),
    prisma.serviceBooking.count({ where: { disputedAt: window } }),
    prisma.serviceBooking.findMany({
      where: { acceptedAt: window, payment: { capturedAt: { not: null } } },
      orderBy: { acceptedAt: "desc" },
      take: MEDIAN_SAMPLE,
      select: { acceptedAt: true, payment: { select: { capturedAt: true } } },
    }),
  ]);

  const hours = acceptRows.map(
    (r) => (r.acceptedAt!.getTime() - r.payment!.capturedAt!.getTime()) / HOUR_MS,
  );

  return {
    booked,
    accepted,
    medianAcceptHours: round1(median(hours)),
    completed,
    expiredUnaccepted,
    refunded,
    disputed,
    disputePct: pct(disputed, booked),
  };
}

/* ------------------------------------------------------------------ */
/* Verification                                                        */
/* ------------------------------------------------------------------ */

/**
 * Completion, mismatch and decline — the three the plan names.
 *
 * Counted on the check rather than the request, except for declines, which only
 * a request can carry: a check that never existed because the subject said no
 * is the one outcome with no row in the other table.
 */
async function buildVerification(window: { gte: Date }): Promise<JourneyHealth["verification"]> {
  const [requested, matched, mismatch, couldNotComplete, declined] = await Promise.all([
    prisma.verificationRequest.count({ where: { createdAt: window } }),
    prisma.verificationCheck.count({ where: { checkedAt: window, outcome: "MATCHED" } }),
    prisma.verificationCheck.count({ where: { checkedAt: window, outcome: "MISMATCH" } }),
    prisma.verificationCheck.count({ where: { checkedAt: window, outcome: "COULD_NOT_COMPLETE" } }),
    // `subjectDecidedAt` carries both a yes and a no, so the status is what
    // separates them — a decline is the only ending with no check row at all.
    prisma.verificationRequest.count({ where: { subjectDecidedAt: window, status: "DECLINED" } }),
  ]);

  return { requested, matched, mismatch, couldNotComplete, declined };
}

/* ------------------------------------------------------------------ */
/* Safety                                                              */
/* ------------------------------------------------------------------ */

/**
 * How many people said something was wrong, and how long it took somebody to
 * pick it up.
 *
 * `openNow` ignores the window on purpose. Every other number here describes a
 * period; this one describes the queue as it stands, and a safety queue is the
 * one place where "12 open right now" matters more than what happened in the
 * last 30 days.
 */
async function buildSafety(window: { gte: Date }): Promise<JourneyHealth["safety"]> {
  const [opened, closed, openNow, reports, claimedRows] = await Promise.all([
    prisma.safetyCase.count({ where: { openedAt: window } }),
    prisma.safetyCase.count({ where: { closedAt: window } }),
    prisma.safetyCase.count({ where: { status: { in: ["OPEN", "IN_REVIEW"] } } }),
    prisma.contentReport.count({ where: { createdAt: window } }),
    prisma.safetyCase.findMany({
      where: { claimedAt: window },
      orderBy: { claimedAt: "desc" },
      take: MEDIAN_SAMPLE,
      select: { openedAt: true, claimedAt: true },
    }),
  ]);

  const hours = claimedRows.map((r) => (r.claimedAt!.getTime() - r.openedAt.getTime()) / HOUR_MS);

  return {
    opened,
    closed,
    medianFirstResponseHours: round1(median(hours)),
    openNow,
    reports,
  };
}
