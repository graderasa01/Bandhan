import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getQuizQuestion, pickBattleQuestionKeys, QUESTIONS_PER_BATTLE } from "@/lib/quiz/battleQuestions";

/**
 * Quiz Battle (Phase E) — match-gated, deterministic, zero AI cost, same P6
 * discipline as the public Mindset Arena polls.
 *
 * ## Why answers stay hidden until COMPLETED
 *
 * Both players answering the same 5 questions only works as a game if
 * neither can see the other's picks mid-round and quietly match them. So a
 * battle has exactly one reveal moment — the instant the second player's
 * final answer lands — rather than a running feed either side could peek at.
 */

export type ProposeResult =
  | { ok: true; battleId: string }
  | { ok: false; code: "NOT_FOUND" | "ALREADY_ACTIVE"; message: string };

async function assertParticipant(matchId: string, userId: string) {
  const match = await prisma.match.findUnique({ where: { id: matchId }, select: { userAId: true, userBId: true } });
  if (!match || (match.userAId !== userId && match.userBId !== userId)) return null;
  return match;
}

export async function proposeBattle(matchId: string, initiatorId: string): Promise<ProposeResult> {
  const match = await assertParticipant(matchId, initiatorId);
  if (!match) return { ok: false, code: "NOT_FOUND", message: "Match nahi mila." };

  const existing = await prisma.quizBattle.findFirst({
    where: { matchId, status: { in: ["PENDING", "ACTIVE"] } },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, code: "ALREADY_ACTIVE", message: "Ek battle pehle se chal rahi hai." };
  }

  const battle = await prisma.quizBattle.create({
    data: { matchId, initiatorId, questionKeys: pickBattleQuestionKeys() },
  });
  return { ok: true, battleId: battle.id };
}

export type ActionResult = { ok: true } | { ok: false; code: "NOT_FOUND" | "FORBIDDEN"; message: string };

export async function respondToBattle(
  battleId: string,
  userId: string,
  accept: boolean,
): Promise<ActionResult> {
  const battle = await prisma.quizBattle.findUnique({
    where: { id: battleId },
    select: { id: true, initiatorId: true, status: true, match: { select: { userAId: true, userBId: true } } },
  });
  if (!battle) return { ok: false, code: "NOT_FOUND", message: "Battle nahi mili." };
  const isParticipant = battle.match.userAId === userId || battle.match.userBId === userId;
  if (!isParticipant) return { ok: false, code: "NOT_FOUND", message: "Battle nahi mili." };
  // Only the person who didn't propose it responds — the initiator is
  // implicitly "in" from the moment they created it.
  if (battle.initiatorId === userId) return { ok: false, code: "FORBIDDEN", message: "Aap khud invite kar chuke hain." };
  if (battle.status !== "PENDING") return { ok: false, code: "FORBIDDEN", message: "Ye invite ab valid nahi hai." };

  await prisma.quizBattle.update({
    where: { id: battleId },
    data: { status: accept ? "ACTIVE" : "DECLINED" },
  });
  return { ok: true };
}

export type AnswerResult =
  | { ok: true; completed: boolean }
  | { ok: false; code: "NOT_FOUND" | "FORBIDDEN" | "BAD_INPUT"; message: string };

export async function submitAnswer(params: {
  battleId: string;
  userId: string;
  questionKey: string;
  optionIndex: number;
}): Promise<AnswerResult> {
  const { battleId, userId, questionKey, optionIndex } = params;

  const battle = await prisma.quizBattle.findUnique({
    where: { id: battleId },
    select: {
      id: true,
      status: true,
      questionKeys: true,
      match: { select: { userAId: true, userBId: true } },
    },
  });
  if (!battle) return { ok: false, code: "NOT_FOUND", message: "Battle nahi mili." };
  const isParticipant = battle.match.userAId === userId || battle.match.userBId === userId;
  if (!isParticipant) return { ok: false, code: "NOT_FOUND", message: "Battle nahi mili." };
  if (battle.status !== "ACTIVE") return { ok: false, code: "FORBIDDEN", message: "Ye battle abhi active nahi hai." };

  const question = getQuizQuestion(questionKey);
  if (!question || !battle.questionKeys.includes(questionKey) || optionIndex < 0 || optionIndex >= question.options.length) {
    return { ok: false, code: "BAD_INPUT", message: "Invalid sawaal ya jawab." };
  }

  await prisma.quizBattleAnswer.upsert({
    where: { battleId_userId_questionKey: { battleId, userId, questionKey } },
    create: { battleId, userId, questionKey, optionIndex },
    // A player's answer is locked once given — same "no changing your mind
    // after seeing the running results" discipline PollVote's upsert-to-no-op
    // already uses on the public polls.
    update: {},
  });

  const otherUserId = battle.match.userAId === userId ? battle.match.userBId : battle.match.userAId;
  const allAnswers = await prisma.quizBattleAnswer.findMany({
    where: { battleId, userId: { in: [userId, otherUserId] } },
    select: { userId: true, questionKey: true },
  });
  const mine = new Set(allAnswers.filter((a) => a.userId === userId).map((a) => a.questionKey));
  const theirs = new Set(allAnswers.filter((a) => a.userId === otherUserId).map((a) => a.questionKey));
  const bothDone = battle.questionKeys.every((k) => mine.has(k) && theirs.has(k));

  if (bothDone) {
    // Claim-and-check: only the request that actually flips ACTIVE→COMPLETED
    // treats itself as the completing one — irrelevant here since there's no
    // reward to double-pay, but keeps this idempotent under a retry either way.
    await prisma.quizBattle.updateMany({
      where: { id: battleId, status: "ACTIVE" },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
  }

  return { ok: true, completed: bothDone };
}

export interface QuizQuestionView {
  key: string;
  question: string;
  options: string[];
  myAnswer: number | null;
  /** Only populated once the battle is COMPLETED — see this file's header. */
  theirAnswer: number | null;
}

export interface QuizBattleView {
  id: string;
  status: "PENDING" | "ACTIVE" | "COMPLETED" | "DECLINED";
  isInitiator: boolean;
  otherName: string;
  questions: QuizQuestionView[];
  /** How many the *other* player has answered — count only, never content, until COMPLETED. */
  theirAnsweredCount: number;
  myAnsweredCount: number;
  matchCount: number | null;
}

/** The match's most recent battle, in the viewer's own terms. Null if none was ever proposed. */
export async function getBattleView(matchId: string, viewerId: string): Promise<QuizBattleView | null> {
  const match = await assertParticipant(matchId, viewerId);
  if (!match) return null;
  const otherUserId = match.userAId === viewerId ? match.userBId : match.userAId;

  const battle = await prisma.quizBattle.findFirst({
    where: { matchId },
    orderBy: { createdAt: "desc" },
    include: { answers: true },
  });
  if (!battle) return null;

  const [otherUser] = await Promise.all([
    prisma.user.findUnique({ where: { id: otherUserId }, select: { profile: { select: { displayName: true } } } }),
  ]);

  const revealed = battle.status === "COMPLETED";
  const myAnswers = new Map(battle.answers.filter((a) => a.userId === viewerId).map((a) => [a.questionKey, a.optionIndex]));
  const theirAnswers = new Map(battle.answers.filter((a) => a.userId === otherUserId).map((a) => [a.questionKey, a.optionIndex]));

  const questions: QuizQuestionView[] = battle.questionKeys.map((key) => {
    const def = getQuizQuestion(key);
    return {
      key,
      question: def?.question ?? key,
      options: def?.options ?? [],
      myAnswer: myAnswers.get(key) ?? null,
      theirAnswer: revealed ? (theirAnswers.get(key) ?? null) : null,
    };
  });

  const matchCount = revealed
    ? questions.filter((q) => q.myAnswer !== null && q.myAnswer === q.theirAnswer).length
    : null;

  return {
    id: battle.id,
    status: battle.status,
    isInitiator: battle.initiatorId === viewerId,
    otherName: otherUser?.profile?.displayName ?? "Unka",
    questions,
    myAnsweredCount: myAnswers.size,
    theirAnsweredCount: theirAnswers.size,
    matchCount,
  };
}

export { QUESTIONS_PER_BATTLE };
