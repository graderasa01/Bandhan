/**
 * Progressive profiling — 07_advanced_ai_spec §3.1.
 *
 * The point of staging is that nobody is asked for 60 fields at once, and
 * every stage buys the user something concrete. Stage 1 is deliberately tiny:
 * eight fields and the profile is live, which is what unlocks the dashboard.
 */

import { PROFILE_FIELDS, fieldsForStage, type ProfileFieldDef, type ProfileStage } from "./fields";

export type ProfileValues = Record<string, string>;

export type StageDef = {
  stage: ProfileStage;
  title: string;
  /** What finishing this stage buys — shown as the reason to bother. */
  unlocks: string;
  estimate: string;
};

export const STAGES: StageDef[] = [
  { stage: 1, title: "Zaroori baatein", unlocks: "Aapki profile live ho jayegi", estimate: "~90 second" },
  { stage: 2, title: "Parivaar aur pasand", unlocks: "Roz ke rishte dikhne lagenge", estimate: "~3 minute" },
  { stage: 3, title: "Thoda aur kareeb se", unlocks: "Chat khul jayegi", estimate: "~2 minute" },
  { stage: 4, title: "Photo aur verification", unlocks: "Trust score badhega", estimate: "Kabhi bhi" },
];

/**
 * A select answer outside its own option list is not an answer, however
 * confident whoever produced it was.
 */
export function isAnswered(field: ProfileFieldDef, values: ProfileValues): boolean {
  const v = (values[field.key] ?? "").trim();
  if (v.length === 0) return false;
  if (field.type === "select" && field.options && !field.options.includes(v)) return false;
  return true;
}

export function requiredFieldsForStage(stage: ProfileStage): ProfileFieldDef[] {
  return fieldsForStage(stage).filter((f) => f.required);
}

/**
 * The first-run manual deck — Stage 1's eight required fields, then the photo.
 *
 * Nothing else. A brand-new account choosing "Khud Bharein" used to be handed
 * the entire sixty-field catalog as a swipe deck (2026-08-25): twenty-odd
 * cards deep, a progress bar of hairline ticks, and not one card past the
 * eighth doing anything to get the profile live. These eight *are* the gate —
 * they are exactly what `isProfileLive` checks — so they are the whole ask,
 * and everything beyond them becomes a top-up the user opts into afterwards
 * ("Add More Details" / "Full Profile Form", both of which still show the
 * full catalog).
 *
 * The photo rides along last and stays `required: false`: a profile goes live
 * without one, and this deck must never imply otherwise. It is here only so
 * that someone who wants to actually *be seen* is offered the upload at the
 * moment they're thinking about it, instead of having to go hunting for it
 * once onboarding is over.
 */
export function gateDeckFields(): ProfileFieldDef[] {
  return [...requiredFieldsForStage(1), ...PROFILE_FIELDS.filter((f) => f.type === "photo")];
}

export const GATE_DECK_KEYS: readonly string[] = gateDeckFields().map((f) => f.key);

export function isStageComplete(stage: ProfileStage, values: ProfileValues): boolean {
  return requiredFieldsForStage(stage).every((f) => isAnswered(f, values));
}

/** Stage 1 done means the profile is live — this is the dashboard gate. */
export function isProfileLive(values: ProfileValues): boolean {
  return isStageComplete(1, values);
}

/** The lowest stage still missing a required answer. */
export function currentStage(values: ProfileValues): ProfileStage {
  for (const s of [1, 2, 3, 4] as ProfileStage[]) {
    if (!isStageComplete(s, values)) return s;
  }
  return 4;
}

/** Completion across every required field, all stages — the honest denominator. */
export function completionPercent(values: ProfileValues): number {
  const required = PROFILE_FIELDS.filter((f) => f.required);
  if (required.length === 0) return 0;
  const done = required.filter((f) => isAnswered(f, values)).length;
  return Math.round((done / required.length) * 100);
}

/**
 * Fields that stay genuinely voluntary even under the "everything filled"
 * bar below — 2026-08-04, Devesh explicitly asked for caste/religion/
 * manglik/gotra to move OUT of this list and become mandatory (a Circle
 * match should see real answers, not a blank), so this is now a short,
 * deliberate exception list rather than the whole `sensitive` flag:
 *
 * - `annualIncome` — financial disclosure, its own `whyNeeded` copy promises
 *   "sirf range dikhti hai", not that it's ever required.
 * - `birthTime` / `birthPlace` — kundli-only and *never shown to anyone*,
 *   match or not (see their `whyNeeded`), so requiring them wouldn't even
 *   serve the "match sees the whole profile" reasoning behind this gate.
 */
const VOLUNTARY_DISCLOSURE_KEYS = new Set(["annualIncome", "birthTime", "birthPlace"]);

/**
 * Every field a match should be able to see, not just the minimum to go
 * live — required *and* optional, minus `VOLUNTARY_DISCLOSURE_KEYS` above and
 * `photo` fields (never part of draft values — photos upload through their
 * own table/endpoint, so `isAnswered` can never see one as filled).
 */
export function fullProfileFields(): ProfileFieldDef[] {
  return PROFILE_FIELDS.filter((f) => f.type !== "photo" && !VOLUNTARY_DISCLOSURE_KEYS.has(f.key));
}

export function missingForFullProfile(values: ProfileValues): ProfileFieldDef[] {
  return fullProfileFields().filter((f) => !isAnswered(f, values));
}

export function fullCompletionPercent(values: ProfileValues): number {
  const fields = fullProfileFields();
  if (fields.length === 0) return 0;
  const done = fields.filter((f) => isAnswered(f, values)).length;
  return Math.round((done / fields.length) * 100);
}

/** Progress within one stage — what the onboarding header shows. */
export function stageProgress(stage: ProfileStage, values: ProfileValues) {
  const required = requiredFieldsForStage(stage);
  const done = required.filter((f) => isAnswered(f, values)).length;
  return { done, total: required.length };
}

/**
 * The gap engine: what to ask next.
 *
 * Deterministic on purpose — D-32 puts question *selection* in code and leaves
 * the model to do understanding only. Required fields first, earliest stage
 * first, then catalog order.
 *
 * `skipped` is honoured for optional fields only. A required field cannot be
 * permanently skipped — D-42's "done" checklist has no such thing as a live
 * profile missing a required field, so a skip there can only ever mean
 * "not right now", never "never ask again". This is enforced here, at the
 * one place selection happens, rather than in each caller — so a required
 * key that ended up in `skipped` some other way (a past bug, a stale draft)
 * self-heals instead of quietly wedging the profile at "not live" forever.
 */
export function queue(values: ProfileValues, skipped: string[] = []): ProfileFieldDef[] {
  const skip = new Set(skipped);
  return PROFILE_FIELDS.filter(
    (f) => f.aiExtractable && !isAnswered(f, values) && (f.required || !skip.has(f.key)),
  ).sort((a, b) => {
    if (a.stage !== b.stage) return a.stage - b.stage;
    if (a.required !== b.required) return a.required ? -1 : 1;
    return 0;
  });
}

export function nextUnanswered(values: ProfileValues, skipped: string[] = []): ProfileFieldDef | null {
  return queue(values, skipped)[0] ?? null;
}

/**
 * The same gap engine, `n` at a time — what lets the voice interview ask
 * "naam, umar aur sheher?" in one breath instead of three separate turns.
 * Order and selection rules are identical to `nextUnanswered`; this is purely
 * a batch size on top, so the two can never disagree about what's next.
 */
export function nextBatch(values: ProfileValues, skipped: string[] = [], n = 3): ProfileFieldDef[] {
  return queue(values, skipped).slice(0, n);
}

export function missingRequired(values: ProfileValues): ProfileFieldDef[] {
  return PROFILE_FIELDS.filter((f) => f.required && !isAnswered(f, values));
}
