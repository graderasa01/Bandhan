import "server-only";
import { prisma } from "@/lib/db/prisma";
import { recordConsentEvent } from "@/lib/services/managedProfile/consentLog";
import { isDelegationLive } from "@/lib/services/managedProfile/delegationService";
import { createNotice } from "@/lib/services/notice/noticeService";
import {
  MAX_OWNER_NOTE_CHARS,
  MAX_PENDING_REQUESTS_PER_ROOM,
  MAX_REQUEST_LEAD_DAYS,
  MAX_REQUEST_NOTE_CHARS,
  MAX_REQUEST_PLACE_CHARS,
  MIN_REQUEST_NOTE_CHARS,
  PERMISSION_FOR_REQUEST,
  REQUEST_KIND_LABEL,
  REQUEST_STATUS_LABEL,
} from "./roomCollabPolicy";
import type { RoomAccess } from "./roomParticipantService";
import type { RishtaRequestKind, RishtaRequestStatus } from "@prisma/client";

/**
 * A helper asking the owner to move one rishta forward.
 *
 * ## The one rule this file exists to enforce
 *
 * Approval is the only thing with an effect. A request is a row and a
 * notification; it schedules nothing, tells nobody, and reveals no contact. The
 * owner's tap is what creates a meeting on their own journey — and even then
 * the meeting is *theirs*, on their row, editable and deletable by them alone.
 *
 * That is why `decideRequest` is the only function here that writes outside
 * this table, and why it takes the owner's id from a session rather than a
 * body. Everything else is a helper writing into their own lane.
 *
 * ## Why approving a family introduction creates a task instead of an event
 *
 * "Ghar walon ko jodna hai" is something a person does, at home, in their own
 * time. The app cannot perform it and should not pretend to have. So an
 * approved FAMILY_INTRO produces exactly what the owner now owes — a task with
 * their name on it — and leaves the doing to them. Marking the stage
 * FAMILY_INVOLVED stays the owner's own confirmation on the stage strip, where
 * every other stage claim is made.
 */

export interface RoomRequestView {
  id: string;
  kind: RishtaRequestKind;
  kindLabel: string;
  status: RishtaRequestStatus;
  statusLabel: string;
  note: string;
  proposedFor: string | null;
  proposedPlace: string | null;
  raisedByLabel: string;
  helperKind: "PARTNER" | "FAMILY";
  ownerNote: string | null;
  ownerDecidedAt: string | null;
  createdAt: string;
}

/**
 * The owner's approval queue for one rishta — pending first, then the history.
 *
 * ## Why this function writes
 *
 * An ask outlives the access that made it. A partner raises a meeting request
 * on Monday, the owner revokes them on Tuesday, and on Wednesday the question
 * is still sitting in the owner's queue with a Yes button under it — from
 * somebody who is no longer in the room.
 *
 * `removeParticipant` withdraws its own pending asks, but revocation and expiry
 * happen elsewhere and must not have to know that rooms exist. So the same
 * pattern `hasDelegatedPermission` uses for expiry applies here: the dead ones
 * are worked out on read and written through the first time anybody looks. No
 * scheduler, and the queue is honest on the very next render.
 */
export async function listRoomRequests(ownerUserId: string, otherUserId: string): Promise<RoomRequestView[]> {
  const journey = await prisma.rishtaJourney.findUnique({
    where: { userId_otherUserId: { userId: ownerUserId, otherUserId } },
    select: { id: true },
  });
  if (!journey) return [];

  const rows = await prisma.rishtaRequest.findMany({
    where: { journeyId: journey.id },
    orderBy: [{ ownerDecidedAt: "asc" }, { createdAt: "desc" }],
    take: 40,
    include: { participant: { include: { delegation: true } } },
  });

  const now = new Date();
  const orphaned = rows.filter((r) => r.status === "PROPOSED" && !isAskStillLive(r.participant, now));
  if (orphaned.length > 0) {
    await prisma.rishtaRequest.updateMany({
      where: { id: { in: orphaned.map((r) => r.id) }, status: "PROPOSED" },
      data: { status: "WITHDRAWN", withdrawnAt: now },
    });
  }
  const orphanedIds = new Set(orphaned.map((r) => r.id));

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    kindLabel: REQUEST_KIND_LABEL[r.kind],
    status: orphanedIds.has(r.id) ? "WITHDRAWN" : r.status,
    statusLabel: REQUEST_STATUS_LABEL[orphanedIds.has(r.id) ? "WITHDRAWN" : r.status],
    note: r.note,
    proposedFor: r.proposedFor?.toISOString() ?? null,
    proposedPlace: r.proposedPlace,
    raisedByLabel: r.raisedByLabel,
    helperKind: r.participant.delegation.partnerId ? "PARTNER" : "FAMILY",
    ownerNote: r.ownerNote,
    ownerDecidedAt: r.ownerDecidedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Is the access behind an undecided ask still real?
 *
 * Both halves of Phase 4's two locks have to hold: the participant still
 * admitted to this room, and the delegation behind them still live. Either one
 * failing makes the ask unanswerable, because approving it would be the owner
 * agreeing with somebody who is no longer there.
 */
function isAskStillLive(
  participant: { status: string; delegation: Parameters<typeof isDelegationLive>[0] },
  now: Date,
): boolean {
  return participant.status === "ACTIVE" && isDelegationLive(participant.delegation, now);
}

export type RequestResult =
  | { ok: true; requestId: string }
  | { ok: false; error: string; message: string; status: number };

export interface RaiseRequestInput {
  kind: RishtaRequestKind;
  note: string;
  proposedFor?: Date | null;
  proposedPlace?: string | null;
  /** The helper's own login, when they have one. Family portal sessions do not. */
  actorUserId?: string | null;
}

/**
 * A helper raising an ask. `access` has already been resolved against the
 * helper's own session, so this never sees a participant id from a request body.
 */
export async function raiseRequest(access: RoomAccess, input: RaiseRequestInput): Promise<RequestResult> {
  const permission = PERMISSION_FOR_REQUEST[input.kind];
  if (!access.permissions.includes(permission)) {
    return {
      ok: false,
      error: "NO_PERMISSION",
      message: "Iske liye aapko permission nahi mili hai.",
      status: 403,
    };
  }

  // `access` was resolved from a live session by the route, but it is still a
  // value somebody could hold on to across a removal. Re-reading the row is one
  // indexed lookup and removes the only way a stale object could write — the
  // same "no default-allow branch" discipline `hasDelegatedPermission` keeps.
  const participant = await prisma.rishtaParticipant.findUnique({
    where: { id: access.participantId },
    include: { delegation: true },
  });
  if (!participant || !isAskStillLive(participant, new Date())) {
    return { ok: false, error: "NO_ACCESS", message: "Aap ab is rishtey me nahi hain.", status: 403 };
  }

  const note = input.note.trim();
  if (note.length < MIN_REQUEST_NOTE_CHARS) {
    return {
      ok: false,
      error: "NOTE_TOO_SHORT",
      message: "Wajah likhna zaroori hai — bina wajah ke request nahi bhej sakte.",
      status: 422,
    };
  }

  if (input.proposedFor) {
    const days = (input.proposedFor.getTime() - Date.now()) / 86_400_000;
    if (days < -1 || days > MAX_REQUEST_LEAD_DAYS) {
      return { ok: false, error: "BAD_DATE", message: "Ye tareekh theek nahi lag rahi.", status: 422 };
    }
  }

  // Two caps, and they say different things. The per-kind one is the anti-nag
  // rule: asking twice for the same meeting is pressure with a timestamp on it.
  // The total is the "pick up the phone" rule.
  const [sameKind, pending] = await Promise.all([
    prisma.rishtaRequest.count({
      where: { participantId: access.participantId, kind: input.kind, status: "PROPOSED" },
    }),
    prisma.rishtaRequest.count({ where: { participantId: access.participantId, status: "PROPOSED" } }),
  ]);
  if (sameKind > 0) {
    return {
      ok: false,
      error: "ALREADY_PENDING",
      message: "Ye baat pehle se unke saamne hai — jawaab ka intezaar kariye.",
      status: 409,
    };
  }
  if (pending >= MAX_PENDING_REQUESTS_PER_ROOM) {
    return {
      ok: false,
      error: "TOO_MANY_PENDING",
      message: "Aapki teen baatein pehle se unke saamne hain. Jawaab aane tak nayi nahi bhej sakte.",
      status: 409,
    };
  }

  const request = await prisma.rishtaRequest.create({
    data: {
      journeyId: access.journeyId,
      participantId: access.participantId,
      kind: input.kind,
      note: note.slice(0, MAX_REQUEST_NOTE_CHARS),
      proposedFor: input.proposedFor ?? null,
      proposedPlace: input.proposedPlace?.trim().slice(0, MAX_REQUEST_PLACE_CHARS) || null,
      raisedByUserId: input.actorUserId ?? null,
      raisedByLabel: access.helperName,
    },
    select: { id: true },
  });

  await Promise.all([
    recordConsentEvent({
      kind: "RISHTA_REQUEST_RAISED",
      ownerUserId: access.ownerUserId,
      actorUserId: input.actorUserId ?? null,
      actorLabel: access.helperName,
      detail: REQUEST_KIND_LABEL[input.kind],
    }),
    // Names the ask and the helper, never the candidate — this string is read
    // off a lock screen.
    createNotice({
      userId: access.ownerUserId,
      kind: "RISHTA_REQUEST",
      title: `${access.helperName} ne aapse kuch poochha hai`,
      body: `${REQUEST_KIND_LABEL[input.kind]} — aapka jawaab chahiye.`,
      href: `/user/rishta/${access.otherUserId}#room-requests`,
    }),
  ]);

  return { ok: true, requestId: request.id };
}

/** The helper taking their own ask back before the owner has answered it. */
export async function withdrawRequest(access: RoomAccess, requestId: string): Promise<RequestResult> {
  const row = await prisma.rishtaRequest.findFirst({
    where: { id: requestId, participantId: access.participantId },
    select: { id: true, status: true },
  });
  if (!row) return { ok: false, error: "NOT_FOUND", message: "Ye request nahi mili.", status: 404 };
  if (row.status !== "PROPOSED") {
    return { ok: false, error: "ALREADY_DECIDED", message: "Is par jawaab aa chuka hai.", status: 409 };
  }

  await prisma.rishtaRequest.update({
    where: { id: requestId },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() },
  });
  return { ok: true, requestId };
}

export interface DecideRequestInput {
  approve: boolean;
  ownerNote?: string | null;
  /** The owner's own time and place, which override whatever was proposed. */
  scheduledFor?: Date | null;
  place?: string | null;
}

/**
 * The owner's answer — and the only place in this feature where a yes turns
 * into a row on the rishta itself.
 *
 * A CALL and a MEETING both become a `RishtaMeeting`, because that is what the
 * app already means by "a time the two of them are going to talk". The call is
 * distinguished by its place, in the owner's own words, exactly as it would be
 * if they had added it themselves from the Meetings card.
 */
export async function decideRequest(
  ownerUserId: string,
  requestId: string,
  input: DecideRequestInput,
): Promise<RequestResult> {
  const row = await prisma.rishtaRequest.findUnique({
    where: { id: requestId },
    include: {
      journey: { select: { id: true, userId: true, otherUserId: true } },
      participant: { include: { delegation: true } },
    },
  });
  if (!row || row.journey.userId !== ownerUserId) {
    return { ok: false, error: "NOT_FOUND", message: "Ye request nahi mili.", status: 404 };
  }
  if (row.status !== "PROPOSED") {
    return { ok: false, error: "ALREADY_DECIDED", message: "Is par jawaab pehle hi de diya gaya hai.", status: 409 };
  }

  const now = new Date();

  // The queue write-through above normally means the owner never sees a dead
  // ask — this is the same rule enforced against a stale client, and it says
  // what to do instead rather than only refusing.
  if (!isAskStillLive(row.participant, now)) {
    await prisma.rishtaRequest.update({
      where: { id: requestId },
      data: { status: "WITHDRAWN", withdrawnAt: now },
    });
    return {
      ok: false,
      error: "ASK_EXPIRED",
      message: "Jinhone ye kaha tha, wo ab is rishtey me nahi hain — mulaqat khud jod sakte hain.",
      status: 409,
    };
  }
  const ownerNote = input.ownerNote?.trim().slice(0, MAX_OWNER_NOTE_CHARS) || null;

  if (!input.approve) {
    await prisma.rishtaRequest.update({
      where: { id: requestId },
      data: { status: "DECLINED", ownerDecidedAt: now, ownerNote },
    });
    await recordConsentEvent({
      kind: "RISHTA_REQUEST_DECLINED",
      ownerUserId,
      actorUserId: ownerUserId,
      actorLabel: row.raisedByLabel,
      detail: REQUEST_KIND_LABEL[row.kind],
    });
    return { ok: true, requestId };
  }

  if (row.kind === "FAMILY_INTRO") {
    // The app cannot introduce two families. It can be honest about who now
    // owes the doing, which is the owner — see the note at the top of the file.
    await prisma.$transaction([
      prisma.rishtaRequest.update({
        where: { id: requestId },
        data: { status: "APPROVED", ownerDecidedAt: now, ownerNote },
      }),
      prisma.rishtaTask.create({
        data: {
          journeyId: row.journey.id,
          title: "Ghar walon ko is rishtey me jodna hai",
          party: "OWNER",
          createdByUserId: ownerUserId,
          createdByLabel: row.raisedByLabel,
        },
      }),
    ]);
  } else {
    const scheduledFor = input.scheduledFor ?? row.proposedFor ?? null;
    const place =
      input.place?.trim().slice(0, MAX_REQUEST_PLACE_CHARS) ||
      row.proposedPlace ||
      (row.kind === "CALL" ? "Call" : null);

    const meeting = await prisma.rishtaMeeting.create({
      data: { journeyId: row.journey.id, scheduledFor, place, note: null },
      select: { id: true },
    });
    await prisma.rishtaRequest.update({
      where: { id: requestId },
      data: { status: "APPROVED", ownerDecidedAt: now, ownerNote, meetingId: meeting.id },
    });
  }

  await recordConsentEvent({
    kind: "RISHTA_REQUEST_APPROVED",
    ownerUserId,
    actorUserId: ownerUserId,
    actorLabel: row.raisedByLabel,
    detail: REQUEST_KIND_LABEL[row.kind],
  });

  return { ok: true, requestId };
}
