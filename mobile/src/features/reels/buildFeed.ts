import { FEED_QUESTIONS, FIELD_BY_KEY } from "~/catalog";
import type { ReelCard, ReelRefineQuestion } from "~/types/api";

export type ReelLensKey = "FOR_YOU" | "NEARBY" | "NEW";

export type FeedItem =
  | { kind: "profile"; key: string; card: ReelCard }
  | { kind: "question"; key: string; question: ReelRefineQuestion }
  | { kind: "end"; key: string };

/** The partner preferences among the feed's questions — the page says they change who is shown next. */
export const FEED_PREFERENCE_KEYS: ReadonlySet<string> = new Set(FEED_QUESTIONS.preferenceFields);

/**
 * The lens rule from lib/contracts/reel.ts: each lens only shows cards that
 * genuinely carry the fact.
 *
 * "New" is judged as the card *arrived* (`arrivedNew`), not as it is now: a
 * Skip or Save marks the card seen on the phone at once, and re-filtering on
 * that would pull the card out from under the thumb — the feed would shift one
 * place and the move to the next person would skip somebody.
 */
export function applyLens(cards: ReelCard[], lens: ReelLensKey, arrivedNew?: Readonly<Record<string, boolean>>): ReelCard[] {
  if (lens === "NEARBY") return cards.filter((c) => c.nearby);
  if (lens === "NEW") return cards.filter((c) => arrivedNew?.[c.id] ?? !c.seenBefore);
  return cards;
}

/**
 * The server's questions, held to the feed's own rules once more on the phone
 * (lib/reel/feedQuestions.ts): only a field on the feed's list, never one on
 * the never-list (caste, religion, gotra, manglik, income…), one tap — a
 * single select whose every option is the catalog's own stored value — and
 * few enough chips to read at a glance. Anything else belongs to the field
 * sheet, Bolo or the full form, never to a feed.
 */
export function feedQuestionsForVisit(questions: ReelRefineQuestion[]): ReelRefineQuestion[] {
  const allowed = new Set(FEED_QUESTIONS.fields);
  const never = new Set(FEED_QUESTIONS.never);
  const seen = new Set<string>();
  return questions.filter((q) => {
    if (seen.has(q.key) || !allowed.has(q.key) || never.has(q.key) || q.multi) return false;
    const def = FIELD_BY_KEY[q.key];
    const options = def?.options ?? [];
    const oneTap =
      def?.type === "select" &&
      q.options.length > 0 &&
      q.options.length <= FEED_QUESTIONS.maxOptions &&
      q.options.every((o) => options.includes(o));
    if (!oneTap) return false;
    seen.add(q.key);
    return true;
  });
}

/**
 * People with the member's own one-tap questions dealt in between, at the
 * web's pacing (lib/reel/feedQuestions.ts): the first after a few people,
 * then far apart, a few per visit at most. A long list scrolled top to bottom
 * lands every question exactly where `feedQuestionDue` would.
 *
 * Pure in the questions it is given, so the caller decides what a "visit"
 * holds: a question stays on its page once answered (the feed never jumps
 * under the thumb), and one already shown is left out of a fresh list (a new
 * lens), never dealt twice.
 */
export function buildFeed(cards: ReelCard[], questions: ReelRefineQuestion[]): FeedItem[] {
  const out: FeedItem[] = [];
  let shown = 0;
  let lastAt = 0;
  cards.forEach((card, i) => {
    out.push({ kind: "profile", key: `p-${card.id}`, card });
    const passed = i + 1;
    const gap = shown === 0 ? FEED_QUESTIONS.firstAfter : FEED_QUESTIONS.every;
    if (shown < FEED_QUESTIONS.maxPerVisit && shown < questions.length && passed - lastAt >= gap && i < cards.length - 1) {
      const question = questions[shown]!;
      out.push({ kind: "question", key: `q-${question.key}`, question });
      shown += 1;
      lastAt = passed;
    }
  });
  out.push({ kind: "end", key: "end" });
  return out;
}
