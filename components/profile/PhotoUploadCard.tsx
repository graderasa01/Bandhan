"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Camera, CircleAlert, Film, ImagePlus, Loader2, ShieldCheck, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/motion";
import Card from "@/components/ui/Card";
import PhotoEnhanceSheet from "@/components/profile/PhotoEnhanceSheet";
import PhotoActionSheet from "@/components/profile/PhotoActionSheet";
import PhotoLightbox from "@/components/profile/PhotoLightbox";
import PhotoPositionControl from "@/components/profile/PhotoPositionControl";
import { useT } from "@/components/i18n/LanguageProvider";

export type PhotoVerificationStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface ProfilePhotoSummary {
  id: string;
  fileUrl: string;
  isPrimary: boolean;
  verificationStatus: PhotoVerificationStatus;
  note: string | null;
  slotOrder: number | null;
  focalY: number | null;
}

const ACCEPTED = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_PHOTOS = 6;
const MAX_SLIDES = 4;

/**
 * Stage 4 (fields.ts) never reaches the voice interview — photos are
 * deliberately excluded from AI extraction (spec hard rule 4) and from the
 * gap engine's queue, which only ever offers `aiExtractable` fields. This is
 * that field's only UI inside the profile deck: a plain upload, no AI in the
 * loop at all deciding *what* goes up.
 *
 * Phase 2 (Reel Slides) extended it: up to 6 photos, and the owner picks up
 * to 4 of the *verified* ones plus an 80-char note each — that becomes the
 * tap-through slide reel candidates see. Nothing here writes the note or slot
 * with AI; it's the same "no AI in the loop" rule extended to the words, not
 * just the photo.
 *
 * The layout is now the same grid + `PhotoActionSheet` the hub page uses
 * (`SelfPhotoGallery`). It used to be a stack of list rows, each carrying an
 * always-open note textarea and two pill buttons — which meant the *editing*
 * UI for six photos was taller than the rest of the profile deck put together,
 * and the note for a photo that was not even in the reel got the same space as
 * the photo itself. Same actions, same service, one screenful instead of six.
 */
export default function PhotoUploadCard({ className }: { className?: string }) {
  const t = useT();
  const STATUS_LABEL: Record<PhotoVerificationStatus, string> = {
    PENDING: t("profile.photoUpload.status.pending", "Review me hai"),
    APPROVED: t("profile.photoUpload.status.approved", "Verified"),
    REJECTED: t("profile.photoUpload.status.rejected", "Reject hui"),
  };
  const [photos, setPhotos] = useState<ProfilePhotoSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canUltraEnhance, setCanUltraEnhance] = useState(false);
  const [enhanceTarget, setEnhanceTarget] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
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

  const upload = useCallback(
    async (file: File) => {
      setError(null);
      if (file.size > MAX_BYTES) {
        setError(t("profile.photoUpload.tooLarge", "Photo 8MB se badi nahi honi chahiye."));
        return;
      }
      setBusy(true);
      try {
        const body = new FormData();
        body.append("file", file);
        const res = await fetch("/api/profile/photo", { method: "POST", body });
        const data = await res.json();
        if (!res.ok) {
          setError(data.message ?? t("profile.photoUpload.uploadFailed", "Photo upload nahi ho paayi."));
          return;
        }
        haptic("success");
        const added: ProfilePhotoSummary = {
          id: data.photoId,
          fileUrl: data.fileUrl,
          isPrimary: data.isPrimary,
          verificationStatus: data.verificationStatus ?? "PENDING",
          note: null,
          slotOrder: null,
          focalY: null,
        };
        setPhotos((prev) => [...(prev ?? []), added]);
        setActionTarget(added.id);
      } catch {
        setError(t("profile.networkError", "Network error — dobara try karein."));
      } finally {
        setBusy(false);
      }
    },
    [t],
  );

  const hasPhoto = (photos?.length ?? 0) > 0;
  const slideCount = photos?.filter((p) => p.slotOrder != null).length ?? 0;
  const atPhotoLimit = (photos?.length ?? 0) >= MAX_PHOTOS;
  const actionPhoto = photos?.find((p) => p.id === actionTarget) ?? null;
  const lightboxPhoto = lightboxIndex !== null ? (photos?.[lightboxIndex] ?? null) : null;

  function pickFile() {
    haptic("tap");
    inputRef.current?.click();
  }

  return (
    <Card padding="lg" className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Camera className="size-4 shrink-0 text-primary-text" />
          <h3 className="text-sm font-semibold text-ink">{t("profile.photoUpload.title", "Profile Photos")}</h3>
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
        <button
          type="button"
          disabled={busy}
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
            {busy ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
          </span>
          <span className="text-[0.9375rem] font-semibold text-ink">
            {t("profile.photoUpload.addPhoto", "Add Photo")}
          </span>
          <span className="text-[0.75rem] leading-snug text-subtle">
            {t("profile.photoUpload.formats", "JPG, PNG ya WEBP · 8MB tak")}
          </span>
        </button>
      ) : (
        <div className="grid grid-cols-3 gap-2.5">
          {photos.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                haptic("tap");
                setActionTarget(p.id);
              }}
              aria-label={t("profile.photoActions.title", "Photo Options")}
              className="glass-surface glass-card--soft relative aspect-[3/4] overflow-hidden [--surface-radius:18px]"
            >
              <Image
                src={p.fileUrl}
                alt=""
                fill
                unoptimized
                className="object-cover"
                style={{ objectPosition: `50% ${p.focalY ?? 50}%` }}
              />
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent"
              />
              {p.isPrimary && (
                <span className="pointer-events-none absolute left-1 top-1 inline-flex items-center gap-0.5 rounded-full bg-gold-500 px-1.5 py-0.5 text-[0.5625rem] font-semibold text-primary-fg shadow-sm">
                  <Star className="size-2.5" aria-hidden />
                  {t("profile.photoUpload.main", "Main")}
                </span>
              )}
              {p.slotOrder != null && (
                <span className="glass-surface glass-chip pointer-events-none absolute right-1 top-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[0.5625rem] font-semibold text-white">
                  <Film className="size-2.5" aria-hidden />
                  {p.slotOrder}
                </span>
              )}
              <span
                className={cn(
                  "pointer-events-none absolute inset-x-1 bottom-1 truncate text-[0.625rem] font-medium",
                  p.verificationStatus === "APPROVED"
                    ? "text-white"
                    : p.verificationStatus === "REJECTED"
                      ? "text-rose-200"
                      : "text-amber-100",
                )}
              >
                {STATUS_LABEL[p.verificationStatus]}
              </span>
            </button>
          ))}

          {!atPhotoLimit && (
            <button
              type="button"
              disabled={busy}
              onClick={pickFile}
              className={cn(
                "glass-surface glass-card--soft flex aspect-[3/4] flex-col items-center justify-center gap-1.5 px-2 text-center [--surface-radius:18px]",
                "text-muted disabled:pointer-events-none disabled:opacity-50",
              )}
            >
              {busy ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
              <span className="text-[0.75rem] font-semibold leading-tight">
                {t("profile.photoUpload.add", "Add")}
              </span>
            </button>
          )}
        </div>
      )}

      {hasPhoto && (
        <p className="flex items-start gap-2 text-[0.75rem] leading-snug text-subtle">
          <Film className="mt-0.5 size-3.5 shrink-0 text-primary-text" aria-hidden />
          {t("profile.photoUpload.reelSummary", "Reel me {n}/{max} photo chuni hain — kisi photo par tap karke options.")
            .replace("{n}", String(slideCount))
            .replace("{max}", String(MAX_SLIDES))}
        </p>
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
        <p role="alert" className="flex items-start gap-2 text-[0.8125rem] leading-snug text-danger">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      )}

      <p className="flex items-start gap-2 text-[0.75rem] leading-snug text-subtle">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-trust" />
        {t(
          "profile.photoUpload.privacyNote",
          "Aap control karte hain kise dikhe — photo tabhi kisi ko dikhti hai jab rishta pakka ho jaaye. Verify hone tak “Review me hai” dikhega. Reel ke liye {max} tak photo chuni ja sakti hain.",
        ).replace("{max}", String(MAX_SLIDES))}
      </p>

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

      {lightboxIndex !== null && photos && (
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
    </Card>
  );
}
