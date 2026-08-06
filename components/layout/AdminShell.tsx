"use client";

import { ReactNode, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ExternalLink, LogOut, Menu, X } from "lucide-react";
import AppShell from "./AppShell";
import AdminNavHub from "./AdminNavHub";
import { ADMIN_NAV_ITEMS, ADMIN_RAIL, isAdminNavActive } from "./adminNavItems";
import { useAdminCounts } from "@/lib/nav/useAdminCounts";
import { cn } from "@/lib/utils";

interface AdminShellProps {
  children: ReactNode;
  adminName?: string;
}

/**
 * The admin chrome.
 *
 * What it replaced: a flat eleven-item array rendered twice by hand. On desktop
 * that was a long ungrouped list with no sense of which pages had work waiting;
 * on a phone it was all eleven *plus Logout* crammed into a 60px bar — twelve
 * icons across roughly 375px, about 31px each. Nobody was using the admin panel
 * on a phone, and this was why.
 *
 * Now: `adminNavItems.ts` is the one list, `AdminNavHub` renders it for both
 * sidebar and sheet, the rail carries four destinations plus More, and pending
 * counts are visible before you open anything.
 */
export default function AdminShell({ children, adminName = "Admin" }: AdminShellProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const counts = useAdminCounts();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const footerLinks = (
    <div className="flex flex-col gap-0.5">
      <Link
        href="/"
        className="inline-flex min-h-12 items-center gap-2 rounded-full px-3 text-sm text-muted transition-colors hover:bg-bg-subtle hover:text-ink"
      >
        <ExternalLink className="size-4" />
        View site
      </Link>
      <button
        type="button"
        onClick={logout}
        className="inline-flex min-h-12 items-center gap-2 rounded-full px-3 text-sm text-muted transition-colors hover:bg-bg-subtle hover:text-ink"
      >
        <LogOut className="size-4" />
        Logout
      </button>
    </div>
  );

  // Work that would badge, but sits behind More on a phone. Shown as a dot, not
  // a number: summing unrelated queues into one figure would mean "seven of
  // nothing in particular", and the real numbers are one tap away.
  const railHrefs = new Set(ADMIN_RAIL.map((i) => i.href));
  const hiddenCount = ADMIN_NAV_ITEMS.reduce(
    (sum, item) => (item.count && !railHrefs.has(item.href) ? sum + counts[item.count] : sum),
    0,
  );

  const bottomNavContent = (
    <>
      {ADMIN_RAIL.map((item) => {
        const active = isAdminNavActive(pathname, item.href);
        const count = item.count ? counts[item.count] : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            aria-label={count > 0 ? `${item.label} — ${count} pending` : undefined}
            className={cn(
              "flex min-w-12 flex-1 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium transition-colors",
              active ? "text-gold-700" : "text-muted",
            )}
          >
            <span className="relative">
              <span
                className={cn(
                  "grid size-9 place-items-center rounded-full transition-all duration-200",
                  active && "bg-gradient-to-br from-gold-400 to-gold-600 text-primary-fg shadow-gold",
                )}
              >
                <item.icon className="size-5" />
              </span>
              {count > 0 && (
                <span
                  aria-hidden
                  className="absolute -right-1 -top-0.5 grid min-w-4 place-items-center rounded-full bg-wine-700 px-1 text-[0.625rem] font-semibold leading-4 text-white"
                >
                  {count > 9 ? "9+" : count}
                </span>
              )}
            </span>
            <span className="w-full truncate px-0.5">{item.label}</span>
          </Link>
        );
      })}

      <button
        type="button"
        onClick={() => setMoreOpen((o) => !o)}
        aria-expanded={moreOpen}
        aria-label={hiddenCount > 0 ? "More — kuchh pending hai" : "More"}
        className="flex min-w-12 flex-1 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium text-muted"
      >
        <span className="relative grid size-9 place-items-center">
          <Menu className="size-5" />
          {hiddenCount > 0 && !moreOpen && (
            <span aria-hidden className="absolute right-1 top-1 size-2 rounded-full bg-wine-700" />
          )}
        </span>
        More
      </button>
    </>
  );

  /* Full height above the rail rather than a peek — sixteen touch-sized tiles
     plus search do not fit in a partial sheet. Passed as AppShell's `overlay`
     and not nested inside `bottomNav`: that bar carries `backdrop-blur`, which
     makes it the containing block for any `fixed` descendant, so a panel nested
     there resolves `top-0` against a 60px bar and collapses. */
  const moreOverlay = moreOpen && (
    <div className="fixed inset-x-0 bottom-[60px] top-0 z-50 flex flex-col bg-surface md:hidden">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
        <span className="text-sm font-semibold text-ink">Admin controls</span>
        <button
          type="button"
          onClick={() => setMoreOpen(false)}
          aria-label="Close"
          className="-mr-2 ml-auto grid size-10 place-items-center rounded-full text-muted transition-colors hover:bg-bg-subtle hover:text-ink"
        >
          <X className="size-5" />
        </button>
      </div>
      <AdminNavHub
        variant="sheet"
        className="min-h-0 flex-1"
        onNavigate={() => setMoreOpen(false)}
        footer={footerLinks}
      />
    </div>
  );

  const sidebar = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-line p-4">
        <Link
          href="/admin"
          className="font-[family-name:var(--font-display)] text-lg font-bold text-wine-700"
        >
          BandhanTak
        </Link>
        <p className="mt-1 truncate text-sm text-muted">Admin: {adminName}</p>
      </div>
      <AdminNavHub variant="sidebar" className="min-h-0 flex-1" footer={footerLinks} />
    </div>
  );

  return (
    <AppShell
      adminMode
      sidebar={sidebar}
      bottomNav={bottomNavContent}
      overlay={moreOverlay}
      header={
        <div className="flex h-14 items-center gap-2 border-b border-line bg-surface px-4 sm:px-6">
          <Link
            href="/admin"
            className="font-[family-name:var(--font-display)] text-base font-semibold text-wine-700"
          >
            BandhanTak
          </Link>
          <span className="ml-auto truncate text-sm text-muted">{adminName}</span>
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
