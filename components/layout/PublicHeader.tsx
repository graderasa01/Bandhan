"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Container } from "@/components/ui/Container";
import ThemeToggle from "@/components/ui/ThemeToggle";
import BrandMark from "@/components/layout/BrandMark";

const NAV_LINKS = [
  { href: "/how-it-works", label: "Kaise Kaam Karta Hai" },
  { href: "/pricing", label: "Pricing" },
  { href: "/partner-program", label: "Partner Banein" },
  { href: "/safety", label: "Safety" },
];

export default function PublicHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Close the sheet whenever navigation lands on a new route.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header
      className={cn(
        "sticky top-0 z-30 transition-all duration-300",
        scrolled
          ? "border-b border-line/70 bg-bg/80 backdrop-blur-xl supports-[backdrop-filter]:bg-bg/65"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <Container size="wide">
        <div className="flex h-16 items-center justify-between gap-4 lg:h-[72px]">
          <Link
            href="/"
            className="touch-target flex shrink-0 items-center"
            aria-label="BandhanTak home"
          >
            <BrandMark />
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
            {NAV_LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-12 items-center rounded-full px-4 text-sm font-medium transition-colors",
                    active ? "text-ink" : "text-muted hover:text-ink",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-active"
                      className="absolute inset-0 rounded-full bg-gold-50 dark:bg-gold-900/40"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    />
                  )}
                  <span className="relative">{link.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle className="hidden sm:grid" />

            <Link
              href="/login"
              className="hidden h-12 items-center rounded-full px-4 text-sm font-medium text-muted transition-colors hover:text-ink sm:inline-flex"
            >
              Login
            </Link>

            <Link
              href="/register"
              className={cn(
                "hidden h-12 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-fg shadow-md",
                "transition-all duration-200 hover:bg-primary-hover hover:shadow-gold sm:inline-flex",
              )}
            >
              Free Profile Banayein
            </Link>

            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label={open ? "Menu band karein" : "Menu kholein"}
              className="grid size-12 place-items-center rounded-full border border-line bg-surface text-ink lg:hidden"
            >
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>
      </Container>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 top-16 z-40 bg-sand-900/40 backdrop-blur-sm lg:hidden"
              aria-hidden
            />
            <motion.div
              key="sheet"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="fixed inset-x-0 top-16 z-50 border-b border-line bg-surface p-5 shadow-xl lg:hidden"
            >
              <nav className="flex flex-col" aria-label="Mobile">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      "border-b border-line/60 py-4 text-[0.9375rem] font-medium transition-colors",
                      pathname === link.href ? "text-primary" : "text-ink",
                    )}
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>

              <div className="mt-5 flex items-center gap-3">
                <Link
                  href="/login"
                  className="flex h-12 flex-1 items-center justify-center rounded-full border border-line-strong text-sm font-semibold text-ink"
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  className="flex h-12 flex-[1.4] items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-fg shadow-md"
                >
                  Free Profile Banayein
                </Link>
              </div>

              <div className="mt-4 flex items-center justify-between rounded-md bg-bg-subtle px-4 py-3">
                <span className="text-sm text-muted">Theme</span>
                <ThemeToggle />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  );
}
