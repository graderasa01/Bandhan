import "server-only";
import { prisma } from "@/lib/db/prisma";
import { isDelegationLive } from "@/lib/services/managedProfile/delegationService";
import { recordConsentEvent } from "@/lib/services/managedProfile/consentLog";
import { PERMISSION_LABELS } from "@/lib/services/managedProfile/managedProfilePolicy";
import { ensureJourney } from "./journeyService";
import { ROOM_PERMISSIONS } from "./roomCollabPolicy";
import type { ProfileDelegatePermission, RishtaRequestKind } from "@prisma/client";

/**
 * Who else is standing in this rishta, and what they may do while they are.
 *
 * ## Two locks, one key each
 *
 * A helper needs both a live delegation carrying the right permission *and* an
 * admission to this particular rishta. Neither implies the other, and the owner
 * grants them in different places for different reasons: the delegation on
 * `/user/profile/access` ("help me with my profile"), the admission inside one
 * Rishta Room ("help me with *this* one").
 *
 * The separation is the point. Phase 3 gave partners the ability to search and
 * propose across a client's whole search; letting that quietly include a seat
 * inside every relationship it produced would have been the largest permission
 * expansion in the product, granted by nobody.
 *
 * ## Permissions are never copied
 *
 * `RishtaParticipant` stores no permission set. Everything a helper may do is
 * `delegation.permissions ∩ ROOM_PERMISSIONS`, read fresh on every request, so
 * a narrowed or revoked delegation narrows every room the same instant — the
 * same reasoning `hasDelegatedPermission` gives for not caching on a session.
 *
 * ## The allow-list
 *
 * `getParticipantRoomView` is written as an allow-list rather than a filtered
 * copy of the owner's room. A view built by subtraction leaks the day somebody
 * adds a field to the source and forgets this file; a view built by addition
 * simply lacks it. What is deliberately absent: the chat, the owner's private
 * reflections, the meeting checkpoint, and the text of unresolved topics.
 */

export type RoomHelperKind = "PARTNER" | "FAMILY";

export interface RoomParticipantView {
  id: string;
  helperKind: RoomHelperKind;
  helperName: string;
  /** Room permissions this helper actually holds right now. */
  permissions: ProfileDelegatePermission[];
  permissionLabels: string[];
  admittedAt: string;
  /** False when the underlying delegation has expired or been revoked. */
  live: boolean;
  openTasks: number;
  pendingRequests: number;
}

/** Room permissions this delegation currently carries. Order follows the policy. */
function roomPermissionsOf(granted: ProfileDelegatePermission[]): ProfileDelegatePermission[] {
  return ROOM_PERMISSIONS.filter((p) => granted.includes(p));
}

function helperNameOf(row: {
  partner: { fullName: string } | null;
  familyMember: { displayName: string } | null;
}): string {
  return row.partner?.fullName ?? row.familyMember?.displayName ?? "Helper";
}

/* ------------------------------------------------------------------ */
/* The owner's side                                                    */
/* ------------------------------------------------------------------ */

/** Everybody the owner has admitted to this rishta, removed ones excluded. */
export async function listRoomParticipants(
  ownerUserId: string,
  otherUserId: string,
): Promise<RoomParticipantView[]> {
  const journey = await prisma.rishtaJourney.findUnique({
    where: { userId_otherUserId: { userId: ownerUserId, otherUserId } },
    select: { id: true },
  });
  if (!journey) return [];

  const rows = await prisma.rishtaParticipant.findMany({
    where: { journeyId: journey.id, status: "ACTIVE" },
    orderBy: { admittedAt: "asc" },
    include: {
      delegation: {
        include: { partner: { select: { fullName: true } }, familyMember: { select: { displayName: true } } },
      },
      _count: { select: { tasks: { where: { doneAt: null } }, requests: { where: { status: "PROPOSED" } } } },
    },
  });

  const now = new Date();
  return rows.map((r) => ({
    id: r.id,
    helperKind: r.delegation.partnerId ? "PARTNER" : "FAMILY",
    helperName: helperNameOf(r.delegation),
    permissions: roomPermissionsOf(r.delegation.permissions),
    permissionLabels: roomPermissionsOf(r.delegation.permissions).map((p) => PERMISSION_LABELS[p]),
    admittedAt: r.admittedAt.toISOString(),
    live: isDelegationLive(r.delegation, now),
    openTasks: r._count.tasks,
    pendingRequests: r._count.requests,
  }));
}

export interface AdmittableHelper {
  delegationId: string;
  helperKind: RoomHelperKind;
  helperName: string;
  /** Room permissions the grant already carries. May be empty — see below. */
  permissions: ProfileDelegatePermission[];
  permissionLabels: string[];
}

/**
 * Helpers the owner could admit to this rishta but has not.
 *
 * A grant with no room permission at all is still listed. That looks wrong
 * until you read it from the owner's side: admitting Papa so he can see the
 * stage and take a task is a completely ordinary thing to want, and it needs no
 * request permission whatsoever. Being in the room and being able to ask for
 * things are two different grants, and this list refuses to conflate them.
 */
export async function listAdmittableHelpers(
  ownerUserId: string,
  otherUserId: string,
): Promise<AdmittableHelper[]> {
  const [journey, delegations] = await Promise.all([
    prisma.rishtaJourney.findUnique({
      where: { userId_otherUserId: { userId: ownerUserId, otherUserId } },
      select: { id: true },
    }),
    prisma.profileDelegation.findMany({
      where: { ownerUserId, status: "ACTIVE" },
      include: { partner: { select: { fullName: true } }, familyMember: { select: { displayName: true } } },
    }),
  ]);

  const now = new Date();
  const live = delegations.filter((d) => isDelegationLive(d, now));

  const admitted = journey
    ? await prisma.rishtaParticipant.findMany({
        where: { journeyId: journey.id, status: "ACTIVE" },
        select: { delegationId: true },
      })
    : [];
  const taken = new Set(admitted.map((a) => a.delegationId));

  return live
    .filter((d) => !taken.has(d.id))
    .map((d) => ({
      delegationId: d.id,
      helperKind: d.partnerId ? "PARTNER" : "FAMILY",
      helperName: helperNameOf(d),
      permissions: roomPermissionsOf(d.permissions),
      permissionLabels: roomPermissionsOf(d.permissions).map((p) => PERMISSION_LABELS[p]),
    }));
}

export type AdmitResult =
  | { ok: true; participantId: string }
  | { ok: false; error: string; message: string; status: number };

/**
 * Let a helper into one rishta.
 *
 * `ownerUserId` always comes from the session, never a body, so the worst a
 * crafted `delegationId` can do is fail the ownership check below.
 */
export async function admitParticipant(
  ownerUserId: string,
  otherUserId: string,
  delegationId: string,
): Promise<AdmitResult> {
  const delegation = await prisma.profileDelegation.findUnique({
    where: { id: delegationId },
    include: { partner: { select: { fullName: true } }, familyMember: { select: { displayName: true } } },
  });

  // One 404 for "no such grant" and "somebody else's grant" — a delegation id
  // is not a lookup service, the same rule `revokeDelegation` follows.
  if (!delegation || delegation.ownerUserId !== ownerUserId) {
    return { ok: false, error: "NOT_FOUND", message: "Ye permission nahi mili.", status: 404 };
  }
  if (!isDelegationLive(delegation)) {
    return {
      ok: false,
      error: "NOT_LIVE",
      message: "Ye access ab active nahi hai — pehle Profile Access se dobara permission dijiye.",
      status: 409,
    };
  }

  const journeyId = await ensureJourney(ownerUserId, otherUserId);

  // Re-admitting somebody the owner removed updates the same row: one helper,
  // one history, rather than two half-stories the audit trail has to reconcile.
  const participant = await prisma.rishtaParticipant.upsert({
    where: { journeyId_delegationId: { journeyId, delegationId } },
    create: { journeyId, delegationId, admittedBy: ownerUserId },
    update: { status: "ACTIVE", removedAt: null, admittedAt: new Date(), admittedBy: ownerUserId },
    select: { id: true },
  });

  await recordConsentEvent({
    kind: "RISHTA_PARTICIPANT_ADMITTED",
    ownerUserId,
    actorUserId: ownerUserId,
    actorLabel: helperNameOf(delegation),
    delegationId,
    // Deliberately not the candidate's name: the consent log says what the
    // owner allowed, not who they are talking to.
    detail: `${roomPermissionsOf(delegation.permissions).length} room permission`,
  });

  return { ok: true, participantId: participant.id };
}

export type RemoveResult = { ok: true } | { ok: false; error: string; message: string; status: number };

/**
 * Show a helper out of one rishta. Their delegation is untouched — an owner who
 * wants a partner to keep helping with the profile but stay out of one
 * relationship should not have to end the whole arrangement to say so.
 *
 * Their tasks and requests are left where they are. Deleting them would erase
 * the record of what happened while they were in the room, which is exactly the
 * history a removal makes worth keeping.
 */
export async function removeParticipant(ownerUserId: string, participantId: string): Promise<RemoveResult> {
  const row = await prisma.rishtaParticipant.findUnique({
    where: { id: participantId },
    include: {
      journey: { select: { userId: true } },
      delegation: {
        include: { partner: { select: { fullName: true } }, familyMember: { select: { displayName: true } } },
      },
    },
  });
  if (!row || row.journey.userId !== ownerUserId) {
    return { ok: false, error: "NOT_FOUND", message: "Ye nahi mila.", status: 404 };
  }
  if (row.status === "REMOVED") return { ok: true };

  await prisma.$transaction([
    prisma.rishtaParticipant.update({
      where: { id: participantId },
      data: { status: "REMOVED", removedAt: new Date() },
    }),
    // Undecided asks die with the access that raised them. Leaving them
    // PROPOSED would put a removed helper's question in front of the owner
    // forever, and answering it would grant nothing to nobody.
    prisma.rishtaRequest.updateMany({
      where: { participantId, status: "PROPOSED" },
      data: { status: "WITHDRAWN", withdrawnAt: new Date() },
    }),
  ]);

  await recordConsentEvent({
    kind: "RISHTA_PARTICIPANT_REMOVED",
    ownerUserId,
    actorUserId: ownerUserId,
    actorLabel: helperNameOf(row.delegation),
    delegationId: row.delegationId,
  });

  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* The helper's side                                                   */
/* ------------------------------------------------------------------ */

export interface RoomAccess {
  participantId: string;
  journeyId: string;
  ownerUserId: string;
  otherUserId: string;
  helperKind: RoomHelperKind;
  helperName: string;
  permissions: ProfileDelegatePermission[];
}

/**
 * The gate every helper-facing room read and write goes through.
 *
 * One of `partnerId` / `familyMemberId` identifies the caller, and it comes
 * from their own session — `requirePartner` or `requireFamilyMember` — never
 * from the request. A participant id belonging to somebody else therefore
 * resolves to null rather than to access, which is why this returns a single
 * nullable object instead of a set of booleans a caller could forget to check.
 */
export async function resolveRoomAccess(params: {
  participantId: string;
  partnerId?: string | null;
  familyMemberId?: string | null;
}): Promise<RoomAccess | null> {
  if (!params.partnerId && !params.familyMemberId) return null;

  const row = await prisma.rishtaParticipant.findUnique({
    where: { id: params.participantId },
    include: {
      journey: { select: { id: true, userId: true, otherUserId: true } },
      delegation: {
        include: { partner: { select: { fullName: true } }, familyMember: { select: { displayName: true } } },
      },
    },
  });
  if (!row || row.status !== "ACTIVE") return null;

  const d = row.delegation;
  if (params.partnerId ? d.partnerId !== params.partnerId : d.familyMemberId !== params.familyMemberId) {
    return null;
  }
  if (!isDelegationLive(d)) return null;

  return {
    participantId: row.id,
    journeyId: row.journey.id,
    ownerUserId: row.journey.userId,
    otherUserId: row.journey.otherUserId,
    helperKind: d.partnerId ? "PARTNER" : "FAMILY",
    helperName: helperNameOf(d),
    permissions: roomPermissionsOf(d.permissions),
  };
}

export interface HelperRoomCard {
  participantId: string;
  ownerName: string;
  /** The candidate, by display name only. Never their contact, photo or profile id. */
  personName: string;
  stageLabel: string;
  openTasks: number;
  pendingRequests: number;
  nextMeetingAt: string | null;
}

/**
 * The rooms one helper is currently standing in.
 *
 * Scoped by the helper's own identity, so a partner sees rooms across their
 * clients and a family member sees rooms for the one person who invited them.
 */
export async function listRoomsForHelper(params: {
  partnerId?: string | null;
  familyMemberId?: string | null;
}): Promise<HelperRoomCard[]> {
  if (!params.partnerId && !params.familyMemberId) return [];

  const rows = await prisma.rishtaParticipant.findMany({
    where: {
      status: "ACTIVE",
      delegation: params.partnerId
        ? { partnerId: params.partnerId, status: "ACTIVE" }
        : { familyMemberId: params.familyMemberId, status: "ACTIVE" },
    },
    orderBy: { admittedAt: "desc" },
    include: {
      delegation: true,
      journey: {
        select: {
          userId: true,
          otherUserId: true,
          confirmedStage: true,
          user: { select: { fullName: true } },
          meetings: {
            where: { happenedAt: null, scheduledFor: { not: null } },
            orderBy: { scheduledFor: "asc" },
            take: 1,
            select: { scheduledFor: true },
          },
        },
      },
      _count: { select: { tasks: { where: { doneAt: null } }, requests: { where: { status: "PROPOSED" } } } },
    },
  });

  const now = new Date();
  const live = rows.filter((r) => isDelegationLive(r.delegation, now));
  if (live.length === 0) return [];

  // Display names only, resolved in one query rather than a join per row.
  const profiles = await prisma.profile.findMany({
    where: { userId: { in: [...new Set(live.map((r) => r.journey.otherUserId))] } },
    select: { userId: true, displayName: true },
  });
  const nameOf = new Map(profiles.map((p) => [p.userId, p.displayName]));

  return live.map((r) => ({
    participantId: r.id,
    ownerName: r.journey.user.fullName,
    personName: nameOf.get(r.journey.otherUserId) ?? "Profile",
    stageLabel: stageLabelFor(r.journey.confirmedStage),
    openTasks: r._count.tasks,
    pendingRequests: r._count.requests,
    nextMeetingAt: r.journey.meetings[0]?.scheduledFor?.toISOString() ?? null,
  }));
}

/**
 * The helper's view of one room — an allow-list, and short on purpose.
 *
 * A helper gets the stage, the tasks, the requests they raised and a scheduled
 * meeting's date and place. They do not get the chat, the owner's reflections,
 * the checkpoint, the topic list, the candidate's photos or anybody's contact,
 * because none of it is loaded here to begin with.
 */
export interface ParticipantRoomView {
  access: RoomAccess;
  ownerName: string;
  personName: string;
  stageLabel: string;
  tasks: {
    id: string;
    title: string;
    party: string;
    dueAt: string | null;
    doneAt: string | null;
    mine: boolean;
  }[];
  requests: {
    id: string;
    kind: RishtaRequestKind;
    status: string;
    note: string;
    proposedFor: string | null;
    ownerNote: string | null;
    createdAt: string;
  }[];
  nextMeeting: { scheduledFor: string | null; place: string | null } | null;
}

export async function getParticipantRoomView(access: RoomAccess): Promise<ParticipantRoomView> {
  const [journey, profile, tasks, requests] = await Promise.all([
    prisma.rishtaJourney.findUnique({
      where: { id: access.journeyId },
      select: {
        confirmedStage: true,
        user: { select: { fullName: true } },
        meetings: {
          where: { happenedAt: null, scheduledFor: { not: null } },
          orderBy: { scheduledFor: "asc" },
          take: 1,
          select: { scheduledFor: true, place: true },
        },
      },
    }),
    prisma.profile.findUnique({ where: { userId: access.otherUserId }, select: { displayName: true } }),
    prisma.rishtaTask.findMany({
      where: { journeyId: access.journeyId },
      orderBy: [{ doneAt: "asc" }, { createdAt: "desc" }],
      take: 30,
    }),
    prisma.rishtaRequest.findMany({
      // Only this helper's own asks. What the family requested is between the
      // family and the owner — a partner does not get to read it, and vice versa.
      where: { participantId: access.participantId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const meeting = journey?.meetings[0] ?? null;

  return {
    access,
    ownerName: journey?.user.fullName ?? "",
    personName: profile?.displayName ?? "Profile",
    stageLabel: stageLabelFor(journey?.confirmedStage ?? null),
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      party: t.party,
      dueAt: t.dueAt?.toISOString() ?? null,
      doneAt: t.doneAt?.toISOString() ?? null,
      mine: t.participantId === access.participantId,
    })),
    requests: requests.map((r) => ({
      id: r.id,
      kind: r.kind,
      status: r.status,
      note: r.note,
      proposedFor: r.proposedFor?.toISOString() ?? null,
      ownerNote: r.ownerNote,
      createdAt: r.createdAt.toISOString(),
    })),
    nextMeeting: meeting
      ? { scheduledFor: meeting.scheduledFor?.toISOString() ?? null, place: meeting.place }
      : null,
  };
}

/**
 * The stage as a helper is allowed to see it.
 *
 * Only the *confirmed* stage, never the derived one. Derivation reads
 * interests, matches and message counts, and a helper who could see a stage
 * move from DISCOVERED to TALKING would have learnt that the two are messaging
 * — which is a fact about the chat, and the chat is not theirs to have.
 */
function stageLabelFor(stage: string | null): string {
  if (!stage) return "Abhi shuruaat";
  return STAGE_TEXT[stage] ?? "Chal raha hai";
}

const STAGE_TEXT: Record<string, string> = {
  DISCOVERED: "Nazar me aaye",
  INTERESTED: "Interest bheja gaya",
  MUTUAL_MATCH: "Dono ne haan ki",
  TALKING: "Baat chal rahi hai",
  UNDERSTANDING: "Seriously soch rahe hain",
  FAMILY_INVOLVED: "Ghar wale jud chuke hain",
  MEETING_PLANNED: "Mulaqat tay hai",
  MET: "Mil chuke hain",
  DECISION: "Faisle par hain",
  CLOSED: "Ye rishta band ho chuka",
};
