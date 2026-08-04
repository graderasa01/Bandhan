/**
 * The gap-filling half of Deep Profile's UNKNOWN state (05_ai_spec.md §15.3,
 * `lib/services/deepProfile/deepProfileService.ts`). A dimension goes UNKNOWN
 * when `buildInput()` there has no signal for it — bio, lifestyle, family,
 * profession fields all null. Rather than leaving that a dead end, this bank
 * asks one short tap-choice question at a time for whichever of those fields
 * is still empty; answering it writes straight to the real field (via the
 * same `/api/profile/save-draft` path Stage 3 onboarding already uses), so
 * the next recompute has real signal to work with.
 *
 * Tap-only, zero AI cost — same discipline as `mindset.ts`'s three questions
 * (D-31/D-32: no model call, code picks the question). One question is shown
 * at a time; once it's answered the field is no longer null, so the next
 * visit naturally surfaces the next gap — no separate "already asked today"
 * state needs to exist for that pacing to work.
 */

import { MINDSET_QUESTIONS, type MindsetKey } from "./mindset";
import { FIELD_BY_KEY } from "./fields";

const GAP_FIELD_KEYS = ["smoking", "drinking", "familyValues", "relocateWilling"] as const;
type GapFieldKey = (typeof GAP_FIELD_KEYS)[number];

export type GapQuestionKey = MindsetKey | GapFieldKey;

export interface GapQuestionDef {
  key: GapQuestionKey;
  question: string;
  options: string[];
}

// Mindset questions first (whoever skipped `MindsetFlow.tsx` after Stage 1),
// then the Stage-3 *optional* fields (`fields.ts`) most likely to still be
// empty on an already-submitted profile — D-25 only requires Stage 1/2.
// Reusing `FIELD_BY_KEY`'s question/options text rather than retyping it
// keeps this bank from drifting out of sync with the onboarding catalog.
export const GAP_QUESTIONS: GapQuestionDef[] = [
  ...MINDSET_QUESTIONS.map((q) => ({
    key: q.key,
    question: q.question,
    options: q.options.map((o) => o.value),
  })),
  ...GAP_FIELD_KEYS.map((key) => ({
    key,
    question: FIELD_BY_KEY[key].question,
    options: FIELD_BY_KEY[key].options ?? [],
  })),
];

export interface GapAnswers {
  weekendVibe: string | null;
  bigDecisionStyle: string | null;
  socialEnergy: string | null;
  smoking: string | null;
  drinking: string | null;
  familyValues: string | null;
  relocateWilling: string | null;
}

/** First unanswered question in priority order — null once every field here is filled. */
export function pickGapQuestion(answers: GapAnswers): GapQuestionDef | null {
  return GAP_QUESTIONS.find((q) => !answers[q.key]?.trim()) ?? null;
}
