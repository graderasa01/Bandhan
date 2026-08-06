"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, X } from "lucide-react";
import {
  ADMIN_NAV_GROUPS,
  ADMIN_TONE_BY_HREF,
  ADMIN_TONE_CLASSES,
  adminNavSearch,
  isAdminNavActive,
  type AdminNavItem,
} from "./adminNavItems";
import { useAdminCounts, type AdminCounts } from "@/lib/nav/useAdminCounts";
import { cn } from "@/lib/utils";

/**
 * One component, three surfaces: the mobile More sheet, the desktop sidebar,
 * and the Control Center's site map. The admin-side twin of `NavHub`, and it
 * exists for the same reason — AdminShell had hand-written the same list twice
 * and the phone copy had already degenerated into a twelve-icon bar.
 *
 * Search matters more here than on the user side: an admin who knows they want
 * "commission" should not have to remember whether that lives under Money or
 * Queues. Ctrl+K focuses it, same as the user hub.
 */
export type AdminNavHubVariant = "sheet" | "sidebar" | "card";

export default function AdminNavHub({
  variant = "sheet",
  onNavigate,
  className,
  footer,
}: {
  variant?: AdminNavHubVariant;
  onNavigate?: () => void;
  className?: string;
  footer?: React.ReactNode;
}) {
  const pathname = usePathname();
  const counts = useAdminCounts();
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

  const results = adminNavSearch(query);
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
            placeholder={variant === "sidebar" ? "Search  (Ctrl+K)" : "Search admin"}
            aria-label="Search admin pages"
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

      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain",
          variant === "sidebar" ? "p-2" : "p-1",
        )}
      >
        {searching ? (
          results.length === 0 ? (
            <p className="px-3 py-8 text-center text-[0.8125rem] text-muted">
              &ldquo;{query}&rdquo; se kuchh nahi mila.
            </p>
          ) : (
            <ul className="pt-2">
              {results.map((item) => (
                <li key={item.href}>
                  <AdminNavRow item={item} pathname={pathname} counts={counts} onNavigate={pick} />
                </li>
              ))}
            </ul>
          )
        ) : (
          ADMIN_NAV_GROUPS.map((group) => (
            <section key={group.id} className="pt-2">
              <p className="px-3 text-[0.6875rem] font-semibold uppercase leading-4 tracking-wider text-subtle">
                {group.label}
              </p>
              {isGrid ? (
                <div className="mt-1.5 grid grid-cols-4 gap-0.5 sm:grid-cols-5">
                  {group.items.map((item) => (
                    <AdminNavTile
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
                      <AdminNavRow
                        item={item}
                        pathname={pathname}
                        counts={counts}
                        onNavigate={pick}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))
        )}

        {footer && <div className="mt-2 border-t border-line pt-1.5">{footer}</div>}
      </div>
    </div>
  );
}

function badgeFor(item: AdminNavItem, counts: AdminCounts): number {
  return item.count ? counts[item.count] : 0;
}

function AdminNavTile({
  item,
  pathname,
  counts,
  onNavigate,
}: {
  item: AdminNavItem;
  pathname: string | null;
  counts: AdminCounts;
  onNavigate: () => void;
}) {
  const active = isAdminNavActive(pathname, item.href);
  const count = badgeFor(item, counts);

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      aria-label={count > 0 ? `${item.label} — ${count} pending` : undefined}
      className="flex flex-col items-center gap-1 rounded-lg p-1.5 text-center transition-colors hover:bg-bg-subtle"
    >
      <span className="relative">
        <span
          className={cn(
            "grid size-9 place-items-center rounded-full",
            active
              ? "bg-gradient-to-br from-gold-400 to-gold-600 text-primary-fg shadow-gold"
              : ADMIN_TONE_CLASSES[ADMIN_TONE_BY_HREF[item.href]],
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

function AdminNavRow({
  item,
  pathname,
  counts,
  onNavigate,
}: {
  item: AdminNavItem;
  pathname: string | null;
  counts: AdminCounts;
  onNavigate: () => void;
}) {
  const active = isAdminNavActive(pathname, item.href);
  const count = badgeFor(item, counts);

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      aria-label={count > 0 ? `${item.label} — ${count} pending` : undefined}
      className={cn(
        "flex min-h-12 items-center gap-2.5 rounded-full px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-gradient-to-r from-gold-400 to-gold-600 text-primary-fg shadow-gold"
          : "text-ink hover:bg-bg-subtle",
      )}
    >
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-full",
          active ? "bg-white/20" : ADMIN_TONE_CLASSES[ADMIN_TONE_BY_HREF[item.href]],
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
        "grid min-w-4 shrink-0 place-items-center rounded-full bg-wine-700 px-1 text-[0.625rem] font-semibold leading-4 text-white",
        floating && "absolute -right-1 -top-1",
      )}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}
