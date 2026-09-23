import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { prisma } from "@/lib/db/prisma";
import { isBlockedEitherWay } from "@/lib/services/safety/blockService";
import { getKundliMatchView, milanUsedAssumedTime } from "@/lib/services/kundli/kundliMatch";
import { getT } from "@/lib/i18n/server";
import type { KundliMilanResponse } from "@/lib/contracts/kundli";

export const runtime = "nodejs";

/**
 * `GET /api/kundli/milan/:profileId` — the reel's Kundli button.
 *
 * The same `getKundliMatchView` the profile page renders, fetched only when the
 * member taps the button on *this* card — so the kundli engine's rule holds:
 * milan is shown for a profile the member opened themselves, and it is never a
 * ranking input (nothing here touches `pipeline.ts`).
 *
 * Nothing of the other person's birth data leaves: the view carries the milan
 * result and the gotra/manglik notes, never a DOB, time or place — and the two
 * "assumed" flags say only *that* a time was missing, not what it was.
 *
 * Re-checks what the profile page checks for a stranger opened by URL:
 * visible, not a draft, not deleted, not blocked either way, not yourself.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { profileId } = await params;
  const t = await getT();

  const target = await prisma.profile.findFirst({
    where: { id: profileId, deletedAt: null, isVisible: true, profileStatus: { not: "DRAFT" } },
    select: { userId: true, displayName: true },
  });
  if (!target || target.userId === user.id || (await isBlockedEitherWay(user.id, target.userId))) {
    return NextResponse.json({ ok: false, message: "Ye profile abhi available nahi hai." } satisfies KundliMilanResponse, {
      status: 404,
    });
  }

  const view = await getKundliMatchView(user.id, profileId, t);
  const precision = view.milan ? await milanUsedAssumedTime(user.id, profileId) : null;

  return NextResponse.json({
    ok: true,
    name: target.displayName?.trim() || "Profile",
    view,
    viewerAssumed: precision?.viewerAssumed ?? false,
    approximate: Boolean(precision?.viewerAssumed || precision?.candidateAssumed),
  } satisfies KundliMilanResponse);
}
