"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Share, Smartphone, SquarePlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/motion";
import { registerWorker } from "@/lib/notices/pushClient";

/**
 * "Install App" nudge — mounted once above every /user/* page.
 *
 * ## Why two completely different branches
 *
 * Android/Chrome hands us `beforeinstallprompt`: we cancel Chrome's own
 * mini-infobar and hold the event so *we* choose the moment to ask, then
 * replay it through `prompt()` on tap. That is a real one-tap install.
 *
 * iOS Safari has no such event and no programmatic install path at all —
 * Add to Home Screen lives only in Safari's own Share sheet, which no page
 * can open. So the iOS branch cannot be a button; the honest version is short
 * visual instructions pointing at the two controls the user has to tap. This
 * matters more than it looks: a large share of the user base is on iPhone, and
 * an install nudge that silently no-ops on iOS would miss most of them.
 *
 * ## Why it never appears for installed users
 *
 * Two independent signals, because neither covers both platforms. The
 * `display-mode: standalone` media query is the standard one; `navigator.standalone`
 * is a WebKit-only leftover that is the *only* signal on older iOS. Checking
 * both is what stops the app telling a user who already installed it to install it.
 */

/** Not in lib.dom — Chrome-only, and still non-standard. */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

/** One key, holding "don't ask again before this epoch ms". */
const SNOOZE_KEY = "bt-install-nudge-until";
const DAY_MS = 24 * 60 * 60 * 1000;
/** A "Not Now" is not a "no" — but 30 days of silence is the price of asking. */
const DISMISS_DAYS = 30;
/** Installed (or accepted): effectively never ask again on this browser. */
const INSTALLED_DAYS = 3650;
/** Long enough that the card arrives after the page has settled, not during paint. */
const APPEAR_DELAY_MS = 3500;
/** Matches the card's transition duration so the exit finishes before unmount. */
const EXIT_MS = 260;

/**
 * Immersive, full-bleed surfaces own their whole viewport — a floating card
 * over the Reel or mid-onboarding is an interruption, not a nudge.
 */
const HIDDEN_ON = ["/user/reel", "/user/concierge", "/user/profile-setup"];

function isStandalone(): boolean {
  // Any of the installed display modes counts; a manifest can ship
  // `minimal-ui` or `fullscreen` instead of `standalone`.
  const installedDisplay = ["standalone", "fullscreen", "minimal-ui"].some((mode) =>
    window.matchMedia(`(display-mode: ${mode})`).matches,
  );
  const iosInstalled =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return installedDisplay || iosInstalled;
}

function isIosSafari(): boolean {
  const ua = window.navigator.userAgent;
  const isIos =
    /iphone|ipad|ipod/i.test(ua) ||
    // iPadOS 13+ reports a desktop Mac UA; the touch points give it away.
    (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  if (!isIos) return false;
  // Every iOS browser is WebKit underneath, but only Safari's Share sheet has
  // the Add to Home Screen row — so only Safari gets these instructions.
  return !/crios|fxios|edgios|opios/i.test(ua);
}

function isSnoozed(): boolean {
  try {
    const until = Number(window.localStorage.getItem(SNOOZE_KEY));
    return Number.isFinite(until) && until > Date.now();
  } catch {
    // Private mode / storage blocked — better to ask than to crash.
    return false;
  }
}

function snooze(days: number) {
  try {
    window.localStorage.setItem(SNOOZE_KEY, String(Date.now() + days * DAY_MS));
  } catch {
    /* storage blocked — the card is dismissed for this session regardless */
  }
}

type Mode = "none" | "android" | "ios";

export default function InstallAppPrompt() {
  const pathname = usePathname();
  const [mode, setMode] = useState<Mode>("none");
  const [shown, setShown] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone() || isSnoozed()) return;

    // Older Chrome/Android WebView only treat a site as installable once a
    // service worker controls the scope. The app already ships one (push-only,
    // no fetch handler by design) but registers it lazily on push opt-in — so a
    // user who never enabled notifications would never see an install prompt.
    // Same single registration path as push, so there is still only one.
    void registerWorker();

    let appearTimer: ReturnType<typeof setTimeout> | undefined;

    function onBeforeInstallPrompt(event: Event) {
      // Without this, Chrome shows its own mini-infobar and ours becomes the
      // second ask on screen. Cancelling it makes this card the only one.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      appearTimer = setTimeout(() => setMode("android"), APPEAR_DELAY_MS);
    }

    function onInstalled() {
      snooze(INSTALLED_DAYS);
      setDeferred(null);
      setMode("none");
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // No event will ever arrive on iOS, so the timing decision is ours alone.
    if (isIosSafari()) {
      appearTimer = setTimeout(() => setMode("ios"), APPEAR_DELAY_MS);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      if (appearTimer) clearTimeout(appearTimer);
    };
  }, []);

  // Mount first, animate second — a transition only runs if the element was
  // already in the DOM at its "from" position for a frame.
  useEffect(() => {
    if (mode === "none") {
      setShown(false);
      return;
    }
    const timer = setTimeout(() => setShown(true), 20);
    return () => clearTimeout(timer);
  }, [mode]);

  const close = useCallback((days: number) => {
    snooze(days);
    setShown(false);
    setTimeout(() => setMode("none"), EXIT_MS);
  }, []);

  const dismiss = useCallback(() => close(DISMISS_DAYS), [close]);

  const install = useCallback(async () => {
    if (!deferred) return;
    haptic("tap");
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    // The event is single-use; Chrome fires a fresh one if the user stays
    // eligible, so this reference is spent either way.
    setDeferred(null);
    close(outcome === "accepted" ? INSTALLED_DAYS : DISMISS_DAYS);
  }, [deferred, close]);

  if (mode === "none") return null;
  if (HIDDEN_ON.some((route) => pathname.startsWith(route))) return null;

  return (
    <section
      aria-label="Install BandhanTak app"
      className={cn(
        "fixed inset-x-3 z-[47] mx-auto max-w-md rounded-lg border border-line bg-surface p-4 shadow-lg",
        // Clears the 60px mobile bottom-nav; on desktop it tucks into the corner.
        "bottom-[calc(60px+env(safe-area-inset-bottom,0px)+12px)] md:bottom-5 md:left-auto md:right-5 md:mx-0",
        "transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        shown ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
      )}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-2 top-2 grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-bg-subtle hover:text-ink"
      >
        <X className="size-4" />
      </button>

      <div className="flex items-start gap-3 pr-6">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-900/40 dark:text-gold-200">
          <Smartphone className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          {mode === "android" ? (
            <>
              <p className="text-[0.9375rem] font-semibold text-ink">
                BandhanTak ko home screen par rakhiye
              </p>
              <p className="mt-1 text-[0.8125rem] leading-snug text-muted">
                Ek tap me app khul jaayega — na URL type karna padega, na baar-baar login. Naye
                rishte ki khabar bhi turant milegi.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={install}
                  className="inline-flex min-h-12 items-center gap-2 rounded-full bg-gradient-to-r from-gold-400 to-gold-600 px-5 text-sm font-semibold text-primary-fg shadow-gold"
                >
                  Install App
                </button>
                <button
                  type="button"
                  onClick={dismiss}
                  className="inline-flex min-h-12 items-center px-3 text-sm font-medium text-muted transition-colors hover:text-ink"
                >
                  Not Now
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-[0.9375rem] font-semibold text-ink">
                iPhone par app aise add kijiye
              </p>
              <p className="mt-1 text-[0.8125rem] leading-snug text-muted">
                Do step ka kaam hai — uske baad BandhanTak home screen se app ki tarah khulega, har
                baar login kiye bina.
              </p>
              {/* Safari's own labels stay in English — that is what is written on the buttons. */}
              <ol className="mt-3 space-y-2">
                <li className="flex items-center gap-2 text-[0.8125rem] text-ink">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-bg-subtle text-[0.6875rem] font-semibold text-muted">
                    1
                  </span>
                  <Share className="size-4 shrink-0 text-accent-text" aria-hidden />
                  <span>
                    Neeche <span className="font-semibold">Share</span> button dabaiye
                  </span>
                </li>
                <li className="flex items-center gap-2 text-[0.8125rem] text-ink">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-bg-subtle text-[0.6875rem] font-semibold text-muted">
                    2
                  </span>
                  <SquarePlus className="size-4 shrink-0 text-accent-text" aria-hidden />
                  <span>
                    <span className="font-semibold">Add to Home Screen</span> par tap kijiye
                  </span>
                </li>
              </ol>
              <button
                type="button"
                onClick={dismiss}
                className="mt-3 inline-flex min-h-12 items-center rounded-full bg-gradient-to-r from-gold-400 to-gold-600 px-5 text-sm font-semibold text-primary-fg shadow-gold"
              >
                Got It
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
