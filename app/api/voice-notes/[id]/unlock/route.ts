import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { unlockVoiceNote } from "@/lib/services/voice/voiceNoteService";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const t = await getT();

  const { id } = await params;
  const result = await unlockVoiceNote(user.id, id, t);

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, code: result.code, message: result.message },
      { status: result.code === "NOT_FOUND" ? 404 : 403 },
    );
  }

  return NextResponse.json({
    ok: true,
    playbackUrl: result.playbackUrl,
    usedCredit: result.usedCredit,
    celebration: result.celebration,
  });
}
