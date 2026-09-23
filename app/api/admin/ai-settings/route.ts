import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { applyProviderSwitch } from "@/lib/ai/aiConfigService";

export const runtime = "nodejs";

/**
 * Bulk provider switch. The sibling `[feature]` route tunes one call; this one
 * exists for the day a provider's credit runs out and every feature has to
 * move at once — see lib/ai/providerSwitch.ts for what "at once" is allowed to
 * mean.
 *
 * POST rather than PATCH on purpose: this is not an edit to a named resource,
 * it is an action applied across the whole collection.
 */
const PostSchema = z.object({
  provider: z.enum(["ANTHROPIC", "OPENAI", "GEMINI", "DEEPSEEK"]),
  mode: z.enum(["tier", "spread"]),
});

export async function POST(req: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = PostSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Provider ya mode valid nahi hai." },
      { status: 422 },
    );
  }

  const result = await applyProviderSwitch({
    provider: parsed.data.provider,
    mode: parsed.data.mode,
    actorId: user.id,
    actorRole: user.role,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    provider: result.provider,
    appliedCount: result.applied.length,
    modelsUsed: result.modelsUsed,
    skipped: result.skipped,
  });
}
