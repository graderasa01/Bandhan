import "server-only";
import sharp from "sharp";
import { prisma } from "@/lib/db/prisma";
import { callAiImageEdit } from "@/lib/ai/callAiImageEdit";
import { MAX_DIMENSION } from "./photoEnhance";

/**
 * Generative "ultra realistic" relight — Premium-only, separate from
 * `photoEnhance.ts`'s free-ish deterministic tier. Unlike that tier, this
 * calls a real image-generation model (OpenAI or Gemini — see
 * `photoUltraEnhance` in lib/ai/models.ts for why Anthropic/DeepSeek can
 * never do this), so every call costs real money and produces exactly one
 * result, not three free variants to pick from.
 *
 * The prompt is fixed and deliberately narrow — "fix the lighting, change
 * nothing else" — not a free-form field the user can override. A model
 * asked to relight is far less likely to drift facial identity than one
 * asked to "improve" or "beautify" a photo generally, and a fixed prompt is
 * also the only version of this feature that was actually reviewed and
 * agreed on before building it.
 *
 * Composition explicitly stays out of the prompt's hands too ("keep... pose,
 * composition... exactly the same"), and the final resize only caps size —
 * see photoEnhance.ts's doc comment for why neither tier crops to the Reel's
 * shape here anymore.
 */
const ULTRA_ENHANCE_PROMPT =
  "Improve the lighting while keeping everything else exactly the same. Do not change the person, pose, " +
  "expression, background, or composition. Fix issues like back lighting, harsh shadows, underexposure or " +
  "uneven lighting. Transform the original lighting into soft, natural, flattering light coming from slightly " +
  "above eye level and facing the subject, so the face is evenly lit with realistic skin tones. Keep the result " +
  "photorealistic and consistent with the original scene.";

export const ULTRA_ENHANCE_DAILY_LIMIT = 4;

export type UltraEnhanceOutcome = { ok: true; dataUrl: string } | { ok: false; message: string };

/**
 * How many ultra-enhance calls this user has made today — the single source
 * of truth for the daily cap, derived from `AiInteraction` (the same log row
 * `callAiImageEdit` writes) rather than a separate counter table. "Today" is
 * the server's local calendar day, same granularity as the rest of the app's
 * daily limits (reel, AI-ask).
 */
export async function getUltraEnhanceUsageToday(userId: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return prisma.aiInteraction.count({
    where: { userId, feature: "photoUltraEnhance", createdAt: { gte: startOfDay } },
  });
}

/**
 * One generative preview, in-memory only — same "nothing touches disk until
 * the owner picks it" discipline as the deterministic tier's preview step.
 * The source photo is re-oriented (EXIF) and normalised to JPEG before it
 * goes to the AI provider — the two providers' SDKs otherwise need different
 * per-format handling for no real benefit. The AI's own output dimensions
 * are never fully trusted, so a final sharp pass just caps runaway size
 * (`fit: "inside"`, never crops) rather than forcing any particular shape.
 */
export async function generateUltraEnhancePreview(userId: string, source: Buffer): Promise<UltraEnhanceOutcome> {
  const oriented = await sharp(source).rotate().jpeg({ quality: 92 }).toBuffer();

  const result = await callAiImageEdit({
    userId,
    prompt: ULTRA_ENHANCE_PROMPT,
    imageBase64: oriented.toString("base64"),
    mimeType: "image/jpeg",
  });

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  const resized = await sharp(Buffer.from(result.imageBase64, "base64"))
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();

  return { ok: true, dataUrl: `data:image/jpeg;base64,${resized.toString("base64")}` };
}
