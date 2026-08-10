import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { prisma } from "@/lib/db/prisma";
import { askProfileQuestion, getInboundQuestions } from "@/lib/services/askBridge/profileQuestionService";
import { getT } from "@/lib/i18n/server";
import type { AskQuestionResponse } from "@/lib/contracts/askBridge";

export const runtime = "nodejs";

/**
 * The caller's own pending questions.
 *
 * Every other consumer of `getInboundQuestions` is a server component that can
 * call it directly (`/user/inbox`, the profile page, Grio's context builder).
 * Grio's answer sheet is the first client-side one — it opens inside a
 * conversation, so there is no page render to hang the list off.
 *
 * Nothing new is exposed: `InboundQuestionView` is masked at the source
 * (`buildMaskedTeaser`), so the asker's identity is no more visible here than
 * on the inbox page — it opens on answering, and only then.
 */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;
  const t = await getT();
  return NextResponse.json({ ok: true, questions: await getInboundQuestions(user.id, t) });
}

const AskSchema = z.object({
  profileId: z.string().min(1),
  questionText: z.string().trim().min(1).max(300),
});

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const t = await getT();

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

  const result = await askProfileQuestion(
    {
      fromUserId: user.id,
      toUserId: target.userId,
      questionText: parsed.data.questionText,
    },
    t,
  );

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
