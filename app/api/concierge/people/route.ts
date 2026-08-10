import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { prisma } from "@/lib/db/prisma";
import { getTodayPollView } from "@/lib/services/vibe/pollService";
import { isFeatureAvailable } from "@/lib/services/plans/entitlements";
import { getT } from "@/lib/i18n/server";
import type { ConciergePersonOption } from "@/lib/contracts/concierge";

export const runtime = "nodejs";

/**
 * Grio's "on whom?" picker — the sibling of `/api/concierge/matches`.
 *
 * That one answers "who can I message" (chat-unlocked matches only). This one
 * answers a different question — "who have I already shown intent toward" —
 * because a targeted action is not a conversation. Sending an interest to
 * someone you shortlisted last week is normal; messaging them is not possible
 * at all.
 *
 * Three sources, all of them consequences of something the user or the other
 * person already did:
 *
 *  - **shortlist** — the user saved them. Their own list, no one else's.
 *  - **interest_received** — they asked to be considered, and the answer is
 *    still pending. Acting here is *replying*, which is why it sorts first.
 *  - **same_vote** — they answered today's Vibe Hub question the same way. Not
 *    a ranking either: `getSameVoteLeads` selects on one equality (same
 *    `optionIndex`), and it is the user's *own* answer that produced the set.
 *
 * What this deliberately is not: a list of candidates. Nothing here comes from
 * ranking, the reel, or search, because a picker fed by the matching pipeline
 * would be Grio recommending people with extra steps — the exact thing D-32
 * reserves for the deterministic pipeline and `context.ts` refuses to hand the
 * model.
 *
 * And it never reaches the model at all: the client fetches it, renders it, and
 * sends back only the id the user tapped. Names live here because a human has
 * to read them, not because an assistant does.
 *
 * No photos. The picker would otherwise have to re-derive the L3/`photoUnlockAll`
 * gate that `profileViewData` owns, and a second implementation of a photo gate
 * is a second chance to get one wrong. Initials are enough to tap the right row.
 */

const LIMIT = 40;

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const visible = { deletedAt: null, isVisible: true, profileStatus: { not: "DRAFT" as const } };

  const t = await getT();
  const [received, shortlisted, sameVote] = await Promise.all([
    prisma.interest.findMany({
      where: { toUserId: user.id, status: "PENDING", fromUser: { profile: visible } },
      orderBy: { createdAt: "desc" },
      take: LIMIT,
      select: { fromUser: { select: { profile: { select: { id: true, displayName: true } } } } },
    }),
    prisma.shortlist.findMany({
      where: { userId: user.id, targetProfile: visible },
      orderBy: { createdAt: "desc" },
      take: LIMIT,
      select: { targetProfile: { select: { id: true, displayName: true } } },
    }),
    // Empty until the user has voted today — `getTodayPollView` reveals leads
    // only after answering, and this must not become a way around that.
    // Failure is not worth a 500: two sources are still a usable picker.
    (async () => {
      if (!(await isFeatureAvailable(user.id, "mindsetArena")).allowed) return [];
      const view = await getTodayPollView(user.id, t).catch(() => null);
      return view?.sameVoteLeads ?? [];
    })(),
  ]);

  // Someone can be in both lists. Pending-interest wins the tie because it is
  // the one with a person waiting on the other end.
  const seen = new Set<string>();
  const people: ConciergePersonOption[] = [];

  for (const [rows, source] of [
    [received.map((r) => r.fromUser.profile), "interest_received"],
    [shortlisted.map((r) => r.targetProfile), "shortlist"],
    [sameVote.map((l) => ({ id: l.profileId, displayName: l.displayName })), "same_vote"],
  ] as const) {
    for (const p of rows) {
      if (!p || seen.has(p.id)) continue;
      seen.add(p.id);
      people.push({ profileId: p.id, name: p.displayName?.trim() || "Profile", source });
    }
  }

  return NextResponse.json({ ok: true, people });
}
