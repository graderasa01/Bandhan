import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { isMarketingProvider } from "@/lib/contracts/marketingAi";
import { disconnectProvider, saveConnectionSettings } from "@/lib/services/marketing/connectionService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PutSchema = z
  .object({
    accountRef: z.string().trim().max(200).nullable(),
    accountLabel: z.string().trim().max(120).nullable().optional(),
    settings: z.record(z.string(), z.string().max(200)).optional(),
  })
  .strict();

/**
 * Non-secret connection settings: the account reference and provider
 * options. Secrets never come through here — Google grants arrive via the
 * OAuth callback, Meta/Ads tokens via /api/admin/provider-keys.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const { provider } = await params;
  if (!isMarketingProvider(provider)) return NextResponse.json({ error: "NOT_FOUND", message: "Aisa koi provider nahi hai." }, { status: 404 });

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;
  const parsed = PutSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Input valid nahi hai." }, { status: 422 });
  }

  const result = await saveConnectionSettings({
    provider,
    accountRef: parsed.data.accountRef,
    accountLabel: parsed.data.accountLabel ?? null,
    settings: parsed.data.settings,
    actorId: user.id,
    actorRole: user.role,
  });
  if (!result.ok) return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  return NextResponse.json({ ok: true });
}

/** Revokes and forgets the Google grant (or clears Meta's row state). The account reference stays. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const { provider } = await params;
  if (!isMarketingProvider(provider)) return NextResponse.json({ error: "NOT_FOUND", message: "Aisa koi provider nahi hai." }, { status: 404 });

  const result = await disconnectProvider({ provider, actorId: user.id, actorRole: user.role });
  if (!result.ok) return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  return NextResponse.json({ ok: true });
}
