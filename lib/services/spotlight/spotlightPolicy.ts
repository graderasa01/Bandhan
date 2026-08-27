/**
 * Every rule Spotlight enforces, as numbers, in one file.
 *
 * Not because constants are tidy, but because these are the promises. "A
 * promoted card never appears in the first three positions" and "one member
 * sees at most one promoted card a day" are the things that keep a paid slot
 * from turning the Reel into a billboard — and a rule spelled out inline at
 * the place it happens is a rule the next feature quietly re-decides.
 *
 * The capacity estimator reads the same numbers the delivery selector will, so
 * what a buyer is told before paying is computed from what will actually
 * happen, not from a second set of assumptions.
 *
 * Client-safe: no `server-only`, no imports. The buy screen shows some of
 * these to the buyer verbatim.
 */

// ---------------------------------------------------------- who may advertise

/**
 * A profile that is not nearly finished cannot be sold to strangers. 80 is the
 * same bar `fullProfileCompletionScore` was built for (Serious Circle uses it
 * too), and it counts the optional fields as well — caste, religion and income
 * excepted.
 */
export const MIN_PROFILE_COMPLETION = 80;

/**
 * Trust score floor. Deliberately the middle of the scale rather than a high
 * bar: this gate exists to keep throwaway accounts out, not to make Spotlight
 * a badge. Anything higher would turn "I paid" into "I am vouched for", which
 * is the one thing paid visibility must never buy.
 */
export const MIN_TRUST_SCORE = 50;

/**
 * A complaint inside this window blocks a new campaign and pauses a running
 * one. Only OPEN and ACTIONED count — a DISMISSED report is one a human looked
 * at and rejected, and holding it against someone would make the queue a
 * punishment nobody reviews.
 */
export const COMPLAINT_LOOKBACK_DAYS = 90;

// ------------------------------------------------------------ where it shows

/**
 * A promoted card can never be one of the first three cards of a Reel.
 *
 * The opening of the deck is the part people trust; selling it is how a
 * recommendation feed stops being one. Three is also enough that a five-card
 * Free reel still shows a promoted card at most in the last two slots.
 */
export const MIN_ORGANIC_CARDS_BEFORE_PROMOTED = 3;

/** At most one promoted card in any single Reel, however long the Reel is. */
export const MAX_PROMOTED_PER_REEL = 1;

/**
 * At most one promoted card per member per day, across every surface.
 *
 * This is the number that decides how much inventory exists at all: daily
 * capacity is (active members in the audience) × this. The estimator says so
 * out loud rather than selling a reach the app cannot physically deliver.
 */
export const MAX_PROMOTED_PER_VIEWER_PER_DAY = 1;

// -------------------------------------------------------------- the estimate

/**
 * How far back "how many of these people actually open the app" looks.
 *
 * Fourteen days rather than seven so one quiet week — a festival, an exam
 * season — does not halve the quoted capacity of every campaign sold that day.
 */
export const ACTIVITY_LOOKBACK_DAYS = 14;

/**
 * Below this many eligible people, the pack is not sold at all.
 *
 * The pitch's own rule, and the honest one: refusing before payment costs a
 * sale, refusing after it costs a refund and the buyer's trust.
 */
export const MIN_AUDIENCE_TO_SELL = 50;

/** The narrowest and widest age window a campaign may target. */
export const MIN_TARGET_AGE = 18;
export const MAX_TARGET_AGE = 75;

/** The app's own gender strings — `Profile.gender` values, from lib/profile/fields.ts. */
export const TARGET_GENDERS = ["Ladka", "Ladki"] as const;
export type TargetGender = (typeof TARGET_GENDERS)[number];

export function isTargetGender(value: string): value is TargetGender {
  return (TARGET_GENDERS as readonly string[]).includes(value);
}

/**
 * The label a promoted card carries, and the note behind its ⓘ.
 *
 * Not "Promoted": in a matrimony deck that word reads as desperation, and the
 * card is seen by someone who may go on to marry this person. Not a
 * seriousness or verification flavour either — Devesh's own rule is that
 * badges are earned and never sold, and a bought badge would put every earned
 * signal in the app under suspicion.
 *
 * "Spotlight" is a named product the whole membership can recognise, which is
 * what makes it a real disclosure rather than a euphemism. And it is attached
 * to the *delivery*, never to the person: see SpotlightDelivery — the label
 * cannot follow anyone into an interest, a match, a chat or a profile page,
 * because nothing downstream has anything to read.
 */
export const SPOTLIGHT_LABEL = "Spotlight";
export const SPOTLIGHT_LABEL_NOTE = "Ye member ne apni profile aage rakhi hai.";
