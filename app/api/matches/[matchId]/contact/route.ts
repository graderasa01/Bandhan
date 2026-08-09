import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { agreeToShareContact, withdrawContactShare } from "@/lib/services/match/contactShare";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";

/** Agree to share my own number in this match. Idempotent. */
export async function POST(_req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { matchId } = await params;
  const t = await getT();

  const result = await agreeToShareContact(matchId, user.id, t);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true, state: result.state });
}

/** Withdraw my consent. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { matchId } = await params;

  const result = await withdrawContactShare(matchId, user.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true, state: result.state });
}
