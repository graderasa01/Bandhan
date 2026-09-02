import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getT } from "@/lib/i18n/server";
import { getInboundQuestions } from "@/lib/services/askBridge/profileQuestionService";
import { WITHDRAW_WINDOW_HOURS } from "@/lib/services/match/withdrawInterest";
import type { NoticeKind } from "@prisma/client";

/**
 * "Aapka kya pending hai" — the things actually waiting on this user.
 *
 * ## Why counts weren't enough
 *
 * `context.ts` already tells Grio how many notices are unread and how many
 * questions are unanswered, and that was enough to answer "mera kya pending
 * hai?" when asked. It was not enough to be *useful*, because a count cannot
 * be prioritised: "3 unread" says nothing about whether one of them is a
 * question expiring tomorrow and the other two are announcements. So Grio
 * either recited numbers or, worse, guessed at what they contained.
 *
 * This block is the difference between a badge and a briefing. Every line is
 * something with a deadline, a person waiting, or an action the user has not
 * taken — and each is computed from the row that proves it, never inferred.
 *
 * ## The boundary is unchanged
 *
 * Everything here is the user's *own* inbox: their notices, questions
 * addressed to them, interests awaiting *their* reply, voice notes sent *to*
 * them. Other people appear only as counts and as the fact that they are
 * waiting — never as attributes, and never in a form that could be ranked.
 * That is the same line `context.ts` draws and for the same reason.
 *
 * Deliberately omitted: notice *bodies*. A notice body is written to be read
 * on the user's screen, and some are masked at the source (`actorMasked`)
 * precisely so an identity stays hidden until the user earns it. Passing kinds
 * and counts keeps that promise intact while still letting Grio say what kind
 * of thing is waiting.
 */

/** Hinglish names for what a notice actually is, so Grio doesn't read enum values aloud. */
const NOTICE_LABEL: Record<NoticeKind, string> = {
  VOICE_NOTE_RECEIVED: "voice note aaya",
  QUESTION_ASKED: "koi sawaal poochha gaya",
  QUESTION_ANSWERED: "aapke sawaal ka jawab aaya",
  QUEST_AVAILABLE: "naya quest khula",
  REWARD_EARNED: "reward mila",
  FAMILY_ACTION: "parivaar ne kuch kiya",
  MATCH_CREATED: "naya match bana",
  CHAT_NUDGE: "chat ka reminder",
  MATCHMAKER_UPDATE: "matchmaker ka update",
  PLAN_GRANTED: "plan mila",
  SERVICE_UPDATE: "partner service ka update",
  ANNOUNCEMENT: "announcement",
  // Named without the rishta it belongs to, the same way the notice itself is
  // written: Grio reads this aloud, and a room is not a place to say a name.
  RISHTA_REQUEST: "ek rishtey me aapse kuch poochha gaya",
};

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function hoursSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 3_600_000);
}

export interface PendingBriefing {
  /**
   * The waiting items as sentences a person could say out loud, most urgent
   * first.
   *
   * Exposed alongside `promptBlock` because these lines have two readers now.
   * The model reads the block; `quickAnswer.ts` reads these directly and speaks
   * them back when the user simply asked "kya pending hai" — a question whose
   * honest answer is this list and nothing else, and which therefore has no
   * business costing an AI call. Same sentences either way: two renderings of
   * the same rows would eventually disagree, and the one that drifts is the one
   * nobody is reading.
   */
  lines: string[];
  /** `lines` wrapped in the framing the system prompt expects. */
  promptBlock: string;
}

/** Null when genuinely nothing is waiting — an empty "pending" heading is worse than none. */
export async function buildPendingBriefing(userId: string): Promise<PendingBriefing | null> {
  const t = await getT();

  const [unreadNotices, questions, inboundInterests, sentInterests, unplayedVoice, silentMatches] =
    await Promise.all([
      prisma.notice.groupBy({
        by: ["kind"],
        where: { userId, readAt: null },
        _count: { _all: true },
        _min: { createdAt: true },
      }),
      getInboundQuestions(userId, t),
      prisma.interest.findMany({
        where: { toUserId: userId, status: "PENDING" },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
      prisma.interest.findMany({
        where: { fromUserId: userId, status: "PENDING" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      // Sent *to* this user and never played. `unlockedAt` splits the two very
      // different asks: a locked note needs a plan or a credit before it can be
      // heard at all, an unlocked one just needs a tap.
      prisma.voiceNote.findMany({
        where: { toUserId: userId, playedAt: null },
        select: { unlockedAt: true },
      }),
      // Matched, and nobody has said anything. The most actionable item in the
      // whole app: both sides already said yes, and the conversation is dying
      // of politeness.
      prisma.match.findMany({
        where: {
          OR: [{ userAId: userId }, { userBId: userId }],
          messages: { none: {} },
        },
        select: { id: true },
      }),
    ]);

  const lines: string[] = [];

  if (unreadNotices.length > 0) {
    const total = unreadNotices.reduce((sum, row) => sum + row._count._all, 0);
    const parts = unreadNotices.map((row) => `${NOTICE_LABEL[row.kind]} (${row._count._all})`);
    const oldest = unreadNotices
      .map((row) => row._min.createdAt)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    const age = oldest ? Math.floor(hoursSince(oldest) / 24) : 0;
    lines.push(
      `Inbox me ${total} cheezein bina padhi hain — ${parts.join(", ")}.` +
        (age >= 2 ? ` Sabse purani ${age} din se padi hai.` : ""),
    );
  }

  if (questions.length > 0) {
    // The expiry is a real deadline (`ProfileQuestion.expiresAt`), not a nudge
    // device — an unanswered question genuinely stops being answerable.
    const soonest = Math.min(...questions.map((q) => daysUntil(q.expiresAt)));
    lines.push(
      `${questions.length} sawaal aapke jawab ka intezaar kar rahe hain.` +
        (soonest <= 2
          ? ` Inme se ek ${soonest <= 0 ? "aaj hi" : `${soonest} din me`} expire ho raha hai — jawab dete hi aapko pata chalega ki poochhne wala kaun tha.`
          : " Jawab dene par hi aapko pata chalta hai ki poochhne wala kaun tha."),
    );
  }

  if (inboundInterests.length > 0) {
    const waited = hoursSince(inboundInterests[0].createdAt);
    lines.push(
      `${inboundInterests.length} logon ne aapko interest bheja hai aur aapke jawab ka intezaar kar rahe hain` +
        (waited >= 24 ? ` — sabse purana ${Math.floor(waited / 24)} din se.` : "."),
    );
  }

  const unlockedUnplayed = unplayedVoice.filter((v) => v.unlockedAt !== null).length;
  const lockedUnplayed = unplayedVoice.length - unlockedUnplayed;
  if (unlockedUnplayed > 0 || lockedUnplayed > 0) {
    const bits: string[] = [];
    if (unlockedUnplayed > 0) bits.push(`${unlockedUnplayed} sunne ke liye taiyar hain`);
    if (lockedUnplayed > 0) bits.push(`${lockedUnplayed} abhi lock hain`);
    lines.push(`Aaye hue voice note jo aapne abhi tak nahi sune: ${bits.join(", ")}.`);
  }

  if (silentMatches.length > 0) {
    lines.push(
      `${silentMatches.length} match aise hain jinme abhi tak ek bhi message nahi hua — dono taraf se haan ho chuki hai, bas baat shuru nahi hui.`,
    );
  }

  if (sentInterests.length > 0) {
    const newest = hoursSince(sentInterests[0].createdAt);
    lines.push(
      `Aapke bheje hue ${sentInterests.length} interest abhi jawab ka intezaar kar rahe hain` +
        (newest < WITHDRAW_WINDOW_HOURS
          ? ` — inme se ek abhi ${WITHDRAW_WINDOW_HOURS} ghante ki wapas-lene wali window me hai.`
          : "."),
    );
  }

  if (lines.length === 0) return null;

  return {
    lines,
    promptBlock: `AAPKE USER KA KYA PENDING HAI (code ne abhi gina hai — sab sach hai):
${lines.map((l) => `- ${l}`).join("\n")}

Ye wo cheezein hain jinpar user ne abhi tak kuch nahi kiya. Jab wo poochein ki "kya pending hai" / "kya naya hai", to yahi bataiye — sabse pehle wo jispar deadline hai ya koi insaan intezaar kar raha hai. Baaki baat-cheet me ise har baar mat dohraaiye; ek baar zikr kaafi hai, aur jo is list me nahi hai wo pending nahi hai.`,
  };
}
