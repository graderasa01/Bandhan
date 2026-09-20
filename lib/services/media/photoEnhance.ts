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

/* ---------- Manual mode ----------
 *
 * The three presets above are somebody else's taste applied to your face. They
 * are a good first offer and a bad only offer: a preset that lifts a dim photo
 * beautifully blows out a bright one, and the owner is the only person in the
 * loop who can see which happened. So the same `sharp` pipeline is also exposed
 * with the dials turned by hand — the *same* transforms, the same "your pixels,
 * never new ones" guarantee, just the owner choosing the numbers.
 *
 * Deliberately not a second kind of editing: no crop (display already crops
 * non-destructively via `focalY` — see this file's header), no filters, no
 * stickers, no skin smoothing. Light, contrast, colour, grain, sharpness,
 * orientation. Everything a bad phone photo actually suffers from, nothing that
 * makes the person in it someone else.
 */

export interface ManualAdjust {
  /** `sharp.modulate` brightness multiplier. 1 = untouched. */
  brightness: number;
  /** Contrast around mid-grey, applied with `linear()`. 1 = untouched. */
  contrast: number;
  /** `sharp.modulate` saturation multiplier. 1 = untouched, 0 = black & white. */
  saturation: number;
  /** Hue rotation in degrees — the "thanda/garam" dial. 0 = untouched. */
  warmth: number;
  /** Unsharp sigma. 0 = no sharpening. */
  sharpen: number;
  /** A 3x3 median pass before everything else — kills phone-sensor grain. */
  denoise: boolean;
  /** Extra rotation on top of EXIF auto-orient, for a photo that came in sideways. */
  rotate: 0 | 90 | 180 | 270;
}

/**
 * The dials, their range, and the step the slider moves in.
 *
 * Bounds are the honest part of this: a brightness multiplier of 3 does not
 * produce a better photo, it produces a white rectangle. These stop at the
 * point where the result is still a photograph of the person.
 */
export const MANUAL_RANGES = {
  brightness: { min: 0.6, max: 1.6, step: 0.02 },
  contrast: { min: 0.7, max: 1.5, step: 0.02 },
  saturation: { min: 0, max: 1.8, step: 0.02 },
  warmth: { min: -20, max: 20, step: 1 },
  sharpen: { min: 0, max: 2.5, step: 0.1 },
} as const;

/** Every dial at "do nothing" — what the sheet opens on and what Reset returns to. */
export const MANUAL_NEUTRAL: ManualAdjust = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  warmth: 0,
  sharpen: 0,
  denoise: false,
  rotate: 0,
};

function clamp(value: number, { min, max }: { min: number; max: number }): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

/** True when the owner has not actually moved anything — used to refuse a no-op save. */
export function isNeutralAdjust(a: ManualAdjust): boolean {
  return (
    a.brightness === 1 &&
    a.contrast === 1 &&
    a.saturation === 1 &&
    a.warmth === 0 &&
    a.sharpen === 0 &&
    !a.denoise &&
    a.rotate === 0
  );
}

/**
 * The manual pipeline, in the order the operations actually make sense:
 * orient → shrink → denoise → contrast → colour → sharpen.
 *
 * Denoise before contrast and sharpening rather than after, for the same reason
 * the presets above do it: both of those amplify grain, so removing it first is
 * the difference between a cleaner photo and a crunchier one.
 */
function applyManual(source: Buffer, adjust: ManualAdjust, maxPx: number): ReturnType<typeof sharp> {
  let pipeline = sharp(source)
    .rotate() // EXIF auto-orient first, then the owner's own quarter-turns
    .rotate(adjust.rotate)
    .resize({ width: maxPx, height: maxPx, fit: "inside", withoutEnlargement: true });

  if (adjust.denoise) pipeline = pipeline.median(3);

  // `linear(a, b)` is a*x + b on 0-255. Pivoting around mid-grey (128) is what
  // makes this read as contrast rather than as contrast-plus-a-brightness-shift.
  if (adjust.contrast !== 1) {
    pipeline = pipeline.linear(adjust.contrast, 128 * (1 - adjust.contrast));
  }

  if (adjust.brightness !== 1 || adjust.saturation !== 1 || adjust.warmth !== 0) {
    pipeline = pipeline.modulate({
      brightness: adjust.brightness,
      saturation: adjust.saturation,
      hue: adjust.warmth,
    });
  }

  if (adjust.sharpen > 0) pipeline = pipeline.sharpen({ sigma: adjust.sharpen });

  return pipeline;
}

/**
 * Clamps whatever arrived over the wire into something the pipeline can be
 * trusted with. Takes loose numbers rather than `Partial<ManualAdjust>` on
 * purpose — the caller is a request body, so `rotate` is a `number` until this
 * function is the thing that decides it is one of four.
 */
export interface ManualAdjustInput {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  warmth?: number;
  sharpen?: number;
  denoise?: boolean;
  rotate?: number;
}

export function normaliseAdjust(input: ManualAdjustInput | null | undefined): ManualAdjust {
  const raw = input ?? {};
  const rotate = Number(raw.rotate ?? 0);
  return {
    brightness: clamp(Number(raw.brightness ?? 1), MANUAL_RANGES.brightness),
    contrast: clamp(Number(raw.contrast ?? 1), MANUAL_RANGES.contrast),
    saturation: clamp(Number(raw.saturation ?? 1), MANUAL_RANGES.saturation),
    warmth: clamp(Number(raw.warmth ?? 0), MANUAL_RANGES.warmth),
    sharpen: clamp(Number(raw.sharpen ?? 0), MANUAL_RANGES.sharpen),
    denoise: Boolean(raw.denoise),
    rotate: rotate === 90 || rotate === 180 || rotate === 270 ? rotate : 0,
  };
}

/**
 * Preview size, well under `MAX_DIMENSION`.
 *
 * The sheet re-renders this on every settled slider move, so it is the one
 * operation in this file that runs repeatedly — at 700px a full pipeline pass
 * costs a few tens of milliseconds instead of a few hundred, and the difference
 * is invisible in a preview tile on a phone. The *saved* file still renders at
 * full `MAX_DIMENSION`.
 */
const MANUAL_PREVIEW_PX = 700;
const MANUAL_PREVIEW_QUALITY = 78;

/** One in-memory preview of the current dial positions — nothing persisted. */
export async function generateManualPreview(source: Buffer, adjust: ManualAdjust): Promise<string> {
  const buffer = await applyManual(source, adjust, MANUAL_PREVIEW_PX)
    .jpeg({ quality: MANUAL_PREVIEW_QUALITY })
    .toBuffer();
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}

/** The same dials at full size — what actually replaces the file on save. */
export async function renderManualPhoto(source: Buffer, adjust: ManualAdjust): Promise<Buffer> {
  return applyManual(source, adjust, MAX_DIMENSION).jpeg({ quality: JPEG_QUALITY }).toBuffer();
}

/* ---------- "Is this upload soft?" ----------
 *
 * The reel asks a member for their own photo before it will show them anyone
 * else's, and the next thing it offers is the clean-up above. That offer is
 * only worth making when the photo actually needs it — "ye dhundhli lag rahi
 * hai" said about a sharp picture is the app being wrong about something the
 * member can see with their own eyes, which costs more trust than the feature
 * wins.
 *
 * So: Laplacian variance, the standard cheap sharpness estimate. Run the
 * 4-neighbour Laplacian over a small greyscale copy — it responds to edges and
 * to nothing else — and measure how much the result varies. A crisp photo has
 * strong edges and a wide spread; a soft one has almost none. Deterministic,
 * local, no model, a few milliseconds on a phone upload.
 *
 * ## Why the kernel is applied by hand
 *
 * `sharp` has `.convolve()`, and the obvious `.convolve(laplacian).stats()` is
 * wrong twice over: `stats()` reads the *input* image, not the processed
 * pipeline, so the number it returns describes the original (measured: a 4px
 * blur moved the "score" by 7%, which is the JPEG re-encode and nothing else);
 * and `convolve` clamps to 0–255, which throws away every negative edge
 * response. One pass over the raw bytes avoids both.
 *
 * Two honest limits, which the copy has to respect:
 *   • It measures the *frame*, not the face. A sharp background behind a
 *     motion-blurred person can still score well.
 *   • It is measured at `SHARPNESS_SAMPLE_PX`, i.e. roughly the size the reel
 *     actually displays. That is deliberate — a soft-at-full-resolution photo
 *     that looks fine on a phone does not need fixing.
 *
 * Which is why nothing here ever *rejects* a photo. It only decides whether
 * the clean-up is offered as the obvious next step or as a quiet extra.
 */

/** Long edge the estimate runs at — about the size the reel shows a photo. */
const SHARPNESS_SAMPLE_PX = 512;

/**
 * Below this the photo reads as soft.
 *
 * Calibrated against the photos actually sitting in this project's uploads
 * folder rather than picked from a paper. Measured there: real phone portraits
 * score 110-610, the one genuinely poor upload scores 36, and those same files
 * put through even a 1px blur at viewing size score 6-87. 90 sits in the gap —
 * it catches every softened version and clears every real photo.
 *
 * Kept as a named constant so re-calibrating is one edit, not a hunt. Raise it
 * and the clean-up gets offered more loudly to more people; the cost of being
 * wrong is one dismissible suggestion, which is why the bar sits where the
 * evidence is rather than where it would sell the most enhancements.
 */
export const SOFT_PHOTO_THRESHOLD = 90;

export interface PhotoSharpness {
  /** Laplacian variance at the sample size above. Higher is crisper. */
  score: number;
  /** `score < SOFT_PHOTO_THRESHOLD` — the reel uses this to decide how loudly to offer the clean-up. */
  soft: boolean;
}

export async function estimateSharpness(source: Buffer): Promise<PhotoSharpness> {
  try {
    const { data, info } = await sharp(source)
      .rotate()
      // A PNG with transparency has no defined luminance where it is clear;
      // without this the raw buffer carries the alpha channel and every
      // measurement comes back NaN.
      .flatten({ background: "#ffffff" })
      .greyscale()
      .resize({ width: SHARPNESS_SAMPLE_PX, height: SHARPNESS_SAMPLE_PX, fit: "inside", withoutEnlargement: true })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width: w, height: h } = info;
    if (w < 3 || h < 3) return { score: 0, soft: false };

    let sum = 0;
    let sumSq = 0;
    let n = 0;
    for (let y = 1; y < h - 1; y++) {
      const row = y * w;
      for (let x = 1; x < w - 1; x++) {
        const i = row + x;
        const lap = data[i - w] + data[i + w] + data[i - 1] + data[i + 1] - 4 * data[i];
        sum += lap;
        sumSq += lap * lap;
        n++;
      }
    }
    if (n === 0) return { score: 0, soft: false };
    const mean = sum / n;
    const score = Math.max(0, Math.round(sumSq / n - mean * mean));
    return { score, soft: score < SOFT_PHOTO_THRESHOLD };
  } catch {
    // An unreadable or exotic file is not a reason to fail an upload that has
    // already succeeded — "we could not tell" reports as "not soft", so the
    // clean-up is offered quietly rather than pushed.
    return { score: 0, soft: false };
  }
}
