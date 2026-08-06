import "server-only";
import { prisma } from "@/lib/db/prisma";
import {
  DAILY_REWARD_CAP,
  QUESTS,
  QUEST_LIST,
  type QuestDef,
  type QuestKey,
  type QuestPeriod,
} from "@/lib/quests/definitions";
import { grantReward } from "@/lib/services/rewards/rewardService";
import { celebrateReward, type Celebration } from "@/lib/services/rewards/celebrationService";
import { createNotice } from "@/lib/services/notice/noticeService";
import { isFeatureAvailable } from "@/lib/services/plans/entitlements";
import { todayUTCDate } from "@/lib/services/match/reelGenerator";

/**
 * Quest progress and payout.
 *
 * ## No scheduler
 *
 * "Daily" is a string, not a cron job. `periodKeyFor("daily")` returns today's
 * UTC date, and the unique index on (userId, questKey, periodKey) means the
 * row for today simply doesn't exist until the user does something — the same
 * lazy pattern `getOrCreateTodayReel` already uses. Nothing has to run at
 * midnight; the day rolls over because the key changes.
 *
 * ## Paying exactly once
 *
 * `rewardedAt` is set by a conditional `updateMany` that only matches rows
 * where it is still null. If two requests race, one of them gets `count: 1`
 * and pays; the other gets `count: 0` and doesn't. The check and the claim are
 * the same statement, so there is no window between them.
 */

/** Shares the reel's UTC day boundary so "today" means one thing app-wide. */
export function periodKeyFor(period: QuestPeriod): string {
  return period === "once" ? "once" : todayUTCDate().toISOString().slice(0, 10);
}

export interface QuestView {
  key: QuestKey;
  title: string;
  description: string;
  rewardLabel: string;
  progress: number;
  target: number;
  completed: boolean;
}

export interface QuestOutcome {
  quest: QuestDef;
  progress: number;
  target: number;
  justCompleted: boolean;
  celebration: Celebration | null;
}

/** Quests this user can currently work on. Closed features contribute nothing. */
export async function getActiveQuests(userId: string): Promise<QuestView[]> {
  const open = await Promise.all(
    QUEST_LIST.map(async (q) => ({ q, gate: await isFeatureAvailable(userId, q.requiresFeature) })),
  );
  const available = open.filter((o) => o.gate.allowed).map((o) => o.q);
  if (available.length === 0) return [];

  const rows = await prisma.questProgress.findMany({
    where: {
      userId,
      OR: available.map((q) => ({ questKey: q.key, periodKey: periodKeyFor(q.period) })),
    },
  });
  const byKey = new Map(rows.map((r) => [r.questKey, r]));

  return available.map((q) => {
    const row = byKey.get(q.key);
    return {
      key: q.key,
      title: q.title,
      description: q.description,
      rewardLabel: q.rewardLabel,
      progress: row?.progress ?? 0,
      target: q.target,
      completed: Boolean(row?.completedAt),
    };
  });
}

/**
 * Records progress against a quest and pays out if it just finished.
 *
 * Returns null when the quest isn't running for this user — the caller's own
 * action (sending a voice note) still succeeded, so a closed quest system must
 * be silent rather than an error.
 *
 * Never throws: a quest is a bonus on top of something that already happened.
 */
export async function recordQuestEvent(
  userId: string,
  questKey: QuestKey,
  amount = 1,
): Promise<QuestOutcome | null> {
  const quest = QUESTS[questKey];
  if (!quest) return null;

  try {
    const gate = await isFeatureAvailable(userId, quest.requiresFeature);
    if (!gate.allowed) return null;

    const periodKey = periodKeyFor(quest.period);

    const row = await prisma.questProgress.upsert({
      where: { userId_questKey_periodKey: { userId, questKey, periodKey } },
      create: { userId, questKey, periodKey, progress: amount, target: quest.target },
      update: { progress: { increment: amount } },
    });

    const reachedTarget = row.progress >= quest.target;
    if (!reachedTarget || row.rewardedAt) {
      return {
        quest,
        progress: Math.min(row.progress, quest.target),
        target: quest.target,
        justCompleted: false,
        celebration: null,
      };
    }

    // Claim-and-check in one statement: whoever flips rewardedAt from null pays.
    const claimed = await prisma.questProgress.updateMany({
      where: { id: row.id, rewardedAt: null },
      data: { rewardedAt: new Date(), completedAt: row.completedAt ?? new Date() },
    });
    if (claimed.count === 0) {
      return { quest, progress: quest.target, target: quest.target, justCompleted: false, celebration: null };
    }

    // DAILY_REWARD_CAP — how many quest *payouts* (any quest, any period) this
    // user may collect today, counted the same UTC day `periodKeyFor("daily")`
    // uses. `rewardedAt` was just set by the claim above, so it is already
    // counted here: comparing with `<=` means this exact completion is one of
    // the cap's allowed slots, not one past it.
    //
    // The completion itself is never denied — `completedAt`/`rewardedAt` are
    // already written by the claim above regardless of what happens next. Only
    // the *payout* is capped, and only past the cap; the module doc's own rule
    // ("a completed quest always pays... a cap that eats a reward the user was
    // shown would be a bait-and-switch") is about not silently dropping a
    // reward that was already promised and completed — this still shows the
    // quest as done, it just stops stacking further grants on top after the
    // day's allowance is spent, the same shape `MAX_HELD` already uses below.
    const rewardedToday = await prisma.questProgress.count({
      where: { userId, rewardedAt: { gte: todayUTCDate() } },
    });
    const underDailyCap = rewardedToday <= DAILY_REWARD_CAP;

    const granted = underDailyCap
      ? await grantReward({
          userId,
          kind: quest.reward.kind,
          amount: quest.reward.amount,
          source: `${questKey}:${periodKey}`,
          ttlHours: quest.reward.ttlHours,
        })
      : ({ ok: false, reason: "AT_CAP", held: 0 } as const);

    // At either cap — this kind's MAX_HELD, or today's DAILY_REWARD_CAP — the
    // quest still counts as done. They just have nothing new to add, which the
    // copy says plainly rather than pretending a grant happened.
    const gotSomething = granted.ok && granted.granted > 0;

    await createNotice({
      userId,
      kind: "REWARD_EARNED",
      title: `${quest.title} — poora hua`,
      body: gotSomething
        ? `${quest.rewardLabel} mil gaya.`
        : underDailyCap
          ? "Aapke paas pehle se itne reward pade hain ki aur add nahi ho paye — pehle wo use kar lijiye."
          : "Aaj ke reward mil chuke — kal ek aur milega.",
      href: "/user/inbox",
    });

    return {
      quest,
      progress: quest.target,
      target: quest.target,
      justCompleted: true,
      celebration: gotSomething
        ? celebrateReward(quest.reward.kind, granted.granted, quest.title)
        : null,
    };
  } catch (err) {
    console.error("[quests] recordQuestEvent failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}
