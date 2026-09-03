import type { ReactNode } from "react";
import Link from "next/link";
import BrandMark from "@/components/layout/BrandMark";
import ThemeToggle from "@/components/ui/ThemeToggle";
import LanguageToggle from "@/components/i18n/LanguageToggle";
import GoogleTranslateWidget from "@/components/i18n/GoogleTranslateWidget";

/**
 * Chrome for a single focused step that sits *outside* the app proper.
 *
 * `OnboardingShell` already answers this need for `/profile/build`, but it
 * reads `useProfile()` — stage, completion, the erase-draft control — so it can
 * only be used inside the `(onboarding)` route group's provider. A step that
 * runs before a draft exists (contact verification straight after registering)
 * has no stage to report and no draft to erase, so it needs the same absence of
 * navigation without the profile machinery.
 *
 * What is deliberately missing: sidebar, bottom nav, notice bell, any link into
 * `/user/*`. A brand-new account has nothing behind those links yet, and the
 * page's own "Skip for now" is the way forward. What stays is the way *out* —
 * the brand mark home — plus the two controls that change how the page itself
 * reads rather than where you are.
 */
export default function FocusShell({ children }: { children: ReactNode }) {
  return (
    /* Tokens only, not `bt-paper`: this shell already lays its own blush
       wash over the ground below, and the skin's cream + grain under that
       is two textures fighting. The warm surfaces, hairlines and serif
       page titles are what make register → verify → build read as the
       same product as everything the user lands in afterwards. */
    <div className="bt-canvas bt-canvas--dense relative flex min-h-dvh flex-col bg-bg">
      {/* Same wash as OnboardingShell, so the register → verify → build run
          reads as one continuous surface rather than three screens. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(120%_80%_at_50%_-10%,var(--color-rose-50)_0%,transparent_55%)] dark:bg-[radial-gradient(120%_80%_at_50%_-10%,var(--color-rose-900)_0%,transparent_55%)]"
      />

      <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/70 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="flex min-h-12 items-center justify-center"
            aria-label="BandhanTak home"
          >
            <BrandMark />
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <LanguageToggle className="hidden sm:inline-flex" />
            <GoogleTranslateWidget className="hidden sm:inline-flex" />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-6 sm:px-6 lg:pt-10">{children}</div>
      </main>
    </div>
  );
}
