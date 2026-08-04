"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Camera, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
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

/**
 * The hub-page counterpart to `PhotoUploadCard` — same `/api/profile/me`
 * fetch, but a proper grid (there's room here) instead of list rows, and
 * every photo the owner has, not just the ones a stranger would ever see.
 * Click-through-lightbox is the fix for "puri tarah se open nahi kar pata";
 * Enhance lives in the lightbox's header so the grid itself stays clean.
 */
export default function SelfPhotoGallery() {
  const [photos, setPhotos] = useState<ProfilePhotoSummary[] | null>(null);
  const [canEnhance, setCanEnhance] = useState(false);
  const [canUltraEnhance, setCanUltraEnhance] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [enhanceTarget, setEnhanceTarget] = useState<string | null>(null);

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

  const lightboxPhoto = lightboxIndex !== null ? (photos?.[lightboxIndex] ?? null) : null;

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
      ) : photos.length === 0 ? (
        <p className="text-[0.8125rem] text-muted">Abhi koi photo upload nahi hui hai.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setLightboxIndex(i)}
              aria-label="Photo poori tarah dekhein"
              className="relative aspect-square overflow-hidden rounded-md border border-line"
            >
              <Image
                src={p.fileUrl}
                alt=""
                fill
                unoptimized
                className="object-cover"
                style={{ objectPosition: `50% ${p.focalY ?? 50}%` }}
              />
              {p.isPrimary && (
                <span className="absolute left-1 top-1 rounded-full bg-gold-500 px-1.5 py-0.5 text-[0.5625rem] font-semibold text-primary-fg shadow-sm">
                  Main
                </span>
              )}
              <span
                className={cn(
                  "absolute bottom-1 right-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[0.5625rem] font-medium text-white",
                )}
              >
                {STATUS_LABEL[p.verificationStatus]}
              </span>
            </button>
          ))}
        </div>
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
