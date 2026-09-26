import { NextResponse } from "next/server";
import { getReelData } from "@/lib/data/reelData";
import { getT } from "@/lib/i18n/server";
import { requireMember } from "../_shared/member";

export const runtime = "nodejs";

/**
 * Today's reel for the native app — the same `ReelViewModel` `/user/reel`
 * renders on the server, as JSON. Nothing is recomputed or reshaped here:
 * scoring, the photo gate, the seen/new mix and the feed questions all come
 * from `getReelData`, so the app and the web page cannot disagree about who is
 * in the deck. Top-ups go through the existing `/api/reel/more`.
 */
export async function GET() {
  const { user, response } = await requireMember();
  if (!user) return response;

  try {
    const reel = await getReelData(user.id, await getT());
    return NextResponse.json({ ok: true, reel });
  } catch (err) {
    console.error("[mobile:reel] failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { ok: false, error: "REEL_FAILED", message: "Reel abhi load nahi ho payi — dobara try karein." },
      { status: 500 },
    );
  }
}
