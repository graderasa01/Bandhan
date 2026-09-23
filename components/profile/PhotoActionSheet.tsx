"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  ArrowLeftRight,
  Crop,
  Film,
  Loader2,
  Maximize2,
  MessageSquareQuote,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import PhotoPositionControl from "@/components/profile/PhotoPositionControl";
import type { ProfilePhotoSummary } from "@/components/profile/PhotoUploadCard";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/motion";
import { useT } from "@/components/i18n/LanguageProvider";

const MAX_SLIDES = 4;
const NOTE_MAX = 80;

/**
 * Everything you can do to one of your own photos, in one place.
 *
 * It replaces a scattering of 24px corner icons on a 96px thumbnail — a
 * sparkle here, a film badge there, a position control buried two taps deep
 * inside the lightbox — with a plain list you reach by tapping the photo
 * itself. The old arrangement was not only hard to hit; it *hid* the two
 * actions that were missing entirely until now, because there was nowhere
 * left on the thumbnail to put them:
 *
 *   • **Main photo** — which photo represents you was decided by upload order
 *     and could never be changed.
 *   • **Remove** — there was no delete at all. Six uploads was a one-way door.
 *
 * Every action here is the owner's own, on the owner's own photo. Nothing in
 * this sheet is plan-gated (the studio included, see `PHOTO_STUDIO_UNGATED`);
 * the one thing that *is* gated is joining the Reel, and that gate is
 * verification, not money — an unreviewed photo cannot appear in a surface
 * whose entire job is to be trustworthy.
 */
export default function PhotoActionSheet({
  open,
  onClose,
  photo,
  slideCount,
  onStudio,
  onLightbox,
  onRefresh,
  onFocalChanged,
}: {
  open: boolean;
  onClose: () => void;
  photo: ProfilePhotoSummary | null;
  /** How many photos are already in the Reel — the 4-slot limit is shown, not discovered by failing. */
  slideCount: number;
  onStudio: (photoId: string) => void;
  onLightbox: (photoId: string) => void;
  /** Re-read `/api/profile/me`: slot numbers and the primary flag re-compact server-side, so the client never re-derives them. */
  onRefresh: () => void | Promise<void>;
  onFocalChanged: (photoId: string, focalY: number) => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setError(null);
    setConfirmingDelete(false);
    setNote(photo?.note ?? "");
  }, [open, photo?.id, photo?.note]);

  if (!photo) return null;

  const inReel = photo.slotOrder != null;
  const approved = photo.verificationStatus === "APPROVED";
  const reelFull = !inReel && slideCount >= MAX_SLIDES;

  async function run(key: string, request: () => Promise<Response>, failMessage: string) {
    setError(null);
    setBusy(key);
    try {
      const res = await request();
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message ?? failMessage);
        return false;
      }
      haptic("success");
      await onRefresh();
      return true;
    } catch {
      setError(t("profile.networkError", "Network error — dobara try karein."));
      return false;
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} variant="bottom" title={t("profile.photoActions.title", "Photo Options")}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="glass-surface glass-card--soft relative size-16 shrink-0 overflow-hidden [--surface-radius:16px]">
            <Image
              src={photo.fileUrl}
              alt=""
              fill
              unoptimized
              className="object-cover"
              style={{ objectPosition: `50% ${photo.focalY ?? 50}%` }}
            />
          </span>
          <div className="min-w-0 space-y-1">
            <p
              className={cn(
                "flex items-center gap-1.5 text-[0.875rem] font-semibold",
                approved ? "text-trust" : photo.verificationStatus === "REJECTED" ? "text-danger" : "text-warn",
              )}
            >
              <ShieldCheck className="size-4 shrink-0" aria-hidden />
              {approved
                ? t("profile.selfGallery.status.approved", "Verified")
                : photo.verificationStatus === "REJECTED"
                  ? t("profile.selfGallery.status.rejected", "Reject hui")
                  : t("profile.selfGallery.status.pending", "Review me hai")}
            </p>
            <p className="text-[0.75rem] leading-snug text-subtle">
              {photo.isPrimary
                ? t("profile.photoActions.isMain", "Ye aapki main photo hai.")
                : inReel
                  ? t("profile.photoActions.inReel", "Reel me slide {n} par hai.").replace("{n}", String(photo.slotOrder))
                  : t("profile.photoActions.notInReel", "Abhi reel me nahi hai.")}
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <ActionRow
            icon={Sparkles}
            label={t("profile.photoActions.studio", "Photo Studio")}
            hint={t("profile.photoActions.studioHint", "Manual sliders ya AI se saaf karein")}
            onClick={() => {
              haptic("tap");
              onStudio(photo.id);
            }}
          />

          {!photo.isPrimary && (
            <ActionRow
              icon={Star}
              label={t("profile.photoActions.makeMain", "Make Main Photo")}
              hint={t("profile.photoActions.makeMainHint", "Jahan ek hi photo dikhti hai, wahan yahi dikhegi")}
              loading={busy === "primary"}
              onClick={() =>
                void run(
                  "primary",
                  () =>
                    fetch(`/api/profile/photo/${photo.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ isPrimary: true }),
                    }),
                  t("profile.photoActions.mainFailed", "Main photo set nahi ho paayi."),
                )
              }
            />
          )}

          {/* The Reel gate says *why* instead of going grey: a disabled row
              with no reason is the same information as no row at all. */}
          <ActionRow
            icon={Film}
            label={
              inReel
                ? t("profile.selfGallery.removeFromReel", "Reel se hataayein")
                : t("profile.selfGallery.addToReel", "Add to Reel")
            }
            hint={
              !approved
                ? t("profile.photoUpload.verifyFirst", "Verify hone ke baad reel me shamil kar sakte hain")
                : reelFull
                  ? t("profile.photoActions.reelFull", "Reel me {max} photo pehle se hain — ek hataayein.").replace(
                      "{max}",
                      String(MAX_SLIDES),
                    )
                  : t("profile.photoActions.reelHint", "Reel me {n}/{max} chuni hain")
                      .replace("{n}", String(slideCount))
                      .replace("{max}", String(MAX_SLIDES))
            }
            disabled={!approved || reelFull}
            active={inReel}
            loading={busy === "reel"}
            onClick={() =>
              void run(
                "reel",
                () =>
                  fetch(`/api/profile/photo/${photo.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ inReel: !inReel }),
                  }),
                t("profile.selfGallery.reelUpdateFailed", "Reel update nahi ho paaya."),
              )
            }
          />

          {/* Which slide it is — the reel shows slides in this order, so
              "put it first" is the one move people actually want after
              adding a better photo. The others shift, nothing is lost. */}
          {inReel && slideCount > 1 && (
            <div className="glass-surface glass-card--soft px-3 py-2.5 [--surface-radius:16px]">
              <p className="mb-2 flex items-center gap-1.5 text-[0.75rem] font-semibold uppercase tracking-wider text-subtle">
                <ArrowLeftRight className="size-3.5" aria-hidden />
                {t("profile.photoActions.slotTitle", "Reel me kaunsi slide par")}
              </p>
              <div className="flex gap-2" role="group">
                {Array.from({ length: slideCount }, (_, i) => i + 1).map((n) => {
                  const current = photo.slotOrder === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={current}
                      disabled={current || busy !== null}
                      onClick={() =>
                        void run(
                          "slot",
                          () =>
                            fetch(`/api/profile/photo/${photo.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ slot: n }),
                            }),
                          t("profile.photoActions.slotFailed", "Slide badal nahi paayi."),
                        )
                      }
                      className={cn(
                        "glass-surface glass-chip inline-flex min-h-10 flex-1 items-center justify-center gap-1 text-[0.875rem] font-semibold tabular-nums",
                        current ? "glass-card--active text-ink" : "text-muted",
                        "disabled:cursor-default",
                      )}
                    >
                      {busy === "slot" && !current ? null : <Film className="size-3.5" aria-hidden />}
                      {n}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[0.6875rem] text-subtle">
                {t("profile.photoActions.slotHint", "Slide 1 reel me sabse pehle dikhti hai.")}
              </p>
            </div>
          )}

          <ActionRow
            icon={Maximize2}
            label={t("profile.selfGallery.viewFullPhoto", "View Full Photo")}
            onClick={() => {
              haptic("tap");
              onLightbox(photo.id);
            }}
          />
        </div>

        {/* The slide's own line, in the owner's words. Written by hand, never
            by AI — the same "no AI in the loop" rule the photo itself is under
            (see `PhotoUploadCard`), extended to the caption. */}
        <div className="glass-surface glass-card--soft px-3 py-2.5 [--surface-radius:16px]">
          <p className="mb-2 flex items-center gap-1.5 text-[0.75rem] font-semibold uppercase tracking-wider text-subtle">
            <MessageSquareQuote className="size-3.5" aria-hidden />
            {t("profile.photoActions.note", "Is photo par ek baat")}
          </p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
            onBlur={() => {
              const trimmed = note.trim();
              if (trimmed === (photo.note ?? "")) return;
              void run(
                "note",
                () =>
                  fetch(`/api/profile/photo/${photo.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ note: trimmed || null }),
                  }),
                t("profile.photoUpload.noteSaveFailed", "Note save nahi ho paaya."),
              );
            }}
            rows={2}
            placeholder={t("profile.photoUpload.notePlaceholder", "Is photo ke baare me ek baat (optional)")}
            className="w-full resize-none rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-[0.8125rem] outline-none focus:border-gold-500"
          />
          <p className="mt-1 flex items-center justify-between text-[0.6875rem] text-subtle">
            <span>{t("profile.photoActions.noteHint", "Reel me is photo ke saath dikhegi")}</span>
            <span className="tabular-nums">
              {note.length}/{NOTE_MAX}
            </span>
          </p>
        </div>

        {/* Crop framing, promoted out of the lightbox footer — every grid tile
            and every reel card crops this photo, so where it crops is a normal
            photo setting, not something you find by opening the photo full
            screen first. */}
        <div className="glass-surface glass-card--soft px-3 py-2.5 [--surface-radius:16px]">
          <p className="mb-2 flex items-center gap-1.5 text-[0.75rem] font-semibold uppercase tracking-wider text-subtle">
            <Crop className="size-3.5" aria-hidden />
            {t("profile.photoActions.framing", "Crop kahan se ho")}
          </p>
          <PhotoPositionControl
            photoId={photo.id}
            focalY={photo.focalY}
            onChanged={onFocalChanged}
            tone="light"
          />
        </div>

        {/* Two taps, and the second one says what is about to happen. A single
            red row next to five ordinary ones is how photos get deleted by
            people who meant to tap the row above. */}
        {confirmingDelete ? (
          <div className="glass-surface glass-card--soft px-3 py-3 [--surface-radius:16px] [--surface-rim:linear-gradient(150deg,rgb(224_86_110/0.7),rgb(224_86_110/0.25))]">
            <p className="text-[0.8125rem] leading-snug text-ink">
              {photo.isPrimary
                ? t(
                    "profile.photoActions.deleteConfirmMain",
                    "Ye aapki main photo hai — hatane par agli photo main ban jaayegi. Pakka hataayein?",
                  )
                : t("profile.photoActions.deleteConfirm", "Ye photo profile se hat jaayegi. Pakka?")}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={busy === "delete"}
                onClick={async () => {
                  const done = await run(
                    "delete",
                    () => fetch(`/api/profile/photo/${photo.id}`, { method: "DELETE" }),
                    t("profile.photoActions.deleteFailed", "Photo hat nahi paayi."),
                  );
                  if (done) onClose();
                }}
                className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-danger px-4 text-[0.875rem] font-semibold text-white transition-opacity disabled:opacity-60"
              >
                {busy === "delete" ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                {t("profile.photoActions.deleteYes", "Haan, hataayein")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="min-h-10 rounded-full px-4 text-[0.875rem] font-semibold text-muted transition-colors hover:text-ink"
              >
                {t("profile.photoActions.cancel", "Rehne dein")}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              haptic("tap");
              setConfirmingDelete(true);
            }}
            className="glass-surface glass-chip inline-flex min-h-10 w-full items-center justify-center gap-1.5 text-[0.875rem] font-semibold text-danger"
          >
            <Trash2 className="size-4" aria-hidden />
            {t("profile.photoActions.delete", "Photo hataayein")}
          </button>
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

function ActionRow({
  icon: Icon,
  label,
  hint,
  onClick,
  disabled,
  loading,
  active,
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        // The app's own material, not a second palette: a soft glass pane per
        // row, and the one that is already "on" wears the active weight.
        "glass-surface glass-card--soft flex w-full items-center gap-3 px-3 py-2.5 text-left [--surface-radius:16px]",
        "disabled:cursor-not-allowed disabled:opacity-55",
        active && "glass-card--active",
      )}
    >
      <span className="glass-seal grid size-8 shrink-0 place-items-center text-white">
        {loading ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.875rem] font-medium text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-[0.75rem] leading-snug text-muted">{hint}</span>}
      </span>
    </button>
  );
}
