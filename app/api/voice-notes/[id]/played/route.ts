import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { markVoiceNotePlayed } from "@/lib/services/voice/voiceNoteService";

export const runtime = "nodejs";

/**
 * "I have now actually heard this."
 *
 * Fired once by the player on first playback. It grants nothing and reveals
 * nothing — it only stops the dashboard banner from announcing a clip the user
 * has already listened to, which it did forever until this route existed
 * (see `markVoiceNotePlayed`).
 *
 * A no-op answer is still `ok: true`: the note was already marked, or it isn't
 * unlocked, or it isn't this user's. None of those are worth a red toast on a
 * ping the user never asked for and cannot see.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { id } = await params;
  return NextResponse.json({ ok: true, marked: await markVoiceNotePlayed(user.id, id) });
}
