import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ageFromDate } from "@/lib/services/match/age";
import { evaluateEligibility, type CircleEligibility } from "@/lib/circle/eligibility";
import { formatSlotLabel } from "@/lib/circle/schedule";
import { getCurrentEvent, getRosterCounts } from "./circleEventService";
import { getMyConnections, type CircleConnectionView } from "./connectionService";
import { getBadgeState, type BadgeState } from "./badgeService";
import { missingForFullProfile } from "@/lib/profile/stages";
import { computeCompletion } from "@/lib/services/profile/completionService";
import { PROFILE_FULL_INCLUDE } from "@/lib/services/profile/profileInclude";
import type { CircleEntryStatus, CircleEventStatus, MarriageTimeline } from "@prisma/client";

/**
 * Phase F — everything `/user/circle` needs, in one read.
 *
 * The page is a single server component and this is its one data call, in the
 * same shape as `lib/data/*Data.ts`. Kept here rather than in `lib/data`
 * because it mutates: `getCircleView` is what advances the event clock (see
 * `syncEvent`), so it cannot pretend to be a pure read.
 */

export interface CirclePersonCard {
  userId: string;
  profileId: string;
  displayName: string;
  age: number | null;
  city: string | null;
  education: string | null;
  profession: string | null;
  trustScore: number | null;
  photoUrl: string | null;
  /**
   * Same consent rule as the reel and the shortlist: a face is unlocked by a
   * mutual Match, never by having been shown someone. Attending the same event
   * is not consent to be looked at — and holding the line here is what lets
   * the Circle be about how someone thinks before how they look.
   */
  photoUnlocked: boolean;
  timeline: MarriageTimeline | null;
}

export interface CircleView {
  featureOn: boolean;
  event: {
    id: string;
    slug: string;
    status: CircleEventStatus;
    slotLabel: string;
    startsAt: string;
    endsAt: string;
    registrationClosesAt: string;
  } | null;
  eligibility: CircleEligibility;
  myEntryStatus: CircleEntryStatus | null;
  marriageTimeline: MarriageTimeline | null;
  roster: { total: number; byGender: Record<string, number> };
  minParticipants: number;
  badge: BadgeState;
  connections: (CircleConnectionView & { person: CirclePersonCard | null })[];
}

export async function getCircleView(userId: string, now = new Date()): Promise<CircleView> {
  const event = await getCurrentEvent(now);

  const { profile, badge, eligibility } = await loadEligibilityContext(userId, now);
  await pointToFirstMissingField(userId, eligibility);

  if (!event) {
    return {
      featureOn: true,
      event: null,
      eligibility,
      myEntryStatus: null,
      marriageTimeline: profile?.marriageTimeline ?? null,
      roster: { total: 0, byGender: {} },
      minParticipants: 0,
      badge,
      connections: [],
    };
  }

  const [entry, roster] = await Promise.all([
    prisma.circleEntry.findUnique({
      where: { eventId_userId: { eventId: event.id, userId } },
      select: { status: true },
    }),
    getRosterCounts(event.id),
  ]);

  // Pairings exist only from LOCKED onward, and are only *shown* once the room
  // is open — knowing your five people a day early would let someone shop the
  // roster and skip the event, which is the one behaviour the whole design is
  // built to prevent.
  const showConnections = event.status === "LIVE" || event.status === "COMPLETED";
  const connections = showConnections ? await getMyConnections(userId, event.id, now) : [];
  const people = await loadPeople(userId, connections.map((c) => c.otherUserId));

  return {
    featureOn: true,
    event: {
      id: event.id,
      slug: event.slug,
      status: event.status,
      slotLabel: formatSlotLabel(event.startsAt),
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      registrationClosesAt: event.registrationClosesAt.toISOString(),
    },
    eligibility,
    myEntryStatus: entry?.status ?? null,
    marriageTimeline: profile?.marriageTimeline ?? null,
    roster,
    minParticipants: event.minParticipants,
    badge,
    connections: connections.map((c) => ({ ...c, person: people.get(c.otherUserId) ?? null })),
  };
}

/**
 * The three eligibility call sites below (`getCircleView`, `getCircleTeaser`,
 * `registerForCircle`) all need the same profile/family/badge triple to run
 * `evaluateEligibility` — collapsed here so the gate logic can't drift between
 * the read paths and the write path.
 */
async function loadEligibilityContext(userId: string, now: Date) {
  const [profile, activeFamilyCount, badge] = await Promise.all([
    prisma.profile.findUnique({
      where: { userId },
      select: {
        profileStatus: true,
        fullProfileCompletionScore: true,
        marriageTimeline: true,
        gender: true,
      },
    }),
    prisma.familyMember.count({ where: { ownerUserId: userId, status: "ACTIVE" } }),
    getBadgeState(userId, now),
  ]);

  const eligibility = evaluateEligibility(
    {
      profileStatus: profile?.profileStatus ?? null,
      fullProfileCompletionScore: profile?.fullProfileCompletionScore ?? 0,
      activeFamilyCount,
      marriageTimeline: profile?.marriageTimeline ?? null,
      badgeSuspendedUntil: badge.suspendedUntil,
    },
    now,
  );

  return { profile, badge, eligibility };
}

/**
 * The "profile" gate's static href points at the top of the whole form — for
 * someone who is already 60% done, that lands them back on fields they
 * already answered. Overridden in place (mutating the gate the caller
 * already built) to the exact unanswered field, using the same manual-form
 * deep link `?mode=manual&field=` that InterviewMode already honours. Costs
 * one extra query, and only for users who haven't cleared the gate.
 */
async function pointToFirstMissingField(userId: string, eligibility: CircleEligibility): Promise<void> {
  const gate = eligibility.gates.find((g) => g.key === "profile" && !g.passed);
  if (!gate) return;

  const fullProfile = await prisma.profile.findUnique({ where: { userId }, include: PROFILE_FULL_INCLUDE });
  if (!fullProfile) return;

  const { draftValues } = computeCompletion(fullProfile);
  const next = missingForFullProfile(draftValues)[0];
  if (next) gate.href = `/profile/build?mode=manual&field=${next.key}`;
}

async function loadPeople(viewerId: string, userIds: string[]): Promise<Map<string, CirclePersonCard>> {
  const out = new Map<string, CirclePersonCard>();
  if (userIds.length === 0) return out;

  const [profiles, matches] = await Promise.all([
    prisma.profile.findMany({
      where: { userId: { in: userIds }, deletedAt: null },
      select: {
        id: true,
        userId: true,
        displayName: true,
        dateOfBirth: true,
        currentCity: true,
        trustScore: true,
        marriageTimeline: true,
        education: { select: { highestEducation: true } },
        profession: { select: { jobTitle: true } },
        photos: {
          where: { isPrimary: true, deletedAt: null },
          take: 1,
          select: { fileUrl: true },
        },
      },
    }),
    prisma.match.findMany({
      where: {
        OR: [
          { userAId: viewerId, userBId: { in: userIds } },
          { userBId: viewerId, userAId: { in: userIds } },
        ],
      },
      select: { userAId: true, userBId: true },
    }),
  ]);

  const matched = new Set(matches.map((m) => (m.userAId === viewerId ? m.userBId : m.userAId)));

  for (const p of profiles) {
    const unlocked = matched.has(p.userId);
    out.set(p.userId, {
      userId: p.userId,
      profileId: p.id,
      displayName: p.displayName ?? "Profile",
      age: ageFromDate(p.dateOfBirth),
      city: p.currentCity,
      education: p.education?.highestEducation ?? null,
      profession: p.profession?.jobTitle ?? null,
      trustScore: p.trustScore,
      photoUrl: unlocked ? (p.photos[0]?.fileUrl ?? null) : null,
      photoUnlocked: unlocked,
      timeline: p.marriageTimeline,
    });
  }
  return out;
}

export interface CircleTeaser {
  slotLabel: string;
  status: CircleEventStatus;
  /** Registered or already confirmed on the locked roster. */
  registered: boolean;
  waitlisted: boolean;
  eligible: boolean;
  passedCount: number;
  totalCount: number;
  rosterTotal: number;
  /** Pairings still awaiting this user's answer. Only ever non-zero while LIVE. */
  awaitingMe: number;
  badgeActive: boolean;
  registrationClosesAt: string;
  startsAt: string;
}

/**
 * The dashboard banner's data — deliberately *not* `getCircleView`.
 *
 * The dashboard is the app's highest-traffic page and the full view loads
 * every pairing plus a profile card for each. This answers only what a banner
 * can show, in four queries.
 *
 * It still goes through `getCurrentEvent`, so the lazy event clock advances on
 * dashboard traffic rather than waiting for someone to visit `/user/circle` —
 * which matters, because the Circle page is exactly the page nobody opens on a
 * Monday.
 */
export async function getCircleTeaser(userId: string, now = new Date()): Promise<CircleTeaser | null> {
  const event = await getCurrentEvent(now);
  if (!event) return null;

  const [{ badge, eligibility }, entry, roster] = await Promise.all([
    loadEligibilityContext(userId, now),
    prisma.circleEntry.findUnique({
      where: { eventId_userId: { eventId: event.id, userId } },
      select: { status: true },
    }),
    getRosterCounts(event.id),
  ]);

  const awaitingMe =
    event.status === "LIVE"
      ? await prisma.circleConnection.count({
          where: {
            eventId: event.id,
            OR: [
              { userAId: userId, aAnsweredAt: null },
              { userBId: userId, bAnsweredAt: null },
            ],
          },
        })
      : 0;

  return {
    slotLabel: formatSlotLabel(event.startsAt),
    status: event.status,
    registered: entry?.status === "REGISTERED" || entry?.status === "CONFIRMED" || entry?.status === "ATTENDED",
    waitlisted: entry?.status === "WAITLISTED",
    eligible: eligibility.eligible,
    passedCount: eligibility.passedCount,
    totalCount: eligibility.totalCount,
    rosterTotal: roster.total,
    awaitingMe,
    badgeActive: badge.active,
    registrationClosesAt: event.registrationClosesAt.toISOString(),
    startsAt: event.startsAt.toISOString(),
  };
}

export type CircleActionResult =
  | { ok: true }
  | { ok: false; error: string; message: string; status: number };

/** The declared "shaadi kab tak" answer. Its own action because it is also a gate. */
export async function setMarriageTimeline(
  userId: string,
  timeline: MarriageTimeline,
): Promise<CircleActionResult> {
  const updated = await prisma.profile.updateMany({ where: { userId }, data: { marriageTimeline: timeline } });
  if (updated.count === 0) {
    return { ok: false, error: "NO_PROFILE", message: "Pehle profile banaiye.", status: 404 };
  }
  return { ok: true };
}

export async function registerForCircle(userId: string, now = new Date()): Promise<CircleActionResult> {
  const event = await getCurrentEvent(now);
  if (!event) {
    return { ok: false, error: "NO_EVENT", message: "Abhi koi Circle scheduled nahi hai.", status: 404 };
  }
  if (event.status !== "SCHEDULED") {
    return {
      ok: false,
      error: "REGISTRATION_CLOSED",
      message: "Is Circle ka registration band ho gaya. Agla Circle jald hi.",
      status: 409,
    };
  }

  // Re-checked server-side even though the UI hides the button — the gates are
  // the feature, and a gate that only exists in a component is decoration.
  const { profile, eligibility } = await loadEligibilityContext(userId, now);
  if (!eligibility.eligible) {
    const pending = eligibility.gates.find((g) => !g.passed);
    return { ok: false, error: "NOT_ELIGIBLE", message: pending?.todo ?? "Abhi entry nahi ho sakti.", status: 403 };
  }
  if (!profile?.gender) {
    return { ok: false, error: "NO_GENDER", message: "Profile me ladka/ladki bharna zaroori hai.", status: 422 };
  }

  await prisma.circleEntry.upsert({
    where: { eventId_userId: { eventId: event.id, userId } },
    create: {
      eventId: event.id,
      userId,
      gender: profile.gender,
      timeline: profile.marriageTimeline!,
      status: "REGISTERED",
    },
    // Re-registering after withdrawing is allowed while the event is still
    // SCHEDULED — changing your mind before the doors close is not a sin, and
    // `registeredAt` deliberately is not reset, so the queue position someone
    // gave up is the one they get back.
    update: { status: "REGISTERED", timeline: profile.marriageTimeline!, gender: profile.gender },
  });

  return { ok: true };
}

export async function withdrawFromCircle(userId: string, now = new Date()): Promise<CircleActionResult> {
  const event = await getCurrentEvent(now);
  if (!event) return { ok: false, error: "NO_EVENT", message: "Koi Circle nahi mila.", status: 404 };
  if (event.status !== "SCHEDULED") {
    return {
      ok: false,
      error: "LOCKED",
      message: "Roster lock ho chuka hai — ab naam wapas nahi liya ja sakta.",
      status: 409,
    };
  }

  await prisma.circleEntry.updateMany({
    where: { eventId: event.id, userId, status: "REGISTERED" },
    data: { status: "WITHDRAWN" },
  });
  return { ok: true };
}

/**
 * Records that the user actually turned up. Called on the first page load
 * inside the live window — attendance *is* the product's definition of
 * serious, so it is recorded by being present, never by tapping "I'm here".
 */
export async function markAttendance(userId: string, now = new Date()): Promise<void> {
  const event = await getCurrentEvent(now);
  if (!event || event.status !== "LIVE") return;

  await prisma.circleEntry.updateMany({
    where: { eventId: event.id, userId, status: "CONFIRMED" },
    data: { status: "ATTENDED", attendedAt: now },
  });
}
