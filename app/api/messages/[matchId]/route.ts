import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { prisma } from "@/lib/db/prisma";
import { getThreadData, markThreadRead } from "@/lib/data/messagesData";
import { canChatInMatch } from "@/lib/services/circle/connectionService";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { matchId } = await params;

  const thread = await getThreadData(user.id, matchId);
  if (!thread) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Conversation nahi mila." }, { status: 404 });
  }
  await markThreadRead(user.id, matchId);

  return NextResponse.json({ ok: true, thread });
}

const SendSchema = z.object({ body: z.string().min(1).max(2000) });

export async function POST(req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { matchId } = await params;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Request JSON padha nahi ja saka." }, { status: 400 });
  }

  const parsed = SendSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 422 },
    );
  }

  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match || (match.userAId !== user.id && match.userBId !== user.id)) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Conversation nahi mila." }, { status: 404 });
  }

  // D-11 has advertised `chat: false` on FREE since the ladder shipped, and the
  // pricing page has been rendering "Chat locked" for it — but nothing ever
  // enforced it at the write path, so the row was decorative. Enforcing it here
  // (the one place a message is created) is also what makes Phase F's 48-hour
  // Circle window mean anything: a trial of something that was never locked is
  // not a trial.
  const gate = await canChatInMatch(user.id, matchId);
  if (!gate.allowed) {
    return NextResponse.json(
      {
        error: "PLAN_REQUIRED",
        message: "Chat abhi aapke plan me nahi hai. Plan lijiye, ya Serious Circle me connect hoke 48 ghante free baat kijiye.",
      },
      { status: 402 },
    );
  }

  const created = await prisma.message.create({
    data: { matchId, senderId: user.id, body: parsed.data.body },
  });

  return NextResponse.json({
    ok: true,
    message: {
      id: created.id,
      senderId: created.senderId,
      body: created.body,
      createdAt: created.createdAt.toISOString(),
      readAt: null,
    },
  });
}
