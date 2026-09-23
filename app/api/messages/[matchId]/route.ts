import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { prisma } from "@/lib/db/prisma";
import { getThreadData, markThreadRead } from "@/lib/data/messagesData";
import { canChatInMatch } from "@/lib/services/circle/connectionService";
import { VOICE_MESSAGE_LABEL } from "@/lib/contracts/messages";

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

/**
 * A typed message, or a voice message recorded through `./voice` — never both.
 * The recording is uploaded first (so it can be heard back and discarded) and
 * only becomes a message here, behind the same chat gate as text.
 */
const SendSchema = z.union([
  z.object({ body: z.string().min(1).max(2000) }).strict(),
  z.object({ mediaId: z.string().min(1) }).strict(),
]);

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

  let voice: { url: string; durationMs: number } | null = null;
  if ("mediaId" in parsed.data) {
    // Only the sender's own clip, and only one nobody has used yet. A clip that
    // already went out as a voice note or another message is refused rather
    // than re-pointed: one recording, one destination.
    const asset = await prisma.mediaAsset.findFirst({
      where: {
        id: parsed.data.mediaId,
        ownerUserId: user.id,
        kind: "VOICE_NOTE",
        deletedAt: null,
        moderation: "APPROVED",
        voiceNote: null,
        message: null,
        pollVoteAnswer: null,
      },
      select: { id: true, durationMs: true },
    });
    if (!asset) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Recording nahi mili — dobara record kijiye." },
        { status: 404 },
      );
    }
    voice = { url: `/api/media/${asset.id}`, durationMs: asset.durationMs ?? 0 };
  }

  const created = await prisma.message.create({
    data:
      "mediaId" in parsed.data
        ? { matchId, senderId: user.id, body: VOICE_MESSAGE_LABEL, mediaAssetId: parsed.data.mediaId }
        : { matchId, senderId: user.id, body: parsed.data.body },
  });

  return NextResponse.json({
    ok: true,
    message: {
      id: created.id,
      senderId: created.senderId,
      body: created.body,
      createdAt: created.createdAt.toISOString(),
      readAt: null,
      ...(voice ? { voice } : {}),
    },
  });
}
