import { MINDSET_QUESTIONS, type MindsetKey } from "@/lib/profile/mindset";
import { AGREEMENT_KEYS } from "@/lib/profile/intelligenceQuestions";
import {
  effectiveSignals,
  evidenceWeightFor,
  firstValue,
  type SignalAnswerMap,
} from "@/lib/profile/signalAnswers";
import type { ProfileWithSubTables } from "@/lib/services/profile/completionService";
import type { DeepDimensionKey } from "@prisma/client";

/**
 * "Soch fit" — how similarly two people actually think.
 *
 * ## What changed, and why it did not touch D-33
 *
 * D-33 locks five L2 weights, one of which is `deepProfileDistance = 0.25`.
 * This module does **not** add a sixth weight — it makes that same 0.25 slot
 * smarter by feeding it four sources instead of one:
 *
 *   1. **Marriage Intelligence answers** (`ProfileSignalAnswer`) — first-person,
 *      asked directly about the things two people actually have to agree on
 *   2. **Poll answers** (`PollVote`) — first-person, accumulates one a day
 *   3. **Mindset trio** (`ProfileLifestyle.weekendVibe` / `bigDecisionStyle` /
 *      `socialEnergy`) — first-person, collected once right after Stage 1
 *   4. **Deep Profile dimensions** — AI-inferred from profile text
 *
 * That is the honest reading of what the slot was always for. "Distance
 * between two people's thinking" was only ever *approximated* by the AI
 * dimension scores because nothing better existed; the poll and mindset
 * answers are the same question asked directly, so they belong in the same
 * 0.25 rather than in a new weight that would need D-33 reopened.
 *
 * ## Evidence weighting: first-person beats inference
 *
 * Each source contributes proportionally to how much evidence it actually has,
 * and the AI source is capped low on purpose (`DIMENSION_EVIDENCE`). A user who
 * has answered ten polls has told us what they think ten times; a dimension
 * score is a model's read of their bio. When both exist the direct answers
 * dominate — D-32's "AI proposes, code decides", applied to ranking.
 *
 * Concretely, the ceilings are: signals 12, polls 10, mindset 6, dimensions 4.
 * With all four present the split lands near 37 / 31 / 19 / 12; with nothing
 * but mindset and dimensions (a brand-new user) it is 60 / 40, exactly as
 * before. A user who has answered no intelligence questions is scored by the
 * three original sources and nothing about their ranking changes.
 *
 * ## Why agreement is binary per question
 *
 * Poll, mindset and layer options are discrete, unordered choices — "Ghar par
 * relax" is not numerically nearer to "Ghoomna" than to "Kuch naya seekhna".
 * Treating a mismatch as partial credit would invent a distance that the
 * option list does not have. Same answer = 100, different = 0, averaged over
 * everything both people answered — which also makes the result something a
 * human can verify: "7 me se 5 sawaalon par ek jaisa jawab".
 */

/** userId → pollId → the option they picked. */
export type PollVoteMap = Map<string, Map<string, number>>;

/** profileId → its computed (non-null) dimension scores. */
export type DimensionScoreMap = Map<string, Partial<Record<DeepDimensionKey, number>>>;

/** profileId -> its stored Marriage Intelligence answers. */
export type SignalAnswerByProfile = Map<string, SignalAnswerMap>;

export interface MatchSignals {
  dimensionScores?: DimensionScoreMap;
  pollVotes?: PollVoteMap;
  signalAnswers?: SignalAnswerByProfile;
}

/**
 * Minimum shared answers before a source is trusted at all.
 *
 * Below these, agreement is noise: two people who both answered one poll
 * identically are not demonstrably like-minded, they got lucky on a coin flip.
 */
const MIN_COMMON_POLLS = 3;
const MIN_COMMON_MINDSET = 2;
const MIN_COMMON_DIMENSIONS = 3;
const MIN_COMMON_SIGNALS = 3;

const POLL_EVIDENCE_CAP = 10;
const MINDSET_EVIDENCE_PER_ANSWER = 2;
const SIGNAL_EVIDENCE_PER_ANSWER = 2;
/**
 * The largest ceiling of the four, on purpose.
 *
 * A Marriage Intelligence answer is the most specific first-person evidence
 * this app can hold: not "what did a model read into your bio", not "how did
 * you vote on today's poll", but "shaadi ke baad joint family ya nuclear" —
 * asked directly, answered by tap, about the exact thing two people have to
 * agree on. With all four sources present the split lands near 37 / 31 / 19 /
 * 12 (signals / polls / mindset / dimensions), which is the ordering the whole
 * design argues for: direct answers beat inference, every time.
 */
const SIGNAL_EVIDENCE_CAP = 12;
/** Deliberately the smallest ceiling of the four — see the module note. */
const DIMENSION_EVIDENCE = 4;

const MINDSET_KEYS: MindsetKey[] = MINDSET_QUESTIONS.map((q) => q.key);

export interface SochFit {
  /** 0..100. What the 0.25 weight is multiplied by. */
  score: number;
  pollCommon: number;
  pollAgreed: number;
  mindsetCommon: number;
  mindsetAgreed: number;
  /** Marriage Intelligence questions both people answered, and how many matched. */
  signalCommon: number;
  signalAgreed: number;
  /** Null when the pair had fewer than 3 dimensions in common. */
  dimensionScore: number | null;
}

/**
 * M17 §3.2's original dimension measure, unchanged: average `100 - abs(diff)`
 * over dimensions both sides have a real score for. Kept as its own exported
 * function because it is still one of the three inputs, and because its
 * "fewer than 3 in common → null, not zero" rule is the pattern the other two
 * sources follow.
 */
export function computeDimensionFit(
  viewer: Partial<Record<DeepDimensionKey, number>> | undefined,
  candidate: Partial<Record<DeepDimensionKey, number>> | undefined,
): number | null {
  if (!viewer || !candidate) return null;
  const common = (Object.keys(viewer) as DeepDimensionKey[]).filter((k) => candidate[k] !== undefined);
  if (common.length < MIN_COMMON_DIMENSIONS) return null;
  const similarities = common.map((k) => 100 - Math.abs(viewer[k]! - candidate[k]!));
  return Math.round(similarities.reduce((a, b) => a + b, 0) / similarities.length);
}

function pollAgreement(
  viewerVotes: Map<string, number> | undefined,
  candidateVotes: Map<string, number> | undefined,
): { common: number; agreed: number } {
  if (!viewerVotes || !candidateVotes) return { common: 0, agreed: 0 };
  let common = 0;
  let agreed = 0;
  for (const [pollId, option] of viewerVotes) {
    const theirs = candidateVotes.get(pollId);
    if (theirs === undefined) continue;
    common++;
    if (theirs === option) agreed++;
  }
  return { common, agreed };
}

function mindsetAgreement(
  viewer: ProfileWithSubTables,
  candidate: ProfileWithSubTables,
): { common: number; agreed: number } {
  const a = viewer.lifestyle;
  const b = candidate.lifestyle;
  if (!a || !b) return { common: 0, agreed: 0 };

  let common = 0;
  let agreed = 0;
  for (const key of MINDSET_KEYS) {
    const mine = a[key];
    const theirs = b[key];
    if (!mine || !theirs) continue;
    common++;
    if (mine === theirs) agreed++;
  }
  return { common, agreed };
}

/**
 * Agreement over the Marriage Intelligence layers.
 *
 * Only `compatibilityMode: "EXACT"` questions take part. The `PREFERENCE` ones
 * ("children ko lekar aap kya chahte hain", "importance:caste") are scored in
 * the preference bucket instead — wanting the same thing in a partner is not
 * the same as *being* alike, and counting one answer in both buckets would let
 * a single tap move the final score twice.
 *
 * Each pair of answers is weighted by the weaker of the two, so a candidate
 * whose parent answered on their behalf contributes half until they confirm it
 * (`evidenceWeightFor`). The `common`/`agreed` counts stay whole numbers
 * because they are what `describeSochFit` shows the user, and "3.5 me se 2.5
 * sawaal" is not a sentence anyone can verify by counting.
 */
function signalAgreement(
  viewer: SignalAnswerMap,
  candidate: SignalAnswerMap,
): { common: number; agreed: number; weight: number; agreedWeight: number } {
  let common = 0;
  let agreed = 0;
  let weight = 0;
  let agreedWeight = 0;

  for (const key of AGREEMENT_KEYS) {
    const mine = viewer.get(key);
    const theirs = candidate.get(key);
    if (!mine || !theirs) continue;
    const w = Math.min(evidenceWeightFor(mine), evidenceWeightFor(theirs));
    common++;
    weight += w;
    if (firstValue(mine.value) === firstValue(theirs.value)) {
      agreed++;
      agreedWeight += w;
    }
  }

  return { common, agreed, weight, agreedWeight };
}

/**
 * Blends whichever sources this specific pair has. Returns null when none of
 * them clear their evidence floor — the caller's weights then renormalize
 * across the remaining signals, exactly as they already did when only the
 * dimension source existed. A pair with no shared thinking data is a pair with
 * no signal, never a pair that scored zero.
 */
export function computeSochFit(
  viewer: ProfileWithSubTables,
  candidate: ProfileWithSubTables,
  signals: MatchSignals,
): SochFit | null {
  const polls = pollAgreement(signals.pollVotes?.get(viewer.userId), signals.pollVotes?.get(candidate.userId));
  const mindset = mindsetAgreement(viewer, candidate);
  // Derived answers are folded in here, so an existing user whose old
  // `familyValues`/`relocateWilling` already answer a layer question is scored
  // on them without having had to re-answer anything.
  const signalFit = signalAgreement(
    effectiveSignals(viewer, signals.signalAnswers?.get(viewer.id)),
    effectiveSignals(candidate, signals.signalAnswers?.get(candidate.id)),
  );
  const dimensionScore = computeDimensionFit(
    signals.dimensionScores?.get(viewer.id),
    signals.dimensionScores?.get(candidate.id),
  );

  const parts: { score: number; evidence: number }[] = [];

  if (signalFit.common >= MIN_COMMON_SIGNALS && signalFit.weight > 0) {
    parts.push({
      score: (signalFit.agreedWeight / signalFit.weight) * 100,
      evidence: Math.min(signalFit.weight * SIGNAL_EVIDENCE_PER_ANSWER, SIGNAL_EVIDENCE_CAP),
    });
  }
  if (polls.common >= MIN_COMMON_POLLS) {
    parts.push({
      score: (polls.agreed / polls.common) * 100,
      evidence: Math.min(polls.common, POLL_EVIDENCE_CAP),
    });
  }
  if (mindset.common >= MIN_COMMON_MINDSET) {
    parts.push({
      score: (mindset.agreed / mindset.common) * 100,
      evidence: mindset.common * MINDSET_EVIDENCE_PER_ANSWER,
    });
  }
  if (dimensionScore !== null) {
    parts.push({ score: dimensionScore, evidence: DIMENSION_EVIDENCE });
  }

  if (parts.length === 0) return null;

  const totalEvidence = parts.reduce((sum, p) => sum + p.evidence, 0);
  const weighted = parts.reduce((sum, p) => sum + p.score * p.evidence, 0);

  return {
    score: Math.round(weighted / totalEvidence),
    pollCommon: polls.common,
    pollAgreed: polls.agreed,
    mindsetCommon: mindset.common,
    mindsetAgreed: mindset.agreed,
    signalCommon: signalFit.common,
    signalAgreed: signalFit.agreed,
    dimensionScore,
  };
}

/**
 * One verifiable sentence about why a pair scored what it did — built from
 * counts the user could recount themselves, never from an AI claim (D-32).
 * Returns null when the only contributing source was the inferred dimensions,
 * because "our model thinks you're similar" is not evidence a user can check.
 */
export function describeSochFit(fit: SochFit): string | null {
  const bits: string[] = [];
  if (fit.signalCommon >= MIN_COMMON_SIGNALS) {
    bits.push(`${fit.signalCommon} me se ${fit.signalAgreed} zindagi wale sawaal same`);
  }
  if (fit.pollCommon >= MIN_COMMON_POLLS) {
    bits.push(`${fit.pollCommon} me se ${fit.pollAgreed} sawaalon par ek jaisa jawab`);
  }
  if (fit.mindsetCommon >= MIN_COMMON_MINDSET) {
    bits.push(`${fit.mindsetCommon} me se ${fit.mindsetAgreed} soch wale sawaal same`);
  }
  return bits.length > 0 ? bits.join(", ") : null;
}
