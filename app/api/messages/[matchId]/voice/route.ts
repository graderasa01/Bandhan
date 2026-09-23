import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { prisma } from "@/lib/db/prisma";
import { canChatInMatch } from "@/lib/services/circle/connectionService";
import { isBlockedEitherWay } from "@/lib/services/safety/blockService";
import { uploadAndModerateVoiceClip } from "@/lib/services/storage/voiceUpload";

export const runtime = "nodejs";

/**
 * Records a voice message for this chat. Does NOT send it.
 *
 * Same two-step shape as `/api/media/voice` — record, hear it back, then
 * decide — so a discarded take never lands in the other person's thread.
 * Sending is `POST /api/messages/:matchId` with `{ mediaId }`.
 *
 * Gated on the chat being open *now*, before a byte is stored: recording into
 * a chat you cannot send to is a take you will lose. The upload itself is not
 * screened (`purpose: "chat"`), by the same decision that leaves typed chat
 * unscreened; who may *hear* it is decided by `mediaAccess.ts` on every play.
 */
export async function POST(req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { matchId } = await params;

  const match = await prisma.match.findUnique({ where: { id: matchId }, select: { userAId: true, userBId: true } });
  if (!match || (match.userAId !== user.id && match.userBId !== user.id)) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Conversation nahi mila." }, { status: 404 });
  }
  const otherUserId = match.userAId === user.id ? match.userBId : match.userAId;
  if (await isBlockedEitherWay(user.id, otherUserId)) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Conversation nahi mila." }, { status: 404 });
  }

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

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Audio file nahi mili." }, { status: 400 });
  }

  const result = await uploadAndModerateVoiceClip({
    ownerUserId: user.id,
    form,
    logFeature: "chat_voice_message",
    purpose: "chat",
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }

  return NextResponse.json(
    {
      mediaId: result.mediaId,
      durationMs: result.durationMs,
      moderation: result.moderation,
      pendingReview: false,
      playbackUrl: result.playbackUrl,
    },
    { status: 201 },
  );
}
