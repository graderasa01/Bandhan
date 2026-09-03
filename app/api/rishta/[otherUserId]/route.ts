import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { getT } from "@/lib/i18n/server";
import type { Translate } from "@/lib/i18n/translate";
import {
  addRishtaMeeting,
  addRishtaReflection,
  confirmRishtaStage,
  getRishtaSummary,
  markRishtaMeetingHappened,
  saveMeetingCheckpoint,
  upsertRishtaTopic,
} from "@/lib/services/rishta/journeyService";
import { admitParticipant, removeParticipant } from "@/lib/services/rishta/roomParticipantService";
import { completeRoomTask, createRoomTask, deleteRoomTask } from "@/lib/services/rishta/roomTaskService";
import { decideRequest } from "@/lib/services/rishta/roomRequestService";
import { MAX_OWNER_NOTE_CHARS, MAX_TASK_TITLE_CHARS } from "@/lib/services/rishta/roomCollabPolicy";
import { RISHTA_OUTCOME_ORDER, RISHTA_STAGE_ORDER } from "@/lib/profile/rishtaStages";
import { prisma } from "@/lib/db/prisma";
import type { RishtaOutcome, RishtaStage } from "@prisma/client";

export const runtime = "nodejs";

/**
 * One rishta's journey — the caller's own view of it, always.
 *
 * `otherUserId` names the other person and nothing else: every read and write
 * below is scoped to `user.id` as the owner, so a crafted id can only ever
 * reach the caller's own row. There is no shape of this route that returns
 * somebody else's stage, topics or reflections — which matters because those
 * are the most private things in the app. "Papa ko involve kar diya" and "yahan
 * clear nahi hai" are notes a person writes for themselves.
 *
 * A stranger's id returns 404 rather than an empty journey: `getRishtaSummary`
 * is null until some real relationship exists, and inventing an empty one would
 * let this endpoint confirm that an arbitrary user id is real.
 */

const StageSchema = z.object({
  action: z.literal("stage"),
  stage: z.enum(RISHTA_STAGE_ORDER as [RishtaStage, ...RishtaStage[]]),
  reason: z.string().max(300).optional(),
  /**
   * Only read when `stage` is CLOSED — `confirmRishtaStage` drops it
   * otherwise rather than trusting the caller to be consistent, so a request
   * carrying `{ stage: "MET", outcome: "MARRIED" }` stores no outcome at all.
   */
  outcome: z.enum(RISHTA_OUTCOME_ORDER as [RishtaOutcome, ...RishtaOutcome[]]).optional(),
});

const TopicSchema = z.object({
  action: z.literal("topic"),
  label: z.string().min(1).max(120),
  resolved: z.boolean().optional(),
  outcome: z.string().max(300).optional(),
});

const ReflectionSchema = z.object({
  action: z.literal("reflection"),
  body: z.string().min(1).max(1000),
});

const MeetingSchema = z.object({
  action: z.literal("meeting"),
  scheduledFor: z.string().datetime().optional(),
  happenedAt: z.string().datetime().optional(),
  place: z.string().max(120).optional(),
  note: z.string().max(500).optional(),
});

const MeetingDoneSchema = z.object({
  action: z.literal("meeting-done"),
  meetingId: z.string().uuid(),
  happenedAt: z.string().datetime().optional(),
  note: z.string().max(500).optional(),
});

/**
 * Phase 4 — the room's collaboration actions.
 *
 * All owner-side, all on the same endpoint as the rest of the Room, because
 * every panel writes through one hook (`useRishtaPost`) and a second endpoint
 * would be a second place to forget the refresh that keeps "agla kadam"
 * truthful. The helper's own actions live elsewhere — they authenticate
 * differently — see `roomHelperActions`.
 */
const ParticipantAdmitSchema = z.object({
  action: z.literal("participant-admit"),
  delegationId: z.string().uuid(),
});

const ParticipantRemoveSchema = z.object({
  action: z.literal("participant-remove"),
  participantId: z.string().uuid(),
});

const TaskAddSchema = z.object({
  action: z.literal("task-add"),
  title: z.string().min(1).max(MAX_TASK_TITLE_CHARS),
  party: z.enum(["OWNER", "FAMILY", "PARTNER"]),
  participantId: z.string().uuid().optional(),
  dueAt: z.string().datetime().optional(),
});

const TaskDoneSchema = z.object({
  action: z.literal("task-done"),
  taskId: z.string().uuid(),
  done: z.boolean(),
});

const TaskDeleteSchema = z.object({ action: z.literal("task-delete"), taskId: z.string().uuid() });

const RequestDecideSchema = z.object({
  action: z.literal("request-decide"),
  requestId: z.string().uuid(),
  approve: z.boolean(),
  ownerNote: z.string().max(MAX_OWNER_NOTE_CHARS).optional(),
  /** The owner's own time and place win over whatever the helper proposed. */
  scheduledFor: z.string().datetime().optional(),
  place: z.string().max(120).optional(),
});

const MeetingCheckpointSchema = z.object({
  action: z.literal("meeting-checkpoint"),
  meetingId: z.string().uuid(),
  feeling: z.enum(["WENT_WELL", "UNSURE", "NOT_RIGHT", "FELT_UNSAFE"]),
  note: z.string().max(700).optional(),
});

const BodySchema = z.discriminatedUnion("action", [
  StageSchema,
  TopicSchema,
  ReflectionSchema,
  MeetingSchema,
  MeetingDoneSchema,
  ParticipantAdmitSchema,
  ParticipantRemoveSchema,
  TaskAddSchema,
  TaskDoneSchema,
  TaskDeleteSchema,
  RequestDecideSchema,
  MeetingCheckpointSchema,
]);

/**
 * The path segment is a **user** id, but Grio's action chips carry a *profile*
 * id — `GrioActionTargetRef` is built from the open profile or the person
 * picker, and neither knows a user id.
 *
 * Rather than a second route or a lookup in the client, the segment accepts
 * either and resolves here. A user id is tried first and a profile id is the
 * fallback, which is unambiguous in practice: both are uuids from different
 * tables, so a value that matches a `Profile.id` is a profile id.
 *
 * Returning the *user* id keeps the journey keyed on the person rather than on
 * a profile row that could be replaced — see the `RishtaJourney` model note on
 * why a journey outlives a profile going hidden.
 */
function personNotFoundResponse(t: Translate) {
  return NextResponse.json({ error: "NOT_FOUND", message: t("rishtaRoom.api.personNotFound", "Ye insaan nahi mila.") }, { status: 404 });
}

function noRishtaResponse(t: Translate) {
  return NextResponse.json(
    { error: "NOT_FOUND", message: t("rishtaRoom.api.noRishta", "Is insaan ke saath abhi koi rishta nahi hai.") },
    { status: 404 },
  );
}

async function resolveOtherUserId(idOrProfileId: string): Promise<string | null> {
  const asUser = await prisma.user.findUnique({ where: { id: idOrProfileId }, select: { id: true } });
  if (asUser) return asUser.id;
  const asProfile = await prisma.profile.findUnique({
    where: { id: idOrProfileId },
    select: { userId: true },
  });
  return asProfile?.userId ?? null;
}

export async function GET(_req: Request, ctx: { params: Promise<{ otherUserId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { otherUserId: raw } = await ctx.params;
  const t = await getT();
  const otherUserId = await resolveOtherUserId(raw);
  if (!otherUserId) return personNotFoundResponse(t);
  const summary = await getRishtaSummary(user.id, otherUserId);
  if (!summary) return noRishtaResponse(t);
  return NextResponse.json({ ok: true, summary });
}

export async function POST(req: Request, ctx: { params: Promise<{ otherUserId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { otherUserId: raw } = await ctx.params;
  const t = await getT();
  const otherUserId = await resolveOtherUserId(raw);
  if (!otherUserId) return personNotFoundResponse(t);

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: t("rishtaRoom.api.badJson", "Request JSON padha nahi ja saka.") },
      { status: 400 },
    );
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? t("rishtaRoom.api.invalidRequest", "Invalid request.") },
      { status: 422 },
    );
  }

  // Every write path below creates the journey row on demand, so this guard is
  // the one place that decides whether a relationship exists at all. Without it
  // a reflection could be filed against a stranger.
  const existing = await getRishtaSummary(user.id, otherUserId);
  if (!existing) return noRishtaResponse(t);

  const body = parsed.data;

  if (body.action === "stage") {
    const result = await confirmRishtaStage(
      user.id,
      otherUserId,
      body.stage,
      body.reason ?? null,
      body.outcome ?? null,
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error, message: result.message }, { status: 422 });
    }
    return NextResponse.json({ ok: true, summary: result.summary });
  }

  // ---- Phase 4 -----------------------------------------------------
  // Each of these carries its own failure message, so they return early
  // instead of falling through to the shared 200 below.
  if (
    body.action === "participant-admit" ||
    body.action === "participant-remove" ||
    body.action === "task-add" ||
    body.action === "task-done" ||
    body.action === "task-delete" ||
    body.action === "request-decide"
  ) {
    const result = await runOwnerRoomAction(user.id, otherUserId, body);
    if (!result.ok) {
      return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
    }
    return NextResponse.json({ ok: true, summary: await getRishtaSummary(user.id, otherUserId) });
  }

  if (body.action === "meeting-checkpoint") {
    const saved = await saveMeetingCheckpoint(user.id, body.meetingId, {
      feeling: body.feeling,
      note: body.note ?? null,
    });
    if (!saved) {
      return NextResponse.json({ error: "NOT_FOUND", message: t("rishtaRoom.api.meetingNotFound", "Ye mulaqat nahi mili.") }, { status: 404 });
    }
    return NextResponse.json({ ok: true, summary: await getRishtaSummary(user.id, otherUserId) });
  }

  if (body.action === "topic") {
    await upsertRishtaTopic(user.id, otherUserId, {
      label: body.label,
      resolved: body.resolved,
      outcome: body.outcome,
    });
  } else if (body.action === "reflection") {
    await addRishtaReflection(user.id, otherUserId, body.body);
  } else if (body.action === "meeting-done") {
    // Scoped to the caller inside the service, so a meeting id belonging to
    // somebody else's journey is a 404 here rather than a silent no-op.
    const done = await markRishtaMeetingHappened(user.id, body.meetingId, {
      happenedAt: body.happenedAt ? new Date(body.happenedAt) : null,
      note: body.note ?? null,
    });
    if (!done) {
      return NextResponse.json({ error: "NOT_FOUND", message: t("rishtaRoom.api.meetingNotFound", "Ye mulaqat nahi mili.") }, { status: 404 });
    }
  } else {
    await addRishtaMeeting(user.id, otherUserId, {
      scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : null,
      happenedAt: body.happenedAt ? new Date(body.happenedAt) : null,
      place: body.place ?? null,
      note: body.note ?? null,
    });
  }

  return NextResponse.json({ ok: true, summary: await getRishtaSummary(user.id, otherUserId) });
}

/**
 * The owner's collaboration writes, kept out of the handler so the handler
 * stays a list of actions rather than a wall of branches.
 *
 * `ownerUserId` is the session's in every call — the request body names rows,
 * never people, and each service re-checks that the row it was handed belongs
 * to this owner's journey.
 */
async function runOwnerRoomAction(
  ownerUserId: string,
  otherUserId: string,
  body: Extract<
    z.infer<typeof BodySchema>,
    { action: "participant-admit" | "participant-remove" | "task-add" | "task-done" | "task-delete" | "request-decide" }
  >,
): Promise<{ ok: true } | { ok: false; error: string; message: string; status: number }> {
  switch (body.action) {
    case "participant-admit": {
      const r = await admitParticipant(ownerUserId, otherUserId, body.delegationId);
      return r.ok ? { ok: true } : r;
    }
    case "participant-remove": {
      const r = await removeParticipant(ownerUserId, body.participantId);
      return r.ok ? { ok: true } : r;
    }
    case "task-add": {
      const r = await createRoomTask(ownerUserId, otherUserId, {
        title: body.title,
        party: body.party,
        participantId: body.participantId ?? null,
        dueAt: body.dueAt ? new Date(body.dueAt) : null,
      });
      return r.ok ? { ok: true } : r;
    }
    case "task-done": {
      const r = await completeRoomTask({ ownerUserId }, body.taskId, body.done);
      return r.ok ? { ok: true } : r;
    }
    case "task-delete": {
      const r = await deleteRoomTask(ownerUserId, body.taskId);
      return r.ok ? { ok: true } : r;
    }
    case "request-decide": {
      const r = await decideRequest(ownerUserId, body.requestId, {
        approve: body.approve,
        ownerNote: body.ownerNote ?? null,
        scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : null,
        place: body.place ?? null,
      });
      return r.ok ? { ok: true } : r;
    }
  }
}
