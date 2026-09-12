/** Rishta Reel — 08_architecture_and_experience_plan.md §4. */

import type { KundliNote, KundliTone } from "@/lib/contracts/kundli";
import type { WhyThisMatch } from "@/lib/services/match/whyThisMatch";
import type { CandidateFactGroup } from "@/lib/services/match/candidateFacts";
import type { PreferenceEvidenceState } from "@/lib/services/match/preferenceEvidence";

export type { WhyThisMatch, WhyReason } from "@/lib/services/match/whyThisMatch";
export type { PreferenceEvidenceState } from "@/lib/services/match/preferenceEvidence";

/**
 * How the viewer's partner preferences stand against this card.
 *
 * The three states are the product rule from `preferenceEvidence.ts`, carried
 * to the card so it can say the honest thing instead of "100% Preferences":
 *
 *   NOT_PROVIDED — "General suggestion — preference match calculate nahi hua."
 *   PARTIAL      — the viewer stated something, but too little could be
 *                  checked against this profile for a percentage.
 *   COMPARABLE   — a preference segment exists on the ring.
 */
export interface ReelCardPreference {
  state: PreferenceEvidenceState;
  /** 0..100 only when COMPARABLE; null otherwise — never a placeholder. */
  score: number | null;
  /** The one honest line shown under the header when the state is not COMPARABLE. */
  note: string | null;
}

/**
 * Guna milan as the details sheet may show it: a real total only when both
 * sides have a date *and* a birth time (a noon-assumed Moon can sit on a
 * nakshatra boundary, and a total built on it would look final while being a
 * guess). Otherwise `milan` is null and `note` says why — never a number.
 */
export interface ReelCardKundli {
  milan: { total: number; max: 36; band: string; tone: KundliTone; headline: string } | null;
  note: string | null;
  /** The gotra/manglik notes, which need no birth time at all. */
  notes: KundliNote[];
}

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
  /**
   * The ranking number — trust, activity, and the preference match and soch
   * fit *when they exist*. Recomputed from the current profiles on every read,
   * never copied from the persisted reel row, so an old inflated score cannot
   * outlive the data that produced it.
   *
   * Null when neither personal comparison exists for this pair: the number
   * would be trust + activity only, which is a fine ordering key and a
   * dishonest "kitna match" — the ring shows "Jaankari kam hai" instead. It is
   * a rank score, never presented as a compatibility probability.
   */
  rankScore: number | null;
  /** Only the components that actually exist for this pair — no placeholder arcs. */
  segments: ReelRingSegment[];
  preference: ReelCardPreference;
  /**
   * The AI's cached strengths — present only while the explanation still
   * describes the *current* profiles (fingerprint match, see explain.ts).
   * Empty when stale: an explanation is omitted, never shown as current.
   */
  strengths: string[];
  concern: string | null;
  /** Deterministic viewer↔candidate field overlap — never AI-generated (D-32). */
  sharedTags: string[];
  /**
   * Gotra/manglik notes and, when both sides have enough birth data, the guna
   * milan summary. Display-only: none of it touches ranking, because the
   * profile builder promises the user gotra "match model me kabhi nahi jaata".
   */
  kundli: ReelCardKundli;
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

/**
 * The reel-level preference notice — shown once above the stack, not on
 * every card, when the viewer has stated nothing (or too little) for a
 * preference match to exist. Missing data as a next step, never a failure.
 */
export interface ReelPreferenceNotice {
  state: Exclude<PreferenceEvidenceState, "COMPARABLE">;
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
}

export interface ReelViewModel {
  reelId: string;
  reelDate: string;
  dailyLimit: number;
  cards: ReelCardViewModel[];
  preferenceNotice: ReelPreferenceNotice | null;
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
