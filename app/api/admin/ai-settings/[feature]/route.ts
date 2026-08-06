import { NextResponse } from "next/server";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { updateAiRoute } from "@/lib/ai/aiConfigService";
import { AI_MODEL_DEFAULTS, type AiFeatureKey } from "@/lib/ai/models";

export const runtime = "nodejs";

const PatchSchema = z.object({
  provider: z.enum(["ANTHROPIC", "OPENAI", "GEMINI", "DEEPSEEK"]),
  model: z.string().min(1),
});

const VALID_FEATURES = Object.keys(AI_MODEL_DEFAULTS) as AiFeatureKey[];

export async function PATCH(req: Request, { params }: { params: Promise<{ feature: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const { feature } = await params;
  if (!VALID_FEATURES.includes(feature as AiFeatureKey)) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Aisa koi AI feature nahi hai." }, { status: 404 });
  }

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = PatchSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Provider ya model valid nahi hai." },
      { status: 422 },
    );
  }

  const result = await updateAiRoute({
    feature: feature as AiFeatureKey,
    provider: parsed.data.provider,
    model: parsed.data.model,
    actorId: user.id,
    actorRole: user.role,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
