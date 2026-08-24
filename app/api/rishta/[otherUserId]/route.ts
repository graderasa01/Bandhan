import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import {
  addRishtaMeeting,
  addRishtaReflection,
  confirmRishtaStage,
  getRishtaSummary,
  upsertRishtaTopic,
} from "@/lib/services/rishta/journeyService";
import { RISHTA_STAGE_ORDER } from "@/lib/profile/rishtaStages";
import { prisma } from "@/lib/db/prisma";
import type { RishtaStage } from "@prisma/client";

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

const BodySchema = z.discriminatedUnion("action", [
  StageSchema,
  TopicSchema,
  ReflectionSchema,
  MeetingSchema,
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
  const otherUserId = await resolveOtherUserId(raw);
  if (!otherUserId) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Ye insaan nahi mila." }, { status: 404 });
  }
  const summary = await getRishtaSummary(user.id, otherUserId);
  if (!summary) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Is insaan ke saath abhi koi rishta nahi hai." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, summary });
}

export async function POST(req: Request, ctx: { params: Promise<{ otherUserId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { otherUserId: raw } = await ctx.params;
  const otherUserId = await resolveOtherUserId(raw);
  if (!otherUserId) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Ye insaan nahi mila." }, { status: 404 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Request JSON padha nahi ja saka." }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 422 },
    );
  }

  // Every write path below creates the journey row on demand, so this guard is
  // the one place that decides whether a relationship exists at all. Without it
  // a reflection could be filed against a stranger.
  const existing = await getRishtaSummary(user.id, otherUserId);
  if (!existing) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Is insaan ke saath abhi koi rishta nahi hai." }, { status: 404 });
  }

  const body = parsed.data;

  if (body.action === "stage") {
    const result = await confirmRishtaStage(user.id, otherUserId, body.stage, body.reason ?? null);
    if (!result.ok) {
      return NextResponse.json({ error: result.error, message: result.message }, { status: 422 });
    }
    return NextResponse.json({ ok: true, summary: result.summary });
  }

  if (body.action === "topic") {
    await upsertRishtaTopic(user.id, otherUserId, {
      label: body.label,
      resolved: body.resolved,
      outcome: body.outcome,
    });
  } else if (body.action === "reflection") {
    await addRishtaReflection(user.id, otherUserId, body.body);
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
