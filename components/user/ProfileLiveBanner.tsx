"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BadgeCheck, X } from "lucide-react";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * The one-time "you're live" line at the top of the dashboard.
 *
 * This is what replaced the profile builder's holding screen ("Aapki profile
 * live hai", two buttons, a list of links): the builder now redirects to
 * `/user/dashboard?profile=live` the moment the server confirms the profile,
 * and this banner is the whole celebration — one sentence, one CTA into
 * today's rishtey, a dismiss. No confetti: the reward is the reel, not the
 * banner about it.
 *
 * `show` is read by the server page from `?profile=live`, so the banner is
 * decided per request and never flashes in for a refresh. On mount the query
 * is stripped with `replaceState` — a refresh, or Back from the reel, must
 * not re-congratulate someone for something that happened ten minutes ago.
 */
export default function ProfileLiveBanner({ show }: { show: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(show);

  useEffect(() => {
    if (!show) return;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("profile")) {
        url.searchParams.delete("profile");
        window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
      }
    } catch {
      /* A URL that cannot be parsed is not worth a broken banner. */
    }
  }, [show]);

  if (!open) return null;

  return (
    <div
      role="status"
      className="bt-card bt-card--foil flex items-center gap-3 px-4 py-3 motion-safe:animate-fade-in"
    >
      <span className="bt-ring bt-ring--trust [--paper-ring-size:2.25rem]">
        <BadgeCheck className="size-4" />
      </span>
      <p className="min-w-0 flex-1 text-[0.875rem] font-medium leading-snug text-ink">
        {t("userPage.dashboard.liveBanner.text", "Profile live hai — aaj ke rishte ready hain.")}
      </p>
      <Link
        href="/user/reel"
        className="bt-cta inline-flex h-11 shrink-0 items-center gap-1 rounded-full px-4 text-[0.8125rem] font-semibold transition-transform duration-200 hover:-translate-y-0.5"
      >
        {t("userPage.dashboard.liveBanner.cta", "Aaj ke rishte dekhein")}
        <ArrowRight className="size-3.5" />
      </Link>
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label={t("userPage.dashboard.liveBanner.dismiss", "Dismiss")}
        className="grid size-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-bg-subtle hover:text-ink"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
