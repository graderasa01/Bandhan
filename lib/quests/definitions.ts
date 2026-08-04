/**
 * Quest catalog.
 *
 * Code, not database — the same call `MINDSET_QUESTIONS` and `PLAN_FEATURES`
 * make. A quest is product copy plus a reward rule, and both are decisions
 * someone should have to review, not fields an admin can retype at 1am. What
 * *is* admin-controlled is whether the quest system runs at all
 * (`FeatureFlag.quests`).
 *
 * ## Two quests, on purpose
 *
 * The temptation is to ship a board of ten. Ten quests turns the app into a
 * chore list and teaches users that the reward, not the rishta, is the point —
 * which is precisely the failure mode §7.1/§7.2 of the architecture doc are
 * about. Two is enough to prove the loop works and to learn whether anyone
 * cares before spending more on it.
 *
 * ## What a quest may never ask for
 *
 * A quest can ask a user to *express interest* in someone. It must never ask
 * them to accept, decline, or reply to a specific person — that would be
 * paying someone to make a decision about a stranger's marriage prospects.
 * Both quests below ask for the same thing: record one honest 10-second note.
 */
import type { FeatureKey } from "@/lib/constants/features";
import type { RewardKind } from "@prisma/client";

export const QUEST_KEYS = ["first_voice_note", "daily_voice_note", "answer_question"] as const;
export type QuestKey = (typeof QUEST_KEYS)[number];

export type QuestPeriod = "once" | "daily";

export interface QuestReward {
  kind: RewardKind;
  amount: number;
  ttlHours: number;
}

export interface QuestDef {
  key: QuestKey;
  period: QuestPeriod;
  title: string;
  /** Shown under the title. States what to do, never hypes the reward. */
  description: string;
  target: number;
  reward: QuestReward;
  /** Reward line, written so the user can verify it afterwards. */
  rewardLabel: string;
  /** The quest only appears while this feature is open to the user. */
  requiresFeature: FeatureKey;
}

export const QUESTS: Record<QuestKey, QuestDef> = {
  first_voice_note: {
    key: "first_voice_note",
    period: "once",
    title: "Pehli voice note bhejein",
    description:
      "Kisi ek profile ko 10 second me apni aawaz me bataiye ki unki kaunsi baat achhi lagi. " +
      "Likhe hue message se aawaz ka jawab zyada aata hai.",
    target: 1,
    reward: { kind: "REEL_UNLOCK", amount: 2, ttlHours: 48 },
    rewardLabel: "2 extra rishta card, 48 ghante ke liye",
    requiresFeature: "voiceNotes",
  },
  daily_voice_note: {
    key: "daily_voice_note",
    period: "daily",
    title: "Aaj ek voice note",
    description: "Roz ek profile ko apni aawaz me jawab dijiye.",
    target: 1,
    reward: { kind: "AI_ASK", amount: 2, ttlHours: 24 },
    rewardLabel: "AI se 2 extra sawaal, aaj ke liye",
    requiresFeature: "voiceNotes",
  },
  /**
   * Phase D3 — rewards answering, never asking. Asking is free and unlimited
   * friction-wise (one per candidate, structurally); answering is the side of
   * Ask Bridge that takes real effort from a person who did not choose this
   * conversation, so that is the side worth a reward.
   */
  answer_question: {
    key: "answer_question",
    period: "daily",
    title: "Aaya hua sawaal jawab dijiye",
    description: "Kisi ne aapse ek sawaal poocha hai — voice me jawab dijiye, aur unki pehchaan bhi khul jayegi.",
    target: 1,
    reward: { kind: "REEL_UNLOCK", amount: 2, ttlHours: 24 },
    rewardLabel: "2 extra rishta card, 24 ghante ke liye",
    requiresFeature: "askBridge",
  },
};

export const QUEST_LIST: QuestDef[] = QUEST_KEYS.map((k) => QUESTS[k]);

/**
 * How many quest rewards one user may collect in a day.
 *
 * Two is not a coincidence: it is exactly what a new user can hit on day one
 * (the lifetime "first" plus that day's daily). The cap exists so that adding
 * quests later cannot silently turn into a reward firehose — not to withhold
 * anything anyone has already earned. See `questService`: a completed quest
 * always pays. A cap that eats a reward the user was shown would be a
 * bait-and-switch, which is the one thing this system cannot afford to be.
 */
export const DAILY_REWARD_CAP = 2;

export function isQuestKey(value: string): value is QuestKey {
  return (QUEST_KEYS as readonly string[]).includes(value);
}
