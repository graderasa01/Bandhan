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

/**
 * The lenses across the top of the reel.
 *
 * They re-cut *today's already-generated deck* — they never ask the server for
 * a different pool, because the pool is the day's ritual and a tab that
 * silently fetched more would make the daily limit meaningless. Each one is
 * answered by a real field on the card below, so an empty lens says "aaj is
 * tarah ki koi profile nahi" rather than inventing a result.
 */
export type ReelLens = "FOR_YOU" | "NEARBY" | "NEW" | "COMPATIBLE";

/** A candidate's audio, as a pre-match viewer may hear it. */
export interface ReelVoiceNote {
  mediaId: string;
  seconds: number;
}

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
  /** The photo gate — see `photoLockFor()` in lib/services/plans/photoAccess.ts (D-90). */
  photoUnlocked: boolean;
  /** Why it is locked, so the card can say the true reason and offer only a real way in. */
  photoLock: import("@/lib/contracts/photoLock").PhotoLock;
  /**
   * A paid Spotlight card (D-90 Phase 6), shown with the "Spotlight" label. Set
   * from this reel row's own delivery, so it cannot follow the person into an
   * interest, a match, a chat or a profile page.
   */
  spotlight: boolean;
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
   * The only audio a pre-match viewer may hear about this person: the Verified
   * Parent Blessing, already past moderation (`getPublicParentBlessings`).
   *
   * Null is the common case and the card hides the affordance entirely rather
   * than showing a disabled play button — nobody recorded anything, so there
   * is nothing to promise. Deliberately NOT "voice intro": nothing in this
   * product lets a member record one about themselves, and labelling a
   * family member's clip as the person's own introduction would be the exact
   * kind of near-miss §25 warns about.
   */
  voiceNote: ReelVoiceNote | null;
  /**
   * Same `currentCity` as the viewer — the honest answer the "Nearby" lens is
   * built on. False whenever either side left the field empty: "we don't know
   * where they are" is not "they are far away", and the lens simply doesn't
   * claim them.
   */
  nearby: boolean;
  /** Profile created inside `NEW_PROFILE_WINDOW_DAYS` — the "New" lens. */
  isNew: boolean;
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

/**
 * One question the end-of-batch refinement may ask.
 *
 * Built from `lib/profile/fields.ts` — the same catalog the interview and the
 * manual deck read — and filtered to the partner-preference fields this viewer
 * has genuinely left empty. Answers are written through the ordinary
 * `/api/profile/save-draft` autosave, so a preference stated here is the same
 * row a preference stated in the deck would be, and tomorrow's reel reads it
 * without anything else being taught about this screen.
 */
export interface ReelRefineQuestion {
  /** Profile field key — the autosave payload's own key. */
  key: string;
  question: string;
  options: string[];
  /** `multiselect` fields send a comma-joined value, same as the manual deck. */
  multi: boolean;
}

/** The viewer's own chip in the reel header — never a candidate's data. */
export interface ReelViewer {
  name: string;
  /** Their own primary photo, shown only to them. Null renders an initial. */
  photoUrl: string | null;
}

export interface ReelViewModel {
  reelId: string;
  reelDate: string;
  dailyLimit: number;
  cards: ReelCardViewModel[];
  /** Whose reel this is — the header avatar and nothing else. */
  viewer: ReelViewer;
  /**
   * The still-unanswered partner-preference questions the post-batch Grio
   * state may ask, one at a time. Empty when the viewer has already told us
   * everything this catalog can ask — the card then goes straight to its
   * closing actions instead of inventing a question.
   */
  refineQuestions: ReelRefineQuestion[];
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
