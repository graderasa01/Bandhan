"use client";

import { useEffect, type ReactNode } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export interface PhotoLightboxPhoto {
  id: string;
  url: string;
  label?: string;
}

/**
 * Full-screen photo viewer — every thumbnail in this app is a small
 * fixed-size crop with no way to see the actual upload; this is that
 * missing "open it properly" step. Mounted only while open (the caller
 * controls that via conditional rendering), so setup lives in a plain mount
 * effect rather than an `open` prop the way Sheet.tsx does it.
 */
export default function PhotoLightbox({
  photos,
  index,
  onIndexChange,
  onClose,
  headerAction,
  footerAction,
}: {
  photos: PhotoLightboxPhoto[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  /** Extra header control for the currently-viewed photo (e.g. an Enhance
   *  button) — kept generic here rather than baking any one feature in. */
  headerAction?: ReactNode;
  /** Extra footer control for the currently-viewed photo (e.g. a position
   *  picker) — same "just render what you're given" principle as headerAction. */
  footerAction?: ReactNode;
}) {
  const clamped = Math.min(Math.max(index, 0), Math.max(photos.length - 1, 0));
  const photo = photos[clamped];
  const hasPrev = clamped > 0;
  const hasNext = clamped < photos.length - 1;

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && hasPrev) onIndexChange(clamped - 1);
      if (e.key === "ArrowRight" && hasNext) onIndexChange(clamped + 1);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clamped, hasPrev, hasNext]);

  if (!photo) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex flex-col bg-black/90 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="flex shrink-0 items-center justify-between px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))]">
        <span className="text-[0.8125rem] font-medium tabular-nums text-white/80">
          {clamped + 1} / {photos.length}
        </span>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {headerAction}
          <button
            type="button"
            onClick={onClose}
            aria-label="Band karein"
            className="grid size-9 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <X className="size-5" />
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1" onClick={(e) => e.stopPropagation()}>
        <Image src={photo.url} alt={photo.label ?? ""} fill unoptimized className="object-contain" />

        {hasPrev && (
          <button
            type="button"
            onClick={() => onIndexChange(clamped - 1)}
            aria-label="Peeche"
            className="absolute left-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <ChevronLeft className="size-6" />
          </button>
        )}
        {hasNext && (
          <button
            type="button"
            onClick={() => onIndexChange(clamped + 1)}
            aria-label="Aage"
            className="absolute right-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <ChevronRight className="size-6" />
          </button>
        )}
      </div>

      {(footerAction || photo.label) && (
        <div
          className="shrink-0 space-y-2 px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-2"
          onClick={(e) => e.stopPropagation()}
        >
          {footerAction && <div className="flex justify-center">{footerAction}</div>}
          {photo.label && <p className="text-center text-[0.875rem] text-white/80">{photo.label}</p>}
        </div>
      )}
    </div>
  );
}
