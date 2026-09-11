import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { getOrCreateProfile } from "@/lib/services/profile/draftService";
import { computeCompletion } from "@/lib/services/profile/completionService";
import { isActivatedOnServer } from "@/lib/services/profile/readinessService";

export const runtime = "nodejs";

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const profile = await getOrCreateProfile(user.id);
  const { percent, missingFields } = computeCompletion(profile);

  // Persisted activation — the same answer every gate reads, so a caller
  // polling this can never see "live" before the profile actually is.
  return NextResponse.json({
    completionPercent: percent,
    missingFields,
    isLive: isActivatedOnServer(profile),
  });
}
