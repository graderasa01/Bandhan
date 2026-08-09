import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { prisma } from "@/lib/db/prisma";
import { blockUser, unblockUser } from "@/lib/services/safety/blockService";
import { createReport } from "@/lib/services/safety/reportService";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";

/**
 * Block and report in one route because the UI offers them together and the
 * important case — "report AND stop hearing from them" — must be a single
 * request. Splitting it would create a window where a user has accused someone
 * but is still receiving from them.
 */
const ActionSchema = z.object({
  action: z.enum(["block", "unblock", "report"]),
  /** Either identifier works; the reel has profileIds, the inbox has userIds. */
  profileId: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
  reason: z.string().max(120).optional(),
  details: z.string().max(1000).optional(),
  targetType: z.enum(["VOICE_NOTE", "PROFILE", "MESSAGE", "QUESTION"]).optional(),
  targetId: z.string().optional(),
  /** Reporting without blocking is allowed, but blocking is the default. */
  alsoBlock: z.boolean().optional(),
});

/**
 * Works out who is being acted on.
 *
 * The VOICE_NOTE branch matters: a *locked* note deliberately gives the client
 * no sender id, so reporting one has to be possible without the reporter ever
 * learning who sent it. The server resolves it from the note — and only for a
 * note actually addressed to this user, so the endpoint can't be used to look
 * up the sender of anyone else's.
 */
async function resolveUserId(
  input: { profileId?: string; userId?: string; targetType?: string; targetId?: string },
  viewerId: string,
): Promise<string | null> {
  if (input.userId) return input.userId;

  if (input.targetType === "VOICE_NOTE" && input.targetId) {
    const note = await prisma.voiceNote.findFirst({
      where: { id: input.targetId, toUserId: viewerId },
      select: { fromUserId: true },
    });
    if (note) return note.fromUserId;
  }

  // Same resolve-from-the-record shape as VOICE_NOTE — a still-masked question
  // gives the client no asker id, so reporting one has to work without the
  // recipient ever learning who sent it.
  if (input.targetType === "QUESTION" && input.targetId) {
    const question = await prisma.profileQuestion.findFirst({
      where: { id: input.targetId, toUserId: viewerId },
      select: { fromUserId: true },
    });
    if (question) return question.fromUserId;
  }

  if (!input.profileId) return null;
  const profile = await prisma.profile.findFirst({
    where: { id: input.profileId, deletedAt: null },
    select: { userId: true },
  });
  return profile?.userId ?? null;
}

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const t = await getT();

  const parsed = ActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 422 });
  }
  const body = parsed.data;

  const targetUserId = await resolveUserId(body, user.id);
  if (!targetUserId) {
    return NextResponse.json({ ok: false, message: "User nahi mila." }, { status: 404 });
  }

  if (body.action === "unblock") {
    await unblockUser(user.id, targetUserId);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "block") {
    const result = await blockUser(
      {
        blockerUserId: user.id,
        blockedUserId: targetUserId,
        reason: body.reason ?? null,
      },
      t,
    );
    if (!result.ok) return NextResponse.json({ ok: false, message: result.message }, { status: 422 });
    return NextResponse.json({ ok: true, message: "Block kar diya. Ab ye aapko kuch nahi bhej payenge." });
  }

  // report
  if (!body.reason) {
    return NextResponse.json({ ok: false, message: "Reason chunna zaroori hai." }, { status: 422 });
  }

  const result = await createReport(
    {
      reporterUserId: user.id,
      reportedUserId: targetUserId,
      targetType: body.targetType ?? "PROFILE",
      targetId: body.targetId ?? targetUserId,
      reason: body.reason,
      details: body.details ?? null,
    },
    t,
  );
  if (!result.ok) return NextResponse.json({ ok: false, message: result.message }, { status: 422 });

  // Relief must not wait for a review.
  if (body.alsoBlock !== false) {
    await blockUser({ blockerUserId: user.id, blockedUserId: targetUserId, reason: `Report: ${body.reason}` }, t);
  }

  return NextResponse.json({
    ok: true,
    message:
      body.alsoBlock === false
        ? "Report bhej di gayi. Hamari team dekhegi."
        : "Report bhej di gayi aur inhe block bhi kar diya.",
  });
}
