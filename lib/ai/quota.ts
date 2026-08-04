import { prisma } from "@/lib/db/prisma";
import { todayUTCDate } from "@/lib/services/match/reelGenerator";

/**
 * M09's subscription plan matrix (docs/bandhantak/modules/M09_subscription_plans)
 * specs `aiAskPerDay: 3 (free) / 15 (basic) / unlimited (standard+)`. No
 * Subscription/Plan model exists yet, so this is the free-tier number only —
 * every user is free-tier until M09 ships real billing.
 */
export const FREE_TIER_AI_ASK_LIMIT = 3;

/** Counts today's "AI se poocho" calls from the existing AiInteraction log — no separate counter table needed. */
export async function getTodayAiAskCount(userId: string): Promise<number> {
  return prisma.aiInteraction.count({
    where: {
      userId,
      feature: "reel_ask",
      createdAt: { gte: todayUTCDate() },
    },
  });
}
