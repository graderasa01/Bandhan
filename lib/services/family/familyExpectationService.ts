import { prisma } from "@/lib/db/prisma";
import {
  FAMILY_EXPECTATION_KEYS,
  familyExpectationQuestions,
  isFamilyExpectationKey,
  familyPhrasingFor,
  type FamilyExpectationKey,
  buildExpectationGaps,
  type ExpectationGapReport,
  type FamilyAnswerInput,
} from "@/lib/profile/expectationGaps";
import { INTELLIGENCE_QUESTION_BY_KEY } from "@/lib/profile/intelligenceQuestions";
import { asList, effectiveSignals, toAnswerValue, type SignalAnswerValue } from "@/lib/profile/signalAnswers";
import { getStoredSignalAnswers } from "@/lib/services/profile/intelligenceService";
import { PROFILE_FULL_INCLUDE } from "@/lib/services/profile/profileInclude";
import { FAMILY_RELATION_LABELS } from "./familyConstants";
import type { FamilyMember } from "@prisma/client";

/**
 * The database half of family expectation intelligence.
 *
 * `lib/profile/expectationGaps.ts` says what a gap *is* and stays pure.
 * This file is what one specific family has actually said, and what the owner
 * is allowed to see of it.
 *
 * No `server-only` marker, matching `intelligenceService.ts` next door and for
 * the identical reason stated there: the marker would lock this module out of
 * `scripts/`, and a verification that exercises a reimplementation of the write
 * path is not a verification. It is server-side by virtue of importing prisma.
 *
 * ## The two directions, and why they are not symmetric
 *
 * **Owner → family answers: allowed.** Seeing "Papa ne joint family chuna" is
 * the entire feature. The owner invited these people and can revoke them.
 *
 * **Family → owner's answers: never.** There is deliberately no function here
 * that hands a family session the candidate's own Marriage Intelligence
 * answers. Half of them are MATCH_PRIVATE — money, children timeline, conflict
 * style — and a parent reading their adult child's private answers is a worse
 * violation than a stranger doing it, because the child cannot easily refuse.
 * `getFamilyOwnAnswers` returns what *that member* wrote and nothing else.
 */

/* ------------------------------------------------------------------ */
/* Writing — family side                                               */
/* ------------------------------------------------------------------ */

export type SaveExpectationResult =
  | { ok: true }
  | { ok: false; error: "UNKNOWN_KEY" | "INVALID_ANSWER" | "FORBIDDEN"; message: string; status: number };

/**
 * Records one family member's expectation.
 *
 * Validation is the same shape `saveSignalAnswer` uses and for the same reason:
 * a value outside the question's own option list is not an answer, however
 * confident whoever produced it was. That matters more here than there, because
 * these rows are later compared against the candidate's answers by exact string
 * match — one free-text value and the comparison silently reports a difference
 * that does not exist.
 *
 * GUARDIAN is refused. The permission table already says a guardian is "sirf
 * dekho": no shortlist, no notes, no profile drill-in. An expectation is a
 * stronger statement than a note — it ends up in a sentence Grio says to the
 * user about their own family — so it follows the stricter of the existing
 * rules rather than inventing a looser one.
 */
export async function saveFamilyExpectation(
  member: FamilyMember,
  key: string,
  rawValue: unknown,
): Promise<SaveExpectationResult> {
  if (member.relation === "GUARDIAN") {
    return {
      ok: false,
      error: "FORBIDDEN",
      message: "Ye aapki role ke liye available nahi hai.",
      status: 403,
    };
  }

  if (!isFamilyExpectationKey(key)) {
    return { ok: false, error: "UNKNOWN_KEY", message: "Ye sawaal maujood nahi hai.", status: 422 };
  }

  const question = INTELLIGENCE_QUESTION_BY_KEY[key];
  const value = toAnswerValue(rawValue);
  if (!question || value === null) {
    return { ok: false, error: "INVALID_ANSWER", message: "Jawab chahiye.", status: 422 };
  }

  const options = new Set(question.options);
  const list = asList(value);
  if (list.length === 0 || list.some((v) => !options.has(v))) {
    return {
      ok: false,
      error: "INVALID_ANSWER",
      message: "Ye jawab is sawaal ke options me nahi hai.",
      status: 422,
    };
  }

  await prisma.familyExpectationAnswer.upsert({
    where: { familyMemberId_questionKey: { familyMemberId: member.id, questionKey: key } },
    // `ownerUserId` comes off the authenticated member row, never a request
    // body — a family session cannot write an expectation onto somebody else's
    // profile even if it guessed their id.
    create: {
      ownerUserId: member.ownerUserId,
      familyMemberId: member.id,
      questionKey: key,
      answerJson: value,
    },
    update: { answerJson: value },
  });

  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Reading — family side (their own answers only)                      */
/* ------------------------------------------------------------------ */

export interface FamilyQuestionView {
  key: string;
  /** Already resolved to the parent-facing phrasing — the client never re-decides. */
  question: string;
  label: string;
  options: string[];
  whyNeeded: string;
  /** This member's own current answer, or empty. */
  answer: string[];
}

/**
 * The questionnaire as one family member sees it.
 *
 * The wording comes from `familyPhrasingFor`, not from either catalog phrasing.
 * `questionForChild` looks like the obvious fit and is the one thing that must
 * not be used: it asks a parent what their *child* thinks, which would both
 * manufacture speaking-for-the-candidate data and make the comparison
 * meaningless — measuring how well a parent predicts their child rather than
 * what the parent themselves wants.
 *
 * `answer` is scoped to this member. Two parents answering the same question
 * never see each other's answers here, and nothing in this payload carries the
 * owner's own answers at all — only the owner sees the whole picture.
 */
export async function getFamilyQuestionnaire(member: FamilyMember): Promise<FamilyQuestionView[]> {
  const rows = await prisma.familyExpectationAnswer.findMany({
    where: { familyMemberId: member.id },
    select: { questionKey: true, answerJson: true },
  });
  const mine = new Map(rows.map((r) => [r.questionKey, toAnswerValue(r.answerJson)]));

  return familyExpectationQuestions().map((q) => ({
    key: q.key,
    // Never `questionForChild` — that asks the family to report the candidate's
    // view. See `familyPhrasingFor`.
    question: familyPhrasingFor(q.key as FamilyExpectationKey),
    label: q.label,
    options: [...q.options],
    whyNeeded: q.whyNeeded,
    answer: asList(mine.get(q.key) ?? undefined),
  }));
}

/* ------------------------------------------------------------------ */
/* Reading — owner side (the gap report)                               */
/* ------------------------------------------------------------------ */

/**
 * What the owner's family has said, shaped for the pure comparator.
 *
 * Revoked members are excluded. A seat the owner has taken back should stop
 * speaking, and leaving a revoked parent's expectation in the report would mean
 * "remove from Family Circle" quietly failed to remove them from the one place
 * their opinion is voiced back.
 */
async function loadFamilyAnswers(ownerUserId: string): Promise<FamilyAnswerInput[]> {
  const rows = await prisma.familyExpectationAnswer.findMany({
    where: {
      ownerUserId,
      familyMember: { revokedAt: null, status: { not: "REVOKED" } },
    },
    include: { familyMember: { select: { id: true, displayName: true, relation: true } } },
  });

  return rows.flatMap((r) => {
    const value = toAnswerValue(r.answerJson);
    if (value === null) return [];
    return [
      {
        familyMemberId: r.familyMember.id,
        familyMemberName: r.familyMember.displayName,
        relationLabel: FAMILY_RELATION_LABELS[r.familyMember.relation],
        questionKey: r.questionKey,
        value,
      } satisfies FamilyAnswerInput,
    ];
  });
}

/**
 * Null when there is no profile — callers skip the block rather than rendering
 * an empty comparison.
 *
 * The user's side uses `effectiveSignals`, the same view the matching pipeline
 * and the profile page consume, so a legacy answer the app derived from an old
 * form field counts as answered. Telling somebody "aapne is par kuch nahi kaha"
 * about a question they filled in during onboarding is the precise "app is not
 * listening" failure the whole intelligence layer exists to end.
 */
export async function getExpectationGapReport(ownerUserId: string): Promise<ExpectationGapReport | null> {
  const profile = await prisma.profile.findUnique({
    where: { userId: ownerUserId },
    include: PROFILE_FULL_INCLUDE,
  });
  if (!profile) return null;

  const [stored, familyAnswers] = await Promise.all([
    getStoredSignalAnswers(profile.id),
    loadFamilyAnswers(ownerUserId),
  ]);

  return buildExpectationGaps(effectiveSignals(profile, stored), familyAnswers);
}

/** How many of the family questions this member has answered — the portal's progress line. */
export async function countFamilyAnswers(familyMemberId: string): Promise<{ answered: number; total: number }> {
  const answered = await prisma.familyExpectationAnswer.count({
    where: { familyMemberId, questionKey: { in: [...FAMILY_EXPECTATION_KEYS] } },
  });
  return { answered, total: FAMILY_EXPECTATION_KEYS.length };
}

export type { SignalAnswerValue };
