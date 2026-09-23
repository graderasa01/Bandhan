/**
 * "Reel dekhte-dekhte profile" — one of the member's own unanswered questions,
 * dealt into the feed between two people.
 *
 * The reel asked about the member's own profile in exactly one place: the deck
 * that opens when the feed runs out (D-92b). Since D-91 the feed rarely runs
 * out — a member with a real pool can scroll for an hour and never reach it —
 * so the screen people spend the most time on never asked them anything. This
 * is the smallest version of the fix, and every rule below is load-bearing:
 *
 *  1. **One tap, or nothing.** Only plain single-select fields whose chips are
 *     the catalog's own stored values, so every chip is an answer `isAnswered`
 *     accepts (the Smart Profile Deck trap: a chip outside the options ticks,
 *     moves on, and stores nothing). No text box, no multi-select, no cascade —
 *     a question that needs a second tap is a form, and a form in the middle of
 *     a feed is an interruption.
 *  2. **Nothing the app must never reach for.** Caste, religion, gotra,
 *     manglik and income are not on the list and are refused even if somebody
 *     adds them to it — the same line `profileGaps.ts` holds for viewers.
 *  3. **A scroll is a skip.** Swiping past the page writes nothing (D-92: a
 *     gesture has no words, so it decides nothing). Only a labelled chip saves.
 *  4. **Rare.** The first after a handful of people, then a long gap, and a
 *     few per visit at most. A question that was shown is not shown again this
 *     visit, answered or not — "abhi nahi" is an answer too.
 *  5. **Code's words, no model call.** The question is the catalog's own
 *     (`fields.ts`), phrased for whoever is answering — a parent running the
 *     account is asked about their child, not about themselves.
 *
 * Pure and client-safe, and deliberately free of the field catalog so the
 * reel's bundle does not carry it: the list itself is built on the server by
 * `feedQuestionList.ts`, `ReelStack` paces it with `feedQuestionDue`, and
 * `scripts/reel-endless-check.ts` proves both without a database.
 */

/**
 * The fields a feed may ask, most useful first: the partner preferences the
 * ranking actually reads, then the facts a family asks about before anything
 * else. Order is priority — a member with all nine missing meets these first.
 */
export const FEED_QUESTION_FIELDS: readonly string[] = [
  "partnerAgeRange",
  "partnerWorkExpectation",
  "relocateWilling",
  "partnerEducation",
  "diet",
  "familyType",
  "familyValues",
  "smoking",
  "drinking",
];

/** Never asked in the feed, whatever `FEED_QUESTION_FIELDS` grows into (rule 2). */
export const NEVER_A_FEED_QUESTION: readonly string[] = [
  "caste",
  "religion",
  "gotra",
  "manglikStatus",
  "annualIncome",
  "partnerCastePreference",
  "partnerReligionPreference",
  "partnerManglikPreference",
];

/** The partner-preference half of the list — they change who is shown next, and the page says so. */
export const FEED_PREFERENCE_FIELDS: readonly string[] = [
  "partnerAgeRange",
  "partnerWorkExpectation",
  "partnerEducation",
];

/** People passed before the first question — enough to be browsing, not arriving. */
export const FEED_QUESTION_FIRST_AFTER = 5;
/** People passed between one question and the next. */
export const FEED_QUESTION_EVERY = 12;
/** However long the visit. */
export const FEED_QUESTION_MAX_PER_VISIT = 3;
/** More chips than this is a list to read, not a tap. */
export const FEED_QUESTION_MAX_OPTIONS = 6;

/**
 * Is the page after the current person a question?
 *
 * @param passed people the member will have moved past once they leave the
 *   one on screen now
 * @param lastAt `passed` at the moment the previous question appeared (0 before the first)
 * @param shown questions already shown this visit
 * @param left questions still unasked this visit
 */
export function feedQuestionDue(p: { passed: number; lastAt: number; shown: number; left: number }): boolean {
  if (p.left <= 0 || p.shown >= FEED_QUESTION_MAX_PER_VISIT) return false;
  const gap = p.shown === 0 ? FEED_QUESTION_FIRST_AFTER : FEED_QUESTION_EVERY;
  return p.passed - p.lastAt >= gap;
}
