import { NextResponse } from "next/server";
import { getLaneCounts } from "@/lib/data/reelLibraryData";
import { requireMember } from "../../_shared/member";

export const runtime = "nodejs";

/**
 * Meri List's five counts, fresh — the same `getLaneCounts` the reel's page
 * load carries (`laneCounts`), without rebuilding the whole deck.
 *
 * The app asks when the list sheet opens: a like, a shortlist or an interest
 * made since the deck arrived moves people between lanes (Viewed excludes
 * anyone liked, saved or sent to), and only the server's eligibility pass —
 * visibility, blocks, the gender floor — can say what each lane now holds.
 */
export async function GET() {
  const { user, response } = await requireMember();
  if (!user) return response;

  try {
    return NextResponse.json({ ok: true, counts: await getLaneCounts(user.id) });
  } catch (err) {
    console.error("[mobile:reel-lanes] failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { ok: false, error: "LANES_FAILED", message: "Meri List abhi load nahi ho payi — dobara try karein." },
      { status: 500 },
    );
  }
}
