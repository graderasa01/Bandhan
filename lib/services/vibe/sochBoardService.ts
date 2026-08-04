import "server-only";
import { prisma } from "@/lib/db/prisma";

/**
 * C7 — Soch Board. A poll answer isn't aimed at anyone (unlike a
 * `VoiceNote`), so its optional voice clip lives as a direct
 * `PollVote.voiceNoteMediaId` link rather than another `VoiceNote` row — see
 * the schema comment on why that model's (fromUserId, toUserId, context)
 * shape and `sendInterest` side effect don't fit here.
 */

export type AttachAnswerNoteResult =
  | { ok: true }
  | { ok: false; error: string; message: string; status: number };

/** Owner-only: attaches (or replaces) the voice clip explaining their own answer to one poll. */
export async function attachAnswerVoiceNote(
  userId: string,
  pollId: string,
  mediaAssetId: string,
): Promise<AttachAnswerNoteResult> {
  const vote = await prisma.pollVote.findUnique({ where: { pollId_userId: { pollId, userId } } });
  if (!vote) {
    return { ok: false, error: "NOT_FOUND", message: "Pehle is poll ka jawab dijiye.", status: 404 };
  }

  const asset = await prisma.mediaAsset.findFirst({
    where: { id: mediaAssetId, ownerUserId: userId, kind: "VOICE_NOTE", deletedAt: null },
    include: { voiceNote: { select: { id: true } }, pollVoteAnswer: { select: { id: true } } },
  });
  if (!asset) {
    return { ok: false, error: "NOT_FOUND", message: "Recording nahi mili — dobara record kijiye.", status: 404 };
  }
  if (asset.moderation === "REJECTED") {
    return { ok: false, error: "REJECTED", message: asset.moderationReason ?? "Ye recording use nahi ho sakti.", status: 422 };
  }
  // Already spoken for — either as a voice note to someone, or as another
  // poll's answer clip. A fresh recording is one tap away in the UI.
  if (asset.voiceNote || (asset.pollVoteAnswer && asset.pollVoteAnswer.id !== vote.id)) {
    return { ok: false, error: "ALREADY_USED", message: "Ye recording pehle hi use ho chuki hai.", status: 422 };
  }

  await prisma.pollVote.update({ where: { id: vote.id }, data: { voiceNoteMediaId: mediaAssetId } });
  return { ok: true };
}

export async function setSochBoardVisibility(userId: string, visible: boolean): Promise<void> {
  await prisma.profile.update({ where: { userId }, data: { sochBoardVisible: visible } });
}

export interface SochBoardEntry {
  pollId: string;
  question: string;
  chosenOption: string;
  votedAt: string;
  voiceNote: { mediaId: string; seconds: number; approved: boolean } | null;
}

/**
 * A profile's Soch Board — visible to anyone once `sochBoardVisible` +
 * `Profile.isVisible` are both true, same PARENT_BLESSING-style rule as
 * `mediaAccess.ts` (not gated by match level, unlike the rest of
 * `/user/profile/[id]`). The owner previewing their own board always sees
 * it, even while the toggle is off — same "isOwnerPreviewing" carve-out
 * `resolveShareLink` already uses.
 */
export async function getSochBoard(
  targetUserId: string,
  viewerUserId?: string,
): Promise<SochBoardEntry[] | null> {
  const profile = await prisma.profile.findUnique({
    where: { userId: targetUserId },
    select: { isVisible: true, sochBoardVisible: true },
  });
  if (!profile) return null;

  const isOwner = viewerUserId === targetUserId;
  if (!isOwner && (!profile.isVisible || !profile.sochBoardVisible)) return null;

  const votes = await prisma.pollVote.findMany({
    where: { userId: targetUserId },
    orderBy: { votedAt: "desc" },
    include: {
      poll: { select: { question: true, options: true } },
      voiceNoteMedia: { select: { id: true, durationMs: true, moderation: true, deletedAt: true } },
    },
  });

  return votes.map((v) => {
    const media = v.voiceNoteMedia;
    // A clip still PENDING or REJECTED stays private to everyone but the
    // owner — nothing un-screened reaches a third party, same rule
    // `mediaAccess.ts` enforces on every read.
    const showVoice = media && !media.deletedAt && (isOwner || media.moderation === "APPROVED");
    return {
      pollId: v.pollId,
      question: v.poll.question,
      chosenOption: v.poll.options[v.optionIndex] ?? "—",
      votedAt: v.votedAt.toISOString(),
      voiceNote: showVoice
        ? { mediaId: media.id, seconds: Math.max(1, Math.round((media.durationMs ?? 0) / 1000)), approved: media.moderation === "APPROVED" }
        : null,
    };
  });
}
