"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Loader2, Lock, Sparkles } from "lucide-react";
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

/**
 * Real enhancement only — brightness/sharpen/denoise on the owner's own
 * pixels (`lib/services/media/photoEnhance.ts`), never a generative redraw.
 * The three previews are generated fresh every time this opens and thrown
 * away the moment it closes without a pick; only the one the owner chooses
 * ever gets written to disk (`/enhance/apply`).
 *
 * A second, separate tier — "Ultra Realistic" — sits below the free grid:
 * Premium-only, on-demand (never auto-generated on open, since unlike the
 * three free presets it's a real, billed AI call), capped at 4/day
 * server-side. Kept visually and functionally distinct from the free tier
 * rather than folded into the same grid, since it needs its own
 * generate-then-pick step and its own locked-CTA state.
 */
export default function PhotoEnhanceSheet({
  open,
  onClose,
  photoId,
  canUltraEnhance,
  onApplied,
}: {
  open: boolean;
  onClose: () => void;
  photoId: string | null;
  canUltraEnhance: boolean;
  onApplied: (photo: ProfilePhotoSummary) => void;
}) {
  const t = useT();
  const { toast } = useToast();
  const [variants, setVariants] = useState<EnhanceVariant[] | null>(null);
  const [selected, setSelected] = useState<Selection>(null);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const [ultraDataUrl, setUltraDataUrl] = useState<string | null>(null);
  const [ultraLoading, setUltraLoading] = useState(false);
  const [ultraError, setUltraError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !photoId) return;
    setVariants(null);
    setSelected(null);
    setError(null);
    setUltraDataUrl(null);
    setUltraLoading(false);
    setUltraError(null);
    fetch(`/api/profile/photo/${photoId}/enhance`, { method: "POST" })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok || !data.ok) {
          setError(data.message ?? t("profile.photoEnhance.loadFailed", "Photo enhance nahi ho paayi."));
          return;
        }
        setVariants(data.variants);
      })
      .catch(() => setError(t("profile.networkError", "Network error — dobara try karein.")));
    // `t` intentionally excluded: this POST kicks off real enhancement work,
    // and re-running it whenever the language toggle flips would re-trigger
    // that request instead of just refreshing copy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, photoId]);

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
    if (!photoId || !selected) return;
    setApplying(true);
    try {
      const res =
        selected.kind === "preset"
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

  return (
    <Sheet
      open={open}
      onClose={onClose}
      variant="bottom"
      title={t("profile.photoEnhance.title", "Photo Enhance Karein")}
      description={t(
        "profile.photoEnhance.description",
        "Aapki asli photo hi hai, bas saaf aur clear — koi naya chehra AI se nahi banaya jaata.",
      )}
      footer={
        variants && (
          <Button variant="primary" fullWidth disabled={!selected} loading={applying} onClick={apply}>
            {t("profile.photoEnhance.useThisOne", "Use This One")}
          </Button>
        )
      }
    >
      {!variants && !error ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
          <Loader2 className="size-6 animate-spin text-gold-600" />
          <p className="text-[0.8125rem] text-muted">
            {t("profile.photoEnhance.loading", "Photo enhance ho rahi hai…")}
          </p>
        </div>
      ) : error ? (
        <p className="py-6 text-center text-[0.875rem] text-danger">{error}</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {variants!.map((v) => (
              <button
                key={v.preset}
                type="button"
                onClick={() => {
                  haptic("tap");
                  setSelected({ kind: "preset", preset: v.preset });
                }}
                className={cn(
                  "overflow-hidden rounded-lg border-2 text-left transition-colors",
                  selected?.kind === "preset" && selected.preset === v.preset
                    ? "border-gold-500"
                    : "border-line hover:border-gold-300",
                )}
              >
                <div className="relative aspect-[4/3] bg-bg-subtle">
                  {/* eslint-disable-next-line @next/next/no-img-element -- in-memory data: URI preview, not a build-known or remote asset */}
                  <img src={v.dataUrl} alt={v.label} className="size-full object-cover" />
                  {selected?.kind === "preset" && selected.preset === v.preset && (
                    <span className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-gold-500 text-primary-fg shadow-sm">
                      <Check className="size-3.5" />
                    </span>
                  )}
                </div>
                <p className="truncate px-2 py-1.5 text-[0.75rem] font-medium text-ink">{v.label}</p>
              </button>
            ))}
          </div>

          <div className="border-t border-line pt-4">
            <p className="mb-2 flex items-center gap-1.5 text-[0.75rem] font-semibold uppercase tracking-wider text-subtle">
              <Sparkles className="size-3.5 text-gold-600" />
              {t("profile.photoEnhance.ultraStudio", "Ultra Realistic — AI Studio")}
            </p>

            {!canUltraEnhance ? (
              <Link
                href="/user/subscription"
                className="flex items-center gap-3 rounded-lg border border-line-strong bg-bg-subtle px-3 py-2.5 text-[0.8125rem] text-muted transition-colors hover:border-gold-400 hover:text-ink"
              >
                <Lock className="size-4 shrink-0" />
                {t("profile.photoEnhance.ultraUpsell", "AI se lighting perfect karwaein — sirf Premium plan me")}
              </Link>
            ) : ultraDataUrl ? (
              <button
                type="button"
                onClick={() => {
                  haptic("tap");
                  setSelected({ kind: "ultra" });
                }}
                className={cn(
                  "w-full max-w-[10rem] overflow-hidden rounded-lg border-2 text-left transition-colors",
                  selected?.kind === "ultra" ? "border-gold-500" : "border-line hover:border-gold-300",
                )}
              >
                <div className="relative aspect-[4/3] bg-bg-subtle">
                  {/* eslint-disable-next-line @next/next/no-img-element -- in-memory data: URI preview */}
                  <img
                    src={ultraDataUrl}
                    alt={t("profile.photoEnhance.ultraRealistic", "Ultra Realistic")}
                    className="size-full object-cover"
                  />
                  {selected?.kind === "ultra" && (
                    <span className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-gold-500 text-primary-fg shadow-sm">
                      <Check className="size-3.5" />
                    </span>
                  )}
                </div>
                <p className="truncate px-2 py-1.5 text-[0.75rem] font-medium text-ink">
                  {t("profile.photoEnhance.ultraRealistic", "Ultra Realistic")}
                </p>
              </button>
            ) : (
              <Button variant="secondary" size="sm" loading={ultraLoading} onClick={generateUltra}>
                <Sparkles className="size-3.5" />
                {t("profile.photoEnhance.generateUltra", "Ultra Realistic Banayein")}
              </Button>
            )}

            {ultraError && <p className="mt-2 text-[0.8125rem] text-danger">{ultraError}</p>}
          </div>
        </div>
      )}
    </Sheet>
  );
}
