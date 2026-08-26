"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Container } from "@/components/ui/Container";
import ThemeToggle from "@/components/ui/ThemeToggle";
import LanguageToggle from "@/components/i18n/LanguageToggle";
import BrandMark from "@/components/layout/BrandMark";
import { useT } from "@/components/i18n/LanguageProvider";

const NAV_LINKS = [
  { href: "/how-it-works", key: "nav.howItWorks", label: "How It Works" },
  { href: "/pricing", key: "nav.pricing", label: "Pricing" },
  { href: "/partner-program", key: "nav.partnerProgram", label: "Partner Banein" },
  { href: "/safety", key: "nav.safety", label: "Safety" },
];

export default function PublicHeader() {
  const t = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  /**
   * Where "go inside" points, or null when nobody is signed in.
   *
   * Public pages this header sits on are not all logged-out territory —
   * /partner/pending and /pricing are both reachable while signed in — and
   * offering a signed-in account "Login / Free Profile Banayein" is a dead
   * end. Resolved server-side (`/api/auth/session` returns `landing`) because
   * a PARTNER's destination depends on `Partner.status`, which the browser
   * can't see.
   */
  const [landing, setLanding] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled && typeof json?.landing === "string") setLanding(json.landing);
      })
      .catch(() => {
        /* logged-out is the safe assumption — leave the Login buttons up */
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
            {/* The tagline only exists on the marketing header — inside the
                app the wordmark is a back-to-home affordance, not a brand
                statement, and a second line there just eats row height. */}
            <BrandMark tagline={t("brand.tagline", "Bharose par bane rishtey")} />
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
                  <span className="relative">{t(link.key, link.label)}</span>
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <LanguageToggle className="hidden sm:inline-flex" />
            <ThemeToggle className="hidden sm:grid" />

            {landing ? (
              <Link
                href={landing}
                className={cn(
                  "pc-cta hidden h-12 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-fg shadow-md",
                  "transition-all duration-200 hover:bg-primary-hover hover:shadow-gold sm:inline-flex",
                )}
              >
                {t("nav.dashboard", "Go to Dashboard")}
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="hidden h-12 items-center rounded-full px-4 text-sm font-medium text-muted transition-colors hover:text-ink sm:inline-flex"
                >
                  {t("nav.login", "Login")}
                </Link>

                <Link
                  href="/register"
                  // `pc-cta` is inert off the marketing canvas (see
                  // globals.css), so this one header can carry the gold
                  // gradient on the home page and stay flat elsewhere.
                  className={cn(
                    "pc-cta hidden h-12 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-fg shadow-md",
                    "transition-all duration-200 hover:bg-primary-hover hover:shadow-gold sm:inline-flex",
                  )}
                >
                  {t("nav.freeProfile", "Free Profile Banayein")}
                </Link>
              </>
            )}

            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label={
                open
                  ? t("nav.menuClose", "Menu band karein")
                  : t("nav.menuOpen", "Menu kholein")
              }
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
                    {t(link.key, link.label)}
                  </Link>
                ))}
              </nav>

              <div className="mt-5 flex items-center gap-3">
                {landing ? (
                  <Link
                    href={landing}
                    className="pc-cta flex h-12 flex-1 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-fg shadow-md"
                  >
                    {t("nav.dashboard", "Go to Dashboard")}
                  </Link>
                ) : (
                  <>
                    <Link
                      href="/login"
                      className="pc-cta-ghost flex h-12 flex-1 items-center justify-center rounded-full border border-line-strong text-sm font-semibold text-ink"
                    >
                      {t("nav.login", "Login")}
                    </Link>
                    <Link
                      href="/register"
                      className="pc-cta flex h-12 flex-[1.4] items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-fg shadow-md"
                    >
                      {t("nav.freeProfile", "Free Profile Banayein")}
                    </Link>
                  </>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between rounded-md bg-bg-subtle px-4 py-3">
                <span className="text-sm text-muted">{t("nav.language", "Language")}</span>
                <LanguageToggle />
              </div>

              <div className="mt-2 flex items-center justify-between rounded-md bg-bg-subtle px-4 py-3">
                <span className="text-sm text-muted">{t("nav.theme", "Theme")}</span>
                <ThemeToggle />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  );
}
