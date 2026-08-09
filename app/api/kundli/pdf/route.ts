import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getOwnChart } from "@/lib/services/kundli/kundliMatch";
import { getPlanContext } from "@/lib/services/plans/entitlements";
import { buildKundliPdf, kundliPdfFilename } from "@/lib/services/kundli/kundliPdf";
import { getT } from "@/lib/i18n/server";

/**
 * The kundli, as a file you can forward.
 *
 * Self-only, like everything else on the kundli path: the chart comes from
 * `getOwnChart(user.id)`, which by construction cannot be pointed at another
 * user (see the header of `kundliMatch.ts`). There is no `?userId=` and there
 * should never be one — a stranger's lagna is exactly what the birth-details
 * privacy promise forbids.
 *
 * The manual-entry tool has no export here on purpose: `generateManualKundli`
 * is a pure computation that deliberately persists nothing (it can be run for a
 * parent or a stranger, so writing it anywhere would be wrong), which means
 * there is no stored id to export. If that tool ever gains persistence, this is
 * the route that grows a `?manualId=`.
 *
 * Everything is computed in-process. Nothing here fetches the app's own routes.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, message: "Login chahiye." }, { status: 401 });

  const planCtx = await getPlanContext(user.id);
  if (!planCtx.features.kundliPdfExport) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Kundli PDF download paid plan ke saath khulta hai. Aapki kundli screen par hamesha free hai — PDF banane ke liye plan upgrade karein.",
      },
      { status: 403 },
    );
  }

  const [chart, profile] = await Promise.all([
    getOwnChart(user.id),
    prisma.profile.findUnique({
      where: { userId: user.id },
      select: { dateOfBirth: true, basicDetails: { select: { birthTime: true, birthPlace: true } } },
    }),
  ]);

  // `getOwnChart` returns null without a DOB, and `buildChart` guarantees the
  // DOB is present whenever a chart exists — so this is one check, not two.
  if (!chart || !profile?.dateOfBirth) {
    return NextResponse.json(
      { ok: false, message: "Kundli ke liye pehle Date of Birth profile me daaliye." },
      { status: 422 },
    );
  }

  const t = await getT();
  const pdf = buildKundliPdf(
    chart,
    {
      name: user.fullName,
      dateOfBirth: profile.dateOfBirth,
      birthTime: profile.basicDetails?.birthTime ?? null,
      birthPlace: profile.basicDetails?.birthPlace ?? null,
    },
    t,
  );

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.length),
      "Content-Disposition": `attachment; filename="${kundliPdfFilename(user.fullName)}"`,
      // A kundli changes the moment a user fills in their birth time.
      "Cache-Control": "no-store",
    },
  });
}
