import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { isMarketingProvider } from "@/lib/contracts/marketingAi";
import { testConnection } from "@/lib/services/marketing/connectionService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * A real, read-only upstream call. POST, not GET — it costs a request
 * against a quota and must never be triggered by a prefetch. 200 either
 * way: "the connection is bad" is a successful test.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const { provider } = await params;
  if (!isMarketingProvider(provider)) return NextResponse.json({ error: "NOT_FOUND", message: "Aisa koi provider nahi hai." }, { status: 404 });

  const result = await testConnection(provider);
  return NextResponse.json(result);
}
