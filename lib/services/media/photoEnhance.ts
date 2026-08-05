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
 * Output keeps the ORIGINAL photo's full frame and aspect ratio — it used to
 * hard-crop to the Reel's own `aspect-[4/3]` (ReelCard.tsx) here, in the
 * file itself, which meant enhancing a portrait upload permanently threw
 * away everything outside that box (the very next `apply` overwrites the
 * only copy — see enhance/apply/route.ts). That fights every display
 * context that already crops non-destructively via CSS `object-cover` +
 * the photo's own `focalY` (PhotoSlideDeck.tsx, SelfPhotoGallery.tsx,
 * ProfilePhoto's grid) — the Reel gets its 4:3 frame at *display* time
 * regardless of the file's real shape, same as an un-enhanced photo does.
 * So "what you pick here is what shows", full-frame, and *where* it's
 * cropped stays adjustable afterwards from Upar/Center/Niche, not baked in.
 */

export const ENHANCE_PRESETS = ["natural", "bright", "warm"] as const;
export type EnhancePreset = (typeof ENHANCE_PRESETS)[number];

export const ENHANCE_PRESET_LABELS: Record<EnhancePreset, string> = {
  natural: "Natural Clean",
  bright: "Bright & Clear",
  warm: "Soft & Warm",
};

// A long-edge cap, not a target shape — `fit: "inside"` only ever shrinks
// (never crops, never upscales past the original), so this just keeps a
// huge upload's enhanced output from ballooning in file size. Exported so
// photoUltraEnhance.ts's generative tier caps to the same bound.
export const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 86;

function basePipeline(source: Buffer): ReturnType<typeof sharp> {
  return sharp(source)
    .rotate() // auto-orient from EXIF
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true });
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
