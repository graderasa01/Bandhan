import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { respondToBattle } from "@/lib/services/quiz/quizBattleService";

export const runtime = "nodejs";

const BodySchema = z.object({ accept: z.boolean() });

export async function POST(req: Request, { params }: { params: Promise<{ battleId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { battleId } = await params;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 422 });
  }

  const result = await respondToBattle(battleId, user.id, parsed.data.accept);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, message: result.message },
      { status: result.code === "NOT_FOUND" ? 404 : 403 },
    );
  }
  return NextResponse.json({ ok: true });
}
