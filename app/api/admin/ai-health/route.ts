import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getAiHealthOverview, probeAll, probeModel } from "@/lib/ai/probe";
import { registeredModel } from "@/lib/ai/registry";

export const runtime = "nodejs";

/**
 * The truth about every AI model — what /admin/ai-settings shows next to each
 * dropdown.
 *
 *   GET   last observed state of every registered model (from real member calls
 *         and earlier probes), each feature's fallback chain as the router
 *         would take it *right now*, the fallback policy, and DeepSeek's
 *         balance. Calls no model.
 *   POST  { provider, model } probes one model; { provider } one provider;
 *         {} every registered model. Each probe is a real 16-token call — on
 *         Gemini's free tier it spends one request of that model's daily
 *         allowance, which is why this is a button and not a page load.
 *
 * Admin-only. Nothing here returns a key; provider messages are redacted
 * (lib/ai/errors.ts `redactProviderMessage`).
 */
export async function GET() {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  return NextResponse.json({ ok: true, overview: await getAiHealthOverview() });
}

const PostSchema = z
  .object({
    provider: z.enum(["ANTHROPIC", "OPENAI", "GEMINI", "DEEPSEEK"]).optional(),
    model: z.string().min(1).max(80).optional(),
  })
  .refine((b) => !b.model || b.provider, { message: "Model ke saath provider bhi chahiye." });

export async function POST(req: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;
  const parsed = PostSchema.safeParse(jsonResult.body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Request valid nahi hai." },
      { status: 422 },
    );
  }

  const { provider, model } = parsed.data;
  if (provider && model && !registeredModel(provider, model)) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Ye model registry me nahi hai." }, { status: 404 });
  }

  const results = provider && model ? [await probeModel(provider, model)] : await probeAll(provider);
  return NextResponse.json({ ok: true, results, overview: await getAiHealthOverview() });
}
