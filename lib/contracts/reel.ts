/** Rishta Reel — 08_architecture_and_experience_plan.md §4. */

import type { KundliNote } from "@/lib/services/kundli/kundliService";
import type { WhyThisMatch } from "@/lib/services/match/whyThisMatch";
import type { CandidateFactGroup } from "@/lib/services/match/candidateFacts";

export type { WhyThisMatch } from "@/lib/services/match/whyThisMatch";

/** One L1 fact, already visibility-filtered by `buildCandidateFacts`. */
export interface ReelFact {
  group: CandidateFactGroup;
  label: string;
  value: string;
}

export type ReelSwipeDirection = "LEFT" | "RIGHT" | "UP" | "DOWN";

export interface ReelRingSegment {
  key: string;
  label: string;
  value: number; // 0..100
  color: string;
}

export interface ReelSlide {
  id: string;
  url: string;
  note: string | null;
  /** 0..100 vertical focal point for `object-cover` crops — null = center (50). */
  focalY: number | null;
}

export interface ReelCardViewModel {
  id: string; // profileId
  displayName: string;
  age: number | null;
  city: string | null;
  education: string | null;
  profession: string | null;
  /** Photo verification — the primary photo's moderation status. */
  verified: boolean;
  /** Mobile OTP verification — a separate trust signal from photo review. */
  mobileVerified: boolean;
  trustScore: number | null;
  photoUrl: string | null;
  /** Consent-gated per the trust-by-design rule — true only once both sides have sent interest. */
  photoUnlocked: boolean;
  /** 0..100 vertical focal point for `object-cover` crops — null = center (50). Same withheld-not-hidden rule as photoUrl: absent while locked. */
  photoFocalY: number | null;
  /**
   * Owner-curated photo slides (Phase 2). Empty unless `photoUnlocked` — same
   * leak-fix rule as `photoUrl`: a locked card carries no slide URLs at all,
   * not URLs hidden behind a lock icon.
   */
  slides: ReelSlide[];
  /** Trailing text slide content, already unlock-gated by the caller. */
  bioNote: string | null;
  compatibility: number;
  segments: ReelRingSegment[];
  strengths: string[];
  concern: string | null;
  /** Deterministic viewer↔candidate field overlap — never AI-generated (D-32). */
  sharedTags: string[];
  /**
   * Gotra/manglik notes. Display-only: these never touch ranking, because the
   * profile builder promises the user gotra "match model me kabhi nahi jaata".
   */
  kundliNotes: KundliNote[];
  /**
   * Set on at most two cards a day, and only where `compatibility` genuinely
   * clears `MISSION_SCORE_FLOOR`.
   *
   * The scarcity is the honesty: a prompt that appears on every card is
   * obviously scripted, and once a user decides one AI nudge was theatre they
   * discount all of them. Computed in `reelData`, never by the model (D-32) —
   * the model wrote none of this, the score did.
   */
  mission: ReelMission | null;
  /** C5 — deterministic, derived from this candidate's own Mindset Arena answers. Null below the minimum-votes floor. */
  vibeBadge: { label: string; description: string } | null;
  /**
   * Phase D — has the viewer already asked this candidate a question?
   * "NONE" means the ask button is live; anything else means it isn't
   * (ProfileQuestion's unique index caps it at one, ever) and the button
   * shows that state instead of pretending it's still available.
   */
  askedStatus: "NONE" | "PENDING" | "ANSWERED" | "DECLINED" | "EXPIRED";
  /**
   * Deterministic "Why this match?" — real signal agreements first, then the
   * cached AI strengths, then shared tags (see whyThisMatch.ts). Slots with
   * nothing eligible are null and the UI says so; nothing is ever guessed.
   */
  whyThisMatch: WhyThisMatch;
  /**
   * True only when BOTH sides have a date of birth — the one precondition the
   * Guna Milan card on `/user/profile/[id]` needs. A cheap flag, never a chart,
   * and never a ranking input (kundli is display-only everywhere).
   */
  kundliMilanAvailable: boolean;
  /**
   * The candidate's L1 facts (family / lifestyle / expectations), from
   * `buildCandidateFacts(profile, "L1")` — the same field set the reel's AI is
   * allowed to see, so the details sheet can never show more than the prompt.
   * Header facts (age, city, education, work) and the bio are excluded: the
   * first are already on the card, the second stays unlock-gated (`bioNote`).
   */
  facts: ReelFact[];
}

export interface ReelMission {
  /** Why this card earned the prompt. Always a real, checkable number. */
  headline: string;
  /** What to actually say — the hardest part of recording a note to a stranger. */
  suggestion: string;
}

export interface ReelViewModel {
  reelId: string;
  reelDate: string;
  dailyLimit: number;
  cards: ReelCardViewModel[];
  emptyState: { title: string; description: string } | null;
  /** M09 §9 REEL_EXHAUSTED trigger — null when there's no higher plan to offer. */
  upgradeHint: { planName: string; reelPerDay: number } | null;
  /** Voice notes usable right now? False hides every voice affordance in the reel. */
  voiceEnabled: boolean;
  /** Ask Bridge usable right now? False hides the "kuch poochein" affordance. */
  askBridgeEnabled: boolean;
  /** Today's voice quest, if the quest system is running and it isn't done yet. */
  voiceQuest: { title: string; rewardLabel: string } | null;
}

export interface ReelAskResponse {
  ok: boolean;
  answer?: string;
  code?: "not_configured" | "upstream_error" | "bad_request" | "quota_exceeded";
  message?: string;
  quota?: { used: number; limit: number };
}

export interface ReelIcebreakerResponse {
  ok: boolean;
  suggestion?: string;
  code?: "not_configured" | "upstream_error" | "bad_request";
  message?: string;
}
