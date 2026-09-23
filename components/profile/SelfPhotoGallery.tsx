"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Camera, CircleAlert, Film, ImagePlus, Loader2, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/motion";
import Card from "@/components/ui/Card";
import PhotoLightbox from "@/components/profile/PhotoLightbox";
import PhotoEnhanceSheet from "@/components/profile/PhotoEnhanceSheet";
import PhotoActionSheet from "@/components/profile/PhotoActionSheet";
import PhotoPositionControl from "@/components/profile/PhotoPositionControl";
import type { ProfilePhotoSummary, PhotoVerificationStatus } from "@/components/profile/PhotoUploadCard";
import { useT } from "@/components/i18n/LanguageProvider";

const MAX_PHOTOS = 6;
const MAX_SLIDES = 4;
const ACCEPTED = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * The hub-page photo manager — "Meri Photos" on `/user/profile/me`.
 *
 * ## Why the tiles got big and the icons went away
 *
 * This used to be a 3-across grid of square thumbnails with three ~24px
 * controls stacked in their corners: a sparkle for enhance, a film badge for
 * the reel, a lock where the plan said no. On a 375px phone each tile was
 * ~104px and each control was a sixth of it, so half the taps opened the
 * lightbox by accident — and the grid still had no room for the two actions
 * that were missing entirely (make main, remove).
 *
 * So the tile is now one target that does one thing: tap it and every action
 * for that photo opens as a list (`PhotoActionSheet`). The tiles themselves
 * are portrait, not square, because every place a photo actually appears — the
 * reel card, the profile header — is portrait; a square thumbnail was
 * showing the owner a crop nobody else ever sees.
 *
 * Adding is a tile of the same size, in the same grid, rather than a button
 * somewhere below it: "add another photo" is the same kind of act as "open
 * that photo", and on an empty profile it becomes the whole card.
 */
export default function SelfPhotoGallery() {
  const t = useT();
  const STATUS_LABEL: Record<PhotoVerificationStatus, string> = {
    PENDING: t("profile.selfGallery.status.pending", "Review me hai"),
    APPROVED: t("profile.selfGallery.status.approved", "Verified"),
    REJECTED: t("profile.selfGallery.status.rejected", "Reject hui"),
  };
  const [photos, setPhotos] = useState<ProfilePhotoSummary[] | null>(null);
  const [canUltraEnhance, setCanUltraEnhance] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [enhanceTarget, setEnhanceTarget] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/profile/me");
    if (!res.ok) return;
    const data = await res.json();
    setPhotos(data.photos ?? []);
    setCanUltraEnhance(data.canPhotoUltraEnhance ?? false);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/profile/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { photos?: ProfilePhotoSummary[]; canPhotoUltraEnhance?: boolean } | null) => {
        if (!active) return;
        setPhotos(data?.photos ?? []);
        setCanUltraEnhance(data?.canPhotoUltraEnhance ?? false);
      })
      .catch(() => {
        if (active) setPhotos([]);
      });
    return () => {
      active = false;
    };
  }, []);

  /**
   * One or many files from a single pick. They go up one after another (the
   * route checks the 6-photo cap per request, so a parallel burst could race
   * past it), and anything beyond the free slots is skipped with a line
   * saying so rather than failing half-way.
   */
  const upload = useCallback(
    async (picked: File[]) => {
      setError(null);
      const room = MAX_PHOTOS - (photos?.length ?? 0);
      const files = picked.slice(0, Math.max(0, room));
      const skippedForLimit = picked.length - files.length;
      if (files.length === 0) {
        setError(t("profile.selfGallery.limitReached", "Zyada se zyada {max} photo laga sakte hain — pehle koi photo hataayein.").replace("{max}", String(MAX_PHOTOS)));
        return;
      }
      setUploading(true);
      const added: string[] = [];
      let failure: string | null = null;
      try {
        for (const file of files) {
          if (file.size > MAX_BYTES) {
            failure = t("profile.selfGallery.tooLarge", "Photo 8MB se badi nahi honi chahiye.");
            continue;
          }
          const body = new FormData();
          body.append("file", file);
          const res = await fetch("/api/profile/photo", { method: "POST", body });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            failure = data.message ?? t("profile.selfGallery.uploadFailed", "Photo upload nahi ho paayi.");
            if (res.status === 422 && data.error === "LIMIT_REACHED") break;
            continue;
          }
          added.push(data.photoId);
        }
      } catch {
        failure = t("profile.networkError", "Network error — dobara try karein.");
      } finally {
        setUploading(false);
      }
      if (added.length > 0) {
        haptic("success");
        // Server decides primary + reel slot, so read them back instead of guessing.
        await refresh();
        // One fresh photo: open its options straight away. Several: the grid
        // itself is the summary, a sheet for only the last one would be arbitrary.
        if (added.length === 1) setActionTarget(added[0]);
      }
      if (skippedForLimit > 0) {
        failure = t("profile.selfGallery.someSkipped", "{n} photo nahi lagi — zyada se zyada {max} photo ho sakti hain.")
          .replace("{n}", String(skippedForLimit))
          .replace("{max}", String(MAX_PHOTOS));
      }
      if (failure) setError(failure);
    },
    [photos?.length, refresh, t],
  );

  const slideCount = photos?.filter((p) => p.slotOrder != null).length ?? 0;
  const atLimit = (photos?.length ?? 0) >= MAX_PHOTOS;
  const lightboxPhoto = lightboxIndex !== null ? (photos?.[lightboxIndex] ?? null) : null;
  const actionPhoto = photos?.find((p) => p.id === actionTarget) ?? null;
  const hasPhoto = (photos?.length ?? 0) > 0;

  function pickFile() {
    haptic("tap");
    inputRef.current?.click();
  }

  return (
    <Card padding="lg" className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Camera className="size-4 shrink-0 text-primary-text" />
          <h3 className="text-sm font-semibold text-ink">{t("profile.selfGallery.title", "Meri Photos")}</h3>
        </div>
        {hasPhoto && (
          <span className="text-[0.75rem] text-subtle">
            {photos?.length}/{MAX_PHOTOS}
          </span>
        )}
      </div>

      {photos === null ? (
        <div className="flex h-20 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted" />
        </div>
      ) : !hasPhoto ? (
        /* Nothing uploaded yet — the card is the ask, not a grid with one
           dashed square in the corner of it. */
        <button
          type="button"
          disabled={uploading}
          onClick={pickFile}
          className={cn(
            // Same satin material as every other pane, with the seal carrying
            // the action — a dashed outline would be a second visual language
            // invented for one button.
            "glass-surface glass-card--soft flex w-full flex-col items-center justify-center gap-2 px-4 py-8 text-center [--surface-radius:20px]",
            "disabled:pointer-events-none disabled:opacity-50",
          )}
        >
          <span className="glass-seal grid size-12 place-items-center text-white">
            {uploading ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
          </span>
          <span className="text-[0.9375rem] font-semibold text-ink">
            {t("profile.selfGallery.addPhoto", "Add Photo")}
          </span>
          <span className="text-[0.75rem] leading-snug text-subtle">
            {t("profile.selfGallery.formats", "Ek saath kai photo chun sakte hain · JPG, PNG ya WEBP · 8MB tak")}
          </span>
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                haptic("tap");
                setActionTarget(p.id);
              }}
              aria-label={t("profile.photoActions.title", "Photo Options")}
              className="glass-surface glass-card--soft group relative aspect-[3/4] overflow-hidden [--surface-radius:18px]"
            >
              <Image
                src={p.fileUrl}
                alt=""
                fill
                unoptimized
                className="object-cover"
                style={{ objectPosition: `50% ${p.focalY ?? 50}%` }}
              />

              {/* One wash at the bottom so both the status line and the badges
                  stay readable over a bright photo. */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent"
              />

              {p.isPrimary && (
                <span className="pointer-events-none absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-gold-500 px-1.5 py-0.5 text-[0.5625rem] font-semibold text-primary-fg shadow-sm">
                  <Star className="size-2.5" aria-hidden />
                  {t("profile.selfGallery.main", "Main")}
                </span>
              )}

              {p.slotOrder != null && (
                <span className="glass-surface glass-chip pointer-events-none absolute right-1.5 top-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 text-[0.5625rem] font-semibold text-white">
                  <Film className="size-2.5" aria-hidden />
                  {p.slotOrder}
                </span>
              )}

              <span
                className={cn(
                  "pointer-events-none absolute inset-x-1.5 bottom-1.5 truncate text-[0.6875rem] font-medium",
                  p.verificationStatus === "APPROVED"
                    ? "text-white"
                    : p.verificationStatus === "REJECTED"
                      ? "text-rose-200"
                      : "text-amber-100",
                )}
              >
                {STATUS_LABEL[p.verificationStatus]}
              </span>

              <span className="sr-only">{i + 1}</span>
            </button>
          ))}

          {!atLimit && (
            <button
              type="button"
              disabled={uploading}
              onClick={pickFile}
              className={cn(
                "glass-surface glass-card--soft flex aspect-[3/4] flex-col items-center justify-center gap-1.5 px-2 text-center [--surface-radius:18px]",
                "text-muted disabled:pointer-events-none disabled:opacity-50",
              )}
            >
              {uploading ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
              <span className="text-[0.75rem] font-semibold leading-tight">
                {t("profile.selfGallery.add", "Add")}
              </span>
            </button>
          )}
        </div>
      )}

      {hasPhoto && (
        <p className="flex items-start gap-2 text-[0.75rem] leading-snug text-subtle">
          <Film className="mt-0.5 size-3.5 shrink-0 text-primary-text" aria-hidden />
          {slideCount > 0
            ? t("profile.selfGallery.reelSummary", "Reel me {n}/{max} photo chuni hain — kisi bhi photo par tap karke badlein.")
                .replace("{n}", String(slideCount))
                .replace("{max}", String(MAX_SLIDES))
            : t(
                "profile.selfGallery.reelEmpty",
                "Reel ke liye abhi koi photo nahi chuni — verified photo par tap karke “Add to Reel” karein.",
              )}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        multiple
        className="sr-only"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length > 0) void upload(files);
        }}
      />

      {error && (
        <p role="alert" className="flex items-start gap-2 text-[0.75rem] leading-snug text-danger">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      )}

      <PhotoActionSheet
        open={actionTarget !== null}
        onClose={() => setActionTarget(null)}
        photo={actionPhoto}
        slideCount={slideCount}
        onStudio={(photoId) => {
          setActionTarget(null);
          setEnhanceTarget(photoId);
        }}
        onLightbox={(photoId) => {
          const index = photos?.findIndex((p) => p.id === photoId) ?? -1;
          if (index < 0) return;
          setActionTarget(null);
          setLightboxIndex(index);
        }}
        onRefresh={refresh}
        onFocalChanged={(id, focalY) =>
          setPhotos((prev) => prev?.map((p) => (p.id === id ? { ...p, focalY } : p)) ?? prev)
        }
      />

      {photos && photos.length > 0 && lightboxIndex !== null && (
        <PhotoLightbox
          photos={photos.map((p) => ({ id: p.id, url: p.fileUrl }))}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
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
        photoUrl={photos?.find((p) => p.id === enhanceTarget)?.fileUrl ?? null}
        canUltraEnhance={canUltraEnhance}
        onApplied={(updated) =>
          setPhotos((prev) => prev?.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)) ?? prev)
        }
      />
    </Card>
  );
}
