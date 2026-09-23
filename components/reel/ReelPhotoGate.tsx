"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Camera, CheckCircle2, Eye, Film, ImagePlus, Loader2, ShieldCheck, Sparkles, X } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import PhotoEnhanceSheet from "@/components/profile/PhotoEnhanceSheet";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/motion";
import type { ReelViewer } from "@/lib/contracts/reel";
import { useT } from "@/components/i18n/LanguageProvider";

const ACCEPTED = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 8 * 1024 * 1024;
/** The upload route caps a profile at 6; the gate never offers more than that in one pick. */
const MAX_PHOTOS = 6;

interface UploadResult {
  photoId: string;
  fileUrl: string;
  verificationStatus: "PENDING" | "APPROVED" | "REJECTED";
  /** Reel slide the server gave it (auto-approved uploads join the reel while there is room), or null. */
  slotOrder: number | null;
  /** From `estimateSharpness` — `soft` is what decides how loudly the clean-up is offered. */
  sharpness: { score: number; soft: boolean };
}

/**
 * "Apni photo lagao, phir sabki photo dikhegi" — asked once, before the deck.
 *
 * ## Why it is asked here and not only on the cards
 *
 * D-90 replaced the photo paywall with reciprocity: a member whose own profile
 * is live and carries an approved photo sees the photos of members who allow
 * it (`photoAccess.ts`). The reel already said so — in a small line on each
 * locked card. That is the right place for the *reason*, and the wrong place
 * for the *ask*: by the time someone has scrolled four grey rectangles looking
 * for a face, they have decided what this product is, and a link at the bottom
 * of the fifth does not undo it.
 *
 * So the screen asks up front, once, and says what it buys.
 *
 * ## It is an ask, not a wall
 *
 * There is a "Baad me", and it works: the deck behind is fully usable without
 * a photo — names, cities, work, the whole "why this match", every action. The
 * free core stays free (D-90). Blocking discovery to extract an upload would
 * be the most effective version of this screen and the wrong one; a member who
 * has no photo ready today is not someone to shut out.
 *
 * Dismissal is remembered for the calendar day, so it is one ask a day rather
 * than one per navigation — the reel is a daily ritual and this should be too.
 *
 * ## The clean-up offer is earned, not automatic
 *
 * After a successful upload the sheet measures the file (`estimateSharpness`,
 * a plain Laplacian variance — no model, no network). Only when it actually
 * comes back soft does the AI clean-up become the loud next step; on a crisp
 * photo it stays a quiet link. And the copy says exactly what that clean-up is:
 * sharpness, light and noise on the member's own pixels
 * (`photoEnhance.ts`) — the face is never redrawn, which is the whole reason
 * an enhanced photo can still carry a Photo Verified badge.
 */
export default function ReelPhotoGate({
  viewer,
  open,
  onClose,
  onUploaded,
}: {
  viewer: ReelViewer;
  open: boolean;
  onClose: () => void;
  /** Fired once a photo is stored, so the screen can refresh and unlock the deck. */
  onUploaded: () => void;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Everything added in this sheet, in pick order. Several photos can go up
  // from one pick, and each one can be taken back right here — a wrong photo
  // should not need a trip to the profile page to undo.
  const [uploaded, setUploaded] = useState<UploadResult[]>([]);
  const [removing, setRemoving] = useState<string | null>(null);
  const [enhanceTarget, setEnhanceTarget] = useState<string | null>(null);

  async function upload(picked: File[]) {
    setError(null);
    const files = picked.slice(0, MAX_PHOTOS);
    setBusy(true);
    let failure: string | null = null;
    let added = 0;
    try {
      for (const file of files) {
        if (file.size > MAX_BYTES) {
          failure = t("profile.photoUpload.tooLarge", "Photo 8MB se badi nahi honi chahiye.");
          continue;
        }
        const body = new FormData();
        body.append("file", file);
        // One after another: the route checks the 6-photo cap per request.
        const res = await fetch("/api/profile/photo", { method: "POST", body });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          failure = data.message ?? t("profile.photoUpload.uploadFailed", "Photo upload nahi ho paayi.");
          if (data.error === "LIMIT_REACHED") break;
          continue;
        }
        added += 1;
        setUploaded((prev) => [
          ...prev,
          {
            photoId: data.photoId,
            fileUrl: data.fileUrl,
            verificationStatus: data.verificationStatus ?? "PENDING",
            slotOrder: data.slotOrder ?? null,
            sharpness: data.sharpness ?? { score: 0, soft: false },
          },
        ]);
      }
    } catch {
      failure = t("profile.networkError", "Network error — dobara try karein.");
    } finally {
      setBusy(false);
    }
    if (added > 0) {
      haptic("success");
      onUploaded();
    }
    if (failure) setError(failure);
  }

  async function remove(photoId: string) {
    setError(null);
    setRemoving(photoId);
    try {
      const res = await fetch(`/api/profile/photo/${photoId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message ?? t("profile.photoActions.deleteFailed", "Photo hat nahi paayi."));
        return;
      }
      haptic("tap");
      // Slides re-compact server-side; renumber the ones still shown the same way.
      setUploaded((prev) => {
        const gone = prev.find((p) => p.photoId === photoId);
        return prev
          .filter((p) => p.photoId !== photoId)
          .map((p) =>
            gone?.slotOrder != null && p.slotOrder != null && p.slotOrder > gone.slotOrder
              ? { ...p, slotOrder: p.slotOrder - 1 }
              : p,
          );
      });
      onUploaded();
    } catch {
      setError(t("profile.networkError", "Network error — dobara try karein."));
    } finally {
      setRemoving(null);
    }
  }

  function pickFiles() {
    haptic("tap");
    inputRef.current?.click();
  }

  const hasUploaded = uploaded.length > 0;
  const latest = uploaded[uploaded.length - 1] ?? null;
  const anyApproved = uploaded.some((p) => p.verificationStatus === "APPROVED");
  const enhancePhoto = uploaded.find((p) => p.photoId === enhanceTarget) ?? null;

  const soft = latest?.sharpness.soft ?? false;

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={
          hasUploaded
            ? t("reel.photoGate.doneTitle", "Photo lag gayi")
            : viewer.photoInReview
              ? t("reel.photoGate.reviewTitle", "Aapki photo review me hai")
              : t("reel.photoGate.title", "Apni photo lagayein")
        }
        variant="bottom"
      >
        {hasUploaded ? (
          /* ── Uploaded: the photos, each removable, then the clean-up ──── */
          <div className="flex flex-col gap-4">
            <div>
              <p className="flex items-center gap-1.5 text-[0.9375rem] font-semibold text-trust">
                <CheckCircle2 className="size-4 shrink-0" aria-hidden />
                {anyApproved
                  ? t("reel.photoGate.live", "Photo live ho gayi")
                  : t("reel.photoGate.inReview", "Review me bheja diya")}
              </p>
              <p className="mt-1 text-[0.8125rem] leading-snug text-muted">
                {anyApproved
                  ? t("reel.photoGate.liveBody", "Ab aapko baaki members ki photo bhi dikhegi.")
                  : t(
                      "reel.photoGate.inReviewBody",
                      "Check hote hi aapko sabki photo dikhne lagegi — aam taur par kuch hi ghante.",
                    )}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {uploaded.map((p) => (
                <div
                  key={p.photoId}
                  className="glass-surface glass-card--soft relative aspect-[3/4] overflow-hidden [--surface-radius:16px]"
                >
                  <Image src={p.fileUrl} alt="" fill unoptimized className="object-cover" />
                  {p.slotOrder != null && (
                    <span className="glass-surface glass-chip pointer-events-none absolute left-1 top-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[0.5625rem] font-semibold text-white">
                      <Film className="size-2.5" aria-hidden />
                      {p.slotOrder}
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={removing !== null}
                    onClick={() => void remove(p.photoId)}
                    aria-label={t("reel.photoGate.remove", "Remove Photo")}
                    className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-black/60 text-white disabled:opacity-60"
                  >
                    {removing === p.photoId ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : (
                      <X className="size-3.5" aria-hidden />
                    )}
                  </button>
                </div>
              ))}

              {uploaded.length < MAX_PHOTOS && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={pickFiles}
                  className="glass-surface glass-card--soft flex aspect-[3/4] flex-col items-center justify-center gap-1.5 px-2 text-center text-muted [--surface-radius:16px] disabled:opacity-50"
                >
                  {busy ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
                  <span className="text-[0.75rem] font-semibold leading-tight">
                    {t("reel.photoGate.addMore", "Add More")}
                  </span>
                </button>
              )}
            </div>

            <p className="-mt-1 flex items-start gap-1.5 text-[0.75rem] leading-snug text-subtle">
              <Film className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {t(
                "reel.photoGate.reelNote",
                "Verified photo apne aap reel me 4 slide tak lagti hain — slide ka kram aur note Meri Photos me badlein.",
              )}
            </p>

            {/* The offer, loud only when the file actually measured soft. */}
            <div
              className={cn(
                // The app's own material. `glass-card--active` is the one
                // weight that glows, and a photo the app has just measured as
                // soft is exactly what it is rationed for.
                "glass-surface glass-card--soft px-3.5 py-3 [--surface-radius:18px]",
                soft && "glass-card--active",
              )}
            >
              <p className="flex items-start gap-2 text-[0.875rem] font-semibold text-ink">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-gold-700" aria-hidden />
                {soft
                  ? t("reel.photoGate.softTitle", "Ye photo thodi dhundhli lag rahi hai")
                  : t("reel.photoGate.sharpTitle", "Photo saaf hai")}
              </p>
              <p className="mt-1.5 text-[0.8125rem] leading-snug text-muted">
                {t(
                  "reel.photoGate.enhanceBody",
                  "AI clean-up sirf sharpness, roshni aur grain theek karta hai — aapka chehra kabhi nahi badalta, isliye verified badge bana rehta hai.",
                )}
              </p>
              {viewer.canPhotoEnhance ? (
                <button
                  type="button"
                  onClick={() => {
                    haptic("tap");
                    if (latest) setEnhanceTarget(latest.photoId);
                  }}
                  className={cn(
                    "mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[0.875rem] font-semibold",
                    soft ? "accent-primary" : "glass-surface glass-chip",
                  )}
                >
                  <Sparkles className="size-4 shrink-0" aria-hidden />
                  {soft
                    ? t("reel.photoGate.enhanceCta", "AI se clear karein")
                    : t("reel.photoGate.enhanceCtaQuiet", "Aur behtar karein")}
                </button>
              ) : (
                <p className="mt-2 text-[0.75rem] text-subtle">
                  {t("reel.photoGate.enhanceLocked", "Ye clean-up abhi aapke plan me nahi hai.")}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-full text-[0.875rem] font-semibold text-muted transition-colors hover:text-ink"
            >
              {t("reel.photoGate.startBrowsing", "Rishtey dekhna shuru karein")}
            </button>
          </div>
        ) : (
          /* ── The ask ──────────────────────────────────────────────────── */
          <div className="flex flex-col gap-4">
            <p className="text-[0.9375rem] leading-relaxed text-ink">
              {viewer.photoInReview
                ? t(
                    "reel.photoGate.reviewBody",
                    "Aapki photo check ho rahi hai. Clear hote hi aapko baaki members ki photo dikhne lagegi — tab tak rishtey aap waise hi dekh sakte hain.",
                  )
                : t(
                    "reel.photoGate.body",
                    "BandhanTak par photo dono taraf se chalti hai: aap apni lagate hain, tabhi aapko baaki members ki dikhti hai. Isi se khaali aur fake accounts bahar rehte hain.",
                  )}
            </p>

            <ul className="glass-surface glass-card--soft flex flex-col gap-2 px-3.5 py-3 [--surface-radius:18px]">
              <li className="flex items-start gap-2 text-[0.8125rem] leading-snug text-muted">
                <Eye className="mt-0.5 size-4 shrink-0 text-gold-700" aria-hidden />
                {t("reel.photoGate.benefitSee", "Aaj ke saare rishton ki photo khul jaayegi.")}
              </li>
              <li className="flex items-start gap-2 text-[0.8125rem] leading-snug text-muted">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-trust" aria-hidden />
                {t(
                  "reel.photoGate.benefitPrivacy",
                  "Aapki photo sirf members ko dikhti hai — chahein to sirf match hone par (Privacy settings me).",
                )}
              </li>
            </ul>

            {!viewer.photoInReview && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={pickFiles}
                  className="accent-primary inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-[0.9375rem] font-semibold"
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Camera className="size-4" aria-hidden />
                  )}
                  {busy
                    ? t("reel.photoGate.uploading", "Upload ho rahi hai…")
                    : t("reel.photoGate.choose", "Photo Choose Karein")}
                </button>
                <p className="-mt-1 text-center text-[0.75rem] text-subtle">
                  {t("reel.photoGate.formatsMulti", "Ek saath kai photo chun sakte hain · JPG, PNG ya WEBP · 8MB tak")}
                </p>
              </>
            )}

            {error && (
              <p role="alert" className="text-[0.8125rem] text-danger">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-full text-[0.875rem] font-semibold text-muted transition-colors hover:text-ink"
            >
              {t("reel.photoGate.later", "Baad me — abhi rishtey dekhein")}
            </button>
          </div>
        )}
        {/* Outside both branches: "Add More" after the first upload uses the same picker. */}
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
      </Sheet>

      {/* The existing, unchanged clean-up: three deterministic presets for every
          plan, plus Premium's Ultra tier. Nothing about it is reel-specific. */}
      <PhotoEnhanceSheet
        open={enhanceTarget !== null}
        onClose={() => setEnhanceTarget(null)}
        photoId={enhancePhoto?.photoId ?? null}
        photoUrl={enhancePhoto?.fileUrl ?? null}
        canUltraEnhance={viewer.canPhotoUltraEnhance}
        onApplied={(photo) => {
          setUploaded((prev) => prev.map((p) => (p.photoId === photo.id ? { ...p, fileUrl: photo.fileUrl } : p)));
          setEnhanceTarget(null);
        }}
      />
    </>
  );
}
