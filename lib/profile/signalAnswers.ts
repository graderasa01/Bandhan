import {
  INTELLIGENCE_LAYERS,
  INTELLIGENCE_QUESTIONS,
  INTELLIGENCE_QUESTION_BY_KEY,
  LAYER_SLUG,
  questionsForLayer,
  type BranchCondition,
  type IntelligenceLayerKey,
  type IntelligenceQuestionDef,
} from "./intelligenceQuestions";
import type { RespondentType, SignalSource, SignalVisibility } from "@prisma/client";
import type { ProfileWithSubTables } from "@/lib/services/profile/completionService";

/**
 * The pure half of Marriage Intelligence — no `prisma`, no `server-only`.
 *
 * It lives apart from `intelligenceService.ts` for one concrete reason: the
 * match pipeline calls `derivedSignals` inside its scoring loop, and D-33 says
 * that loop stays pure TypeScript with no DB and no AI. A module that imports
 * `prisma` cannot be called from there without dragging the client in behind
 * it, so the functions the loop needs live here and the ones that read the
 * database live there.
 */

export type SignalAnswerValue = string | string[];

export interface SignalAnswerView {
  key: string;
  value: SignalAnswerValue;
  source: SignalSource;
  respondentType: RespondentType;
  /**
   * False for a subjective answer someone else gave on the candidate's behalf,
   * or an AI inference nobody has confirmed. Such an answer still shows and
   * still counts — at reduced evidence. See `evidenceWeightFor`.
   */
  confirmed: boolean;
  visibility: SignalVisibility;
  /** True when this was read off an older profile field, not answered here. */
  derived: boolean;
}

export type SignalAnswerMap = Map<string, SignalAnswerView>;

export function toAnswerValue(raw: unknown): SignalAnswerValue | null {
  if (typeof raw === "string") return raw.trim() ? raw : null;
  if (Array.isArray(raw)) {
    const items = raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
    return items.length > 0 ? items : null;
  }
  return null;
}

/** First option of a multi-answer, or the answer itself. Comparison helper. */
export function firstValue(value: SignalAnswerValue | undefined): string | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

export function asList(value: SignalAnswerValue | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * The legacy fields a question can be read off, in the shape `derivedFrom`
 * expects. `marriageTimelineEnum` is not a catalog field — it is the
 * `Profile.marriageTimeline` column Serious Circle already collects, folded in
 * here so nobody is asked their timeline twice.
 */
export type LegacySignalSource = Record<string, string | null | undefined>;

export function legacySourceFromProfile(profile: ProfileWithSubTables): LegacySignalSource {
  return {
    marriageTimelineEnum: profile.marriageTimeline,
    relocateWilling: profile.lifestyle?.relocateWilling,
    partnerWorkExpectation: profile.partnerPreferences?.partnerWorkExpectation,
    familyValues: profile.family?.familyValues,
  };
}

/**
 * Answers the app already holds under an older name.
 *
 * The mapping is intentionally partial: `relocateWilling = "Haan"` says someone
 * will move but not how far, so it maps to nothing and the real question still
 * gets asked. A derived answer that over-claims is worse than an honest gap.
 */
export function derivedSignals(
  source: LegacySignalSource,
  respondentType: RespondentType = "SELF",
): SignalAnswerMap {
  const out: SignalAnswerMap = new Map();
  for (const q of INTELLIGENCE_QUESTIONS) {
    if (!q.derivedFrom) continue;
    const raw = source[q.derivedFrom.field];
    if (!raw) continue;
    const mapped = q.derivedFrom.map[raw];
    if (!mapped) continue;
    out.set(q.key, {
      key: q.key,
      value: mapped,
      source: "USER_ENTERED",
      respondentType,
      confirmed: true,
      visibility: q.visibility,
      derived: true,
    });
  }
  return out;
}

/** Stored answers win over derived ones — a real answer beats a translation of an old field. */
export function mergeSignalAnswers(derived: SignalAnswerMap, stored: SignalAnswerMap): SignalAnswerMap {
  const merged = new Map(derived);
  for (const [key, view] of stored) merged.set(key, view);
  return merged;
}

/**
 * Everything a profile has told us about itself, derived answers included.
 * This is what the scoring loop compares — one call per profile, no DB.
 */
export function effectiveSignals(
  profile: ProfileWithSubTables,
  stored: SignalAnswerMap | undefined,
): SignalAnswerMap {
  const derived = derivedSignals(legacySourceFromProfile(profile), profile.respondentType);
  return stored ? mergeSignalAnswers(derived, stored) : derived;
}

/**
 * How much a single answer is worth as evidence.
 *
 * A subjective answer a parent gave about their child is real information and
 * is kept — but it is a report, not a statement, so it counts for half until
 * the candidate confirms it. Same for an unconfirmed AI inference: D-32 says
 * the model proposes and code decides, and treating an unconfirmed guess as a
 * fact is exactly the decision code should not make.
 */
export function evidenceWeightFor(view: SignalAnswerView): number {
  return view.confirmed ? 1 : 0.5;
}

/**
 * A branch can key off either catalog: `childrenTimeline` depends on a signal
 * answer, `importance:caste` depends on whether the user ever set
 * `partnerCastePreference` in the profile form. So the lookup reads answers
 * first and falls back to the flat draft values.
 */
export function makeLookup(answers: SignalAnswerMap, values: Record<string, string>) {
  return (key: string): SignalAnswerValue | undefined => {
    const answer = answers.get(key);
    if (answer) return answer.value;
    const raw = values[key];
    return raw && raw.trim() ? raw : undefined;
  };
}

export function branchSatisfied(
  condition: BranchCondition | undefined,
  lookup: (key: string) => SignalAnswerValue | undefined,
): boolean {
  if (!condition) return true;
  const raw = lookup(condition.key);
  const values = asList(raw)
    .map((v) => v.trim())
    .filter(Boolean);
  if (values.length === 0) return false;
  if (condition.anyOf && !values.some((v) => condition.anyOf!.includes(v))) return false;
  if (condition.notOneOf && values.every((v) => condition.notOneOf!.includes(v))) return false;
  return true;
}

/** Questions in a layer whose branch condition currently holds. */
export function applicableQuestions(
  layer: IntelligenceLayerKey,
  lookup: (key: string) => SignalAnswerValue | undefined,
): IntelligenceQuestionDef[] {
  return questionsForLayer(layer).filter((q) => branchSatisfied(q.branchOn, lookup));
}

/**
 * Answers safe to render on a profile page or hand to an AI dossier.
 *
 * MATCH_PRIVATE and PRIVATE answers are dropped here rather than at each call
 * site — the whole point of the visibility field is that one function decides
 * and every reader inherits the decision.
 */
export function profileVisibleAnswers(answers: SignalAnswerMap): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  for (const q of INTELLIGENCE_QUESTIONS) {
    if (q.visibility !== "PROFILE_VISIBLE") continue;
    const answer = answers.get(q.key);
    if (!answer) continue;
    const text = asList(answer.value).join(", ");
    if (text.trim()) out.push({ label: q.label, value: text });
  }
  return out;
}

/** A stored row, narrowed to what building a view actually needs. */
export interface SignalAnswerRow {
  key: string;
  answerJson: unknown;
  source: SignalSource;
  respondentType: RespondentType;
  confirmed: boolean;
}

export function rowsToSignalMap(rows: SignalAnswerRow[]): SignalAnswerMap {
  const map: SignalAnswerMap = new Map();
  for (const r of rows) {
    const question = INTELLIGENCE_QUESTION_BY_KEY[r.key];
    // A row whose key left the catalog is skipped rather than surfaced — it is
    // history, not an answer to a question anyone can still see.
    if (!question) continue;
    const value = toAnswerValue(r.answerJson);
    if (value === null) continue;
    map.set(r.key, {
      key: r.key,
      value,
      source: r.source,
      respondentType: r.respondentType,
      confirmed: r.confirmed,
      // Read from the catalog, not the row: re-classifying a question as
      // private must take effect immediately for answers already stored.
      visibility: question.visibility,
      derived: false,
    });
  }
  return map;
}

/* ------------------------------------------------------------------ */
/* Coverage                                                            */
/* ------------------------------------------------------------------ */

export interface IntelligenceLayerProgress {
  key: IntelligenceLayerKey;
  slug: string;
  title: string;
  unlocks: string;
  answered: number;
  total: number;
  complete: boolean;
  estimatedMinutes: number;
  /**
   * Which of the layer's questions currently apply, in ask order. Branch
   * conditions read the profile's draft values (`importance:caste` only exists
   * if a caste preference was ever set), which the browser does not have — so
   * the server resolves them once here rather than shipping the draft to the
   * client just to re-run the same logic.
   */
  applicableKeys: string[];
}

export interface IntelligenceProgress {
  answeredQuestions: number;
  totalQuestions: number;
  /** The number a user actually reads: "3 of 9 areas understood". */
  completedLayers: number;
  totalLayers: number;
  layers: IntelligenceLayerProgress[];
  /** First incomplete layer in catalog order. Null once every layer is done. */
  nextLayer: IntelligenceLayerProgress | null;
  /** First unanswered question inside `nextLayer` — required ones first. */
  nextQuestionKey: string | null;
}

export function computeIntelligenceProgress(
  answers: SignalAnswerMap,
  values: Record<string, string>,
): IntelligenceProgress {
  const lookup = makeLookup(answers, values);

  const layers: IntelligenceLayerProgress[] = INTELLIGENCE_LAYERS.map((layer) => {
    const applicable = applicableQuestions(layer.key, lookup);
    const answered = applicable.filter((q) => answers.has(q.key)).length;
    const requiredLeft = applicable.filter((q) => q.required && !answers.has(q.key));
    return {
      key: layer.key,
      slug: LAYER_SLUG[layer.key],
      title: layer.title,
      unlocks: layer.unlocks,
      answered,
      total: applicable.length,
      // Gated on *required* questions only: an optional one left blank must
      // never keep a layer permanently "incomplete", or the dashboard would
      // recommend the same area forever.
      complete: requiredLeft.length === 0,
      estimatedMinutes: layer.estimatedMinutes,
      applicableKeys: applicable.map((q) => q.key),
    };
  });

  const nextLayer = layers.find((l) => !l.complete) ?? null;
  let nextQuestionKey: string | null = null;
  if (nextLayer) {
    const applicable = applicableQuestions(nextLayer.key, lookup);
    const unanswered = applicable.filter((q) => !answers.has(q.key));
    const next = unanswered.find((q) => q.required) ?? unanswered[0] ?? null;
    nextQuestionKey = next?.key ?? null;
  }

  return {
    answeredQuestions: layers.reduce((sum, l) => sum + l.answered, 0),
    totalQuestions: layers.reduce((sum, l) => sum + l.total, 0),
    completedLayers: layers.filter((l) => l.complete).length,
    totalLayers: layers.length,
    layers,
    nextLayer,
    nextQuestionKey,
  };
}
