"use client";

import { useSyncExternalStore } from "react";

/**
 * One shared capture of `beforeinstallprompt`, not one per component.
 *
 * The event is single-use — calling `.prompt()` spends it, and Chrome only
 * ever hands out a fresh one later. `InstallAppPrompt` (the dashboard banner)
 * and `PinSettingsCard`'s install button both want to trigger the same
 * install, so they have to share one captured reference: two independent
 * listeners would each hold their own copy, and whichever UI the user didn't
 * tap would be left holding a reference the browser has already invalidated.
 * Module-level state, not a Context provider, because both consumers already
 * sit under `app/user/layout.tsx` but not under one another — a singleton
 * outside React avoids adding a provider just to share one event.
 */

/** Not in lib.dom — Chrome-only, and still non-standard. */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let initialized = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function ensureInit() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    // Without this, Chrome shows its own mini-infobar as a second, competing ask.
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    notify();
  });

  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

function subscribe(listener: () => void) {
  ensureInit();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return deferred !== null;
}

function getServerSnapshot() {
  return false;
}

export function isStandalone(): boolean {
  const installedDisplay = ["standalone", "fullscreen", "minimal-ui"].some((mode) =>
    window.matchMedia(`(display-mode: ${mode})`).matches,
  );
  const iosInstalled =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return installedDisplay || iosInstalled;
}

export function isIosSafari(): boolean {
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

/**
 * `canInstall` is true only once Chrome has actually handed over a real,
 * still-unspent `beforeinstallprompt` event — not "this looks like Chrome."
 * `triggerInstall` consumes it; a second call with nothing captured is a
 * silent no-op, which is why every caller should hide its button once
 * `canInstall` goes false rather than leaving it clickable.
 */
export function useInstallPrompt() {
  const canInstall = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  async function triggerInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
    if (!deferred) return "unavailable";
    const event = deferred;
    deferred = null; // single-use, spent the moment we call prompt()
    notify();
    await event.prompt();
    const { outcome } = await event.userChoice;
    return outcome;
  }

  return { canInstall, triggerInstall };
}
