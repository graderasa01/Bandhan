import { prisma } from "@/lib/db/prisma";
import {
  DEAL_BREAKER_LABEL,
  INTELLIGENCE_QUESTION_BY_KEY,
  LAYER_BY_KEY,
  LAYER_SLUG,
  intelligenceQuestionFor,
  type IntelligenceLayerKey,
  type IntelligenceQuestionDef,
} from "@/lib/profile/intelligenceQuestions";
import {
  applicableQuestions,
  asList,
  computeIntelligenceProgress,
  derivedSignals,
  legacySourceFromProfile,
  makeLookup,
  mergeSignalAnswers,
  rowsToSignalMap,
  type IntelligenceProgress,
  type SignalAnswerMap,
  type SignalAnswerRow,
  type SignalAnswerValue,
} from "@/lib/profile/signalAnswers";
import { getOrCreateProfile, saveDraft } from "./draftService";
import { computeCompletion, type ProfileWithSubTables } from "./completionService";
import type { MarriageTimeline, RespondentType } from "@prisma/client";

/**
 * Marriage Intelligence — reading and writing the second data layer.
 *
 * The catalog (`lib/profile/intelligenceQuestions.ts`) says what may be asked.
 * The pure helpers (`lib/profile/signalAnswers.ts`) say how an answer is read
 * and weighed. This file is the database half: what one specific person has
 * already told us, which layer to ask about next, and what happens on a write.
 *
 * Client components import `signalAnswers.ts`, never this file — that split is
 * the boundary, the same way `draftService.ts` and `completionService.ts` next
 * door are server-side by virtue of importing `prisma`, not by a marker. No
 * `server-only` here on purpose: it would also make this module unimportable
 * from `scripts/`, and `scripts/intelligence-persistence-check.ts` exercises
 * the real write path rather than a reimplementation of it.
 *
 * ## Coverage is not completion
 *
 * Nothing here touches `completionPercent()`. A profile is "ready" when
 * `stages.ts` says its required fields are filled; it is "understood" when the
 * layers below are answered. Those are different facts and the dashboard shows
 * them as different numbers on purpose — a 100%-complete profile the app knows
 * nothing real about is exactly the state this whole layer exists to end.
 *
 * ## Nothing here blocks anything
 *
 * No layer gates the reel, matches, chat or the dashboard. An unanswered
 * question is UNKNOWN — a missing signal that renormalizes away in ranking,
 * never a zero and never a lock.
 */

export type {
  IntelligenceLayerProgress,
  IntelligenceProgress,
  SignalAnswerMap,
  SignalAnswerValue,
  SignalAnswerView,
} from "@/lib/profile/signalAnswers";
export {
  asList,
  computeIntelligenceProgress,
  effectiveSignals,
  evidenceWeightFor,
  firstValue,
  profileVisibleAnswers,
} from "@/lib/profile/signalAnswers";

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

export async function getStoredSignalAnswers(profileId: string): Promise<SignalAnswerMap> {
  return rowsToSignalMap(await prisma.profileSignalAnswer.findMany({ where: { profileId } }));
}

/**
 * Stored answers for many profiles in one query — what the match pipeline
 * pre-fetches so its scoring loop stays pure TS.
 */
export async function getSignalAnswersForProfiles(
  profileIds: string[],
): Promise<Map<string, SignalAnswerMap>> {
  const out = new Map<string, SignalAnswerMap>();
  if (profileIds.length === 0) return out;

  const rows = await prisma.profileSignalAnswer.findMany({ where: { profileId: { in: profileIds } } });
  const byProfile = new Map<string, SignalAnswerRow[]>();
  for (const r of rows) {
    const existing = byProfile.get(r.profileId) ?? [];
    existing.push(r);
    byProfile.set(r.profileId, existing);
  }
  for (const [profileId, list] of byProfile) out.set(profileId, rowsToSignalMap(list));
  return out;
}

/* ------------------------------------------------------------------ */
/* The one read every screen uses                                      */
/* ------------------------------------------------------------------ */

export interface IntelligenceState {
  profileId: string;
  respondentType: RespondentType;
  answers: SignalAnswerMap;
  values: Record<string, string>;
  progress: IntelligenceProgress;
}

export async function getIntelligenceState(userId: string): Promise<IntelligenceState> {
  return buildIntelligenceState(await getOrCreateProfile(userId));
}

export async function buildIntelligenceState(profile: ProfileWithSubTables): Promise<IntelligenceState> {
  const stored = await getStoredSignalAnswers(profile.id);
  const derived = derivedSignals(legacySourceFromProfile(profile), profile.respondentType);
  const answers = mergeSignalAnswers(derived, stored);
  const { draftValues } = computeCompletion(profile);

  return {
    profileId: profile.id,
    respondentType: profile.respondentType,
    answers,
    values: draftValues,
    progress: computeIntelligenceProgress(answers, draftValues),
  };
}

/* ------------------------------------------------------------------ */
/* Writing                                                             */
/* ------------------------------------------------------------------ */

export type SaveSignalResult =
  | { ok: true; state: IntelligenceState }
  | { ok: false; error: "UNKNOWN_KEY" | "INVALID_ANSWER" | "TOO_MANY" };

function validate(q: IntelligenceQuestionDef, value: SignalAnswerValue): SaveSignalResult | null {
  const options = new Set(q.options);
  if (q.multi) {
    const list = asList(value);
    if (list.length === 0) return { ok: false, error: "INVALID_ANSWER" };
    if (q.maxSelections && list.length > q.maxSelections) return { ok: false, error: "TOO_MANY" };
    if (list.some((v) => !options.has(v))) return { ok: false, error: "INVALID_ANSWER" };
    return null;
  }
  if (Array.isArray(value)) return { ok: false, error: "INVALID_ANSWER" };
  // Same rule as `stages.isAnswered`: a choice outside its own option list is
  // not an answer, however confident whoever produced it was.
  if (!options.has(value)) return { ok: false, error: "INVALID_ANSWER" };
  return null;
}

/**
 * `Profile.marriageTimeline` is the column Serious Circle gates on, and this
 * layer asks the same question in richer words. Answering it here therefore
 * sets that column — the two must never disagree about what the user declared.
 *
 * The last two options ("1–2 years", "Abhi sure nahi") have no enum value, and
 * that is the point: the app will not guess a timeline it was not given, so
 * choosing one of them *clears* an older declaration rather than leaving a
 * stale one propping up Circle eligibility.
 */
const TIMELINE_ENUM: Record<string, MarriageTimeline> = {
  "0–3 months": "WITHIN_3_MONTHS",
  "3–6 months": "WITHIN_6_MONTHS",
  "6–12 months": "WITHIN_1_YEAR",
};

export async function saveSignalAnswer(
  userId: string,
  key: string,
  value: SignalAnswerValue,
): Promise<SaveSignalResult> {
  const question = INTELLIGENCE_QUESTION_BY_KEY[key];
  if (!question) return { ok: false, error: "UNKNOWN_KEY" };

  const invalid = validate(question, value);
  if (invalid) return invalid;

  const profile = await getOrCreateProfile(userId);
  const respondentType = profile.respondentType;

  // Server-assigned, never taken from the request: a client cannot talk a
  // private answer onto a public profile, and cannot claim its parent-entered
  // guess is a confirmed statement from the candidate.
  const confirmed = !(question.selfRequired && respondentType !== "SELF");

  await prisma.profileSignalAnswer.upsert({
    where: { profileId_key: { profileId: profile.id, key } },
    create: {
      profileId: profile.id,
      key,
      answerJson: value,
      source: "USER_ENTERED",
      respondentType,
      confirmed,
      visibility: question.visibility,
    },
    update: {
      answerJson: value,
      source: "USER_ENTERED",
      respondentType,
      confirmed,
      visibility: question.visibility,
    },
  });

  if (key === "marriageTimeline" && !Array.isArray(value)) {
    const enumValue = TIMELINE_ENUM[value] ?? null;
    if (enumValue !== profile.marriageTimeline) {
      await prisma.profile.update({ where: { id: profile.id }, data: { marriageTimeline: enumValue } });
    }
  }

  // Fill the older field this answer also covers, but only if it is still
  // blank — see `writeBack` in the catalog.
  if (question.writeBack && !Array.isArray(value)) {
    const { draftValues } = computeCompletion(profile);
    const existing = draftValues[question.writeBack.field];
    const mapped = question.writeBack.map[value];
    if (mapped && !(existing && existing.trim())) {
      await saveDraft(userId, { [question.writeBack.field]: mapped });
    }
  }

  return { ok: true, state: await buildIntelligenceState(await getOrCreateProfile(userId)) };
}

/* ------------------------------------------------------------------ */
/* One layer, ready to render                                          */
/* ------------------------------------------------------------------ */

export interface LayerQuestionView {
  key: string;
  label: string;
  /** Already resolved for self vs parent — the client never re-decides this. */
  question: string;
  options: { value: string; label: string }[];
  whyNeeded: string;
  required: boolean;
  multi: boolean;
  maxSelections: number | null;
  /** Not PROFILE_VISIBLE — the card shows the "kisi ko nahi dikhega" line. */
  isPrivate: boolean;
  /** Current answer(s); empty when unanswered. */
  answer: string[];
  /** True when this came from an older profile field rather than being answered here. */
  derived: boolean;
  /** A parent answered something only the candidate can really confirm. */
  needsSelfConfirm: boolean;
}

export interface LayerView {
  key: IntelligenceLayerKey;
  slug: string;
  title: string;
  unlocks: string;
  estimatedMinutes: number;
  complete: boolean;
  questions: LayerQuestionView[];
  /** "Ye hume pehle se pata hai" — answered elsewhere, never re-asked. */
  alreadyKnown: { label: string; value: string }[];
  nextLayer: { slug: string; title: string } | null;
}

export function buildLayerView(state: IntelligenceState, layerKey: IntelligenceLayerKey): LayerView {
  const layer = LAYER_BY_KEY[layerKey];
  const lookup = makeLookup(state.answers, state.values);
  const forSelf = state.respondentType === "SELF";
  const progress = state.progress.layers.find((l) => l.key === layerKey)!;

  const questions: LayerQuestionView[] = applicableQuestions(layerKey, lookup).map((q) => {
    const answer = state.answers.get(q.key);
    return {
      key: q.key,
      label: q.label,
      question: intelligenceQuestionFor(q, forSelf),
      options: q.options.map((value) => ({ value, label: DEAL_BREAKER_LABEL[value] ?? value })),
      whyNeeded: q.whyNeeded,
      required: q.required,
      multi: Boolean(q.multi),
      maxSelections: q.maxSelections ?? null,
      isPrivate: q.visibility !== "PROFILE_VISIBLE",
      answer: answer ? asList(answer.value) : [],
      derived: answer?.derived ?? false,
      needsSelfConfirm: Boolean(answer && !answer.confirmed),
    };
  });

  const next = state.progress.layers.find((l) => l.key !== layerKey && !l.complete) ?? null;

  return {
    key: layerKey,
    slug: LAYER_SLUG[layerKey],
    title: layer.title,
    unlocks: layer.unlocks,
    estimatedMinutes: layer.estimatedMinutes,
    complete: progress.complete,
    questions,
    alreadyKnown: (layer.alreadyKnown ?? []).flatMap((k) => {
      const value = state.values[k.field];
      return value && value.trim() ? [{ label: k.label, value }] : [];
    }),
    nextLayer: next ? { slug: next.slug, title: next.title } : null,
  };
}

