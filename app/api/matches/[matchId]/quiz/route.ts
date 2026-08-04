import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { getBattleView, proposeBattle } from "@/lib/services/quiz/quizBattleService";

export const runtime = "nodejs";

/** The match's current/most recent battle — used both for the initial page load and the thread's poll tick. */
export async function GET(_req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { matchId } = await params;

  const battle = await getBattleView(matchId, user.id);
  return NextResponse.json({ ok: true, battle });
}

/** Propose a new battle. Refused if one is already PENDING/ACTIVE for this match. */
export async function POST(_req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { matchId } = await params;

  const result = await proposeBattle(matchId, user.id);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, message: result.message },
      { status: result.code === "NOT_FOUND" ? 404 : 409 },
    );
  }
  return NextResponse.json({ ok: true, battleId: result.battleId });
}
