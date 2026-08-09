import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { prisma } from "@/lib/db/prisma";
import { sendVoiceNote } from "@/lib/services/voice/voiceNoteService";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";

const SendSchema = z.object({
  /** The reel deals in profile ids; the voice note deals in user ids. */
  profileId: z.string().min(1),
  mediaId: z.string().min(1),
  // A deliberately narrow allowlist — QUESTION_ANSWER/PARENT_BLESSING/MATCH_CHAT
  // each have their own dedicated flow and gate elsewhere, so a client can
  // never pick those through this generic "voice note to a stranger" route.
  context: z.enum(["REEL_INTEREST", "POLL_ICEBREAKER"]).optional(),
});

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const t = await getT();

  const parsed = SendSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Profile aur recording dono chahiye." }, { status: 422 });
  }

  const target = await prisma.profile.findFirst({
    where: { id: parsed.data.profileId, deletedAt: null },
    select: { userId: true },
  });
  if (!target) {
    return NextResponse.json({ ok: false, message: "Profile nahi mila." }, { status: 404 });
  }

  const result = await sendVoiceNote(
    {
      fromUserId: user.id,
      toUserId: target.userId,
      mediaAssetId: parsed.data.mediaId,
      context: parsed.data.context,
    },
    t,
  );

  if (!result.ok) {
    const status = result.code === "LIMIT_REACHED" ? 403 : result.code === "NOT_FOUND" ? 404 : 422;
    return NextResponse.json({ ok: false, code: result.code, message: result.message }, { status });
  }

  return NextResponse.json({
    ok: true,
    voiceNoteId: result.voiceNoteId,
    matched: result.matched,
    matchId: result.matchId,
    heldForReview: result.heldForReview,
    celebration: result.celebration,
  });
}
