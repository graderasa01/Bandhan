"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/LanguageProvider";

interface AppShellProps {
  children: ReactNode;
  header?: ReactNode;
  sidebar?: ReactNode;
  bottomNav?: ReactNode;
  /**
   * Full-viewport layers launched *from* the bottom nav (the nav hub).
   *
   * Kept out of `bottomNav` on purpose: that nav carries `backdrop-blur`, and a
   * backdrop-filter makes an element the containing block for its `fixed`
   * descendants — so a panel nested inside it resolves `top-0` against a 60px
   * bar and collapses to nothing instead of covering the screen.
   */
  overlay?: ReactNode;
  adminMode?: boolean;
  /** Edge-to-edge: no header/sidebar/bottom-nav/max-w cap. For immersive full-screen surfaces (e.g. Rishta Reel). */
  fullBleed?: boolean;
  /**
   * Put this shell on the BandhanTak skin — warm paper, serif headings, the
   * `.bt-*` ornament classes (see `THE PUBLIC CANVAS` in globals.css).
   *
   * A prop rather than the default because the three shells are three
   * different rooms: the member app and the marketing site share one identity,
   * the admin panel deliberately does not (an operator tool that looks like
   * the customer site is how you edit production thinking you are browsing).
   */
  canvas?: boolean;
}

export default function AppShell({
  children,
  header,
  sidebar,
  bottomNav,
  overlay,
  adminMode = false,
  fullBleed = false,
  canvas = false,
}: AppShellProps) {
  const t = useT();
  if (fullBleed) {
    // `overscroll-none`: this screen owns the finger completely (the reel's
    // details pane scrolls inside a card), so a vertical drag that runs out of
    // content must not chain into the browser's pull-to-refresh.
    //
    // The skin's tokens ride along but not its paper: a full-bleed screen is
    // its own picture edge to edge, and washing cream under it would only show
    // through as a seam at the top on an over-scroll.
    return (
      <div
        className={cn(
          "h-[100dvh] w-full overflow-hidden overscroll-none bg-bg",
          canvas && "bt-canvas bt-canvas--dense",
        )}
      >
        {children}
      </div>
    );
  }

  return (
    <div className={cn("flex min-h-screen flex-col bg-bg", canvas && "bt-canvas bt-canvas--dense bt-paper")}>
      {adminMode && (
        <div
          role="alert"
          aria-label={t("layout.appShell.adminPanelAriaLabel", "Admin panel")}
          className="flex h-12 items-center gap-2 bg-wine-700 px-4 text-sm font-bold text-white"
        >
          <span aria-hidden className="text-danger">
            🔴
          </span>
          {t("layout.appShell.adminPanel", "ADMIN PANEL")}
        </div>
      )}

      {header}

      <div className="flex flex-1">
        {sidebar && (
          <aside className="sticky top-0 hidden max-h-screen w-60 shrink-0 overflow-y-auto border-r border-line bg-surface md:flex md:flex-col">
            {sidebar}
          </aside>
        )}

        <main
          className={cn(
            "mx-auto w-full max-w-6xl flex-1 px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8",
            bottomNav && "pb-[calc(60px+var(--space-4)+env(safe-area-inset-bottom,0px))] md:pb-6",
          )}
        >
          {children}
        </main>
      </div>

      {bottomNav && (
        <nav className="fixed inset-x-0 bottom-0 z-40 flex h-[60px] border-t border-line bg-surface/95 backdrop-blur-md pb-[env(safe-area-inset-bottom,0px)] md:hidden">
          {bottomNav}
        </nav>
      )}

      {overlay}
    </div>
  );
}
