"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/motion";
import { useT } from "@/components/i18n/LanguageProvider";

const OPTIONS = [
  { label: "Upar", focalY: 15 },
  { label: "Center", focalY: 50 },
  { label: "Niche", focalY: 85 },
] as const;

/**
 * Every thumbnail and Reel card in this app crops with `object-cover`, which
 * defaults to a center crop — fine for a landscape shot, but a portrait photo
 * with the face above center gets its head cut off on a wide frame. This is
 * the owner-facing control for that: pick which third of the photo stays in
 * frame. Lives inside `PhotoLightbox`'s footer slot, so it's styled for a
 * dark backdrop (same `bg-white/10` language as the lightbox's own buttons).
 */
export default function PhotoPositionControl({
  photoId,
  focalY,
  onChanged,
  tone = "dark",
}: {
  photoId: string;
  focalY: number | null;
  onChanged: (photoId: string, focalY: number) => void;
  /** `dark` is the lightbox's over-the-photo styling; `light` is for a normal sheet or card. */
  tone?: "dark" | "light";
}) {
  const t = useT();
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = focalY ?? 50;

  async function pick(value: number) {
    if (value === current || saving !== null) return;
    setError(null);
    setSaving(value);
    try {
      const res = await fetch(`/api/profile/photo/${photoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ focalY: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? t("profile.photoPosition.saveFailed", "Position save nahi ho paayi."));
        return;
      }
      haptic("tap");
      onChanged(photoId, value);
    } catch {
      setError(t("profile.networkError", "Network error — dobara try karein."));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={cn(
          "inline-flex items-center gap-1 rounded-full p-1",
          // Dark = over the photo in the lightbox; light = on a normal pane,
          // where the app's own glass rail is the right container.
          tone === "dark" ? "bg-white/10" : "glass-surface glass-control",
        )}
      >
        {OPTIONS.map((opt) => {
          const active = current === opt.focalY;
          return (
            <button
              key={opt.label}
              type="button"
              disabled={saving !== null}
              onClick={() => pick(opt.focalY)}
              aria-pressed={active}
              className={cn(
                "min-h-8 rounded-full px-3 text-[0.75rem] font-medium transition-colors disabled:opacity-60",
                tone === "dark"
                  ? active
                    ? "bg-white text-black"
                    : "text-white/80 hover:bg-white/10"
                  : // `.glass-chip` draws its own selected state from
                    // `aria-pressed`, so the accent here is the app's, not a
                    // second one invented for this control.
                    "glass-surface glass-chip",
              )}
            >
              {t(`profile.photoPosition.${opt.focalY}`, opt.label)}
            </button>
          );
        })}
      </div>
      {error && <p className="text-[0.6875rem] text-danger">{error}</p>}
    </div>
  );
}
