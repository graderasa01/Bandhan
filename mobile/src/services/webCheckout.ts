import * as WebBrowser from "expo-web-browser";
import { AppState } from "react-native";
import { ApiError, api } from "./api/client";
import { WEB_ORIGIN } from "./config";

/**
 * Paying on the website from inside the app — a Chat Unlock today.
 *
 * ## Why the app cannot just open the checkout URL
 *
 * The checkout pages know the payer only from the website's httpOnly session
 * cookie. The browser the app opens has none of the app's session — iOS's
 * in-app Safari never shares Safari's cookies, and Chrome's may be nobody's or
 * somebody else's — and the app's bearer token must never ride in a URL, where
 * it would outlive the visit in history and logs. So the app asks its own
 * authenticated API for a single-use, two-minute code bound to this member and
 * this one checkout (`POST /api/mobile/web-handoff`), and opens
 * `/api/auth/handoff?code=…`, which signs that browser in and lands on the
 * checkout.
 *
 * ## What the browser closing means
 *
 * Nothing about the payment. It is only the cue to ask the server again: the
 * payment webhook (or the checkout's own server-side confirm) is what opens a
 * paid chat, and the app never unlocks anything on its own say-so.
 */

/** The pages a payment gateway's `checkoutUrl` names (lib/services/payments/gateway.ts). */
const CHECKOUT_PATHS = new Set(["/checkout/razorpay", "/checkout/dummy"]);

/** Where a handoff code is spent (app/api/auth/handoff). */
const HANDOFF_PATH = "/api/auth/handoff";

/** `raw`, absolute or relative, as a URL on BandhanTak's own origin — or null for anywhere else. */
function onWebOrigin(raw: string): URL | null {
  try {
    const { origin } = new URL(WEB_ORIGIN);
    const url = new URL(raw, `${origin}/`);
    if (url.origin !== origin || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * The server's `checkoutUrl` as the path to hand off to, or null when it is not
 * one of BandhanTak's own checkout pages on this origin. No external payment
 * page is allowed: Razorpay's modal runs inside `/checkout/razorpay`, so the
 * gateway never hands back a provider URL to open directly.
 */
export function trustedCheckoutPath(checkoutUrl: string): string | null {
  const url = onWebOrigin(checkoutUrl);
  if (!url || !CHECKOUT_PATHS.has(url.pathname) || !url.searchParams.get("order")) return null;
  return `${url.pathname}${url.search}`;
}

/** A fresh single-use URL that signs the browser in as this member and lands on `checkoutPath`. */
export async function checkoutHandoffUrl(checkoutPath: string): Promise<string> {
  const res = await api<{ ok: boolean; url: string }>("/api/mobile/web-handoff", { body: { path: checkoutPath } });
  const url = typeof res.url === "string" ? onWebOrigin(res.url) : null;
  if (!url || url.pathname !== HANDOFF_PATH) {
    throw new ApiError(502, "HANDOFF_INVALID", "Payment page ka link sahi nahi mila — dobara try karein.");
  }
  return url.toString();
}

/**
 * Opens `url` in the in-app browser and resolves once the member is back.
 *
 * iOS's in-app Safari is a modal whose promise waits for Done. Android's Custom
 * Tab — and a tab in the web preview — answers "opened" at once, so there the
 * cue is the app coming back to the foreground. `manualReturn` covers the case
 * where the foreground never changes at all (split screen, a pop-up the browser
 * blocked): the screen offers a button that resolves it.
 */
export async function openInBrowserUntilBack(url: string, manualReturn: Promise<void>): Promise<void> {
  let left = false;
  let markBack: () => void = () => {};
  const foreground = new Promise<void>((resolve) => {
    markBack = resolve;
  });
  // Subscribed before opening, so the trip to the background cannot be missed.
  const sub = AppState.addEventListener("change", (state) => {
    if (state !== "active") left = true;
    else if (left) markBack();
  });

  try {
    const result = await WebBrowser.openBrowserAsync(url);
    if (result.type === WebBrowser.WebBrowserResultType.LOCKED) {
      throw new ApiError(0, "BROWSER_BUSY", "Browser pehle se khula hai — use band karke dobara try karein.");
    }
    if (result.type === WebBrowser.WebBrowserResultType.OPENED) {
      await Promise.race([foreground, manualReturn]);
    }
  } finally {
    sub.remove();
  }
}
