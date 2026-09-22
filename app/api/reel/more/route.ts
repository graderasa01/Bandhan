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
 * Who is in the next batch is decided entirely by the server — the viewer's
 * preferences, their Discovery settings, who they have already met. The one
 * thing the body may carry is `seenCursor` (D-92): how far into the "already
 * seen" half of the feed the screen has got. It is an offset into this
 * member's own history and nothing else, so the worst a bad one can do is
 * repeat a page the screen then drops by id.
 *
 * `exhausted: true` is the end of the pool, not the end of a quota: nobody new
 * matches, and nobody already seen is left to come round again. The screen
 * says exactly that.
 */
export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const t = await getT();

  let seenCursor: string | null = null;
  try {
    const body: unknown = await req.json();
    const value = (body as { seenCursor?: unknown } | null)?.seenCursor;
    if (typeof value === "string") seenCursor = value;
  } catch {
    // No body at all — the first top-up of a session, or an older client.
  }

  try {
    const { cards, exhausted, seenCursor: nextSeenCursor } = await getMoreReelCards(user.id, t, seenCursor);
    return NextResponse.json({ ok: true, cards, exhausted, seenCursor: nextSeenCursor } satisfies ReelMoreResponse);
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
