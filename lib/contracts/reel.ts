/** Rishta Reel — 08_architecture_and_experience_plan.md §4. */

import type { KundliNote, KundliTone } from "@/lib/contracts/kundli";
import type { WhyThisMatch } from "@/lib/services/match/whyThisMatch";
import type { CandidateFactGroup } from "@/lib/services/match/candidateFacts";
import type { PreferenceEvidenceState } from "@/lib/services/match/preferenceEvidence";
import { REEL_LANES, type ReelLane } from "@/lib/contracts/reelLibrary";

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
  /**
   * The one honest line about how this card stands against what the viewer
   * asked for. Two things can fill it: "we could not compare" (the states
   * above), and — on any state, including COMPARABLE — "this person is
   * outside the age range you gave us, because nobody inside it was left".
   * The second exists because `getCandidates` widens the age filter on the
   * member's behalf and owes them the sentence. Null when neither applies.
   */
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
 * They re-cut the deck the screen is holding. Each one is answered by a real
 * field on the card below, so a lens can only ever show cards that genuinely
 * carry that property — nothing is inferred to fill a tab.
 *
 * Since D-91 the deck grows: a lens that runs dry asks for the next batch
 * rather than declaring the day over, and gives up only when the candidate
 * pool itself is finished (`ReelMoreResponse.exhausted`). An empty lens with a
 * non-empty pool is therefore a "abhi tak koi nahi mila" state with a way to
 * keep looking, never a full stop.
 *
 * ## FOR_YOU holds everybody (D-92)
 *
 * It is not "the undecided ones" any more. The deck the server sends is the
 * new rishtey *and* the ones this member has already seen, mixed (see
 * `reelSeenDeck.ts`), because the reel is scrolled like a feed now and a feed
 * that silently drops everything you have already looked at ends every few
 * minutes. NEW is the lens that answers "naye kaun hain" — `!seenBefore` — so
 * a new profile appears in both tabs, which is the point: one of them is the
 * whole feed and the other is a filter over it.
 */
export type ReelLens = "FOR_YOU" | "NEARBY" | "NEW";

/**
 * The three forward lenses, in rail order. Here rather than in `ReelTabs`
 * because the page itself has to resolve a `?tab=` link target before any
 * client component is reached — the same reason `REEL_LANES` lives in
 * `reelLibrary.ts`.
 */
export const REEL_LENSES: ReelLens[] = ["FOR_YOU", "NEARBY", "NEW"];

/** Every pill in the rail, in order — the forward lenses, then the history lanes. */
export type ReelTab = ReelLens | ReelLane;
export const REEL_TABS: ReelTab[] = [...REEL_LENSES, ...REEL_LANES];

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
  /**
   * Has this card been on this viewer's screen before? (D-92)
   *
   * True the moment a `SwipeAction` row exists for the pair — a decision, an
   * Ask Grio, or simply having been scrolled past. It is what makes "For You"
   * able to hold both halves of the feed at once: the "New" lens is exactly
   * `!seenBefore`, so a tab can still only show cards that carry the fact.
   *
   * Deliberately *not* "the profile joined recently", which is what this field
   * used to mean (`isNew`, a 30-day window on `Profile.createdAt`). A member
   * asking for "naye" on this screen means new to them — somebody they have
   * not already walked past — and the join date answered a different question
   * nobody was asking here.
   */
  seenBefore: boolean;
  /**
   * The last decision this viewer took on this person, on any day — so a card
   * returning in the mixed feed wears what already happened to it instead of
   * pretending to be a first meeting.
   *
   * Null when nothing was ever decided (seen and scrolled past, or asked
   * about). "UP" is never stored here: it is a look, not a decision.
   */
  lastDecision: Exclude<ReelSwipeDirection, "UP"> | null;
  /**
   * The `Match` these two already have, if they have one (D-92b).
   *
   * Set from the same batch query the photo gate reads, so it cannot disagree
   * with `photoUnlocked`. Non-null changes what the card *is*: there is
   * nothing left to decide, so the interest button becomes "Message", the
   * horizontal gestures stop deciding anything, and the rail offers the chat.
   *
   * It is also why a matched person appears in the feed at all — see
   * `reelSeenDeck.ts`.
   */
  matchId: string | null;
  /*
   * `compatible` was here — the "Compatible" lens's backing field. Removed
   * with the lens (D-91b, Devesh's call): every other lens states a fact the
   * card carries (same city, joined this month), and this one stated a
   * judgement about the pair. The judgement still exists where it belongs —
   * the ring on the card, and the breakdown behind it — rather than as a tab
   * that was empty for anybody who had not yet stated a preference.
   */
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
   * This viewer's own private like on this person (D-91b) — so the heart is
   * already filled after a reload.
   *
   * Never the other direction, and never a count: "kisne mujhe like kiya" has
   * no implementation anywhere (see `likeService`), and a card that leaked it
   * would be the whole feature undone.
   */
  liked: boolean;
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
  /**
   * Every candidate's photo on this screen is locked, and the *reason* is this
   * viewer — `canViewerUnlockPhotos` is false, so the gate reads
   * `add_own_photo` (D-90: "apni photo lagao, sabki dekho").
   *
   * The reel asks for it up front rather than only per-card: a member who
   * scrolls fifteen grey rectangles has already formed their opinion of the
   * product by the time a small "Add Your Photo" link explains why.
   */
  needsOwnPhoto: boolean;
  /**
   * They have uploaded and it is waiting on Photo Verification. Distinct from
   * `needsOwnPhoto` being false, because both mean "don't ask again" but they
   * are different news: one is "done", the other is "with us, nothing for you
   * to do". Asking a member to upload a photo they just uploaded is the fastest
   * way to make a gate feel broken.
   */
  photoInReview: boolean;
  /** Plan flags for the clean-up the gate offers — the same two `/api/profile/me` returns. */
  canPhotoEnhance: boolean;
  canPhotoUltraEnhance: boolean;
  /**
   * Their own `currentCity`, for the reel search sheet's one-tap "mere sheher
   * me" chip. Null when they never filled it, and the chip is then absent
   * rather than guessing a city from an IP address.
   */
  city: string | null;
}

export interface ReelViewModel {
  reelId: string;
  reelDate: string;
  /*
   * `dailyLimit` was here, and D-91 removed it rather than replacing it with a
   * total. The reel does not need one: it shows the next card until there is
   * no next card, and a number on this screen would only invite the member to
   * treat it as a target. The dashboard, which is asked "how many rishtey do I
   * have", counts the pool for itself (`countCandidatePool`).
   */
  cards: ReelCardViewModel[];
  /**
   * How far into the "already seen" half of the feed this batch got (D-92) —
   * an opaque offset the screen hands straight back to `/api/reel/more` so the
   * next top-up continues the same walk instead of restarting it.
   *
   * Null means that half is finished: everybody this member has seen before is
   * already in the deck.
   */
  seenCursor: string | null;
  /** Whose reel this is — the header avatar and nothing else. */
  viewer: ReelViewer;
  /**
   * The still-unanswered partner-preference questions the post-batch Grio
   * state may ask, one at a time. Empty when the viewer has already told us
   * everything this catalog can ask — the card then goes straight to its
   * closing actions instead of inventing a question.
   */
  /**
   * How many people sit in each Meri List lane (D-91b) — the number on the
   * four backward-looking pills, from the server rather than from whatever
   * happens to be loaded.
   */
  laneCounts: import("@/lib/contracts/reelLibrary").ReelLaneCounts;
  refineQuestions: ReelRefineQuestion[];
  preferenceNotice: ReelPreferenceNotice | null;
  /**
   * What this member had already done on today's deck before this page load —
   * so a reload continues the day instead of restarting it, and the closing
   * card's recap counts the whole day rather than the last few minutes.
   *
   * `seen` is everybody who was on screen, including the cards scrolled past
   * (D-92) — the recap says "dekhi", and they were. `sent` and `shortlisted`
   * count decisions only, one per person however many times it was taken.
   */
  todayDecisions: { seen: number; sent: number; shortlisted: number };
  /**
   * Set only when the reel has never had a single candidate — "koi rishta
   * mila hi nahi", which is a different sentence from "sab dekh liye" and
   * needs a different screen. Null once anything has ever been dealt, however
   * much of it has since been decided.
   */
  emptyState: { title: string; description: string } | null;
  /**
   * Unread messages waiting for this member, across every chat (D-92b).
   *
   * The reel is full-bleed — no header, no bottom nav — so the pill rail is
   * the only place a "koi jawab aaya hai" can appear while somebody is
   * browsing. A count of rows, and the Messages pill shows a mark when it is
   * above zero rather than a second number nobody asked for.
   */
  unreadMessages: number;
  /**
   * The member's own unanswered profile fields, in catalog order (D-92b).
   *
   * Handed to `SmartProfileDeck` as its `only` list when the feed runs out, so
   * the end of the reel is a thing to *do* rather than a full stop. Capped —
   * see `REEL_END_GAP_CARDS` — because "ab ye 8 cheezein bhar dijiye" is an
   * offer and "ab ye 34 bhar dijiye" is a chore.
   *
   * Empty means the profile has nothing missing, and the closing card then
   * offers only what it always did.
   */
  profileGaps: string[];
  /** Voice notes usable right now? False hides every voice affordance in the reel. */
  voiceEnabled: boolean;
  /** Ask Bridge usable right now? False hides the "kuch poochein" affordance. */
  askBridgeEnabled: boolean;
  /** Today's voice quest, if the quest system is running and it isn't done yet. */
  voiceQuest: { title: string; rewardLabel: string } | null;
}

/**
 * What `/api/reel/more` answers with — D-91's top-up.
 *
 * `exhausted` is the one thing the screen cannot work out for itself, and it
 * is the difference between the two sentences it may print: "aur rishtey aa
 * rahe hain" and "ab aapke liye matching rishtey baad me milenge". It is set
 * from a real empty result, never guessed from a short batch — and since D-92
 * it means *both* halves of the feed are finished: no new rishta left, and
 * nobody left among the ones already seen.
 */
export interface ReelMoreResponse {
  ok: boolean;
  cards: ReelCardViewModel[];
  exhausted: boolean;
  /** Where the "already seen" half got to — see `ReelViewModel.seenCursor`. */
  seenCursor?: string | null;
  message?: string;
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
