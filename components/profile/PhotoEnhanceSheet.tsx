"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, Loader2, Lock, RotateCw, Sparkles, SlidersHorizontal, Undo2, Wand2 } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { haptic } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { ProfilePhotoSummary } from "@/components/profile/PhotoUploadCard";
import { useT } from "@/components/i18n/LanguageProvider";

interface EnhanceVariant {
  preset: "natural" | "bright" | "warm";
  label: string;
  dataUrl: string;
}

/** Which single option (of the 3 free presets, or the 1 generative Ultra result) is picked right now. */
type Selection = { kind: "preset"; preset: EnhanceVariant["preset"] } | { kind: "ultra" } | null;

type Mode = "manual" | "ai";

/** Mirrors `ManualAdjust` in lib/services/media/photoEnhance.ts — the server clamps, this is just what the sliders hold. */
interface Adjust {
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
  sharpen: number;
  denoise: boolean;
  rotate: 0 | 90 | 180 | 270;
}

const NEUTRAL: Adjust = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  warmth: 0,
  sharpen: 0,
  denoise: false,
  rotate: 0,
};

function isNeutral(a: Adjust): boolean {
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
 * How long the sliders sit still before the server is asked for the real thing.
 *
 * Every settled move costs one `sharp` render, so this is the difference
 * between ~4 renders and ~40 while a thumb crosses a slider. Short enough that
 * letting go feels like it committed.
 */
const PREVIEW_DEBOUNCE_MS = 380;

/**
 * Two ways to fix a photo, deliberately kept apart.
 *
 * ## Manual
 *
 * The owner's own dials — light, contrast, colour, warmth, sharpness, grain,
 * orientation — run through the exact same `sharp` pipeline the presets use.
 * It exists because a preset is somebody else's taste applied to your face: the
 * one that rescues a dim photo blows out a bright one, and the owner is the
 * only person here who can see which happened.
 *
 * The preview is honest about what it is. While a slider is moving, the
 * *original* photo is shown with a CSS filter that approximates the dials —
 * instant, but only an approximation (CSS cannot sharpen or denoise). The
 * moment the dials settle, the server renders the real pipeline and that
 * replaces it. So what is on screen when you press Save is what Save writes.
 *
 * ## AI
 *
 * Unchanged in substance: three deterministic presets generated on open, plus
 * the generative "Ultra Realistic" relight underneath. Neither tier is
 * plan-gated any more (see `PHOTO_STUDIO_UNGATED` in entitlements.ts) — Ultra
 * still carries its own per-day cap, enforced server-side.
 *
 * Nothing in either mode invents pixels except Ultra, which says so in its own
 * words. The face is never redrawn, which is the whole reason an edited photo
 * can still carry a Photo Verified badge.
 */
export default function PhotoEnhanceSheet({
  open,
  onClose,
  photoId,
  photoUrl,
  canUltraEnhance,
  onApplied,
}: {
  open: boolean;
  onClose: () => void;
  photoId: string | null;
  /** The stored original — the base the manual preview filters on top of. Manual mode is hidden without it. */
  photoUrl?: string | null;
  canUltraEnhance: boolean;
  onApplied: (photo: ProfilePhotoSummary) => void;
}) {
  const t = useT();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("manual");
  const [variants, setVariants] = useState<EnhanceVariant[] | null>(null);
  const [selected, setSelected] = useState<Selection>(null);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const [ultraDataUrl, setUltraDataUrl] = useState<string | null>(null);
  const [ultraLoading, setUltraLoading] = useState(false);
  const [ultraError, setUltraError] = useState<string | null>(null);

  const [adjust, setAdjust] = useState<Adjust>(NEUTRAL);
  const [manualPreview, setManualPreview] = useState<{ key: string; dataUrl: string } | null>(null);
  const [manualRendering, setManualRendering] = useState(false);

  const adjustKey = useMemo(() => JSON.stringify(adjust), [adjust]);
  const manualTouched = !isNeutral(adjust);
  const previewFresh = manualPreview?.key === adjustKey;

  useEffect(() => {
    if (!open) return;
    setMode("manual");
    setVariants(null);
    setSelected(null);
    setError(null);
    setUltraDataUrl(null);
    setUltraLoading(false);
    setUltraError(null);
    setAdjust(NEUTRAL);
    setManualPreview(null);
    setManualRendering(false);
  }, [open, photoId]);

  // The three presets are generated once, the first time the AI tab is opened —
  // not on mount. Manual is the landing tab, and rendering three variants for
  // someone who never switches is work nobody asked for.
  useEffect(() => {
    if (!open || !photoId || mode !== "ai" || variants) return;
    let active = true;
    fetch(`/api/profile/photo/${photoId}/enhance`, { method: "POST" })
      .then(async (r) => {
        const data = await r.json();
        if (!active) return;
        if (!r.ok || !data.ok) {
          setError(data.message ?? t("profile.photoEnhance.loadFailed", "Photo enhance nahi ho paayi."));
          return;
        }
        setVariants(data.variants);
      })
      .catch(() => {
        if (active) setError(t("profile.networkError", "Network error — dobara try karein."));
      });
    return () => {
      active = false;
    };
    // `t` intentionally excluded: this POST kicks off real enhancement work,
    // and re-running it whenever the language toggle flips would re-trigger
    // that request instead of just refreshing copy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, photoId, mode, variants]);

  // Real render of whatever the dials currently say, once they stop moving.
  const latestKey = useRef(adjustKey);
  latestKey.current = adjustKey;
  useEffect(() => {
    if (!open || !photoId || mode !== "manual" || !manualTouched) return;
    if (manualPreview?.key === adjustKey) return;
    const timer = setTimeout(async () => {
      setManualRendering(true);
      try {
        const res = await fetch(`/api/profile/photo/${photoId}/manual`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(adjust),
        });
        const data = await res.json();
        // A slower render that lands after the dials moved again would put a
        // stale image under a fresh set of numbers — drop it.
        if (latestKey.current !== adjustKey) return;
        if (!res.ok || !data.ok) {
          setError(data.message ?? t("profile.photoEnhance.loadFailed", "Photo enhance nahi ho paayi."));
          return;
        }
        setManualPreview({ key: adjustKey, dataUrl: data.dataUrl });
        setError(null);
      } catch {
        setError(t("profile.networkError", "Network error — dobara try karein."));
      } finally {
        if (latestKey.current === adjustKey) setManualRendering(false);
      }
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, photoId, mode, adjustKey, manualTouched]);

  const setDial = useCallback(<K extends keyof Adjust>(key: K, value: Adjust[K]) => {
    setAdjust((prev) => ({ ...prev, [key]: value }));
  }, []);

  async function generateUltra() {
    if (!photoId) return;
    haptic("tap");
    setUltraLoading(true);
    setUltraError(null);
    try {
      const res = await fetch(`/api/profile/photo/${photoId}/ultra-enhance`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setUltraError(data.message ?? t("profile.photoEnhance.ultraFailed", "Ultra enhance nahi ho paaya."));
        return;
      }
      setUltraDataUrl(data.dataUrl);
      setSelected({ kind: "ultra" });
    } catch {
      setUltraError(t("profile.networkError", "Network error — dobara try karein."));
    } finally {
      setUltraLoading(false);
    }
  }

  async function apply() {
    if (!photoId) return;
    if (mode === "manual" ? !manualTouched : !selected) return;
    setApplying(true);
    try {
      const res =
        mode === "manual"
          ? await fetch(`/api/profile/photo/${photoId}/manual/apply`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(adjust),
            })
          : selected?.kind === "preset"
            ? await fetch(`/api/profile/photo/${photoId}/enhance/apply`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ preset: selected.preset }),
              })
            : await fetch(`/api/profile/photo/${photoId}/ultra-enhance/apply`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ dataUrl: ultraDataUrl }),
              });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message ?? t("profile.photoEnhance.saveFailed", "Save nahi ho paaya."));
        return;
      }
      haptic("success");
      toast({
        title: t("profile.photoEnhance.appliedTitle", "Photo enhance ho gayi"),
        description: data.resetForReview
          ? t("profile.photoEnhance.appliedResetForReview", "Naya version dobara review ke liye chala gaya hai.")
          : undefined,
        tone: "success",
      });
      onApplied(data.photo);
      onClose();
    } catch {
      setError(t("profile.networkError", "Network error — dobara try karein."));
    } finally {
      setApplying(false);
    }
  }

  const canSave = mode === "manual" ? manualTouched : Boolean(selected);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      variant="bottom"
      title={t("profile.photoEnhance.title", "Photo Studio")}
      description={t(
        "profile.photoEnhance.description",
        "Aapki asli photo hi hai, bas saaf aur clear — koi naya chehra AI se nahi banaya jaata.",
      )}
      footer={
        <Button variant="primary" fullWidth disabled={!canSave} loading={applying} onClick={apply}>
          {mode === "manual"
            ? t("profile.photoEnhance.saveManual", "Save Photo")
            : t("profile.photoEnhance.useThisOne", "Use This One")}
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Two tools, one row — the split the whole sheet is built around.
            `glass-control` for the rail and `glass-chip` for the two buttons:
            the app's own material vocabulary (globals.css, "THE GLASS MATERIAL
            SYSTEM"), so this sheet is made of the same satin as every other
            surface rather than a second, private set of colours. The selected
            state is drawn from `aria-pressed` alone — that is how `.glass-chip`
            is defined, which keeps what is announced and what is seen in step. */}
        <div className="glass-surface glass-control grid grid-cols-2 gap-1 p-1">
          {(
            [
              { id: "manual" as const, icon: SlidersHorizontal, label: t("profile.photoEnhance.tabManual", "Manual") },
              { id: "ai" as const, icon: Wand2, label: t("profile.photoEnhance.tabAi", "AI") },
            ]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                haptic("tap");
                setError(null);
                setMode(tab.id);
              }}
              aria-pressed={mode === tab.id}
              className="glass-surface glass-chip inline-flex min-h-9 items-center justify-center gap-1.5 text-[0.8125rem] font-semibold"
            >
              <tab.icon className="size-3.5 shrink-0" aria-hidden />
              {tab.label}
            </button>
          ))}
        </div>

        {mode === "manual" ? (
          photoUrl ? (
            <ManualPanel
              photoUrl={photoUrl}
              adjust={adjust}
              setDial={setDial}
              onReset={() => {
                haptic("tap");
                setAdjust(NEUTRAL);
                setManualPreview(null);
              }}
              previewDataUrl={previewFresh ? manualPreview!.dataUrl : null}
              rendering={manualRendering}
              touched={manualTouched}
            />
          ) : (
            <p className="py-6 text-center text-[0.875rem] text-muted">
              {t("profile.photoEnhance.manualUnavailable", "Ye photo manual mode me nahi khul paayi — AI tab try karein.")}
            </p>
          )
        ) : !variants && !error ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
            <Loader2 className="size-6 animate-spin text-gold-600" />
            <p className="text-[0.8125rem] text-muted">
              {t("profile.photoEnhance.loading", "Photo enhance ho rahi hai…")}
            </p>
          </div>
        ) : (
          variants && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {variants.map((v) => (
                  <button
                    key={v.preset}
                    type="button"
                    onClick={() => {
                      haptic("tap");
                      setSelected({ kind: "preset", preset: v.preset });
                    }}
                    aria-pressed={selected?.kind === "preset" && selected.preset === v.preset}
                    className={cn(
                      "glass-surface glass-card--soft overflow-hidden text-left [--surface-radius:16px]",
                      selected?.kind === "preset" && selected.preset === v.preset && "glass-card--active",
                    )}
                  >
                    <div className="relative aspect-[4/3]">
                      {/* eslint-disable-next-line @next/next/no-img-element -- in-memory data: URI preview, not a build-known or remote asset */}
                      <img src={v.dataUrl} alt={v.label} className="size-full object-cover" />
                      {selected?.kind === "preset" && selected.preset === v.preset && (
                        <span className="glass-seal absolute right-1.5 top-1.5 grid size-6 place-items-center text-white">
                          <Check className="size-3.5" />
                        </span>
                      )}
                    </div>
                    <p className="truncate px-2 py-1.5 text-[0.75rem] font-medium text-ink">{v.label}</p>
                  </button>
                ))}
              </div>

              <div className="glass-divide pt-4">
                <p className="gold-label mb-2">
                  <Sparkles className="size-3.5" />
                  {t("profile.photoEnhance.ultraStudio", "Ultra Realistic — AI Studio")}
                </p>

                {/* Normally open to everyone (`PHOTO_STUDIO_UNGATED`); this
                    branch is what the screen falls back to if that switch is
                    ever turned off again, so the upsell stays honest either
                    way rather than being deleted and re-invented. */}
                {!canUltraEnhance ? (
                  <Link
                    href="/user/subscription"
                    className="glass-surface glass-card--soft flex items-center gap-3 px-3 py-2.5 text-[0.8125rem] text-muted [--surface-radius:16px]"
                  >
                    <Lock className="size-4 shrink-0" />
                    {t("profile.photoEnhance.ultraUpsellPass", "AI se lighting perfect karwaein — Rishta Pass me")}
                  </Link>
                ) : ultraDataUrl ? (
                  <button
                    type="button"
                    onClick={() => {
                      haptic("tap");
                      setSelected({ kind: "ultra" });
                    }}
                    aria-pressed={selected?.kind === "ultra"}
                    className={cn(
                      "glass-surface glass-card--soft w-full max-w-[10rem] overflow-hidden text-left [--surface-radius:16px]",
                      selected?.kind === "ultra" && "glass-card--active",
                    )}
                  >
                    <div className="relative aspect-[4/3]">
                      {/* eslint-disable-next-line @next/next/no-img-element -- in-memory data: URI preview */}
                      <img
                        src={ultraDataUrl}
                        alt={t("profile.photoEnhance.ultraRealistic", "Ultra Realistic")}
                        className="size-full object-cover"
                      />
                      {selected?.kind === "ultra" && (
                        <span className="glass-seal absolute right-1.5 top-1.5 grid size-6 place-items-center text-white">
                          <Check className="size-3.5" />
                        </span>
                      )}
                    </div>
                    <p className="truncate px-2 py-1.5 text-[0.75rem] font-medium text-ink">
                      {t("profile.photoEnhance.ultraRealistic", "Ultra Realistic")}
                    </p>
                  </button>
                ) : (
                  <>
                    <p className="mb-2 text-[0.8125rem] leading-snug text-muted">
                      {t(
                        "profile.photoEnhance.ultraBody",
                        "Roshni AI se dobara set hoti hai — thoda time lagta hai, aur din me ginti ke baar hi ho sakta hai.",
                      )}
                    </p>
                    <Button variant="secondary" size="sm" loading={ultraLoading} onClick={generateUltra}>
                      <Sparkles className="size-3.5" />
                      {t("profile.photoEnhance.generateUltra", "Ultra Realistic Banayein")}
                    </Button>
                  </>
                )}

                {ultraError && <p className="mt-2 text-[0.8125rem] text-danger">{ultraError}</p>}
              </div>
            </div>
          )
        )}

        {error && (
          <p role="alert" className="text-[0.8125rem] text-danger">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}

/* ---------- Manual panel ---------- */

/**
 * CSS approximation of the server pipeline, used only while the dials are
 * moving. `brightness`/`contrast`/`saturate`/`hue-rotate` line up closely
 * enough with `sharp`'s `modulate`/`linear` to steer by; sharpen and denoise
 * have no CSS equivalent at all, which is exactly why the real render replaces
 * this the moment the sliders settle.
 */
function cssApprox(a: Adjust): string {
  return `brightness(${a.brightness}) contrast(${a.contrast}) saturate(${a.saturation}) hue-rotate(${a.warmth}deg)`;
}

function ManualPanel({
  photoUrl,
  adjust,
  setDial,
  onReset,
  previewDataUrl,
  rendering,
  touched,
}: {
  photoUrl: string;
  adjust: Adjust;
  setDial: <K extends keyof Adjust>(key: K, value: Adjust[K]) => void;
  onReset: () => void;
  /** The server's exact render, present only when it matches the current dials. */
  previewDataUrl: string | null;
  rendering: boolean;
  touched: boolean;
}) {
  const t = useT();

  const dials: {
    key: "brightness" | "contrast" | "saturation" | "warmth" | "sharpen";
    label: string;
    min: number;
    max: number;
    step: number;
    /** Where "unchanged" sits, so the reading can show a signed delta. */
    neutral: number;
  }[] = [
    { key: "brightness", label: t("profile.photoEnhance.dialBrightness", "Roshni"), min: 0.6, max: 1.6, step: 0.02, neutral: 1 },
    { key: "contrast", label: t("profile.photoEnhance.dialContrast", "Contrast"), min: 0.7, max: 1.5, step: 0.02, neutral: 1 },
    { key: "saturation", label: t("profile.photoEnhance.dialSaturation", "Rang"), min: 0, max: 1.8, step: 0.02, neutral: 1 },
    { key: "warmth", label: t("profile.photoEnhance.dialWarmth", "Garmaahat"), min: -20, max: 20, step: 1, neutral: 0 },
    { key: "sharpen", label: t("profile.photoEnhance.dialSharpen", "Sharpness"), min: 0, max: 2.5, step: 0.1, neutral: 0 },
  ];

  return (
    <div className="space-y-4">
      <div className="glass-surface glass-card--soft relative mx-auto aspect-[4/5] w-full max-w-[16rem] overflow-hidden [--surface-radius:20px]">
        {previewDataUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element -- in-memory data: URI preview */
          <img src={previewDataUrl} alt="" className="size-full object-cover" />
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element -- filtered live preview of a stored photo, not a build-known asset */
          <img
            src={photoUrl}
            alt=""
            className="size-full object-cover transition-transform"
            style={{ filter: cssApprox(adjust), transform: `rotate(${adjust.rotate}deg)` }}
          />
        )}

        {rendering && (
          <span className="glass-seal absolute right-2 top-2 grid size-7 place-items-center text-white">
            <Loader2 className="size-4 animate-spin" />
          </span>
        )}

        {/* Quarter-turns and Reset sit on the preview itself rather than in the
            slider list — they act on the picture, not on a value. */}
        <div className="absolute bottom-2 left-2 flex gap-1.5">
          <button
            type="button"
            onClick={() => {
              haptic("tap");
              setDial("rotate", (((adjust.rotate + 90) % 360) as Adjust["rotate"]));
            }}
            aria-label={t("profile.photoEnhance.rotate", "Rotate")}
            className="glass-seal grid size-8 place-items-center text-white"
          >
            <RotateCw className="size-4" />
          </button>
          {touched && (
            <button
              type="button"
              onClick={onReset}
              aria-label={t("profile.photoEnhance.reset", "Reset")}
              className="glass-seal grid size-8 place-items-center text-white"
            >
              <Undo2 className="size-4" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {dials.map((dial) => {
          const value = adjust[dial.key];
          const moved = value !== dial.neutral;
          return (
            <label key={dial.key} className="block">
              <span className="mb-1 flex items-center justify-between text-[0.8125rem] font-medium text-ink">
                {dial.label}
                <span className={cn("tabular-nums text-[0.75rem]", moved ? "text-gold" : "text-subtle")}>
                  {dial.key === "warmth"
                    ? `${value > 0 ? "+" : ""}${Math.round(value)}`
                    : dial.key === "sharpen"
                      ? value.toFixed(1)
                      : `${Math.round((value - 1) * 100) > 0 ? "+" : ""}${Math.round((value - 1) * 100)}`}
                </span>
              </span>
              <input
                type="range"
                min={dial.min}
                max={dial.max}
                step={dial.step}
                value={value}
                onChange={(e) => setDial(dial.key, Number(e.target.value))}
                // Inline rather than an `accent-[…]` utility: Tailwind v4
                // silently drops some arbitrary values that wrap a custom
                // property, and a slider that quietly reverts to the browser's
                // blue is exactly the kind of drift this theme pass is fixing.
                style={{ accentColor: "var(--accent-primary, #851a30)" }}
                className="h-6 w-full cursor-pointer"
              />
            </label>
          );
        })}

        <button
          type="button"
          onClick={() => {
            haptic("tap");
            setDial("denoise", !adjust.denoise);
          }}
          aria-pressed={adjust.denoise}
          className="glass-surface glass-chip inline-flex min-h-9 items-center gap-1.5 px-3 text-[0.8125rem] font-medium"
        >
          <Sparkles className="size-3.5 shrink-0" aria-hidden />
          {t("profile.photoEnhance.denoise", "Grain kam karein")}
        </button>
      </div>

      <p className="text-[0.75rem] leading-snug text-subtle">
        {t(
          "profile.photoEnhance.manualNote",
          "Sliders chhodte hi asli preview ban jaata hai — jo dikh raha hai, wahi save hoga.",
        )}
      </p>
    </div>
  );
}
