import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { isCredentialProvider } from "@/lib/ai/credentials";
import { testProviderKey } from "@/lib/ai/credentialTest";

export const runtime = "nodejs";
/** A real upstream round trip — well past the default edge-ish budget on a slow provider. */
export const maxDuration = 30;

/**
 * Probes the configured key against the provider. POST rather than GET because
 * it costs a (tiny) real API call and must never be triggered by a prefetch.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const { provider } = await params;
  if (!isCredentialProvider(provider)) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Aisa koi provider nahi hai." }, { status: 404 });
  }

  const result = await testProviderKey(provider);
  // 200 either way: "the key is bad" is a successful test, not a failed
  // request, and the UI needs the message in both cases.
  return NextResponse.json(result);
}
