import { NextResponse } from "next/server";
import { getMatchMilanList, getOwnChart } from "@/lib/services/kundli/kundliMatch";
import { mangalSummary } from "@/lib/services/kundli/mangalSummary";
import { getPlanContext } from "@/lib/services/plans/entitlements";
import { getT } from "@/lib/i18n/server";
import { requireMember } from "../_shared/member";

export const runtime = "nodejs";

/**
 * "Meri Kundli" for the native app — what `/user/kundli` renders on the
 * server, as JSON: the member's own chart (`getOwnChart`), guna milan with the
 * people they have already matched with (`getMatchMilanList`), and the two
 * plan answers the page reads (PDF export, the manual tool). Nothing is
 * computed here; the Mangal line is `mangalSummary`, the same words the web
 * card prints.
 *
 * The chart is only ever the caller's own — birth time and place never leave
 * for anybody else (lib/contracts/kundli.ts). Same page rule as the web:
 * a member with a live profile (`ROUTE_ACCESS_MATRIX` '/user/kundli').
 */
export async function GET() {
  const { user, response } = await requireMember();
  if (!user) return response;

  try {
    const t = await getT();
    const [chart, milanRows, planCtx] = await Promise.all([
      getOwnChart(user.id),
      getMatchMilanList(user.id, t),
      getPlanContext(user.id),
    ]);
    return NextResponse.json({
      ok: true,
      chart,
      mangal: chart ? mangalSummary(chart, t) : null,
      milanRows,
      pdfEntitled: planCtx.features.kundliPdfExport,
      manualUsable: planCtx.features.kundliManualEntry || planCtx.credits.KUNDLI_UNLOCK > 0,
    });
  } catch (err) {
    console.error("[mobile:kundli] failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { ok: false, error: "KUNDLI_FAILED", message: "Kundli abhi load nahi ho payi — dobara try karein." },
      { status: 500 },
    );
  }
}
