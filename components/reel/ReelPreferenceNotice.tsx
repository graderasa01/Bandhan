"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, SlidersHorizontal, X } from "lucide-react";
import type { ReelPreferenceNotice as Notice } from "@/lib/contracts/reel";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * "Aapne partner preferences abhi nahi batayi hain." — once, above the stack.
 *
 * Shown only while the viewer's stated preferences are below the bar for a
 * preference match (`preferenceEvidence.ts`). It is a next step, not an
 * error: no red, no lock, one line of *why* ("ye batane se aapke rishte zyada
 * relevant honge") and one thumb-sized CTA into the two-field deck that
 * comes straight back here. Dismissable for the session, because the reel's
 * job is the cards; the card-level "General suggestion" line keeps the
 * honesty on every profile after the banner is gone.
 */
export default function ReelPreferenceNotice({ notice }: { notice: Notice }) {
  const t = useT();
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-2">
      <div className="relative flex items-start gap-2.5 rounded-lg border border-gold-300/60 bg-gold-50/90 px-3 py-2.5 shadow-sm backdrop-blur-sm dark:border-gold-700/40 dark:bg-gold-900/20">
        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-900/40 dark:text-gold-200">
          <SlidersHorizontal className="size-3.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 pr-6">
          <p className="text-[0.8125rem] font-semibold leading-snug text-ink">{notice.title}</p>
          <p className="mt-0.5 text-[0.75rem] leading-snug text-muted">{notice.body}</p>
          <Link
            href={notice.ctaHref}
            className="mt-1.5 inline-flex min-h-9 items-center gap-1.5 rounded-full bg-gradient-to-r from-gold-400 to-gold-600 px-3.5 text-[0.8125rem] font-semibold text-primary-fg shadow-gold"
          >
            {notice.ctaLabel}
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
        <button
          type="button"
          onClick={() => setHidden(true)}
          aria-label={t("reel.preferenceNotice.dismiss", "Dismiss")}
          className="absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-gold-100 hover:text-ink dark:hover:bg-gold-900/40"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
