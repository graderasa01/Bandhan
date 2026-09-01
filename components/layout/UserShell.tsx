"use client";

import { ReactNode, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import AppShell from "./AppShell";
import NavHub from "./NavHub";
import { BOTTOM_RAIL, NAV_ITEMS, isNavActive } from "./navItems";
import BrandMark from "./BrandMark";
import NoticeBell from "@/components/notice/NoticeBell";
import LanguageToggle from "@/components/i18n/LanguageToggle";
import ThemeToggle from "@/components/ui/ThemeToggle";
import { useNavCounts } from "@/lib/nav/useNavCounts";
import { useRecordVisit } from "@/lib/nav/recentPages";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/LanguageProvider";

interface UserShellProps {
  children: ReactNode;
  userName?: string;
  fullBleed?: boolean;
}

export default function UserShell({ children, userName = "Test User A", fullBleed = false }: UserShellProps) {
  const t = useT();
  const [moreOpen, setMoreOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const counts = useNavCounts();
  useRecordVisit();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  // Language lives in the header now (reachable from every page, one tap,
  // same spot on mobile and desktop) — not duplicated here too.
  const navFooter = (
    <button
      type="button"
      onClick={logout}
      className="inline-flex min-h-12 min-w-12 items-center gap-2 rounded-full px-3 text-sm text-muted transition-colors hover:bg-bg-subtle hover:text-ink"
    >
      <LogOut className="size-4" />
      {t("layout.userShell.logout", "Logout")}
    </button>
  );

  // Anything the hub would badge but the rail can't show, because it lives
  // behind More. Without this the whole point of the counts is lost on mobile:
  // an unread message would sit two taps deep with nothing on screen hinting at
  // it. A dot rather than a number — the number is one tap away, and summing
  // unrelated counts into "5" would mean five of nothing in particular.
  const railHrefs = new Set(BOTTOM_RAIL.map((i) => i.href));
  const hiddenCount = NAV_ITEMS.reduce(
    (sum, item) => (item.count && !railHrefs.has(item.href) ? sum + counts[item.count] : sum),
    0,
  );

  const bottomNavContent = (
    <>
      {BOTTOM_RAIL.map((item) => {
        const active = isNavActive(pathname, item.href);
        const count = item.count ? counts[item.count] : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            aria-label={
              count > 0
                ? `${item.label} — ${count} ${t("layout.userShell.newSuffix", "new")}`
                : undefined
            }
            className={cn(
              "flex min-w-12 flex-1 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium transition-colors",
              active ? "text-primary-text" : "text-muted",
            )}
          >
            <span className="relative">
              <span
                className={cn(
                  "grid size-9 place-items-center rounded-full transition-all duration-200",
                  active && "bg-gradient-to-br from-primary to-primary-hover text-primary-fg shadow-gold",
                )}
              >
                <item.icon className="size-5" />
              </span>
              {count > 0 && (
                <span
                  aria-hidden
                  className="absolute -right-1 -top-0.5 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[0.625rem] font-semibold leading-4 text-accent-fg"
                >
                  {count > 9 ? "9+" : count}
                </span>
              )}
            </span>
            {item.label}
          </Link>
        );
      })}

      <button
        type="button"
        onClick={() => setMoreOpen((o) => !o)}
        aria-expanded={moreOpen}
        aria-label={
          hiddenCount > 0
            ? t("layout.userShell.moreWithBadgeAriaLabel", "More — kuchh naya hai")
            : t("layout.userShell.more", "More")
        }
        className="flex min-w-12 flex-1 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium text-muted"
      >
        <span className="relative grid size-9 place-items-center">
          <Menu className="size-5" />
          {hiddenCount > 0 && !moreOpen && (
            <span aria-hidden className="absolute right-1 top-1 size-2 rounded-full bg-accent" />
          )}
        </span>
        {t("layout.userShell.more", "More")}
      </button>
    </>
  );

  /* Full height above the rail, not a partial sheet: nineteen touch-sized tiles
     plus search do not fit in a peek, and a hub you have to scroll to read is
     the flat list again with rounder corners. z-50 clears the Grio bubble
     (z-45), which would otherwise float on top of the nav. Passed as AppShell's
     `overlay` rather than nested in `bottomNav` — see the prop's own note. */
  const moreOverlay = moreOpen && (
    <div className="fixed inset-x-0 bottom-[60px] top-0 z-50 flex flex-col bg-surface md:hidden">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
        <span className="text-sm font-semibold text-ink">{t("layout.userShell.goAnywhere", "Go anywhere")}</span>
        <button
          type="button"
          onClick={() => setMoreOpen(false)}
          aria-label={t("layout.userShell.close", "Close")}
          className="-mr-2 ml-auto grid size-10 place-items-center rounded-full text-muted transition-colors hover:bg-bg-subtle hover:text-ink"
        >
          <X className="size-5" />
        </button>
      </div>
      <NavHub
        variant="sheet"
        className="min-h-0 flex-1"
        onNavigate={() => setMoreOpen(false)}
        footer={navFooter}
      />
    </div>
  );

  return (
    <AppShell
      canvas
      fullBleed={fullBleed}
      sidebar={<NavHub variant="sidebar" className="h-full" footer={navFooter} />}
      bottomNav={bottomNavContent}
      overlay={moreOverlay}
      header={
        <div className="flex h-14 items-center gap-2 border-b border-line bg-surface px-4 sm:px-6">
          {/* Same BrandMark the public header uses, so the identity doesn't
              drift between the logged-out site and the app. Rendered ONCE:
              its gold-foil gradient is referenced by `url(#bt-foil)`, so a
              second copy for a responsive variant would put a duplicate id in
              the DOM and the rings paint from the hidden copy's (unrendered)
              gradient instead — a blank seal. The wordmark is a sibling here,
              hidden on phones with CSS, rather than a second <BrandMark>. */}
          <Link href="/user/dashboard" aria-label="BandhanTak dashboard" className="flex shrink-0 items-center gap-2.5">
            <BrandMark showWordmark={false} />
            <span className="hidden font-[family-name:var(--font-display)] text-[1.3rem] font-semibold leading-none tracking-tight text-ink sm:inline">
              Bandhan<span className="text-foil">Tak</span>
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-sm text-muted sm:inline">
              {t("layout.userShell.namastePrefix", "Namaste,")} {userName}
            </span>
            <LanguageToggle />
            <ThemeToggle />
            <NoticeBell className="-mr-2" />
          </div>
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
