import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { prisma } from "@/lib/db/prisma";
import { moderateHeldVoiceNote } from "@/lib/services/voice/voiceNoteService";
import { moderateHeldQuestion } from "@/lib/services/askBridge/profileQuestionService";
import { resolveReport } from "@/lib/services/safety/reportService";

export const runtime = "nodejs";

const BodySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("media"),
    mediaId: z.string().min(1),
    approve: z.boolean(),
    reason: z.string().max(300).optional(),
  }),
  z.object({
    kind: z.literal("question"),
    questionId: z.string().min(1),
    approve: z.boolean(),
    reason: z.string().max(300).optional(),
  }),
  z.object({
    kind: z.literal("report"),
    reportId: z.string().min(1),
    status: z.enum(["REVIEWED", "ACTIONED", "DISMISSED"]),
    note: z.string().max(300).optional(),
  }),
]);

export async function POST(req: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 422 });
  }
  const body = parsed.data;

  if (body.kind === "media") {
    const result = await moderateHeldVoiceNote({
      mediaAssetId: body.mediaId,
      approve: body.approve,
      reason: body.reason ?? null,
    });
    if (!result.ok) {
      return NextResponse.json({ ok: false, message: "Media nahi mila." }, { status: 404 });
    }

    await prisma.adminAuditLog.create({
      data: {
        actorId: user.id,
        actorRole: user.role,
        actionType: body.approve ? "MEDIA_APPROVED" : "MEDIA_REJECTED",
        targetType: "media_asset",
        targetId: body.mediaId,
        newValue: body.approve ? "APPROVED" : "REJECTED",
        reason: body.reason ?? null,
      },
    });

    return NextResponse.json({
      ok: true,
      delivered: result.delivered,
      message: result.delivered
        ? "Approve kar diya — receiver ko notice chala gaya."
        : body.approve
          ? "Approve kar diya."
          : "Reject kar diya, file hata di gayi.",
    });
  }

  if (body.kind === "question") {
    const result = await moderateHeldQuestion({
      questionId: body.questionId,
      approve: body.approve,
      reason: body.reason ?? null,
    });
    if (!result.ok) {
      return NextResponse.json({ ok: false, message: "Sawaal nahi mila." }, { status: 404 });
    }

    await prisma.adminAuditLog.create({
      data: {
        actorId: user.id,
        actorRole: user.role,
        actionType: body.approve ? "QUESTION_APPROVED" : "QUESTION_REJECTED",
        targetType: "profile_question",
        targetId: body.questionId,
        newValue: body.approve ? "APPROVED" : "REJECTED",
        reason: body.reason ?? null,
      },
    });

    return NextResponse.json({
      ok: true,
      delivered: result.delivered,
      message: result.delivered
        ? "Approve kar diya — recipient ko notice chala gaya."
        : body.approve
          ? "Approve kar diya."
          : "Reject kar diya.",
    });
  }

  const result = await resolveReport({
    reportId: body.reportId,
    status: body.status,
    actorId: user.id,
    actorRole: user.role,
    note: body.note ?? null,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: 404 });
  }
  return NextResponse.json({ ok: true, message: "Report resolve kar di." });
}
