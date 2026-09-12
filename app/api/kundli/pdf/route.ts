import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getOwnChart } from "@/lib/services/kundli/kundliMatch";
import { getPlanContext } from "@/lib/services/plans/entitlements";
import { buildKundliPdf, kundliPdfFilename } from "@/lib/services/kundli/kundliPdf";
import { computeManualChart, ManualKundliInput } from "@/lib/services/kundli/manualKundliService";
import { getT } from "@/lib/i18n/server";

/**
 * The kundli, as a file you can forward.
 *
 * **GET — your own kundli.** Self-only, like everything else on the kundli
 * path: the chart comes from `getOwnChart(user.id)`, which by construction
 * cannot be pointed at another user (see the header of `kundliMatch.ts`).
 * There is no `?userId=` and there should never be one — a stranger's lagna is
 * exactly what the birth-details privacy promise forbids.
 *
 * **POST — a manual kundli.** `generateManualKundli` deliberately persists
 * nothing (it can be run for a parent or a stranger, so writing it anywhere
 * would be wrong), which means there is no stored id to export by. The chart
 * is instead *recomputed* from the same typed details the form posted — the
 * computation is deterministic, so the PDF is byte-for-byte the chart the
 * person is looking at. No KUNDLI_UNLOCK credit is spent a second time: the
 * unlock paid for making the kundli, and `kundliPdfExport` pays for the file.
 * Both plan flags are required, so the PDF can never become a way around the
 * manual tool's own gate.
 *
 * Everything is computed in-process. Nothing here fetches the app's own routes.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pdfResponse(pdf: Buffer, name: string): NextResponse {
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.length),
      "Content-Disposition": `attachment; filename="${kundliPdfFilename(name)}"`,
      // A kundli changes the moment a user fills in their birth time.
      "Cache-Control": "no-store",
    },
  });
}

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

  return pdfResponse(pdf, user.fullName);
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, message: "Login chahiye." }, { status: 401 });

  const t = await getT();
  const planCtx = await getPlanContext(user.id);
  if (!planCtx.features.kundliPdfExport || !planCtx.features.kundliManualEntry) {
    return NextResponse.json(
      {
        ok: false,
        message: t(
          "kundli.manual.error.pdfLocked",
          "Kundli PDF download paid plan ke saath khulta hai — kundli screen par to hamesha dikhti hi rahegi.",
        ),
      },
      { status: 403 },
    );
  }

  const parsed = ManualKundliInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, code: "INVALID", message: parsed.error.issues[0]?.message ?? "Form sahi se bharein." },
      { status: 422 },
    );
  }

  const outcome = await computeManualChart(parsed.data, t);
  if (!outcome.ok) {
    return NextResponse.json({ ok: false, code: outcome.code, message: outcome.message }, { status: 422 });
  }

  const pdf = buildKundliPdf(
    outcome.chart,
    {
      name: outcome.subject.name,
      dateOfBirth: new Date(`${outcome.subject.dateOfBirth}T00:00:00Z`),
      birthTime: outcome.subject.birthTime,
      birthPlace: outcome.subject.birthPlace,
      birthTimeUnknown: outcome.subject.birthTimeUnknown,
      birthPlaceUnknown: outcome.subject.birthPlaceUnknown,
    },
    t,
  );

  return pdfResponse(pdf, outcome.subject.name);
}
