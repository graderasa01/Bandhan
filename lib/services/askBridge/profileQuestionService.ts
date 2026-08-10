import "server-only";
import { prisma } from "@/lib/db/prisma";
import { callAi } from "@/lib/ai/providers";
import { moderateOutgoingText } from "@/lib/services/moderation/contentModeration";
import { isBlockedEitherWay } from "@/lib/services/safety/blockService";
import { isFeatureAvailable } from "@/lib/services/plans/entitlements";
import { createNotice } from "@/lib/services/notice/noticeService";
import { buildMaskedTeaser, notifyRecipient } from "@/lib/services/voice/voiceNoteService";
import { recordQuestEvent } from "@/lib/services/quests/questService";
import { celebrateFirst, type Celebration } from "@/lib/services/rewards/celebrationService";
import { noopT, type Translate } from "@/lib/i18n/translate";
import { QUESTION_MAX_LENGTH, type InboundQuestionView } from "@/lib/contracts/askBridge";
import type { ProfileQuestionStatus } from "@prisma/client";

export type { InboundQuestionView } from "@/lib/contracts/askBridge";

/**
 * Ask Bridge (P7) — a typed question, aimed at one candidate, answered only
 * in voice.
 *
 * ## Why this doesn't touch `sendInterest`
 *
 * Voice notes (P2) are Interest-costed because they *are* an Interest — a
 * one-way "I want to talk to you" that spends the sender's monthly quota.
 * Asking a question is a lighter, structurally-capped action (one question
 * per candidate, ever — the unique index below is the entire anti-spam rule,
 * same discipline as VoiceNote's unique index), so it does not spend a quota
 * either direction. Answering costs the answerer nothing either: they did not
 * choose this conversation, and charging them to respond would be charging
 * someone for being asked something.
 *
 * ## The curiosity gap is the growth mechanic
 *
 * The asker already knows exactly who they picked. The recipient does not
 * know who's asking until they answer (`askerRevealedAt`) — masked the same
 * way a locked voice note is, using the identical `buildMaskedTeaser` so the
 * two masking promises never drift apart. That gap is what gets a stranger's
 * question answered instead of ignored.
 */

/** A question sits open this long before it's treated as stale. No sweep job
 * flips a status row — same lazy-compute discipline as the rest of this app
 * (§3.7): callers just filter `expiresAt > now` when listing what's answerable. */
export const QUESTION_TTL_DAYS = 7;

export type AskQuestionResult =
  | { ok: true; questionId: string; alreadyAsked: boolean; status: ProfileQuestionStatus; heldForReview: boolean }
  | { ok: false; code: "FEATURE_OFF" | "NOT_FOUND" | "REJECTED" | "BAD_INPUT"; message: string };

const QUESTION_REWRITE_SYSTEM = `Aap BandhanTak (Indian matrimony platform) ke liye ek sawaal ko thoda aur polite/warm banate hain, bina uska matlab badle. User ne ye sawaal ek ajnabi candidate ke liye likha hai jo unhe answer karega.

Rules:
- Sirf jo poocha gaya hai wahi rakhiye — kuch naya mat jodiye ya invent mat kijiye.
- Agar sawaal pehle se hi polite aur clear hai, usse waise hi ya bahut halka sa refine karke rakhiye.
- 1 chhoti line, Hinglish me.
- Sirf JSON dijiye.`;

const QUESTION_REWRITE_SCHEMA = {
  type: "object",
  properties: { politeText: { type: "string" } },
  required: ["politeText"],
  additionalProperties: false,
} as const;

async function rewriteQuestion(questionText: string, userId: string): Promise<string | null> {
  const result = await callAi({
    configFeature: "questionRewrite",
    logFeature: "profile_question_rewrite",
    userId,
    system: QUESTION_REWRITE_SYSTEM,
    content: questionText,
    maxTokens: 200,
    // One sentence in, one politer sentence out — see `AiCallParams.thinking`.
    thinking: "off",
    jsonSchema: QUESTION_REWRITE_SCHEMA as unknown as Record<string, unknown>,
    schemaName: "question_rewrite",
  });
  if (!result.ok) return null;
  try {
    const parsed = JSON.parse(result.text) as { politeText?: unknown };
    return typeof parsed.politeText === "string" && parsed.politeText.trim() ? parsed.politeText.trim() : null;
  } catch {
    return null;
  }
}

async function deliverAskedNotice(questionId: string, t: Translate = noopT): Promise<void> {
  const q = await prisma.profileQuestion.findUnique({
    where: { id: questionId },
    include: {
      fromUser: {
        select: {
          profile: {
            select: {
              currentCity: true,
              dateOfBirth: true,
              gender: true,
              profession: { select: { jobTitle: true } },
            },
          },
        },
      },
    },
  });
  if (!q) return;

  const p = q.fromUser.profile;
  const who = buildMaskedTeaser(
    {
      currentCity: p?.currentCity ?? null,
      dateOfBirth: p?.dateOfBirth ?? null,
      gender: p?.gender ?? null,
      jobTitle: p?.profession?.jobTitle ?? null,
    },
    t,
  );

  await createNotice({
    userId: q.toUserId,
    kind: "QUESTION_ASKED",
    title: t("askBridge.notice.asked.title", "Kisi ne aapse ek sawaal poocha hai"),
    body: `${who}: "${q.politeText ?? q.questionText}"${t(
      "askBridge.notice.asked.bodySuffix",
      " — voice me jawab dijiye, tabhi pata chalega kaun hai.",
    )}`,
    href: "/user/inbox",
    actorMasked: true,
    relatedId: q.id,
  });
}

export async function askProfileQuestion(
  params: {
    fromUserId: string;
    toUserId: string;
    questionText: string;
  },
  t: Translate = noopT,
): Promise<AskQuestionResult> {
  const { fromUserId, toUserId } = params;
  const questionText = params.questionText.trim();

  if (!questionText || questionText.length > QUESTION_MAX_LENGTH) {
    return { ok: false, code: "BAD_INPUT", message: t("askBridge.ask.error.length", "Sawaal 1 se 300 characters ke beech hona chahiye.") };
  }

  const gate = await isFeatureAvailable(fromUserId, "askBridge");
  if (!gate.allowed) {
    return { ok: false, code: "FEATURE_OFF", message: t("askBridge.ask.error.featureOff", "Ask Bridge abhi available nahi hai.") };
  }

  if (fromUserId === toUserId) {
    return { ok: false, code: "NOT_FOUND", message: t("askBridge.ask.error.self", "Khud se sawaal nahi poochh sakte.") };
  }

  if (await isBlockedEitherWay(fromUserId, toUserId)) {
    // Same wording a missing profile would get — confirming a block exists
    // tells the asker something the blocker chose not to say.
    return { ok: false, code: "NOT_FOUND", message: t("askBridge.ask.error.notFound", "Ye profile abhi available nahi hai.") };
  }

  const existing = await prisma.profileQuestion.findUnique({
    where: { fromUserId_toUserId: { fromUserId, toUserId } },
    select: { id: true, status: true },
  });
  if (existing) {
    // Not an error — asking twice is a no-op that reports the current state,
    // the same spirit as PollVote's upsert-to-no-op on a repeat tap.
    return { ok: true, questionId: existing.id, alreadyAsked: true, status: existing.status, heldForReview: false };
  }

  const moderation = await moderateOutgoingText({
    text: questionText,
    userId: fromUserId,
    logFeature: "profile_question",
  });

  if (moderation.decision === "REJECTED") {
    return { ok: false, code: "REJECTED", message: moderation.reason ?? t("askBridge.ask.error.rejected", "Ye sawaal bheja nahi ja sakta.") };
  }

  const politeText = moderation.decision === "APPROVED" ? await rewriteQuestion(questionText, fromUserId) : null;

  const question = await prisma.profileQuestion.create({
    data: {
      fromUserId,
      toUserId,
      questionText,
      politeText,
      moderation: moderation.decision, // "APPROVED" | "PENDING" — REJECTED already returned above
      moderationReason: moderation.decision === "PENDING" ? moderation.reason : null,
      expiresAt: new Date(Date.now() + QUESTION_TTL_DAYS * 24 * 3600_000),
    },
  });

  // deliverAskedNotice is not passed `t` here: that notice belongs to
  // `toUserId`, not the asker whose locale `t` reflects — see the same note
  // on notifyRecipient in voiceNoteService.ts.
  const delivered = moderation.decision === "APPROVED";
  if (delivered) await deliverAskedNotice(question.id);

  await celebrateFirst(fromUserId, "first_question_asked", t);

  return {
    ok: true,
    questionId: question.id,
    alreadyAsked: false,
    status: question.status,
    heldForReview: !delivered,
  };
}

export type AnswerQuestionResult =
  | {
      ok: true;
      heldForReview: boolean;
      asker: { userId: string; profileId: string | null; displayName: string | null };
      celebration: Celebration | null;
    }
  | { ok: false; code: "NOT_FOUND" | "EXPIRED" | "REJECTED"; message: string };

/**
 * The recipient answers. Creates the VoiceNote directly — deliberately not
 * via `sendVoiceNote`, see this file's header for why answering must never
 * cost an Interest.
 */
export async function answerProfileQuestion(
  params: {
    userId: string;
    questionId: string;
    mediaAssetId: string;
  },
  t: Translate = noopT,
): Promise<AnswerQuestionResult> {
  const { userId, questionId, mediaAssetId } = params;

  const question = await prisma.profileQuestion.findFirst({
    where: { id: questionId, toUserId: userId },
    include: { fromUser: { select: { id: true, profile: { select: { id: true, displayName: true } } } } },
  });
  if (!question || question.moderation !== "APPROVED" || question.status !== "PENDING") {
    return { ok: false, code: "NOT_FOUND", message: t("askBridge.answer.error.notFound", "Ye sawaal available nahi hai.") };
  }
  if (question.expiresAt < new Date()) {
    return { ok: false, code: "EXPIRED", message: t("askBridge.answer.error.expired", "Ye sawaal expire ho chuka hai.") };
  }

  const asset = await prisma.mediaAsset.findFirst({
    where: { id: mediaAssetId, ownerUserId: userId, kind: "VOICE_NOTE", deletedAt: null },
    include: { voiceNote: { select: { id: true } } },
  });
  if (!asset) {
    return { ok: false, code: "NOT_FOUND", message: t("askBridge.answer.error.recordingMissing", "Recording nahi mili — dobara record kijiye.") };
  }
  if (asset.moderation === "REJECTED") {
    return { ok: false, code: "REJECTED", message: asset.moderationReason ?? t("askBridge.answer.error.rejected", "Ye recording bheji nahi ja sakti.") };
  }
  if (asset.voiceNote) {
    return { ok: false, code: "REJECTED", message: t("askBridge.answer.error.alreadyUsed", "Ye recording pehle hi istemal ho chuki hai.") };
  }

  const voiceNote = await prisma.voiceNote.create({
    data: {
      mediaAssetId,
      fromUserId: userId,
      toUserId: question.fromUserId,
      context: "QUESTION_ANSWER",
      relatedQuestionId: question.id,
    },
  });

  await prisma.profileQuestion.update({
    where: { id: question.id },
    data: {
      status: "ANSWERED",
      answeredAt: new Date(),
      // Revealing the asker's name is not the audio content the moderation
      // gate protects — see notifyRecipient's QUESTION_ANSWER branch.
      askerRevealedAt: new Date(),
      answerVoiceNoteId: voiceNote.id,
    },
  });

  // notifyRecipient is not passed `t` here: that notice belongs to the
  // original asker, not the answerer whose locale `t` reflects.
  const delivered = asset.moderation === "APPROVED";
  if (delivered) await notifyRecipient(voiceNote.id);

  const [celebration, questOutcome] = await Promise.all([
    celebrateFirst(userId, "first_question_answered", t),
    recordQuestEvent(userId, "answer_question", 1, t),
  ]);

  return {
    ok: true,
    heldForReview: !delivered,
    asker: {
      userId: question.fromUser.id,
      profileId: question.fromUser.profile?.id ?? null,
      displayName: question.fromUser.profile?.displayName ?? null,
    },
    celebration: celebration ?? questOutcome?.celebration ?? null,
  };
}

export async function declineProfileQuestion(userId: string, questionId: string): Promise<boolean> {
  const result = await prisma.profileQuestion.updateMany({
    where: { id: questionId, toUserId: userId, status: "PENDING", moderation: "APPROVED" },
    data: { status: "DECLINED" },
  });
  return result.count > 0;
}

/** Awaiting-answer questions for this user's inbox — masked, same as a locked voice note. */
export async function getInboundQuestions(userId: string, t: Translate = noopT): Promise<InboundQuestionView[]> {
  const rows = await prisma.profileQuestion.findMany({
    where: { toUserId: userId, status: "PENDING", moderation: "APPROVED", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      fromUser: {
        select: {
          profile: {
            select: {
              currentCity: true,
              dateOfBirth: true,
              gender: true,
              profession: { select: { jobTitle: true } },
            },
          },
        },
      },
    },
  });

  return rows.map((q) => {
    const p = q.fromUser.profile;
    return {
      id: q.id,
      teaser: buildMaskedTeaser(
        {
          currentCity: p?.currentCity ?? null,
          dateOfBirth: p?.dateOfBirth ?? null,
          gender: p?.gender ?? null,
          jobTitle: p?.profession?.jobTitle ?? null,
        },
        t,
      ),
      questionText: q.politeText ?? q.questionText,
      expiresAt: q.expiresAt.toISOString(),
      createdAt: q.createdAt.toISOString(),
    };
  });
}

/** One asker → one candidate: what to show on the reel/profile ask button. */
export async function getAskedStatusMap(
  fromUserId: string,
  candidateUserIds: string[],
): Promise<Map<string, ProfileQuestionStatus>> {
  if (candidateUserIds.length === 0) return new Map();
  const rows = await prisma.profileQuestion.findMany({
    where: { fromUserId, toUserId: { in: candidateUserIds } },
    select: { toUserId: true, status: true },
  });
  return new Map(rows.map((r) => [r.toUserId, r.status]));
}

// ---------------------------------------------------------------------------
// Admin moderation queue — the text-only sibling of getPendingMedia/
// moderateHeldVoiceNote in voiceNoteService.ts. A question lands here only
// when contentModeration's AI pass couldn't run (no key, no credit, provider
// down) — the deterministic pass-1 blocklist already rejects outright,
// synchronously, before a row is ever created.
// ---------------------------------------------------------------------------

export interface PendingQuestionRow {
  questionId: string;
  askerName: string;
  questionText: string;
  moderationReason: string | null;
  createdAt: Date;
}

export async function getPendingQuestions(limit = 50): Promise<PendingQuestionRow[]> {
  const rows = await prisma.profileQuestion.findMany({
    where: { moderation: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: { fromUser: { select: { fullName: true } } },
  });
  return rows.map((q) => ({
    questionId: q.id,
    askerName: q.fromUser.fullName,
    questionText: q.questionText,
    moderationReason: q.moderationReason,
    createdAt: q.createdAt,
  }));
}

export async function moderateHeldQuestion(params: {
  questionId: string;
  approve: boolean;
  reason?: string | null;
}): Promise<{ ok: boolean; delivered: boolean }> {
  const question = await prisma.profileQuestion.findUnique({ where: { id: params.questionId } });
  if (!question || question.moderation !== "PENDING") return { ok: false, delivered: false };

  if (!params.approve) {
    await prisma.profileQuestion.update({
      where: { id: question.id },
      data: { moderation: "REJECTED", moderationReason: params.reason ?? null },
    });
    return { ok: true, delivered: false };
  }

  const politeText = question.politeText ?? (await rewriteQuestion(question.questionText, question.fromUserId));
  await prisma.profileQuestion.update({
    where: { id: question.id },
    data: { moderation: "APPROVED", politeText },
  });
  await deliverAskedNotice(question.id);
  return { ok: true, delivered: true };
}
