"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * The reel's viewport.
 *
 * **Mobile is a plain passthrough** — the full-screen column the reel fills.
 * This component exists for the desktop half.
 *
 * ## Desktop: a phone, not a stretched page
 *
 * Laid out by width, the reel on a 1440px monitor was a 448px strip in a sea
 * of empty height. Here the height is the definite dimension — capped
 * viewport height — and the width falls out of a 9:16 aspect ratio, so the
 * desktop reel is a phone-shaped screen showing the mobile layout at mobile
 * proportions, the way YouTube Shorts does it. `md:w-auto` + `md:aspect-[9/16]`
 * is the whole trick; do not add a `max-w-*` here — that is the cap this
 * exists to remove.
 *
 * Since the immersive shell (2026-09-23) the app's sidebar stands to the left
 * of this, so the frame centres in what is left, and the spare width on the
 * right carries the two things a mouse needs that a thumb does not: up/down
 * buttons beside the frame, and the keyboard legend.
 */
export default function ReelFrame({
  backdropUrl,
  children,
  onPrev,
  onNext,
  canPrev = false,
  canNext = false,
}: {
  /** Current card's photo, blurred behind the frame on desktop. Null keeps a plain ground. */
  backdropUrl?: string | null;
  children: React.ReactNode;
  onPrev?: () => void;
  onNext?: () => void;
  canPrev?: boolean;
  canNext?: boolean;
}) {
  const t = useT();
  return (
    <div className="relative flex h-full w-full items-center justify-center gap-5 overflow-hidden bg-bg">
      {backdropUrl && (
        // Decorative only — a plain CSS background so it can never be
        // announced or focused. Never rendered on mobile.
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 hidden scale-110 bg-cover bg-center opacity-20 blur-3xl md:block"
          style={{ backgroundImage: `url(${JSON.stringify(backdropUrl)})` }}
        />
      )}
      <div aria-hidden className="pointer-events-none absolute inset-0 hidden bg-grad-hero opacity-60 md:block" />

      <div
        className={cn(
          "relative z-10 h-full w-full overflow-hidden bg-bg",
          // Desktop: a phone. Height first, width derived from it.
          "md:h-[min(100dvh-1.5rem,960px)] md:w-auto md:aspect-[9/16] md:rounded-3xl md:shadow-2xl md:ring-1 md:ring-white/15",
        )}
      >
        {children}
      </div>

      {/* Desktop only: the feed's two moves as buttons beside the phone, and
          the keys that do the same. Hidden on mobile, where the thumb is the
          control and this width does not exist. */}
      {(onPrev || onNext) && (
        <div className="relative z-10 hidden flex-col items-center gap-3 md:flex">
          <button
            type="button"
            onClick={onPrev}
            disabled={!canPrev}
            aria-label={t("reel.frame.prevAria", "Previous profile")}
            className="grid size-12 place-items-center rounded-full border border-line-strong bg-surface text-ink shadow-md transition-colors hover:border-gold-400 disabled:opacity-35"
          >
            <ChevronUp className="size-6" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!canNext}
            aria-label={t("reel.frame.nextAria", "Next profile")}
            className="grid size-12 place-items-center rounded-full border border-line-strong bg-surface text-ink shadow-md transition-colors hover:border-gold-400 disabled:opacity-35"
          >
            <ChevronDown className="size-6" aria-hidden />
          </button>
          <div aria-hidden className="mt-4 hidden flex-col gap-1.5 text-[0.8125rem] text-muted xl:flex">
            <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-subtle">
              {t("reel.frame.keyboardLabel", "Keyboard")}
            </span>
            {/* The moves that exist. No key decides anything by direction any
                more — Interest and Save have letters, the way their buttons
                have labels. */}
            <span>{t("reel.frame.keyNext", "↑ Next profile")}</span>
            <span>{t("reel.frame.keyPrev", "↓ Previous profile")}</span>
            <span>{t("reel.frame.keyPhotos", "← → Photos")}</span>
            <span>{t("reel.frame.keyInterest", "I Interest")}</span>
            <span>{t("reel.frame.keySave", "S Save")}</span>
          </div>
        </div>
      )}
    </div>
  );
}
