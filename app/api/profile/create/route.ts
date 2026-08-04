import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { getOrCreateProfile } from "@/lib/services/profile/draftService";

export const runtime = "nodejs";

export async function POST() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const profile = await getOrCreateProfile(user.id);
  return NextResponse.json({ profileId: profile.id, profileStatus: profile.profileStatus }, { status: 201 });
}
