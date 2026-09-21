"use client";

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu } from "lucide-react";
import AppShell from "./AppShell";
import BrandMark from "./BrandMark";
import {
  PARTNER_NAV_GROUPS,
  activePartnerGroup,
  activePartnerItem,
  groupItems,
  type PartnerNavGroup,
} from "./partnerNavItems";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/LanguageProvider";
import LanguageToggle from "@/components/i18n/LanguageToggle";
import GoogleTranslateWidget from "@/components/i18n/GoogleTranslateWidget";
import ThemeToggle from "@/components/ui/ThemeToggle";
import Sheet from "@/components/ui/Sheet";

interface PartnerShellProps {
  children: ReactNode;
  /** Absent while `app/partner/loading.tsx` draws this shell — see the greeting below. */
  partnerName?: string;
  partnerCode?: string | null;
}

/**
 * The partner app's chrome. Navigation comes from `partnerNavItems.ts` — four
 * spaces and a More sheet, every old route still reachable — and renders three
 * ways from that one list: the desktop sidebar (groups with headings), the
 * four-slot mobile rail, and the "More" sheet the rail's fifth slot opens.
 */
export default function PartnerShell({ children, partnerName, partnerCode }: PartnerShellProps) {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);

  // A route change closes the sheet; a tap on a row inside it also closes it
  // explicitly so the close does not wait on the navigation.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  const activeGroup = activePartnerGroup(pathname);
  const activeItem = activePartnerItem(pathname);
  const railGroups = PARTNER_NAV_GROUPS.filter((g) => g.rail);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div className="border-b border-line p-4">
        <Link href="/" className="font-[family-name:var(--font-display)] text-lg font-bold text-wine-700">
          BandhanTak
        </Link>
        {/* No name means the loading boundary is drawing this shell before the
            page has asked the database who is here. Shimmer holds the line's
            height so nothing below it jumps when the name arrives. */}
        <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-muted">
          {t("layout.partnerShell.namastePrefix", "Namaste,")}{" "}
          {partnerName ?? <span className="skeleton inline-block h-3.5 w-20 rounded-full" />}
        </p>
        {partnerCode && (
          <p className="mt-1 font-mono text-sm font-semibold text-primary-text">{partnerCode}</p>
        )}
      </div>

      <nav className="flex-1 p-2 pt-3" aria-label={t("layout.partnerShell.navAriaLabel", "Partner navigation")}>
        {PARTNER_NAV_GROUPS.map((group) => {
          const items = groupItems(group);
          const showHeading = group.items.length > 0;
          return (
            <div key={group.id} className={cn("space-y-0.5", showHeading ? "pb-3" : "pb-1")}>
              {showHeading && (
                <p className="px-3.5 pb-1 pt-2 text-xs font-semibold uppercase tracking-[0.12em] text-subtle">
                  {t(group.key, group.label)}
                </p>
              )}
              {items.map((item) => {
                const active = activeItem?.href === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center gap-2.5 rounded-full px-3.5 py-2 text-sm font-medium transition-all duration-200",
                      active
                        ? "bg-gradient-to-r from-gold-400 to-gold-600 text-primary-fg shadow-gold"
                        : "text-ink hover:bg-bg-subtle",
                    )}
                  >
                    <item.icon className="size-4 shrink-0" />
                    {t(item.key, item.label)}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-line p-3">
        <button
          type="button"
          onClick={logout}
          className="inline-flex min-h-12 min-w-12 items-center gap-2 px-2 text-sm text-muted transition-colors hover:text-ink"
        >
          <LogOut className="size-4" />
          {t("layout.partnerShell.logout", "Logout")}
        </button>
      </div>
    </div>
  );

  const moreActive = activeGroup?.id === "more";

  const bottomNavContent = (
    <>
      {railGroups.map((group) => {
        const active = activeGroup?.id === group.id;
        return (
          <Link
            key={group.id}
            href={group.primary.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 text-[0.75rem] font-medium leading-tight transition-colors",
              active ? "text-gold-700" : "text-muted",
            )}
          >
            <span
              className={cn(
                "grid size-8 place-items-center rounded-full transition-all duration-200",
                active && "bg-gradient-to-br from-gold-400 to-gold-600 text-primary-fg shadow-gold",
              )}
            >
              <group.icon className="size-5" />
            </span>
            <span className="max-w-full truncate">{t(group.key, group.label)}</span>
          </Link>
        );
      })}
      <button
        type="button"
        onClick={() => setMoreOpen((o) => !o)}
        aria-expanded={moreOpen}
        aria-label={t("layout.partnerShell.groupMore", "More")}
        className={cn(
          "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 text-[0.75rem] font-medium leading-tight transition-colors",
          moreActive || moreOpen ? "text-gold-700" : "text-muted",
        )}
      >
        <span
          className={cn(
            "grid size-8 place-items-center rounded-full transition-all duration-200",
            moreActive && !moreOpen && "bg-gradient-to-br from-gold-400 to-gold-600 text-primary-fg shadow-gold",
          )}
        >
          <Menu className="size-5" />
        </span>
        <span className="max-w-full truncate">{t("layout.partnerShell.groupMore", "More")}</span>
      </button>
    </>
  );

  /* Passed as AppShell's `overlay`, never nested in `bottomNav`: that bar has a
     backdrop-filter, which would make it the containing block for the sheet's
     `fixed` panel and collapse it into a 60px strip. */
  const moreSheet = (
    <Sheet
      open={moreOpen}
      onClose={() => setMoreOpen(false)}
      title={t("layout.partnerShell.goAnywhere", "Go anywhere")}
    >
      <div className="flex flex-col gap-4 pb-[env(safe-area-inset-bottom,0px)]">
        {PARTNER_NAV_GROUPS.map((group) => (
          <MoreSection
            key={group.id}
            group={group}
            activeHref={activeItem?.href ?? null}
            label={t(group.key, group.label)}
            t={t}
            onNavigate={() => setMoreOpen(false)}
          />
        ))}
        <button
          type="button"
          onClick={logout}
          className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-left text-[0.9375rem] font-medium text-muted transition-colors hover:bg-bg-subtle hover:text-ink"
        >
          <LogOut className="size-5 shrink-0" />
          {t("layout.partnerShell.logout", "Logout")}
        </button>
      </div>
    </Sheet>
  );

  return (
    <AppShell
      // Same paper as the member app — a partner is a member-facing person on
      // the same brand, and the two surfaces link into each other.
      canvas
      sidebar={sidebarContent}
      bottomNav={bottomNavContent}
      overlay={moreSheet}
      header={
        <div className="flex h-14 items-center gap-2 border-b border-line bg-surface px-3 sm:px-6">
          {/* Same seal + wordmark treatment as UserShell. Rendered ONCE — the
              gold-foil gradient is referenced by id, so a second copy for a
              responsive variant would collide and paint a blank seal. The
              wordmark is a sibling hidden on phones, not a second BrandMark. */}
          <Link
            href="/partner/dashboard"
            aria-label="BandhanTak partner dashboard"
            className="flex min-w-0 shrink-0 items-center gap-2.5"
          >
            <BrandMark showWordmark={false} />
            <span className="hidden font-[family-name:var(--font-display)] text-[1.3rem] font-semibold leading-none tracking-tight text-ink sm:inline">
              Bandhan<span className="text-foil">Tak</span>
            </span>
          </Link>
          {/* `shrink-0` on the controls: at 360px the three switches are the
              one thing that must never clip, so the greeting yields first. */}
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            <span className="hidden max-w-40 items-center gap-1.5 truncate text-sm text-muted md:inline-flex">
              {t("layout.partnerShell.namastePrefix", "Namaste,")}{" "}
              {partnerName ?? <span className="skeleton inline-block h-3.5 w-20 rounded-full" />}
            </span>
            <LanguageToggle />
            <GoogleTranslateWidget />
            <ThemeToggle />
          </div>
        </div>
      }
    >
      {children}
    </AppShell>
  );
}

function MoreSection({
  group,
  activeHref,
  label,
  t,
  onNavigate,
}: {
  group: PartnerNavGroup;
  activeHref: string | null;
  label: string;
  t: (key: string, fallback: string) => string;
  onNavigate: () => void;
}) {
  return (
    <section aria-label={label}>
      <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-[0.12em] text-subtle">{label}</p>
      <ul className="flex flex-col">
        {groupItems(group).map((item) => {
          const active = activeHref === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-12 items-center gap-3 rounded-xl px-3 text-[0.9375rem] font-medium transition-colors",
                  active ? "bg-gold-100 text-gold-700 dark:bg-gold-900/30 dark:text-gold-300" : "text-ink hover:bg-bg-subtle",
                )}
              >
                <item.icon className="size-5 shrink-0 text-muted" />
                {t(item.key, item.label)}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
