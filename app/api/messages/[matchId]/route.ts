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

  // The one place a message is created, so the one place the chat gate is
  // enforced — a gate that only lives in the UI is decorative, which is exactly
  // what `chat: false` was until 2026-08-04. Since D-90 the rule behind
  // `canChatInMatch` is `getChatAccess`: an unlock on this match, either
  // member's plan, or a live Serious Circle window.
  const gate = await canChatInMatch(user.id, matchId);
  if (!gate.allowed) {
    return NextResponse.json(
      {
        error: "CHAT_LOCKED",
        message: "Ye chat abhi khuli nahi hai — ek Chat Unlock se aap dono ke liye khul jayegi.",
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
