import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { answerProfileQuestion } from "@/lib/services/askBridge/profileQuestionService";
import type { AnswerQuestionResponse } from "@/lib/contracts/askBridge";

export const runtime = "nodejs";

const AnswerSchema = z.object({ mediaId: z.string().min(1) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { id } = await params;
  const parsed = AnswerSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Recording chahiye." } satisfies AnswerQuestionResponse, {
      status: 422,
    });
  }

  const result = await answerProfileQuestion({
    userId: user.id,
    questionId: id,
    mediaAssetId: parsed.data.mediaId,
  });

  if (!result.ok) {
    const status = result.code === "NOT_FOUND" ? 404 : 422;
    return NextResponse.json(
      { ok: false, code: result.code, message: result.message } satisfies AnswerQuestionResponse,
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    heldForReview: result.heldForReview,
    asker: result.asker,
    celebration: result.celebration,
  } satisfies AnswerQuestionResponse);
}
