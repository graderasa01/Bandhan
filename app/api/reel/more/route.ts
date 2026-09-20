import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { getMoreReelCards } from "@/lib/data/reelData";
import { getT } from "@/lib/i18n/server";
import type { ReelMoreResponse } from "@/lib/contracts/reel";

export const runtime = "nodejs";

/**
 * The reel's top-up — D-91.
 *
 * POST rather than GET because it writes: the next batch is scored and
 * persisted onto today's `DailyReel` before it is returned, so the same cards
 * come back after a refresh instead of being re-dealt in a different order.
 *
 * It takes no body. What the next batch contains is decided entirely by the
 * server — the viewer's preferences, their Discovery settings, who they have
 * already swiped — and a client-supplied cursor or count would only be another
 * thing to validate and distrust.
 *
 * `exhausted: true` is the end of the pool, not the end of a quota: there is
 * nobody left who matches and has not already been seen. The screen says
 * exactly that.
 */
export async function POST() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const t = await getT();

  try {
    const { cards, exhausted } = await getMoreReelCards(user.id, t);
    return NextResponse.json({ ok: true, cards, exhausted } satisfies ReelMoreResponse);
  } catch (err) {
    console.error("[reel] top-up failed:", err instanceof Error ? err.message : String(err));
    // Not `exhausted` — a failure here is us, not an empty pool, and the
    // difference matters: one is "ab koi rishta nahi", the other is "dobara
    // try karein". Saying the first when the second is true would close a
    // deck that still has people in it.
    return NextResponse.json(
      {
        ok: false,
        cards: [],
        exhausted: false,
        message: t("reel.more.failed", "Aur rishtey laane me dikkat aayi — dobara try karein."),
      } satisfies ReelMoreResponse,
      { status: 500 },
    );
  }
}
