import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { clearProviderKey, isCredentialProvider, setProviderKey } from "@/lib/ai/credentials";

export const runtime = "nodejs";

/**
 * Set or clear one provider's API key.
 *
 * There is deliberately **no GET for a single key**. The list endpoint returns
 * only a masked hint; nothing in this app ever sends a stored key back to a
 * browser, not even to an admin — a page that could display it is a page that
 * can leak it (screenshare, screenshot, an over-broad session).
 */

const PutSchema = z.object({
  apiKey: z.string().trim().min(8, "Key bahut chhoti lag rahi hai — poori key paste karein."),
});

export async function PUT(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const { provider } = await params;
  if (!isCredentialProvider(provider)) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Aisa koi provider nahi hai." }, { status: 404 });
  }

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = PutSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Key valid nahi hai." },
      { status: 422 },
    );
  }

  const result = await setProviderKey({
    provider,
    apiKey: parsed.data.apiKey,
    actorId: user.id,
    actorRole: user.role,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const { provider } = await params;
  if (!isCredentialProvider(provider)) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Aisa koi provider nahi hai." }, { status: 404 });
  }

  const result = await clearProviderKey({ provider, actorId: user.id, actorRole: user.role });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
