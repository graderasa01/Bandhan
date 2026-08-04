/** Rishta Reel — 08_architecture_and_experience_plan.md §4. */

import type { KundliNote } from "@/lib/services/kundli/kundliService";

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
