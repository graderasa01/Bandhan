import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ageFromDate } from "@/lib/services/match/age";
import { canViewerUnlockPhotos, photoUnlockedFor } from "@/lib/services/plans/photoAccess";
import { getEntitlements } from "@/lib/services/plans/entitlements";
import { getMyMatchmakerRequests } from "@/lib/services/matchmaker/matchmakerService";
import { getRishtaSummary, type RishtaSummary } from "@/lib/services/rishta/journeyService";
import { nextStepFor, type RishtaNextStep } from "@/lib/profile/rishtaNextStep";
import { FAMILY_RELATION_LABELS } from "@/lib/services/family/familyConstants";
import {
  listAdmittableHelpers,
  listRoomParticipants,
  type AdmittableHelper,
  type RoomParticipantView,
} from "@/lib/services/rishta/roomParticipantService";
import { listRoomTasks, type RoomTaskView } from "@/lib/services/rishta/roomTaskService";
import { listRoomRequests, type RoomRequestView } from "@/lib/services/rishta/roomRequestService";
import { listBookingsForRishta } from "@/lib/services/marketplace/bookingService";
import { BOOKING_STATUS_LABEL } from "@/lib/services/marketplace/servicePolicy";
import {
  listVerificationBadges,
  type VerificationBadge,
} from "@/lib/services/verification/verificationBadgeService";
import { getPairVerification } from "@/lib/services/verification/verificationRequestService";

/**
 * Everything the Rishta Room shows about one rishta.
 *
 * ## Why a loader and not four calls in the page
 *
 * The Room is the first screen that pulls the journey, the person, the family's
 * traces and the human-help entitlement onto one surface, and every one of
 * those already has an owner elsewhere. This file's whole job is to call those
 * owners in parallel and hand the page one object — it computes nothing of its
 * own except the photo gate, which it also delegates.
 *
 * ## The Room is one person's, always
 *
 * `getRishtaSummary` is scoped to `userId` and returns null when these two have
 * no relationship at all, so there is no shape of this function that shows a
 * stranger's journey — the same guarantee `/api/rishta/[otherUserId]` makes,
 * for the same reason. What the other person marked, wrote or planned is not
 * fetched here because it is not fetchable: their journey is a different row
 * and nothing in the app joins the two.
 *
 * The family's traces *are* included, and they are the user's own data: a note
 * Papa wrote sits on the owner's profile record, not on the candidate's.
 */

export interface RishtaRoomPerson {
  profileId: string | null;
  name: string;
  age: number | null;
  city: string | null;
  photoUrl: string | null;
  verified: boolean;
  trustScore: number;
}

export interface RishtaRoomFamilyNote {
  id: string;
  body: string;
  author: string;
  relation: string;
  createdAt: string;
}

export interface RishtaRoom {
  summary: RishtaSummary;
  nextStep: RishtaNextStep;
  person: RishtaRoomPerson;
  familyNotes: RishtaRoomFamilyNote[];
  /** Who in the family put this person on the user's shortlist, if anyone did. */
  shortlistedBy: string | null;
  /** PREMIUM's `assistedMatchmaker`. The card is hidden, not disabled, without it. */
  canAskHuman: boolean;
  openHumanRequests: number;

  /* ---- Phase 4 ---- */
  /** Helpers standing in this room, and helpers who could be. */
  participants: RoomParticipantView[];
  admittableHelpers: AdmittableHelper[];
  tasks: RoomTaskView[];
  /** Pending first — this is an approval queue before it is a history. */
  requests: RoomRequestView[];
  /** Services the owner booked *about this rishta*. Never anybody else's. */
  bookings: RishtaRoomBooking[];

  /* ---- Phase 5 ---- */
  /**
   * What has been checked about the other person, as this viewer may read it,
   * plus the asks this viewer has made of them. Never the other direction's
   * private half: what *they* asked of the viewer lives on the viewer's own
   * verification screen, where it can be answered.
   */
  verificationBadges: VerificationBadge[];
  verificationAsked: {
    id: string;
    kind: VerificationBadge["kind"];
    label: string;
    status: string;
    outcome: string | null;
    resultNote: string | null;
    declineReason: string | null;
  }[];
}

/** A booking as the room shows it: what was bought, from whom, where it has got to. */
export interface RishtaRoomBooking {
  id: string;
  serviceName: string;
  partnerName: string;
  statusLabel: string;
  milestonesDone: number;
  milestonesTotal: number;
  createdAt: string;
}

export async function getRishtaRoom(userId: string, otherUserId: string): Promise<RishtaRoom | null> {
  const summary = await getRishtaSummary(userId, otherUserId);
  if (!summary) return null;

  const [profile, canUnlockAll, entitlements] = await Promise.all([
    prisma.profile.findUnique({
      where: { userId: otherUserId },
      select: {
        id: true,
        displayName: true,
        dateOfBirth: true,
        currentCity: true,
        trustScore: true,
        photos: {
          where: { isPrimary: true, deletedAt: null },
          take: 1,
          select: { fileUrl: true, verificationStatus: true },
        },
      },
    }),
    canViewerUnlockPhotos(userId),
    getEntitlements(userId),
  ]);

  // Family reads need the candidate's profile id, so they wait on the query
  // above rather than joining the batch — two round trips for a screen that is
  // already one tap deep, against a join this schema does not have.
  const [familyNotes, familyShortlist, humanRequests] = await Promise.all([
    profile
      ? prisma.familyNote.findMany({
          where: { familyMember: { ownerUserId: userId }, targetProfileId: profile.id },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            body: true,
            createdAt: true,
            familyMember: { select: { displayName: true, relation: true } },
          },
        })
      : Promise.resolve([]),
    profile
      ? prisma.shortlist.findFirst({
          where: { userId, targetProfileId: profile.id, addedByFamilyMemberId: { not: null } },
          select: { addedByFamilyMember: { select: { displayName: true } } },
        })
      : Promise.resolve(null),
    entitlements.assistedMatchmaker ? getMyMatchmakerRequests(userId) : Promise.resolve([]),
  ]);

  // Phase 4's four reads. They are their own batch rather than joining the one
  // above because every one of them is scoped by the journey, and the journey
  // is what `getRishtaSummary` already proved exists.
  const [participants, admittableHelpers, tasks, requests, bookings, verificationBadges, pairVerification] =
    await Promise.all([
      listRoomParticipants(userId, otherUserId),
      listAdmittableHelpers(userId, otherUserId),
      listRoomTasks(userId, otherUserId),
      listRoomRequests(userId, otherUserId),
      listBookingsForRishta(userId, otherUserId),
      // Viewer-scoped: the result note of a check *this* viewer paid for is
      // theirs to read, and a check somebody else asked for is not.
      listVerificationBadges(otherUserId, { viewerUserId: userId }),
      getPairVerification(userId, otherUserId),
    ]);

  const photo = profile?.photos[0];
  const photoOpen = photoUnlockedFor({ matched: summary.matched, viewerCanUnlockAll: canUnlockAll });
  const meetings = summary.meetings;

  return {
    summary,
    nextStep: nextStepFor({
      stage: summary.stage,
      outcome: summary.outcome,
      interestSent: summary.interestSent,
      interestReceived: summary.interestReceived,
      matched: summary.matched,
      totalMessages: summary.messagesFromUser + summary.messagesFromOther,
      awaitingReplyFrom: summary.awaitingReplyFrom,
      unresolvedTopics: summary.unresolvedTopics.length,
      hasUpcomingMeeting: meetings.some((m) => !m.happenedAt && m.scheduledFor),
      hasPastMeeting: meetings.some((m) => m.happenedAt),
      familyInvolved: summary.familyInvolved,
      lastInteractionAt: summary.lastInteractionAt,
    }),
    person: {
      profileId: profile?.id ?? null,
      name: summary.name,
      age: profile ? ageFromDate(profile.dateOfBirth) : null,
      city: profile?.currentCity ?? null,
      // Locked means no URL at all, not a blurred one — same rule as the reel.
      photoUrl: photoOpen ? (photo?.fileUrl ?? null) : null,
      verified: photo?.verificationStatus === "APPROVED",
      trustScore: profile?.trustScore ?? 0,
    },
    familyNotes: familyNotes.map((n) => ({
      id: n.id,
      body: n.body,
      author: n.familyMember.displayName,
      relation: FAMILY_RELATION_LABELS[n.familyMember.relation],
      createdAt: n.createdAt.toISOString(),
    })),
    shortlistedBy: familyShortlist?.addedByFamilyMember?.displayName ?? null,
    canAskHuman: entitlements.assistedMatchmaker,
    openHumanRequests: humanRequests.filter((r) => r.status !== "RESOLVED").length,

    participants,
    admittableHelpers,
    tasks,
    requests,
    bookings: bookings.map((b) => ({
      id: b.id,
      serviceName: b.service.name,
      partnerName: b.partner.organizationName ?? b.partner.fullName,
      statusLabel: BOOKING_STATUS_LABEL[b.status],
      milestonesDone: b.milestones.filter((m) => m.status === "ACCEPTED").length,
      milestonesTotal: b.milestones.length,
      createdAt: b.createdAt.toISOString(),
    })),

    verificationBadges,
    verificationAsked: pairVerification.asked,
  };
}
