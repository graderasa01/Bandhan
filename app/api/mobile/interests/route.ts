import { NextResponse } from "next/server";
import { getInterestsData, getMatchesData } from "@/lib/data/discoveryData";
import { getT } from "@/lib/i18n/server";
import { requireMember } from "../_shared/member";

export const runtime = "nodejs";

/**
 * Received and sent interests plus matches, for the app's Interests tab — the
 * view models `/user/interests` and `/user/matches` already render. Accepting,
 * declining and withdrawing stay on `/api/interests/[id]`.
 */
export async function GET() {
  const { user, response } = await requireMember();
  if (!user) return response;

  const t = await getT();
  const [interests, matches] = await Promise.all([getInterestsData(user.id, t), getMatchesData(user.id, t)]);
  return NextResponse.json({ ok: true, interests, matches });
}
