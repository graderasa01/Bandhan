import "server-only";
import { prisma } from "@/lib/db/prisma";
import { createNotice } from "@/lib/services/notice/noticeService";
import { noopT, type Translate } from "@/lib/i18n/translate";

/**
 * Ghosting Shield — a nudge, never an accusation.
 *
 * ## Why this is deterministic, not AI (D-32)
 *
 * "Aapne inka jawab nahi diya" is a fact a timestamp comparison already knows.
 * Handing this to a model would risk exactly the kind of invented-urgency
 * copy §7.1 rules out ("wo intezaar kar rahe hain, jaldi kijiye") over a
 * plain, checkable fact: it has been more than a day since their last
 * message and the viewer hasn't replied.
 *
 * ## Who gets nudged
 *
 * Only the person who hasn't replied — never the person still waiting. A
 * notice telling someone "wo abhi tak nahi bole" about their own match adds
 * anxiety with nothing they can do about it; a notice telling the *silent*
 * person to reply is the one nudge that can actually change the outcome.
 *
 * ## Why one nudge per staleness, not one per visit
 *
 * `getThreadData` runs every time this thread is opened, and polling means
 * that could be every few seconds. Renudging on every read would be the
 * confetti-inflation mistake (§7.2) wearing a different feature's clothes —
 * so a Notice is only written if none exists yet for a staleness that started
 * at this exact `lastMessageAt`. A new message resets the clock and makes a
 * fresh nudge possible again.
 */

const GHOST_THRESHOLD_MS = 24 * 3600_000;

export interface GhostingNudge {
  otherName: string;
  hoursSince: number;
}

/** Pure — no I/O, so MessageThread's card and the Notice writer can never disagree. */
export function computeGhostingNudge(
  lastMessage: { senderId: string; createdAt: Date } | null,
  viewerId: string,
  otherName: string,
): GhostingNudge | null {
  if (!lastMessage || lastMessage.senderId === viewerId) return null;
  const elapsedMs = Date.now() - lastMessage.createdAt.getTime();
  if (elapsedMs < GHOST_THRESHOLD_MS) return null;
  return { otherName, hoursSince: Math.floor(elapsedMs / 3600_000) };
}

/**
 * Writes the inbox reminder for a stale thread, idempotently. Never throws —
 * same "a nudge is a bonus, not the point" discipline as celebrateFirst.
 */
export async function notifyGhostingNudge(
  params: {
    userId: string;
    matchId: string;
    otherName: string;
    lastMessageAt: Date;
  },
  t: Translate = noopT,
): Promise<void> {
  try {
    const already = await prisma.notice.findFirst({
      where: {
        userId: params.userId,
        kind: "CHAT_NUDGE",
        relatedId: params.matchId,
        createdAt: { gt: params.lastMessageAt },
      },
      select: { id: true },
    });
    if (already) return;

    await createNotice({
      userId: params.userId,
      kind: "CHAT_NUDGE",
      title: t("ghosting.notice.title", "Ek jawab reh gaya"),
      body: `${params.otherName}${t(
        "ghosting.notice.bodySuffix",
        " ka message aapko mila tha — ek chhota sa jawab rishta aage badha sakta hai.",
      )}`,
      href: `/user/messages/${params.matchId}`,
      relatedId: params.matchId,
    });
  } catch (err) {
    console.error("[ghostingShield] notify failed:", err instanceof Error ? err.message : String(err));
  }
}
