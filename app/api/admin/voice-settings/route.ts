import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { updateVoiceSettings } from "@/lib/speech/voiceConfig";

export const runtime = "nodejs";

/**
 * Sibling of `/api/admin/ai-settings/[feature]`, and not a variant of it: text
 * routing is per-feature (thirteen rows, one PATCH each) while voice is a
 * single deployment-wide choice, so this takes the whole settings object at
 * once. Splitting it into per-field PATCHes would let a save land with STT on
 * one vendor and the voice name belonging to the other.
 */
const PatchSchema = z.object({
  sttProvider: z.enum(["SARVAM", "GEMINI"]),
  ttsProvider: z.enum(["SARVAM", "GEMINI"]),
  sarvamVoice: z.string().min(1),
  geminiVoice: z.string().min(1),
});

export async function PATCH(req: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = PatchSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Voice setting valid nahi hai." },
      { status: 422 },
    );
  }

  const result = await updateVoiceSettings({
    ...parsed.data,
    actorId: user.id,
    actorRole: user.role,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
