"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Languages } from "lucide-react";
import { cn } from "@/lib/utils";
import BrandMark from "@/components/layout/BrandMark";
import ThemeToggle from "@/components/ui/ThemeToggle";
import LanguageToggle from "@/components/i18n/LanguageToggle";
import GoogleTranslateWidget from "@/components/i18n/GoogleTranslateWidget";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * `/bolo`'s whole chrome — the mark home, how far the profile has come, and
 * one small button for the controls that change how the page reads.
 *
 * `FocusShell` keeps language, translation and theme in a sticky bar; here
 * that bar would sit over the conversation for its whole two minutes, so the
 * three fold behind a single button. They stay *mounted* while folded:
 * `GoogleTranslateWidget` loads Google's engine on mount, and a page that
 * mounted it only on open would stop translating for someone who picked
 * Tamil on the page before.
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
    <header className="flex items-center gap-3 pb-1 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <Link
        href="/"
        aria-label="BandhanTak home"
        className="-ml-1 flex min-h-12 items-center rounded-xl px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <BrandMark className="gap-2 [&>svg]:size-8" />
      </Link>

      <div className="ml-auto flex items-center gap-2.5">
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          aria-label={t("bolo.progress.label", "Profile progress")}
          className="flex flex-col items-end gap-1.5"
        >
          <span className="text-[0.8125rem] font-semibold leading-none tabular-nums text-ink/80">
            {done}/{total}
          </span>
          <span className="flex gap-[3px]" aria-hidden>
            {Array.from({ length: total }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "size-[7px] rounded-full transition-colors duration-500",
                  i < done ? "bg-gold-600 dark:bg-gold-400" : "bg-line-strong",
                )}
              />
            ))}
          </span>
        </div>

        <div ref={rootRef} className="relative">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={t("bolo.header.settings", "Bhasha aur display")}
            className={cn(
              "touch-target grid size-9 place-items-center rounded-full text-muted outline-none transition-colors hover:bg-surface hover:text-ink focus-visible:ring-2 focus-visible:ring-ring",
              open && "bg-surface text-ink",
            )}
          >
            <Languages className="size-[18px]" aria-hidden />
          </button>
          <div
            id={menuId}
            className={cn(
              "absolute right-0 top-[calc(100%+0.5rem)] z-50 w-64 rounded-2xl border border-line bg-surface px-3 py-1.5 shadow-xl",
              !open && "hidden",
            )}
          >
            <MenuRow label={t("bolo.header.language", "Bhasha")}>
              <LanguageToggle />
            </MenuRow>
            <MenuRow label={t("bolo.header.translate", "Anuvaad")}>
              <GoogleTranslateWidget />
            </MenuRow>
            <MenuRow label={t("bolo.header.theme", "Theme")}>
              <ThemeToggle />
            </MenuRow>
          </div>
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
