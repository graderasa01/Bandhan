import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { getOrCreateProfile } from "@/lib/services/profile/draftService";
import { computeCompletion } from "@/lib/services/profile/completionService";

export const runtime = "nodejs";

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const profile = await getOrCreateProfile(user.id);
  const { percent, missingFields, isLive } = computeCompletion(profile);

  return NextResponse.json({ completionPercent: percent, missingFields, isLive });
}
