import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { checkMetaAdReadiness } from "@/lib/services/marketing/connectionService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * "Check ad creation readiness" (doc 14 §9) — read-only Graph calls that
 * separate token validity, read permission, write permission, access tier,
 * ad-account role/status/currency/timezone, Page and Instagram assignment.
 * POST, not GET: it spends API quota and must never run on a prefetch.
 * 200 either way — "not ready" is a successful check. Meta Ads only; the
 * Google side has no equivalent because its readiness is the OAuth grant +
 * the connection test.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  const { provider } = await params;
  if (provider !== "META_ADS") return NextResponse.json({ error: "NOT_FOUND", message: "Readiness check sirf Meta Ads ke liye hai." }, { status: 404 });
  const report = await checkMetaAdReadiness();
  return NextResponse.json({ ok: true, report });
}
