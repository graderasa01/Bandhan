import "server-only";
import sharp from "sharp";

/**
 * Deterministic photo clean-up for the Reel — brightness/contrast/sharpen/
 * denoise via `sharp` only, never a generative model. The output is always a
 * transform of the exact pixels the user uploaded, never new pixels invented
 * by a model (the whole point Devesh was firm about: "koi bhi fake na ho") —
 * which also means it can never make someone look like a different person
 * than the one whose photo goes through Photo Verification.
 *
 * Output is cropped to the Rishta Reel's own display ratio (`aspect-[4/3]` in
 * `ReelCard.tsx`) using sharp's "attention" crop strategy — it favours the
 * region with the most skin-tone/saturation/detail, which in practice means
 * it keeps a face in frame during the ratio change far better than a plain
 * centre-crop, without needing an actual face-detection model. So "what you
 * pick here is what shows on your Reel", not a differently-shaped photo that
 * gets cropped again, differently, later.
 */

export const ENHANCE_PRESETS = ["natural", "bright", "warm"] as const;
export type EnhancePreset = (typeof ENHANCE_PRESETS)[number];

export const ENHANCE_PRESET_LABELS: Record<EnhancePreset, string> = {
  natural: "Natural Clean",
  bright: "Bright & Clear",
  warm: "Soft & Warm",
};

// Matches ReelCard.tsx's photo frame exactly (`aspect-[4/3]`) — see that
// file's own comment for why a person's card photo is landscape, not portrait.
// Exported so photoUltraEnhance.ts's generative tier crops to the exact same
// contract — every enhance path ends at the size the Reel actually displays.
export const OUTPUT_WIDTH = 1200;
export const OUTPUT_HEIGHT = 900;
const JPEG_QUALITY = 86;

function basePipeline(source: Buffer): ReturnType<typeof sharp> {
  return sharp(source)
    .rotate() // auto-orient from EXIF *before* the attention-crop reads pixel positions
    .resize({ width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT, fit: "cover", position: sharp.strategy.attention });
}

function applyPreset(pipeline: ReturnType<typeof sharp>, preset: EnhancePreset): ReturnType<typeof sharp> {
  switch (preset) {
    case "natural":
      // Auto-levels + a light sharpen — the "just clean up what's already there" option.
      // `median(3)` runs first (same as `warm` below) so the sharpen step enhances real
      // edges, not sensor grain — sharpening straight over noise used to make it more
      // visible, not less.
      return pipeline.median(3).normalise().modulate({ saturation: 1.06 }).sharpen({ sigma: 0.8 });
    case "bright":
      // For dim/backlit uploads — stronger exposure lift, sharpened harder to counter the
      // softness brightening exposes. Denoise matters most here: lifting exposure on a dim
      // photo amplifies whatever sensor noise was sitting in the shadows.
      return pipeline.median(3).normalise().modulate({ brightness: 1.12, saturation: 1.04 }).sharpen({ sigma: 1.1 });
    case "warm":
      // A mild denoise (median) before sharpening softens grain instead of amplifying it, plus a warm hue nudge.
      return pipeline.median(3).modulate({ brightness: 1.05, saturation: 1.1, hue: 4 }).sharpen({ sigma: 0.6 });
  }
}

async function renderPreset(source: Buffer, preset: EnhancePreset): Promise<Buffer> {
  return applyPreset(basePipeline(source), preset).jpeg({ quality: JPEG_QUALITY }).toBuffer();
}

export interface EnhancePreview {
  preset: EnhancePreset;
  label: string;
  dataUrl: string;
}

/**
 * All three variants, in-memory only — nothing touches disk until the owner
 * actually picks one via `renderEnhancedPhoto` + `photoStorage.upload()`.
 * Keeps the "generate 3, throw away 2" cost at zero storage, not just zero
 * API spend.
 */
export async function generateEnhancePreviews(source: Buffer): Promise<EnhancePreview[]> {
  return Promise.all(
    ENHANCE_PRESETS.map(async (preset) => ({
      preset,
      label: ENHANCE_PRESET_LABELS[preset],
      dataUrl: `data:image/jpeg;base64,${(await renderPreset(source, preset)).toString("base64")}`,
    })),
  );
}

/** Re-runs the same pure preset function for the one preset the owner chose — cheap enough that caching the preview buffers isn't worth the complexity. */
export async function renderEnhancedPhoto(source: Buffer, preset: EnhancePreset): Promise<Buffer> {
  return renderPreset(source, preset);
}
