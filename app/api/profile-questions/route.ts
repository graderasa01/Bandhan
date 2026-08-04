import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { prisma } from "@/lib/db/prisma";
import { askProfileQuestion } from "@/lib/services/askBridge/profileQuestionService";
import type { AskQuestionResponse } from "@/lib/contracts/askBridge";

export const runtime = "nodejs";

const AskSchema = z.object({
  profileId: z.string().min(1),
  questionText: z.string().trim().min(1).max(300),
});

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const parsed = AskSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "Profile aur sawaal dono chahiye." } satisfies AskQuestionResponse,
      { status: 422 },
    );
  }

  const target = await prisma.profile.findFirst({
    where: { id: parsed.data.profileId, deletedAt: null },
    select: { userId: true },
  });
  if (!target) {
    return NextResponse.json({ ok: false, message: "Profile nahi mila." } satisfies AskQuestionResponse, {
      status: 404,
    });
  }

  const result = await askProfileQuestion({
    fromUserId: user.id,
    toUserId: target.userId,
    questionText: parsed.data.questionText,
  });

  if (!result.ok) {
    const status = result.code === "NOT_FOUND" ? 404 : result.code === "FEATURE_OFF" ? 403 : 422;
    return NextResponse.json(
      { ok: false, code: result.code, message: result.message } satisfies AskQuestionResponse,
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    questionId: result.questionId,
    alreadyAsked: result.alreadyAsked,
    status: result.status,
    heldForReview: result.heldForReview,
  } satisfies AskQuestionResponse);
}
