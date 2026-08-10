import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { prisma } from "@/lib/db/prisma";
import { getOrCreateTodayReel } from "@/lib/services/match/reelGenerator";
import { getBlockedUserIds } from "@/lib/services/safety/blockService";
import type { ConciergeWalkthroughStep } from "@/lib/contracts/concierge";

export const runtime = "nodejs";

/**
 * Today's rishtey, in order, for Grio to walk the user through one at a time.
 *
 * ## Why a list endpoint does not reopen the ranking hazard
 *
 * `lib/services/grio/context.ts` states the boundary this app defends: *"Only
 * the user's own state. Never another person's attributes."* — and gives the
 * reason, that a Grio which could see "your matches" would be one prompt away
 * from doing L2's job in prose. Today's reel appears in that file as three
 * numbers for exactly this reason.
 *
 * This endpoint returns names. It does not breach that boundary, because of
 * where the names go: **to the client, never into a prompt.** The walkthrough
 * driver holds the list, and at each step it sets `candidateProfileId` scope to
 * exactly one profile — which is Rishta Lens, unchanged, with its own
 * single-candidate dossier. The model is never handed two people, so "which of
 * these is best" still has nothing to answer from.
 *
 * The ordering is the other half. It is the reel's own `rank`, decided by
 * `scoreCandidates` when the reel was generated. Grio does not choose who comes
 * first and cannot reorder; it narrates a sequence code already fixed. That is
 * the same division of labour Rishta Lens has — code ranks, Grio explains — just
 * applied to a list instead of a card.
 *
 * ## Generation
 *
 * `getOrCreateTodayReel` rather than a read-only lookup, deliberately and
 * unlike `context.ts`. Asking Grio to show you today's rishtey *is* asking for
 * today's reel; refusing to generate one would mean the walkthrough works only
 * for users who happened to open the reel screen first. Nothing is consumed —
 * a generated reel is the same reel `/user/reel` will show.
 */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const reel = await getOrCreateTodayReel(user.id).catch(() => null);
  // No profile yet — the generator throws rather than inventing one. An empty
  // walkthrough is the honest answer, and the chat already knows how to say
  // "profile poori kijiye".
  if (!reel) return NextResponse.json({ ok: true, steps: [] satisfies ConciergeWalkthroughStep[] });

  const [swipes, blockedUserIds] = await Promise.all([
    prisma.swipeAction.findMany({
      where: { actorUserId: user.id, dailyReelId: reel.id },
      select: { targetProfileId: true },
    }),
    getBlockedUserIds(user.id),
  ]);

  const seen = new Set(swipes.map((s) => s.targetProfileId));
  const blocked = new Set(blockedUserIds);

  // Already-swiped cards are dropped for the same reason the reel never
  // re-shows them: the user has answered that card. Blocked people are
  // re-filtered on read because the reel is persisted once a day and a block
  // made at 4pm has to apply to a list built at 9am (reelData.ts makes the
  // same pass for the same reason).
  const steps: ConciergeWalkthroughStep[] = reel.candidates
    .filter((c) => !seen.has(c.profile.id) && !blocked.has(c.profile.userId))
    .map((c) => ({
      profileId: c.profile.id,
      name: c.profile.displayName?.trim() || "Profile",
    }));

  return NextResponse.json({ ok: true, steps });
}
