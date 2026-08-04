"use client";

import { ReactNode, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  Bookmark,
  Bot,
  CalendarHeart,
  CreditCard,
  Eye,
  FileText,
  Film,
  Flame,
  Heart,
  Home,
  LogOut,
  Menu,
  MessageCircle,
  Send,
  ShieldCheck,
  Sparkles,
  User as UserIcon,
  Users,
} from "lucide-react";
import AppShell from "./AppShell";
import NoticeBell from "@/components/notice/NoticeBell";
import { cn } from "@/lib/utils";

interface UserShellProps {
  children: ReactNode;
  userName?: string;
  fullBleed?: boolean;
}

/**
 * Kinds of tone, not a fourth CTA colour — D-26 still holds for buttons
 * (gold + mehroon, nothing else). These are the same non-action semantic
 * tokens `Card`'s `trust`/`info` variants already use elsewhere (badges,
 * notice chips), applied here as icon-badge backgrounds so a full site map
 * (InterviewMode's "live" screen) can read at a glance without inventing a
 * new palette.
 */
export type NavTone = "gold" | "wine" | "trust" | "info";

export const NAV_TONE_CLASSES: Record<NavTone, string> = {
  gold: "bg-gold-100 text-gold-700 dark:bg-gold-900/30 dark:text-gold-300",
  wine: "bg-wine-100 text-wine-700 dark:bg-wine-900/30 dark:text-wine-300",
  trust: "bg-trust/15 text-trust",
  info: "bg-info-bg text-info",
};

export const NAV = [
  { href: "/user/dashboard", label: "Dashboard", icon: Home, tone: "gold" as NavTone },
  { href: "/user/reel", label: "Rishta Reel", icon: Film, tone: "gold" as NavTone },
  { href: "/user/vibe", label: "Vibe", icon: Flame, tone: "gold" as NavTone },
  { href: "/user/circle", label: "Serious Circle", icon: CalendarHeart, tone: "wine" as NavTone },
  { href: "/user/inbox", label: "Aapke liye", icon: Bell, tone: "info" as NavTone },
  // Profile editing lives outside this shell — see app/(onboarding).
  { href: "/profile/build", label: "My Profile", icon: UserIcon, tone: "gold" as NavTone },
  // Read-only self-view: how the profile looks, not how to edit it.
  { href: "/user/profile/me", label: "Meri Profile", icon: Eye, tone: "gold" as NavTone },
  { href: "/user/biodata", label: "Biodata", icon: FileText, tone: "gold" as NavTone },
  { href: "/user/profile-trust-score", label: "Trust Score", icon: ShieldCheck, tone: "trust" as NavTone },
  { href: "/user/deep-profile", label: "Deep Profile", icon: Sparkles, tone: "trust" as NavTone },
  { href: "/user/concierge", label: "Grio", icon: Bot, tone: "info" as NavTone },
  { href: "/user/matches", label: "Matches", icon: Heart, tone: "gold" as NavTone },
  { href: "/user/shortlist", label: "Meri Shortlist", icon: Bookmark, tone: "gold" as NavTone },
  { href: "/user/family", label: "Family Circle", icon: Users, tone: "wine" as NavTone },
  { href: "/user/interests", label: "Interests", icon: Send, tone: "info" as NavTone },
  { href: "/user/messages", label: "Messages", icon: MessageCircle, tone: "info" as NavTone },
  { href: "/user/subscription", label: "Subscription", icon: CreditCard, tone: "wine" as NavTone },
];

// Reel is now the primary discovery loop — an explicit set, not a slice.
// Vibe takes Interests' slot here (Devesh, 2026-08-02): Interests already
// overlaps with Matches, while Vibe's daily question/poll only works as a
// habit if it's one tap away, not buried in More. Interests lives on in the
// More sheet — nothing about it was removed, only its nav prominence.
const BOTTOM_MAIN = NAV.filter((n) =>
  ["/user/dashboard", "/user/reel", "/user/vibe", "/user/matches"].includes(n.href),
);
const BOTTOM_MORE = NAV.filter((n) => !BOTTOM_MAIN.includes(n));

export default function UserShell({ children, userName = "Test User A", fullBleed = false }: UserShellProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <nav className="flex-1 space-y-0.5 p-2 pt-4">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-12 items-center gap-2.5 rounded-full px-3.5 py-2 text-sm font-medium transition-all duration-200",
                active
                  ? "bg-gradient-to-r from-gold-400 to-gold-600 text-primary-fg shadow-gold"
                  : "text-ink hover:bg-bg-subtle",
              )}
            >
              {item.icon && <item.icon className="size-4 shrink-0" />}
              {item.label}
            </Link>
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
          Logout
        </button>
      </div>
    </div>
  );

  const bottomNavContent = (
    <>
      {BOTTOM_MAIN.map((item) => {
        const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex min-w-12 flex-1 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium transition-colors",
              active ? "text-gold-700" : "text-muted",
            )}
          >
            <span
              className={cn(
                "grid size-9 place-items-center rounded-full transition-all duration-200",
                active && "bg-gradient-to-br from-gold-400 to-gold-600 text-primary-fg shadow-gold",
              )}
            >
              {item.icon && <item.icon className="size-5" />}
            </span>
            {item.label}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={() => setMoreOpen((o) => !o)}
        className="flex min-w-12 flex-1 flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium text-muted"
      >
        <Menu className="size-5" />
        More
      </button>
      {moreOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
          <div className="fixed inset-x-0 bottom-[60px] z-40 max-h-[70vh] overflow-y-auto overscroll-contain border-t border-line bg-surface p-2 pb-[env(safe-area-inset-bottom,0px)] shadow-lg">
            {BOTTOM_MORE.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className="block min-h-12 rounded-md px-3 py-3 text-sm text-ink hover:bg-bg-subtle"
              >
                {item.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={logout}
              className="block w-full min-h-12 rounded-md px-3 py-3 text-left text-sm text-muted hover:bg-bg-subtle"
            >
              Logout
            </button>
          </div>
        </>
      )}
    </>
  );

  return (
    <AppShell
      fullBleed={fullBleed}
      sidebar={sidebarContent}
      bottomNav={bottomNavContent}
      header={
        <div className="flex h-14 items-center gap-2 border-b border-line bg-surface px-4 sm:px-6">
          <span className="font-[family-name:var(--font-display)] text-base font-semibold text-wine-700">
            BandhanTak
          </span>
          <span className="ml-auto hidden text-sm text-muted sm:inline">Namaste, {userName}</span>
          <NoticeBell className="-mr-2" />
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
