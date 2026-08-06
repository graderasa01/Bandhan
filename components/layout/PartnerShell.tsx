"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BadgeIndianRupee, LayoutDashboard, LogOut, Share2, UserPlus, Users, Wallet } from "lucide-react";
import AppShell from "./AppShell";
import { cn } from "@/lib/utils";

interface PartnerShellProps {
  children: ReactNode;
  partnerName: string;
  partnerCode?: string | null;
}

const NAV = [
  { href: "/partner/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/partner/invite", label: "Invite Someone", icon: UserPlus },
  { href: "/partner/leads", label: "My Leads", icon: Users },
  { href: "/partner/referral-tools", label: "Referral Tools", icon: Share2 },
  { href: "/partner/commissions", label: "Commissions", icon: BadgeIndianRupee },
  { href: "/partner/payouts", label: "Payouts", icon: Wallet },
];

export default function PartnerShell({ children, partnerName, partnerCode }: PartnerShellProps) {
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
        <p className="mt-1 text-sm text-muted">Namaste, {partnerName}</p>
        {partnerCode && (
          <p className="mt-1 font-mono text-sm font-semibold text-primary-text">{partnerCode}</p>
        )}
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
                active
                  ? "bg-gradient-to-r from-gold-400 to-gold-600 text-primary-fg shadow-gold"
                  : "text-ink hover:bg-bg-subtle",
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
      {NAV.slice(0, 4).map((item) => {
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
              <item.icon className="size-5" />
            </span>
            {item.label}
          </Link>
        );
      })}
      <Link
        href="/partner/payouts"
        className="flex min-w-12 flex-1 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium text-muted"
      >
        <span className="grid size-9 place-items-center rounded-full">
          <Wallet className="size-5" />
        </span>
        Payouts
      </Link>
    </>
  );

  return (
    <AppShell
      sidebar={sidebarContent}
      bottomNav={bottomNavContent}
      header={
        <div className="flex h-14 items-center border-b border-line bg-surface px-4 sm:px-6">
          <span className="font-[family-name:var(--font-display)] text-base font-semibold text-wine-700">
            BandhanTak
          </span>
          <span className="ml-auto text-sm text-muted">Namaste, {partnerName}</span>
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
