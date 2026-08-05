"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Handshake, Headset, IndianRupee, LogOut, Mic, MessageCircleQuestion, ShieldAlert, ShieldCheck, Sparkles, ToggleRight, Wallet } from "lucide-react";
import AppShell from "./AppShell";
import { cn } from "@/lib/utils";

interface AdminShellProps {
  children: ReactNode;
  adminName?: string;
}

// Only routes that actually exist. The rest of the M15 admin surface
// (users, profiles, commissions, payouts, audit logs) is not built yet —
// listing dead links here would just be another form of mock data.
const NAV = [
  { href: "/admin/verification", label: "Verification", icon: ShieldCheck },
  { href: "/admin/moderation", label: "Moderation", icon: ShieldAlert },
  { href: "/admin/partners", label: "Partners", icon: Handshake },
  { href: "/admin/commissions", label: "Commissions", icon: Wallet },
  { href: "/admin/matchmaker", label: "Matchmaker", icon: Headset },
  { href: "/admin/pricing", label: "Pricing", icon: IndianRupee },
  { href: "/admin/ai-settings", label: "AI Settings", icon: Sparkles },
  { href: "/admin/features", label: "Features & Access", icon: ToggleRight },
  { href: "/admin/polls", label: "Mindset Arena Sawaal", icon: MessageCircleQuestion },
  { href: "/admin/voice-access", label: "Voice Access", icon: Mic },
];

export default function AdminShell({ children, adminName = "Admin" }: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();

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
        <p className="mt-1 text-sm text-muted">Admin: {adminName}</p>
      </div>

      <nav className="flex-1 space-y-0.5 p-2 pt-4">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-12 items-center gap-2.5 rounded-full px-3.5 py-2 text-sm font-medium transition-all duration-200",
                active ? "bg-gradient-to-r from-gold-400 to-gold-600 text-primary-fg shadow-gold" : "text-ink hover:bg-bg-subtle",
              )}
            >
              <item.icon className="size-4 shrink-0" />
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
      {NAV.map((item) => {
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
            <item.icon className="size-5" />
            {item.label}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={logout}
        className="flex min-w-12 flex-1 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium text-muted"
      >
        <LogOut className="size-5" />
        Logout
      </button>
    </>
  );

  return (
    <AppShell
      adminMode
      sidebar={sidebarContent}
      bottomNav={bottomNavContent}
      header={
        <div className="flex h-14 items-center border-b border-line bg-surface px-4 sm:px-6">
          <span className="font-[family-name:var(--font-display)] text-base font-semibold text-wine-700">
            BandhanTak
          </span>
          <span className="ml-auto text-sm text-muted">{adminName}</span>
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
