import { prisma } from "@/lib/db/prisma";
import { todayUTCDate } from "@/lib/services/match/reelGenerator";

/**
 * Today's AI usage, counted from the existing AiInteraction log — no separate
 * counter table needed.
 *
 * The per-plan ceilings these get checked against live in the plan catalog
 * (`aiAskPerDay`, `grioChatPerDay` — lib/constants/plans.ts) and are read via
 * `getPlanContext`, not here. This file used to also export a flat
 * `FREE_TIER_AI_ASK_LIMIT` that every plan was silently held to, a leftover
 * from before Subscription/Plan existed.
 */

/**
 * The short, one-shot AI asks that share the `aiAskPerDay` budget.
 *
 * `discover_intent` joined `reel_ask` when D-90 opened Advanced Discovery to
 * FREE: turning a sentence into filters is a model call per search, and it was
 * previously bounded only by being on a paid plan. Manual filters keep working
 * when the budget is spent — only the sentence parsing stops.
 */
export const AI_ASK_FEATURES = ["reel_ask", "discover_intent"] as const;

/** Grio conversation turns that reached a model — the `grioChatPerDay` budget (D-90). */
export const GRIO_CHAT_FEATURES = ["rishta_concierge", "match_explain"] as const;

export async function getTodayAiAskCount(userId: string): Promise<number> {
  return prisma.aiInteraction.count({
    where: {
      userId,
      feature: { in: [...AI_ASK_FEATURES] },
      createdAt: { gte: todayUTCDate() },
    },
  });
}

export async function getTodayGrioChatCount(userId: string): Promise<number> {
  return prisma.aiInteraction.count({
    where: {
      userId,
      feature: { in: [...GRIO_CHAT_FEATURES] },
      createdAt: { gte: todayUTCDate() },
    },
  });
}
