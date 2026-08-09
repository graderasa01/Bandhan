import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { getTodayPollView, getVibeStreak } from "@/lib/services/vibe/pollService";
import { isFeatureAvailable } from "@/lib/services/plans/entitlements";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;
  const t = await getT();

  const gate = await isFeatureAvailable(user.id, "mindsetArena");
  if (!gate.allowed) {
    return NextResponse.json({ error: "FEATURE_OFF", message: "Ye feature abhi available nahi hai." }, { status: 403 });
  }

  const [poll, streak] = await Promise.all([getTodayPollView(user.id, t), getVibeStreak(user.id)]);
  return NextResponse.json({ poll, streak });
}
