"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Languages } from "lucide-react";
import { cn } from "@/lib/utils";
import LanguageToggle from "@/components/i18n/LanguageToggle";
import GoogleTranslateWidget from "@/components/i18n/GoogleTranslateWidget";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * `/bolo`'s whole chrome — the mark home, how far the profile has come, and
 * one small button for the two controls that change how the page reads.
 *
 * `FocusShell` keeps language, translation and theme in a sticky bar; here that
 * bar would sit over the conversation for its whole two minutes, so they fold
 * behind a single button. They stay *mounted* while folded:
 * `GoogleTranslateWidget` loads Google's engine on mount, and a page that
 * mounted it only on open would stop translating for someone who picked Tamil
 * on the page before.
 *
 * The theme toggle is not among them any more. This page is night whatever the
 * site theme says (`.bolo-night`, globals.css), so a light/dark switch here
 * would be a control that visibly does nothing — it stays on every other page,
 * where it means something.
 *
 * The mark is drawn here rather than by `BrandMark`: on this ground the seal is
 * a deeper wine, the rings are brighter and larger in their tile, and the
 * wordmark is set on the room's ivory instead of ink. Everywhere else on the
 * site keeps the shared mark unchanged.
 */
export default function BoloHeader({ done, total }: { done: number; total: number }) {
  const t = useT();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <header className="flex items-center gap-3 pr-[7px] pt-[15px]">
      <Link
        href="/"
        aria-label="BandhanTak home"
        className="-m-1 flex items-center gap-[11px] rounded-xl p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="bolo-tile grid size-[34px] shrink-0 place-items-center rounded-[9px]">
          <svg viewBox="0 0 34 34" className="size-[34px]" aria-hidden>
            <defs>
              <linearGradient id="bolo-ring-foil" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#ffe6b0" />
                <stop offset="45%" stopColor="#f5c04e" />
                <stop offset="100%" stopColor="#d2932a" />
              </linearGradient>
            </defs>
            <circle cx="13.6" cy="17" r="6.2" fill="none" stroke="url(#bolo-ring-foil)" strokeWidth="2" />
            <circle cx="20.4" cy="17" r="6.2" fill="none" stroke="url(#bolo-ring-foil)" strokeWidth="2" opacity="0.85" />
          </svg>
        </span>
        <span className="shadow-on-room font-[family-name:var(--font-display)] text-[18.5px] font-semibold leading-none tracking-[-0.02em] text-ink">
          Bandhan<span className="text-foil">Tak</span>
        </span>
      </Link>

      <div className="ml-auto flex items-center gap-2.5">
        <div ref={rootRef} className="relative">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={t("bolo.header.settings", "Bhasha aur anuvaad")}
            className={cn(
              "touch-target grid size-[30px] place-items-center rounded-full text-ink/45 outline-none transition-colors",
              "hover:bg-white/10 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring",
              open && "bg-white/10 text-ink",
            )}
          >
            <Languages className="size-[16px]" aria-hidden />
          </button>
          <div
            id={menuId}
            className={cn(
              "bolo-pane bolo-menu absolute right-0 top-[calc(100%+0.5rem)] z-50 w-64 px-3 py-1.5",
              !open && "hidden",
            )}
          >
            <MenuRow label={t("bolo.header.language", "Bhasha")}>
              <LanguageToggle />
            </MenuRow>
            <MenuRow label={t("bolo.header.translate", "Anuvaad")}>
              <GoogleTranslateWidget />
            </MenuRow>
          </div>
        </div>

        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          aria-label={t("bolo.progress.label", "Profile progress")}
          className="flex flex-col items-end gap-[6px]"
        >
          <span className="shadow-on-room text-[13px] leading-none tabular-nums text-ink">
            {done}/{total}
          </span>
          <span className="flex gap-[5px]" aria-hidden>
            {Array.from({ length: total }, (_, i) => (
              <span key={i} className={cn("bolo-bead", i < done && "bolo-bead--on")} />
            ))}
          </span>
        </div>
      </div>
    </header>
  );
}

function MenuRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3">
      <span className="text-sm text-muted">{label}</span>
      {children}
    </div>
  );
}
