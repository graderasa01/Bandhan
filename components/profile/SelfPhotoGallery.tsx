"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Camera, CircleAlert, Film, Loader2, Lock, Plus, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/motion";
import Card from "@/components/ui/Card";
import PhotoLightbox from "@/components/profile/PhotoLightbox";
import PhotoEnhanceSheet from "@/components/profile/PhotoEnhanceSheet";
import PhotoPositionControl from "@/components/profile/PhotoPositionControl";
import type { ProfilePhotoSummary, PhotoVerificationStatus } from "@/components/profile/PhotoUploadCard";

const STATUS_LABEL: Record<PhotoVerificationStatus, string> = {
  PENDING: "Review me hai",
  APPROVED: "Verified",
  REJECTED: "Reject hui",
};

const MAX_PHOTOS = 6;
const MAX_SLIDES = 4;
const ACCEPTED = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * The hub-page counterpart to `PhotoUploadCard` — same `/api/profile/me`
 * fetch, but a proper grid (there's room here) instead of list rows.
 *
 * Add, Enhance, and "use in Reel" used to live one tap deeper (a bottom
 * button elsewhere on the page; a sparkle icon buried inside the lightbox;
 * a labeled toggle only in the list view) — all three now sit directly on
 * the grid itself: a dashed "+" tile alongside the photos, and a
 * sparkle/lock/film badge on every thumbnail's corners. The lightbox keeps
 * its own Enhance action too (full-size view before deciding is still
 * useful), this is additive, not a replacement.
 */
export default function SelfPhotoGallery() {
  const [photos, setPhotos] = useState<ProfilePhotoSummary[] | null>(null);
  const [canEnhance, setCanEnhance] = useState(false);
  const [canUltraEnhance, setCanUltraEnhance] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [enhanceTarget, setEnhanceTarget] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [savingSlideId, setSavingSlideId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/profile/me")
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          data: {
            photos?: ProfilePhotoSummary[];
            canPhotoEnhance?: boolean;
            canPhotoUltraEnhance?: boolean;
          } | null,
        ) => {
          if (!active) return;
          setPhotos(data?.photos ?? []);
          setCanEnhance(data?.canPhotoEnhance ?? false);
          setCanUltraEnhance(data?.canPhotoUltraEnhance ?? false);
        },
      )
      .catch(() => {
        if (active) setPhotos([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const upload = useCallback(async (file: File) => {
    setError(null);
    if (file.size > MAX_BYTES) {
      setError("Photo 8MB se badi nahi honi chahiye.");
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/profile/photo", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "Photo upload nahi ho paayi.");
        return;
      }
      haptic("success");
      setPhotos((prev) => [
        ...(prev ?? []),
        {
          id: data.photoId,
          fileUrl: data.fileUrl,
          isPrimary: data.isPrimary,
          verificationStatus: "PENDING",
          note: null,
          slotOrder: null,
          focalY: null,
        },
      ]);
    } catch {
      setError("Network error — dobara try karein.");
    } finally {
      setUploading(false);
    }
  }, []);

  const slideCount = photos?.filter((p) => p.slotOrder != null).length ?? 0;

  const toggleSlide = useCallback(
    async (photoId: string, inReel: boolean) => {
      if (inReel && slideCount >= MAX_SLIDES) {
        setError(`Reel ke liye zyada se zyada ${MAX_SLIDES} photo select ho sakti hain.`);
        return;
      }
      setError(null);
      setSavingSlideId(photoId);
      try {
        const res = await fetch(`/api/profile/photo/${photoId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inReel }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.message ?? "Reel update nahi ho paaya.");
          return;
        }
        haptic("tap");
        // Slot numbers re-compact server-side on removal — simplest correct
        // client update is to refetch rather than re-derive that ordering here.
        const fresh = await fetch("/api/profile/me");
        const freshData = await fresh.json();
        setPhotos(freshData.photos ?? []);
      } catch {
        setError("Network error — dobara try karein.");
      } finally {
        setSavingSlideId(null);
      }
    },
    [slideCount],
  );

  const lightboxPhoto = lightboxIndex !== null ? (photos?.[lightboxIndex] ?? null) : null;
  const atLimit = (photos?.length ?? 0) >= MAX_PHOTOS;

  return (
    <Card padding="lg" className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Camera className="size-4 shrink-0 text-primary-text" />
          <h3 className="text-sm font-semibold text-ink">Meri Photos</h3>
        </div>
        {photos && photos.length > 0 && (
          <span className="text-[0.75rem] text-subtle">
            {photos.length}/{MAX_PHOTOS}
          </span>
        )}
      </div>

      {photos === null ? (
        <div className="flex h-20 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted" />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((p, i) => (
            <div key={p.id} className="relative aspect-square overflow-hidden rounded-md border border-line">
              <button
                type="button"
                onClick={() => setLightboxIndex(i)}
                aria-label="Photo poori tarah dekhein"
                className="absolute inset-0"
              >
                <Image
                  src={p.fileUrl}
                  alt=""
                  fill
                  unoptimized
                  className="object-cover"
                  style={{ objectPosition: `50% ${p.focalY ?? 50}%` }}
                />
              </button>

              {p.isPrimary && (
                <span className="pointer-events-none absolute left-1 top-1 rounded-full bg-gold-500 px-1.5 py-0.5 text-[0.5625rem] font-semibold text-primary-fg shadow-sm">
                  Main
                </span>
              )}
              <span className="pointer-events-none absolute bottom-1 left-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[0.5625rem] font-medium text-white">
                {STATUS_LABEL[p.verificationStatus]}
              </span>

              {/* Enhance, right on the thumbnail — no detour through the
                  lightbox first. Sibling of the open-lightbox button above
                  (not nested inside it), so tapping this corner never also
                  opens the lightbox. */}
              {canEnhance ? (
                <button
                  type="button"
                  onClick={() => {
                    haptic("tap");
                    setEnhanceTarget(p.id);
                  }}
                  aria-label="Photo enhance karein"
                  className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
                >
                  <Sparkles className="size-3.5" />
                </button>
              ) : (
                <Link
                  href="/user/subscription"
                  aria-label="Enhance ke liye upgrade karein"
                  className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/45 text-white/85 backdrop-blur-sm transition-colors hover:bg-black/60"
                >
                  <Lock className="size-3" />
                </Link>
              )}

              {/* Reel selection — only once a photo is verified, same rule
                  PhotoUploadCard's list view already enforces. No icon at
                  all for PENDING/REJECTED photos here rather than a disabled
                  one — the status badge already explains why. */}
              {p.verificationStatus === "APPROVED" && (
                <button
                  type="button"
                  disabled={savingSlideId === p.id}
                  onClick={() => void toggleSlide(p.id, p.slotOrder == null)}
                  aria-label={p.slotOrder != null ? "Reel se hataayein" : "Reel me shamil karein"}
                  aria-pressed={p.slotOrder != null}
                  className={cn(
                    "absolute bottom-1 right-1 grid size-6 place-items-center rounded-full backdrop-blur-sm transition-colors disabled:opacity-60",
                    p.slotOrder != null
                      ? "bg-gold-500 text-primary-fg shadow-sm"
                      : "bg-black/45 text-white/85 hover:bg-black/60",
                  )}
                >
                  {savingSlideId === p.id ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Film className="size-3.5" />
                  )}
                </button>
              )}
            </div>
          ))}

          {!atLimit && (
            <button
              type="button"
              disabled={uploading}
              onClick={() => {
                haptic("tap");
                inputRef.current?.click();
              }}
              aria-label="Photo add karein"
              className={cn(
                "flex aspect-square flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed",
                "border-line-strong text-muted transition-colors",
                "hover:border-gold-500 hover:bg-gold-50 hover:text-ink dark:hover:bg-gold-900/20",
                "disabled:pointer-events-none disabled:opacity-50",
              )}
            >
              {uploading ? <Loader2 className="size-5 animate-spin" /> : <Plus className="size-5" />}
              <span className="text-[0.6875rem] font-medium">Add</span>
            </button>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void upload(file);
        }}
      />

      {error && (
        <p role="alert" className="flex items-start gap-2 text-[0.75rem] leading-snug text-danger">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      )}

      {photos && photos.length > 0 && lightboxIndex !== null && (
        <PhotoLightbox
          photos={photos.map((p) => ({ id: p.id, url: p.fileUrl }))}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
          headerAction={
            canEnhance && lightboxPhoto ? (
              <button
                type="button"
                onClick={() => setEnhanceTarget(lightboxPhoto.id)}
                aria-label="Photo enhance karein"
                className="grid size-9 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              >
                <Sparkles className="size-4" />
              </button>
            ) : undefined
          }
          footerAction={
            lightboxPhoto ? (
              <PhotoPositionControl
                photoId={lightboxPhoto.id}
                focalY={lightboxPhoto.focalY}
                onChanged={(id, focalY) =>
                  setPhotos((prev) => prev?.map((p) => (p.id === id ? { ...p, focalY } : p)) ?? prev)
                }
              />
            ) : undefined
          }
        />
      )}

      <PhotoEnhanceSheet
        open={enhanceTarget !== null}
        onClose={() => setEnhanceTarget(null)}
        photoId={enhanceTarget}
        canUltraEnhance={canUltraEnhance}
        onApplied={(updated) =>
          setPhotos((prev) => prev?.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)) ?? prev)
        }
      />
    </Card>
  );
}
