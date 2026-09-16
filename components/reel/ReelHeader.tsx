"use client";

import Link from "next/link";
import Image from "next/image";
import { Search, Sparkles } from "lucide-react";
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
 * (also the way back to the dashboard), search, Grio, the unread count, and
 * their own profile. Each is the real control from elsewhere in the app —
 * `NoticeBell` is the same component and the same live count the shell header
 * shows, not a copy with its own idea of "new".
 *
 * ## Search is also the filter control
 *
 * There is no separate funnel icon, and there does not need to be: partner
 * preferences and the "Reel aur recommendation settings" panel both live on
 * `/user/discover`, which is where this goes. One control, named for what the
 * member is actually doing — looking for someone — instead of two that land on
 * the same page.
 */
export default function ReelHeader({ viewer }: { viewer: ReelViewer }) {
  const t = useT();
  const { open } = useGrio();

  return (
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

      <Link
        href="/user/discover"
        aria-label={t("reel.header.search", "Search aur reel filters")}
        className="ml-auto grid size-8 shrink-0 place-items-center rounded-full text-white drop-shadow-[0_1px_4px_rgb(0_0_0_/_0.45)] transition-colors hover:bg-white/15"
      >
        <Search className="size-5" aria-hidden />
      </Link>

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

      <Link
        href="/user/me"
        aria-label={t("reel.header.myProfile", "My profile")}
        className="relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-black/30 text-[0.8125rem] font-semibold text-white shadow-sm ring-2 ring-white/60"
      >
        {viewer.photoUrl ? (
          <Image src={viewer.photoUrl} alt="" fill unoptimized className="object-cover" />
        ) : (
          <span aria-hidden>{viewer.name.trim().charAt(0).toUpperCase() || "?"}</span>
        )}
      </Link>
    </header>
  );
}
