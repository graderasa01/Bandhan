"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, X } from "lucide-react";
import {
  NAV_GROUPS,
  NAV_TONE_BY_HREF,
  NAV_TONE_CLASSES,
  isNavActive,
  navSearch,
  type NavItem,
} from "./navItems";
import { useNavCounts, type NavCounts } from "@/lib/nav/useNavCounts";
import { useRecentPages } from "@/lib/nav/recentPages";
import { cn } from "@/lib/utils";

/**
 * One component, three surfaces: the mobile More sheet, the desktop sidebar,
 * and the site map on the profile "live" screen. They used to be three
 * hand-written lists over the same data and had already drifted apart — only
 * two of them had icons, none of them had counts, and a new page had to be
 * added in three places or it silently went missing from one.
 *
 * The variant changes the shape, never the contents:
 *  - `sheet` / `card` — icon tiles in a grid, which fits nineteen destinations
 *    on one screen without scrolling and lets the eye land on a group instead
 *    of reading down a list.
 *  - `sidebar` — rows, because 240px can't hold a readable four-column grid.
 */
export type NavHubVariant = "sheet" | "sidebar" | "card";

export default function NavHub({
  variant = "sheet",
  onNavigate,
  className,
  footer,
}: {
  variant?: NavHubVariant;
  /** Called after any destination is picked — the sheet uses it to close itself. */
  onNavigate?: () => void;
  className?: string;
  /** Rendered at the bottom, inside the same scroll area (logout, etc.). */
  footer?: React.ReactNode;
}) {
  const pathname = usePathname();
  const counts = useNavCounts();
  const recents = useRecentPages(pathname);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Desktop only: the sidebar is always mounted, so it owns the shortcut. The
  // sheet would fight it for focus while sitting invisible behind `md:hidden`.
  useEffect(() => {
    if (variant !== "sidebar") return;
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [variant]);

  const results = navSearch(query);
  const searching = query.trim().length > 0;
  const isGrid = variant !== "sidebar";

  function pick() {
    setQuery("");
    onNavigate?.();
  }

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className={cn("shrink-0", variant === "sidebar" ? "px-2 pt-3" : "px-1 pt-1")}>
        <div className="flex items-center gap-2 rounded-full border border-line bg-bg-subtle px-3">
          <Search className="size-4 shrink-0 text-subtle" aria-hidden />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={variant === "sidebar" ? "Search  (Ctrl+K)" : "Search anything"}
            aria-label="Search pages"
            className="min-h-12 w-full min-w-0 border-0 bg-transparent text-sm text-ink outline-none placeholder:text-subtle [&::-webkit-search-cancel-button]:hidden"
          />
          {searching && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="grid size-8 shrink-0 place-items-center rounded-full text-subtle hover:text-ink"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", variant === "sidebar" ? "p-2" : "p-1")}>
        {searching ? (
          results.length === 0 ? (
            <p className="px-3 py-8 text-center text-[0.8125rem] text-muted">
              &ldquo;{query}&rdquo; se kuchh nahi mila.
            </p>
          ) : (
            <ul className="pt-2">
              {results.map((item) => (
                <li key={item.href}>
                  <NavRow item={item} pathname={pathname} counts={counts} onNavigate={pick} />
                </li>
              ))}
            </ul>
          )
        ) : (
          <>
            {isGrid && recents.length > 0 && (
              <section className="pt-2">
                <GroupLabel>Recent</GroupLabel>
                <div className="mt-1.5 flex gap-1.5">
                  {recents.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={pick}
                      className="flex min-h-11 flex-1 items-center gap-2 rounded-full border border-line px-3 py-1.5 text-[0.75rem] font-medium text-ink transition-colors hover:bg-bg-subtle"
                    >
                      <item.icon className="size-4 shrink-0 text-subtle" />
                      <span className="min-w-0 truncate">{item.label}</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {NAV_GROUPS.map((group) => (
              <section key={group.id} className="pt-2">
                <GroupLabel>{group.label}</GroupLabel>
                {isGrid ? (
                  <div className="mt-1.5 grid grid-cols-4 gap-0.5 sm:grid-cols-5">
                    {group.items.map((item) => (
                      <NavTile
                        key={item.href}
                        item={item}
                        pathname={pathname}
                        counts={counts}
                        onNavigate={pick}
                      />
                    ))}
                  </div>
                ) : (
                  <ul className="mt-0.5">
                    {group.items.map((item) => (
                      <li key={item.href}>
                        <NavRow item={item} pathname={pathname} counts={counts} onNavigate={pick} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </>
        )}

        {footer && <div className="mt-2 border-t border-line pt-1.5">{footer}</div>}
      </div>
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 text-[0.6875rem] font-semibold uppercase leading-4 tracking-wider text-subtle">
      {children}
    </p>
  );
}

function badgeFor(item: NavItem, counts: NavCounts): number {
  return item.count ? counts[item.count] : 0;
}

function NavTile({
  item,
  pathname,
  counts,
  onNavigate,
}: {
  item: NavItem;
  pathname: string | null;
  counts: NavCounts;
  onNavigate: () => void;
}) {
  const active = isNavActive(pathname, item.href);
  const count = badgeFor(item, counts);

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      aria-label={count > 0 ? `${item.label} — ${count} new` : undefined}
      className="flex flex-col items-center gap-1 rounded-lg p-1.5 text-center transition-colors hover:bg-bg-subtle"
    >
      <span className="relative">
        <span
          className={cn(
            "grid size-9 place-items-center rounded-full",
            active
              ? "bg-gradient-to-br from-primary to-primary-hover text-primary-fg shadow-gold"
              : NAV_TONE_CLASSES[NAV_TONE_BY_HREF[item.href]],
          )}
        >
          <item.icon className="size-4" />
        </span>
        {count > 0 && <CountBadge count={count} floating />}
      </span>
      <span className="w-full truncate text-[0.6875rem] font-medium leading-tight text-ink">
        {item.label}
      </span>
    </Link>
  );
}

function NavRow({
  item,
  pathname,
  counts,
  onNavigate,
}: {
  item: NavItem;
  pathname: string | null;
  counts: NavCounts;
  onNavigate: () => void;
}) {
  const active = isNavActive(pathname, item.href);
  const count = badgeFor(item, counts);

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      aria-label={count > 0 ? `${item.label} — ${count} new` : undefined}
      className={cn(
        "flex min-h-12 items-center gap-2.5 rounded-full px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-gradient-to-r from-primary to-primary-hover text-primary-fg shadow-gold" : "text-ink hover:bg-bg-subtle",
      )}
    >
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-full",
          active ? "bg-white/20" : NAV_TONE_CLASSES[NAV_TONE_BY_HREF[item.href]],
        )}
      >
        <item.icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {count > 0 && <CountBadge count={count} />}
    </Link>
  );
}

/** `aria-hidden` because the number is already in the link's own aria-label — a badge read on its own is just a loose digit. */
function CountBadge({ count, floating }: { count: number; floating?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid min-w-4 shrink-0 place-items-center rounded-full bg-accent px-1 text-[0.625rem] font-semibold leading-4 text-accent-fg",
        floating && "absolute -right-1 -top-1",
      )}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}
