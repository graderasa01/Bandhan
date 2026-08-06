import { prisma } from "@/lib/db/prisma";
import { todayUTCDate } from "@/lib/services/match/reelGenerator";

/** Counts today's "AI se poocho" calls from the existing AiInteraction log — no separate counter table needed.
 *
 * The per-plan ceiling this gets checked against lives in
 * `PLAN_FEATURES[...].aiAskPerDay` (lib/constants/plans.ts) and is read via
 * `effectiveAiAskLimit` (lib/services/plans/entitlements.ts), not here — this
 * file used to also export a flat `FREE_TIER_AI_ASK_LIMIT` that every plan
 * was silently held to, a leftover from before Subscription/Plan existed.
 */
export async function getTodayAiAskCount(userId: string): Promise<number> {
  return prisma.aiInteraction.count({
    where: {
      userId,
      feature: "reel_ask",
      createdAt: { gte: todayUTCDate() },
    },
  });
}
