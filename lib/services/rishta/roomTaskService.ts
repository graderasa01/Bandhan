import "server-only";
import { prisma } from "@/lib/db/prisma";
import { recordConsentEvent } from "@/lib/services/managedProfile/consentLog";
import { createNotice } from "@/lib/services/notice/noticeService";
import { ensureJourney } from "./journeyService";
import { MAX_OPEN_TASKS_PER_ROOM, MAX_TASK_TITLE_CHARS, TASK_PARTY_LABEL } from "./roomCollabPolicy";
import type { RoomAccess } from "./roomParticipantService";
import type { RishtaTaskParty } from "@prisma/client";

/**
 * Who owes what inside one rishta.
 *
 * ## Tasks only ever flow one way
 *
 * The owner writes them; a helper reads their own and marks it done. A helper
 * cannot create one, and specifically cannot create one for the owner — a
 * partner who could put "aaj shaam tak jawaab dijiye" on their client's screen
 * would have invented a pressure mechanism, and the product's answer to "what
 * should I do next" would stop being the owner's own.
 *
 * What a helper *can* do is ask, and that has its own table with an approval
 * on it. See `roomRequestService`.
 *
 * ## Why the assignee is a party, not a person
 *
 * The board's promise is one responsible party per rishta. `OWNER` covers the
 * common case with no participant row at all, and `FAMILY` / `PARTNER` name a
 * specific helper through `participantId`. A task whose helper is later removed
 * keeps its party and loses its pointer (`onDelete: SetNull`) — "ghar walon ka
 * kaam tha" survives the person leaving, which is the honest record.
 */

export interface RoomTaskView {
  id: string;
  title: string;
  party: RishtaTaskParty;
  partyLabel: string;
  /** The helper's own name when one is assigned; null for the owner's tasks. */
  assigneeName: string | null;
  participantId: string | null;
  dueAt: string | null;
  doneAt: string | null;
  doneByLabel: string | null;
  overdue: boolean;
}

export async function listRoomTasks(ownerUserId: string, otherUserId: string): Promise<RoomTaskView[]> {
  const journey = await prisma.rishtaJourney.findUnique({
    where: { userId_otherUserId: { userId: ownerUserId, otherUserId } },
    select: { id: true },
  });
  if (!journey) return [];

  const rows = await prisma.rishtaTask.findMany({
    where: { journeyId: journey.id },
    orderBy: [{ doneAt: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
    include: {
      participant: {
        select: {
          delegation: {
            select: { partner: { select: { fullName: true } }, familyMember: { select: { displayName: true } } },
          },
        },
      },
    },
  });

  const now = Date.now();
  return rows.map((t) => ({
    id: t.id,
    title: t.title,
    party: t.party,
    partyLabel: TASK_PARTY_LABEL[t.party],
    assigneeName:
      t.participant?.delegation.partner?.fullName ?? t.participant?.delegation.familyMember?.displayName ?? null,
    participantId: t.participantId,
    dueAt: t.dueAt?.toISOString() ?? null,
    doneAt: t.doneAt?.toISOString() ?? null,
    doneByLabel: t.doneByLabel,
    overdue: !t.doneAt && t.dueAt ? t.dueAt.getTime() < now : false,
  }));
}

export type TaskResult =
  | { ok: true; taskId: string }
  | { ok: false; error: string; message: string; status: number };

/** The owner adding a task, to themselves or to somebody they admitted. */
export async function createRoomTask(
  ownerUserId: string,
  otherUserId: string,
  input: { title: string; party: RishtaTaskParty; participantId?: string | null; dueAt?: Date | null },
): Promise<TaskResult> {
  const title = input.title.trim().slice(0, MAX_TASK_TITLE_CHARS);
  if (!title) {
    return { ok: false, error: "EMPTY_TITLE", message: "Kaam kya hai, ye likhna zaroori hai.", status: 422 };
  }

  const journeyId = await ensureJourney(ownerUserId, otherUserId);

  const openCount = await prisma.rishtaTask.count({ where: { journeyId, doneAt: null } });
  if (openCount >= MAX_OPEN_TASKS_PER_ROOM) {
    return {
      ok: false,
      error: "TOO_MANY_TASKS",
      message: `Ek rishtey me ${MAX_OPEN_TASKS_PER_ROOM} se zyada khule kaam nahi rakhe ja sakte — pehle kuch poore kariye.`,
      status: 409,
    };
  }

  // A task assigned to a helper has to name a helper who is actually in *this*
  // room. Without this check a valid participant id from another rishta would
  // quietly attach, and the helper would see a task from a relationship they
  // were never admitted to.
  let participantId: string | null = null;
  if (input.party !== "OWNER") {
    if (!input.participantId) {
      return { ok: false, error: "NO_ASSIGNEE", message: "Kis ko dena hai, ye chunna hoga.", status: 422 };
    }
    const participant = await prisma.rishtaParticipant.findFirst({
      where: { id: input.participantId, journeyId, status: "ACTIVE" },
      include: { delegation: { select: { partnerId: true, familyMemberId: true } } },
    });
    if (!participant) {
      return { ok: false, error: "NOT_A_PARTICIPANT", message: "Ye helper is rishtey me nahi hain.", status: 404 };
    }
    const isPartner = Boolean(participant.delegation.partnerId);
    if ((input.party === "PARTNER") !== isPartner) {
      return { ok: false, error: "PARTY_MISMATCH", message: "Ye kaam is helper ka nahi ho sakta.", status: 422 };
    }
    participantId = participant.id;
  }

  const task = await prisma.rishtaTask.create({
    data: {
      journeyId,
      title,
      party: input.party,
      participantId,
      dueAt: input.dueAt ?? null,
      createdByUserId: ownerUserId,
      createdByLabel: "Aap",
    },
    select: { id: true },
  });

  if (participantId) {
    await recordConsentEvent({
      kind: "RISHTA_TASK_ASSIGNED",
      ownerUserId,
      actorUserId: ownerUserId,
      actorLabel: TASK_PARTY_LABEL[input.party],
    });
  }

  return { ok: true, taskId: task.id };
}

/**
 * Marking a task done — by the owner, or by the helper it belongs to.
 *
 * A helper may only close their own row, which is why `access` is passed whole
 * rather than as an id: the participant it names has already been resolved
 * against that helper's own session by `resolveRoomAccess`.
 */
export async function completeRoomTask(
  actor: { ownerUserId: string } | { access: RoomAccess },
  taskId: string,
  done: boolean,
): Promise<TaskResult> {
  const task = await prisma.rishtaTask.findUnique({
    where: { id: taskId },
    include: { journey: { select: { userId: true, otherUserId: true } } },
  });
  if (!task) return { ok: false, error: "NOT_FOUND", message: "Ye kaam nahi mila.", status: 404 };

  let label: string;
  if ("ownerUserId" in actor) {
    if (task.journey.userId !== actor.ownerUserId) {
      return { ok: false, error: "NOT_FOUND", message: "Ye kaam nahi mila.", status: 404 };
    }
    label = "Aap";
  } else {
    if (task.participantId !== actor.access.participantId) {
      return { ok: false, error: "NOT_FOUND", message: "Ye kaam nahi mila.", status: 404 };
    }
    label = actor.access.helperName;
  }

  await prisma.rishtaTask.update({
    where: { id: taskId },
    data: done ? { doneAt: new Date(), doneByLabel: label } : { doneAt: null, doneByLabel: null },
  });

  // The owner hears about a helper finishing something. Under the masking rule
  // this names the task and the helper, never the candidate.
  if (done && !("ownerUserId" in actor)) {
    await createNotice({
      userId: task.journey.userId,
      kind: "RISHTA_REQUEST",
      title: `${label} ne ek kaam poora kiya`,
      body: task.title,
      href: `/user/rishta/${task.journey.otherUserId}#room-tasks`,
    });
  }

  return { ok: true, taskId };
}

export async function deleteRoomTask(ownerUserId: string, taskId: string): Promise<TaskResult> {
  const task = await prisma.rishtaTask.findUnique({
    where: { id: taskId },
    select: { id: true, journey: { select: { userId: true } } },
  });
  if (!task || task.journey.userId !== ownerUserId) {
    return { ok: false, error: "NOT_FOUND", message: "Ye kaam nahi mila.", status: 404 };
  }
  await prisma.rishtaTask.delete({ where: { id: taskId } });
  return { ok: true, taskId };
}
