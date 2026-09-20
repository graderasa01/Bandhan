"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Home, Search, Sparkles, X } from "lucide-react";
import NavHub from "@/components/layout/NavHub";
import BrandMark from "@/components/layout/BrandMark";
import NoticeBell from "@/components/notice/NoticeBell";
import { useGrio } from "@/components/grio/GrioProvider";
import { haptic } from "@/lib/motion";
import { useT } from "@/components/i18n/LanguageProvider";
import type { ReelViewer } from "@/lib/contracts/reel";

/**
 * The reel's top bar — floating over the photograph, not above it.
 *
 * The photo is the screen. Everything here sits on top of it in white, with a
 * gradient behind (drawn by `ReelCard`, so it travels with the card rather
 * than hanging over a gap during a swipe) doing the legibility work. Nothing
 * here has a solid bar of its own: a cream strip across the top would cut the
 * person off at the forehead, and removing it is the whole point of this
 * rebuild.
 *
 * Full-bleed drops the shell's header entirely, so everything a member expects
 * to find at the top of the app has to be here or be unreachable: the brand
 * (also the way back to Today), search, Grio, the unread count, and the whole
 * nav behind their own face. Each is the real control from elsewhere in the app —
 * `NoticeBell` is the same component and the same live count the shell header
 * shows, not a copy with its own idea of "new".
 *
 * ## Getting out of the reel (D-91b)
 *
 * Full-bleed drops the app's bottom rail *and* its sidebar, which left this
 * screen with one way back that reads as a logo rather than as a control.
 * People got stuck in the reel and said so.
 *
 * So the avatar opens the app's own `NavHub` instead of linking straight to
 * the profile — the same component the shell's "More" uses, reading the same
 * `navItems.ts`. A page added there appears here too, and the reel can never
 * drift into having its own smaller idea of where you can go. Today sits in
 * the bar as its own button, because that is the destination people were
 * actually looking for; the brand mark keeps its direct link as well.
 *
 * ## Search is also the filter control
 *
 * There is no separate funnel icon, and there does not need to be: the sheet
 * this opens *is* the filter — a name box and four chips (D-91). It used to be
 * a link to `/user/discover`, which meant leaving the deck to look somebody up
 * and never coming back to the card you were on. The full filter set is still
 * one tap further, from inside the sheet.
 */
export default function ReelHeader({ viewer, onSearch }: { viewer: ReelViewer; onSearch: () => void }) {
  const t = useT();
  const { open } = useGrio();
  const [navOpen, setNavOpen] = useState(false);

  return (
    <>
    <header className="flex h-[3.25rem] items-center gap-1.5 px-3 sm:gap-2 sm:px-4">
      {/* BrandMark's own wordmark is sized and coloured for the app's cream
          header; over a photograph the type has to be white. The seal still
          comes from the shared component — one `url(#bt-foil)` gradient per
          page (see UserShell) — and only the lettering is set locally. */}
      <Link
        href="/user/dashboard"
        aria-label={t("reel.header.backToDashboard", "Back to Dashboard")}
        className="flex min-w-0 shrink items-center gap-2"
      >
        <BrandMark showWordmark={false} className="shrink-0 drop-shadow-[0_2px_6px_rgb(0_0_0_/_0.35)] [&>svg]:size-8" />
        <span className="flex min-w-0 flex-col [text-shadow:0_1px_6px_rgb(0_0_0_/_0.5)]">
          <span className="truncate font-[family-name:var(--font-display)] text-[1.0625rem] font-semibold leading-none tracking-tight text-white">
            Bandhan<span className="text-foil">Tak</span>
          </span>
          <span className="mt-1 hidden truncate text-[0.5625rem] font-medium leading-none tracking-normal text-white/80 min-[380px]:block">
            {t("reel.header.tagline", "Bharose par bane rishtey")}
          </span>
        </span>
      </Link>

      <button
        type="button"
        onClick={() => {
          haptic("tap");
          onSearch();
        }}
        aria-label={t("reel.header.search", "Search aur reel filters")}
        className="ml-auto grid size-8 shrink-0 place-items-center rounded-full text-white drop-shadow-[0_1px_4px_rgb(0_0_0_/_0.45)] transition-colors hover:bg-white/15"
      >
        <Search className="size-5" aria-hidden />
      </button>

      {/* Unscoped on purpose: the header's Grio is "talk to Grio", while the
          card's two entry points (`ReelWhyMatchCard`, `ReelActionBar`) open the
          same panel already scoped to the person on screen. */}
      <button
        type="button"
        onClick={() => {
          haptic("tap");
          open();
        }}
        className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full border border-white/35 bg-black/25 px-2.5 text-[0.78125rem] font-semibold text-white shadow-sm backdrop-blur-md transition-colors hover:bg-black/40"
      >
        <Sparkles className="size-4 shrink-0" aria-hidden />
        <span className="max-[379px]:sr-only">{t("reel.header.askGrio", "Ask Grio")}</span>
      </button>

      <NoticeBell onDeep className="size-8 shrink-0" />

      <button
        type="button"
        onClick={() => {
          haptic("tap");
          setNavOpen(true);
        }}
        aria-label={t("reel.header.menu", "Menu — Today, profile aur baaki sab")}
        aria-expanded={navOpen}
        className="relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-black/30 text-[0.8125rem] font-semibold text-white shadow-sm ring-2 ring-white/60"
      >
        {viewer.photoUrl ? (
          <Image src={viewer.photoUrl} alt="" fill unoptimized className="object-cover" />
        ) : (
          <span aria-hidden>{viewer.name.trim().charAt(0).toUpperCase() || "?"}</span>
        )}
      </button>
    </header>

    {/* Full height, like the shell's own hub: nineteen destinations do not fit
        in a peek, and a nav you have to scroll to read is a flat list with
        rounder corners. z-50 clears the Grio bubble, which would otherwise
        float over it. Today gets its own button in the bar because it is the
        one destination people were actually stuck looking for. */}
    {navOpen && (
      <div className="fixed inset-0 z-50 flex flex-col bg-surface">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
          <Link
            href="/user/dashboard"
            onClick={() => setNavOpen(false)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-3.5 text-[0.8125rem] font-semibold text-accent-fg"
          >
            <Home className="size-4" aria-hidden />
            {t("reel.header.today", "Today")}
          </Link>
          <button
            type="button"
            onClick={() => setNavOpen(false)}
            aria-label={t("layout.userShell.close", "Close")}
            className="-mr-2 ml-auto grid size-10 place-items-center rounded-full text-muted transition-colors hover:bg-bg-subtle hover:text-ink"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <NavHub variant="sheet" className="min-h-0 flex-1" onNavigate={() => setNavOpen(false)} />
      </div>
    )}
    </>
  );
}
