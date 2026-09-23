/**
 * The server half of "reel dekhte-dekhte profile": which of the member's own
 * unanswered fields the feed may ask, phrased for whoever is answering. The
 * rules live in `feedQuestions.ts`; this file only applies them to the field
 * catalog, and is kept apart so the catalog never ships in the reel's bundle.
 */

import { FIELD_BY_KEY, questionFor } from "@/lib/profile/fields";
import type { ReelRefineQuestion } from "@/lib/contracts/reel";
import { FEED_QUESTION_FIELDS, FEED_QUESTION_MAX_OPTIONS, NEVER_A_FEED_QUESTION } from "@/lib/reel/feedQuestions";

/**
 * The questions this member can be asked in the feed, in priority order.
 *
 * @param missingKeys field keys `computeCompletion` reports as unanswered
 *   (`missingFullFields`) — so "missing" means exactly what it means on the
 *   member's own dashboard, and the end-of-feed deck agrees with it.
 * @param forSelf false when a parent or relative runs the account.
 */
export function feedQuestionsFrom(missingKeys: readonly string[], forSelf: boolean): ReelRefineQuestion[] {
  const missing = new Set(missingKeys);
  const out: ReelRefineQuestion[] = [];
  for (const key of FEED_QUESTION_FIELDS) {
    if (!missing.has(key) || NEVER_A_FEED_QUESTION.includes(key)) continue;
    const def = FIELD_BY_KEY[key];
    if (!def || def.type !== "select" || !def.options?.length || def.options.length > FEED_QUESTION_MAX_OPTIONS) continue;
    out.push({ key, question: questionFor(def, forSelf), options: [...def.options], multi: false });
  }
  return out;
}
