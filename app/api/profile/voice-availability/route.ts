import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { getVoiceOnboardingAvailability } from "@/lib/services/profile/voiceOnboardingService";

export const runtime = "nodejs";

/**
 * "Can I build my profile by talking, right now?"
 *
 * Asked once when the method screen opens, so "AI se Boliye" is either a live
 * option or visibly unavailable *before* the user commits to it — rather than
 * after they have already spoken a sentence into a microphone.
 *
 * Says nothing about which vendor answers (see `/api/speech/config`'s note on
 * why no client may learn that) and nothing about the user's plan, because
 * voice-fill does not have one.
 */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const availability = await getVoiceOnboardingAvailability(user.id);
  return NextResponse.json(availability);
}
