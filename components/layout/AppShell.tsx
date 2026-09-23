"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import AmbientBackground from "@/components/theme/AmbientBackground";
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
  /** Edge-to-edge: no header/sidebar/bottom-nav/max-w cap. For full-screen surfaces with their own way out (chat thread, previews). */
  fullBleed?: boolean;
  /**
   * Edge-to-edge content that is still *inside* the app: no header and no
   * padding, but the bottom nav stays on mobile and the sidebar on desktop.
   *
   * Built for the Rishta Reel. It used to be `fullBleed`, which dropped every
   * piece of navigation, and members got stuck in it — the only way out was a
   * "Dashboard" button that cost the reel one of its four action slots. A
   * photo feed does not need to hide the app's nav to feel immersive; it needs
   * the nav to stop competing with the photo. So here the nav is in the flow
   * (the content ends where the bar begins, nothing overlaps the photo) and it
   * is dark, the way a photo app's bar goes dark on its feed. Same items, same
   * order, same badges as every other page — only the ground changes.
   */
  immersive?: boolean;
  /**
   * Put this shell on the BandhanTak skin — warm paper, serif headings, the
   * `.bt-*` ornament classes (see `THE BANDHANTAK CANVAS` in globals.css).
   *
   * Every shell passes it today. It stays a prop rather than becoming the
   * default because "on the skin" is a decision a shell should have to make
   * out loud: a future surface that genuinely needs its own ground — a
   * full-screen player, an embed, a print view — should read as an exception
   * in its own file, not be one silently.
   *
   * The admin panel is on it too. What separates that room from the customer
   * one is `adminMode`'s red bar, which no palette can be relied on to do —
   * a colour difference is a signal an operator stops seeing by the third
   * visit, and a red banner across the top is not.
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
  immersive = false,
  canvas = false,
}: AppShellProps) {
  const t = useT();
  if (immersive) {
    return (
      <div
        className={cn(
          "h-[100dvh] w-full overflow-hidden overscroll-none bg-bg",
          canvas && "bt-glass dark isolate bt-canvas bt-canvas--dense",
        )}
      >
        {canvas && <AmbientBackground variant="deep" />}
        {/* The layout lives one level in, not on the themed element: `.bt-glass`
            sets `display: flow-root` in unlayered CSS, which silently beats a
            `flex` utility on the same node (the canvas-skin cascade rule). */}
        <div className="flex h-full w-full">
          {/* Same classes as the ordinary shell's sidebar, `sticky` included:
              the glass theme keys its opaque-overlay rule off it, and a
              translucent sidebar over the deep room would read as a second,
              fainter page beside the reel. */}
          {sidebar && (
            <aside className="sticky top-0 hidden max-h-screen w-60 shrink-0 overflow-y-auto border-r border-line bg-surface md:flex md:flex-col">
              {sidebar}
            </aside>
          )}
          <div className="flex min-w-0 flex-1 flex-col">
            <main className="relative min-h-0 flex-1">{children}</main>
            {/* In the flow, not fixed: the content ends exactly where the bar
                begins, so nothing the reel draws is ever under it. Solid rather
                than blurred — a backdrop-filter here would make this bar the
                containing block of every fixed layer inside it (see `overlay`),
                and a photo's colours bleeding into the nav is noise. */}
            {bottomNav && (
              <nav className="flex h-[calc(60px+env(safe-area-inset-bottom,0px))] shrink-0 border-t border-white/10 bg-[rgb(10_8_16)] pb-[env(safe-area-inset-bottom,0px)] md:hidden">
                {bottomNav}
              </nav>
            )}
          </div>
        </div>
        {overlay}
      </div>
    );
  }
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
          canvas && "bt-glass dark isolate bt-canvas bt-canvas--dense",
        )}
      >
        {canvas && <AmbientBackground variant="deep" />}
        {children}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex min-h-screen flex-col bg-bg",
        // The glass theme rides on the same `canvas` decision the skin already
        // made: one flag, one room, every signed-in shell. `dark` comes with
        // it because the product's whole dark-mode pass — including the raw
        // wine-text rescue at the foot of globals.css — is written against it.
        canvas && "bt-glass dark isolate bt-canvas bt-canvas--dense bt-paper",
      )}
    >
      {canvas && <AmbientBackground variant={adminMode ? "deep" : "soft"} />}
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
