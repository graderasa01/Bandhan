import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { getOrCreateProfile } from "@/lib/services/profile/draftService";
import { computeTrustScore } from "@/lib/services/trust/trustScoreService";
import { prisma } from "@/lib/db/prisma";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const t = await getT();
  const profile = await getOrCreateProfile(user.id);
  const result = computeTrustScore(user, profile, t);

  if (profile.trustScore !== result.trustScore || profile.trustScoreLabel !== result.scoreLabel) {
    await prisma.profile.update({
      where: { id: profile.id },
      data: { trustScore: result.trustScore, trustScoreLabel: result.scoreLabel },
    });
  }

  return NextResponse.json(result);
}
