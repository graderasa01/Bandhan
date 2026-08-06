import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { activateBoostFromReward } from "@/lib/services/boost/boostService";
import { celebrateReward } from "@/lib/services/rewards/celebrationService";
import type { BoostActivateResponse } from "@/lib/contracts/boost";

export const runtime = "nodejs";

/**
 * Spends one earned BOOST credit right now — the "manual" half of boost,
 * next to the subscription's automatic one (`syncBoostFromSubscription`).
 *
 * `activateBoostFromReward` already existed (`lib/services/boost/
 * boostService.ts`) but had no caller anywhere in the app — this route is
 * that caller. No entitlement gate beyond the credit itself: holding a
 * `RewardGrant(BOOST)` *is* the permission, same shape as spending a
 * VOICE_UNLOCK or REEL_UNLOCK credit elsewhere.
 */
export async function POST() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const result = await activateBoostFromReward(user.id);
  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message } satisfies BoostActivateResponse, { status: 422 });
  }

  return NextResponse.json({
    ok: true,
    activeUntil: result.activeUntil.toISOString(),
    celebration: celebrateReward("BOOST", 1, "Aapki profile agle 24 ghante zyada logon tak pahunchegi."),
  } satisfies BoostActivateResponse);
}
