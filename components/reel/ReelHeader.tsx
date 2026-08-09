"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import BrandMark from "@/components/layout/BrandMark";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * Slim in-canvas header for the full-bleed reel screen. Full-bleed drops the
 * shell's header/sidebar/bottom-nav entirely, so the back link here is the
 * only way out of this screen — not optional chrome.
 */
export default function ReelHeader({ index, total }: { index: number; total: number }) {
  const t = useT();
  return (
    <div className="flex shrink-0 items-center gap-3 px-4 pb-2 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] sm:px-6">
      <Link
        href="/user/dashboard"
        aria-label={t("reel.header.backToDashboard", "Back to Dashboard")}
        className="grid size-9 shrink-0 touch-target place-items-center rounded-full text-muted transition-colors hover:bg-bg-subtle hover:text-ink"
      >
        <ArrowLeft className="size-5" />
      </Link>

      <BrandMark className="shrink-0" showWordmark={false} />

      <div
        className="flex flex-1 items-center justify-center gap-1.5"
        role="progressbar"
        aria-valuenow={index}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={t("reel.header.progressLabel", "Aaj ke rishtey")}
      >
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 flex-1 max-w-8 rounded-full transition-colors duration-300",
              i < index ? "bg-gold-500" : i === index ? "bg-gold-300" : "bg-line",
            )}
          />
        ))}
      </div>

      {/* Balances the back button so the dot row stays visually centered. */}
      <span className="size-9 shrink-0" aria-hidden />
    </div>
  );
}
