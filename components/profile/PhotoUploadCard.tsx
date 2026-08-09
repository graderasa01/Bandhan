"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Camera, CircleAlert, Film, Loader2, Lock, ShieldCheck, Sparkles, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/motion";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import PhotoEnhanceSheet from "@/components/profile/PhotoEnhanceSheet";
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
const NOTE_MAX = 80;

/**
 * Stage 4 (fields.ts) never reaches the voice interview — photos are
 * deliberately excluded from AI extraction (spec hard rule 4) and from the
 * gap engine's queue, which only ever offers `aiExtractable` fields. This is
 * that field's only UI: a plain upload, no AI in the loop at all.
 *
 * Phase 2 (Reel Slides) extended it: up to 6 photos, and the owner picks up
 * to 4 of the *verified* ones plus an 80-char note each — that becomes the
 * tap-through slide reel candidates see. Nothing here writes the note or slot
 * with AI; it's the same "no AI in the loop" rule extended to the words, not
 * just the photo.
 */
export default function PhotoUploadCard({ className }: { className?: string }) {
  const t = useT();
  const STATUS_COPY: Record<PhotoVerificationStatus, { label: string; className: string }> = {
    PENDING: { label: t("profile.photoUpload.status.pending", "Review me hai"), className: "text-warn" },
    APPROVED: { label: t("profile.photoUpload.status.approved", "Verified"), className: "text-trust" },
    REJECTED: { label: t("profile.photoUpload.status.rejected", "Reject hui"), className: "text-danger" },
  };
  const [photos, setPhotos] = useState<ProfilePhotoSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [canEnhance, setCanEnhance] = useState(false);
  const [canUltraEnhance, setCanUltraEnhance] = useState(false);
  const [enhanceTarget, setEnhanceTarget] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
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
          const list = data?.photos ?? [];
          setPhotos(list);
          setDrafts(Object.fromEntries(list.map((p) => [p.id, p.note ?? ""])));
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
      setDrafts((prev) => ({ ...prev, [data.photoId]: "" }));
    } catch {
      setError(t("profile.networkError", "Network error — dobara try karein."));
    } finally {
      setBusy(false);
    }
  }, [t]);

  async function saveNote(photoId: string) {
    const note = (drafts[photoId] ?? "").trim();
    const original = photos?.find((p) => p.id === photoId)?.note ?? "";
    if (note === original) return;

    setSavingId(photoId);
    try {
      const res = await fetch(`/api/profile/photo/${photoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? t("profile.photoUpload.noteSaveFailed", "Note save nahi ho paaya."));
        return;
      }
      setPhotos((prev) => prev?.map((p) => (p.id === photoId ? { ...p, note: note || null } : p)) ?? prev);
    } catch {
      setError(t("profile.networkError", "Network error — dobara try karein."));
    } finally {
      setSavingId(null);
    }
  }

  async function toggleSlide(photoId: string, inReel: boolean) {
    setError(null);
    setSavingId(photoId);
    try {
      const res = await fetch(`/api/profile/photo/${photoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inReel }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? t("profile.photoUpload.reelUpdateFailed", "Reel update nahi ho paaya."));
        return;
      }
      // Slot numbers re-compact server-side on removal — simplest correct
      // client update is to refetch rather than re-derive that ordering here.
      const fresh = await fetch("/api/profile/me");
      const freshData = await fresh.json();
      setPhotos(freshData.photos ?? []);
      haptic("tap");
    } catch {
      setError(t("profile.networkError", "Network error — dobara try karein."));
    } finally {
      setSavingId(null);
    }
  }

  const hasPhoto = (photos?.length ?? 0) > 0;
  const slideCount = photos?.filter((p) => p.slotOrder != null).length ?? 0;
  const atPhotoLimit = (photos?.length ?? 0) >= MAX_PHOTOS;

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
      ) : (
        hasPhoto && (
          <div className="space-y-3">
            {photos.map((p, i) => {
              const status = STATUS_COPY[p.verificationStatus];
              const inReel = p.slotOrder != null;
              const canJoinReel = p.verificationStatus === "APPROVED";
              const draft = drafts[p.id] ?? "";

              return (
                <div key={p.id} className="flex gap-3 rounded-md border border-line p-3">
                  <button
                    type="button"
                    onClick={() => setLightboxIndex(i)}
                    aria-label={t("profile.photoUpload.viewFullPhoto", "View Full Photo")}
                    className="relative shrink-0"
                  >
                    <Image
                      src={p.fileUrl}
                      alt=""
                      width={72}
                      height={72}
                      unoptimized
                      className="size-[72px] rounded-md border border-line object-cover"
                      style={{ objectPosition: `50% ${p.focalY ?? 50}%` }}
                    />
                    {p.isPrimary && (
                      <span className="absolute -left-1.5 -top-1.5 rounded-full bg-gold-500 px-1.5 py-0.5 text-[0.5625rem] font-semibold text-primary-fg shadow-sm">
                        {t("profile.photoUpload.main", "Main")}
                      </span>
                    )}
                  </button>

                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("text-[0.75rem] font-medium", status.className)}>{status.label}</span>
                      {inReel && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gold-100 px-2 py-0.5 text-[0.6875rem] font-medium text-gold-800 dark:bg-gold-900/40 dark:text-gold-200">
                          <Film className="size-3" />
                          {t("profile.photoUpload.slide", "Slide {n}").replace("{n}", String(p.slotOrder))}
                        </span>
                      )}
                    </div>

                    <div>
                      <textarea
                        value={draft}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [p.id]: e.target.value.slice(0, NOTE_MAX) }))}
                        onBlur={() => void saveNote(p.id)}
                        rows={1}
                        placeholder={t("profile.photoUpload.notePlaceholder", "Is photo ke baare me ek baat (optional)")}
                        className="w-full resize-none rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-[0.8125rem] outline-none focus:border-gold-500"
                      />
                      <p className="mt-0.5 text-right text-[0.6875rem] text-subtle">
                        {draft.length}/{NOTE_MAX}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {canJoinReel ? (
                        <button
                          type="button"
                          disabled={savingId === p.id || (!inReel && slideCount >= MAX_SLIDES)}
                          onClick={() => toggleSlide(p.id, !inReel)}
                          className={cn(
                            "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-[0.75rem] font-medium transition-colors disabled:opacity-40",
                            inReel
                              ? "border-gold-400 bg-gold-50 text-gold-800 hover:bg-gold-100 dark:border-gold-600/40 dark:bg-gold-900/30 dark:text-gold-200"
                              : "border-line-strong text-muted hover:border-gold-400 hover:text-ink",
                          )}
                        >
                          {savingId === p.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Film className="size-3.5" />
                          )}
                          {inReel
                            ? t("profile.photoUpload.removeFromReel", "Reel se hataayein")
                            : t("profile.photoUpload.addToReel", "Add to Reel")}
                        </button>
                      ) : (
                        <p className="flex items-center gap-1.5 text-[0.6875rem] text-subtle">
                          <Lock className="size-3 shrink-0" />
                          {t("profile.photoUpload.verifyFirst", "Verify hone ke baad reel me shamil kar sakte hain")}
                        </p>
                      )}

                      {canEnhance ? (
                        <button
                          type="button"
                          onClick={() => {
                            haptic("tap");
                            setEnhanceTarget(p.id);
                          }}
                          className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-line-strong px-3 text-[0.75rem] font-medium text-muted transition-colors hover:border-gold-400 hover:text-ink"
                        >
                          <Sparkles className="size-3.5" />
                          {t("profile.photoUpload.enhance", "Enhance")}
                        </button>
                      ) : (
                        <Link
                          href="/user/subscription"
                          className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-line-strong px-3 text-[0.75rem] font-medium text-subtle transition-colors hover:border-gold-400 hover:text-ink"
                        >
                          <Lock className="size-3" />
                          {t("profile.photoUpload.enhanceLocked", "Enhance (Standard+)")}
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
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

      {lightboxIndex !== null && photos && (
        <PhotoLightbox
          photos={photos.map((p) => ({ id: p.id, url: p.fileUrl }))}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
          footerAction={
            photos[lightboxIndex] ? (
              <PhotoPositionControl
                photoId={photos[lightboxIndex].id}
                focalY={photos[lightboxIndex].focalY}
                onChanged={(id, focalY) =>
                  setPhotos((prev) => prev?.map((p) => (p.id === id ? { ...p, focalY } : p)) ?? prev)
                }
              />
            ) : undefined
          }
        />
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

      <Button
        variant="secondary"
        fullWidth
        disabled={busy || atPhotoLimit}
        onClick={() => {
          haptic("tap");
          inputRef.current?.click();
        }}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        {atPhotoLimit
          ? t("profile.photoUpload.atLimit", "Zyada se zyada {max} photo").replace("{max}", String(MAX_PHOTOS))
          : hasPhoto
            ? t("profile.photoUpload.addAnother", "Add Another Photo")
            : t("profile.photoUpload.addPhoto", "Add Photo")}
      </Button>

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
    </Card>
  );
}
