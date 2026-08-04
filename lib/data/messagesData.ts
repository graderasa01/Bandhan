import { prisma } from "@/lib/db/prisma";
import { PROFILE_CHAT_SELECT } from "@/lib/services/profile/profileInclude";
import type { ChatParticipant, ConversationViewModel, ThreadViewModel } from "@/lib/contracts/messages";

const PARTICIPANT_INCLUDE = {
  select: {
    id: true,
    fullName: true,
    profile: { select: PROFILE_CHAT_SELECT },
  },
} as const;

type ParticipantRow = {
  id: string;
  fullName: string;
  profile: {
    id: string;
    displayName: string | null;
    trustScoreLabel: string | null;
    photos: { fileUrl: string; verificationStatus: string }[];
  } | null;
};

/**
 * The photo is unconditional here, unlike the reel and shortlist: a chat
 * participant is by definition the other half of a Match, which is exactly the
 * condition the consent gate waits for.
 */
function toParticipant(u: ParticipantRow): ChatParticipant {
  const photo = u.profile?.photos[0];
  return {
    userId: u.id,
    profileId: u.profile?.id ?? null,
    displayName: u.profile?.displayName ?? u.fullName,
    photoUrl: photo?.fileUrl ?? null,
    verified: photo?.verificationStatus === "APPROVED",
  };
}

/** Chat is real-only from day one (like reelData.ts) — no mock counterpart. */
export async function getConversationsData(userId: string): Promise<ConversationViewModel[]> {
  const matches = await prisma.match.findMany({
    where: { OR: [{ userAId: userId }, { userBId: userId }] },
    include: {
      userA: PARTICIPANT_INCLUDE,
      userB: PARTICIPANT_INCLUDE,
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const conversations = await Promise.all(
    matches.map(async (m) => {
      const other = m.userAId === userId ? m.userB : m.userA;
      const last = m.messages[0] ?? null;
      const unreadCount = await prisma.message.count({
        where: { matchId: m.id, senderId: { not: userId }, readAt: null },
      });

      return {
        matchId: m.id,
        other: toParticipant(other),
        lastMessage: last
          ? { body: last.body, senderId: last.senderId, createdAt: last.createdAt.toISOString() }
          : null,
        unreadCount,
        updatedAt: (last?.createdAt ?? m.createdAt).toISOString(),
      } satisfies ConversationViewModel;
    }),
  );

  return conversations.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** 404-shaped as "not found" rather than "forbidden" if the viewer isn't a participant — avoids leaking match existence. */
export async function getThreadData(userId: string, matchId: string): Promise<ThreadViewModel | null> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      userA: PARTICIPANT_INCLUDE,
      userB: PARTICIPANT_INCLUDE,
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!match || (match.userAId !== userId && match.userBId !== userId)) return null;

  const other = match.userAId === userId ? match.userB : match.userA;
  return {
    matchId: match.id,
    other: toParticipant(other),
    messages: match.messages.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      readAt: m.readAt?.toISOString() ?? null,
    })),
  };
}

/** Marks the other participant's unread messages read — called whenever this user opens the thread. */
export async function markThreadRead(userId: string, matchId: string): Promise<void> {
  await prisma.message.updateMany({
    where: { matchId, senderId: { not: userId }, readAt: null },
    data: { readAt: new Date() },
  });
}
