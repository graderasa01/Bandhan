import type { Metadata, Viewport } from "next";
import type { CSSProperties } from "react";
import { Inter, Playfair_Display, Poppins } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";
import { getActiveTheme } from "@/lib/services/theme/siteThemeService";
import { cookies } from "next/headers";
import { getLocale } from "@/lib/i18n/server";
import { LanguageProvider } from "@/components/i18n/LanguageProvider";

/**
 * D-22 — two families for the product: Poppins for display, Inter for
 * everything else. Do not add a fourth.
 *
 * D-22b (2026-08-26) — Playfair is the third, and the only one, admitted
 * since. The public marketing pages were redrawn to the bandhantak.com
 * reference (see `.bt-canvas` in globals.css), whose entire voice is a
 * high-contrast serif; Poppins is a geometric sans and cannot stand in for
 * it. It is scoped, not global: `.bt-canvas` remaps --font-display to
 * this face, so it reaches marketing headings and the wordmark and nothing
 * inside the signed-in app.
 */
const poppins = Poppins({
  subsets: ["latin"],
  variable: "--font-poppins",
  display: "swap",
  weight: ["500", "600", "700"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "BandhanTak — AI Powered Verified Matrimony",
    template: "%s · BandhanTak",
  },
  description:
    "Verified marriage profiles, AI biodata autofill, trust score aur privacy-first rishta journey. Partners ke liye transparent referral income.",
  keywords: ["matrimony", "shaadi", "rishta", "verified profiles", "AI matrimony", "BandhanTak"],
  appleWebApp: { capable: true, title: "BandhanTak", statusBarStyle: "default" },
  // Installability is what makes push worth having on Android: an installed
  // PWA keeps its notification permission and its own launcher icon, so a
  // "naya match aaya" buzz lands the way an app's does rather than a tab's.
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf9fa" },
    { media: "(prefers-color-scheme: dark)", color: "#100c0a" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * Picks the room before first paint, so nobody sees another one flash.
 *
 * `data-glass` is what the glass system's tokens read, and there are four
 * rooms now: `terrace` (the satin room, and the default), `ivory` (the day
 * room), `gold` (the lamp-lit night one) and `paper` (the classic cream look
 * that is live on bandhantak.com). The `dark` class stays on for the first
 * three — they are all dark grounds, and the app's whole dark-mode pass is
 * written against that class — and comes off for `paper`, which is the one
 * light room.
 *
 * Precedence is explicit: what the person last chose (localStorage), then the
 * cookie the server already rendered from, then `terrace`. Reading the cookie
 * matters — without it this script would overwrite a chosen room with the
 * default on any device whose local storage was cleared. The device's own
 * light/dark preference is deliberately NOT consulted: it cannot express a
 * preference between four named looks. Kept in sync with `ThemeToggle`.
 */
const NO_FLASH_THEME = `(function(){try{var r=document.documentElement;var v=/^(terrace|ivory|gold|paper)$/;var s=localStorage.getItem("bt-glass");var c=/(?:^|; )bt-glass=(terrace|ivory|gold|paper)/.exec(document.cookie);var t=s&&v.test(s)?s:c?c[1]:"terrace";r.dataset.glass=t;r.classList.toggle("dark",t!=="paper");if(!c||c[1]!==t){document.cookie="bt-glass="+t+";path=/;max-age=31536000;samesite=lax"}}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Site-wide colour pack (see /admin/theme) — resolved server-side so
  // there's no flash of the wrong palette. `getActiveTheme` never throws
  // (falls back to Kundan, the app's original look) so a DB hiccup here
  // can never take the whole site down.
  const { pack, customVars } = await getActiveTheme();
  const dataPack = pack === "CUSTOM" ? "kundan" : pack.toLowerCase();
  const locale = await getLocale();
  /**
   * Which of the three rooms the glass system shows (see the terrace block and
   * `[data-glass="gold"]` in globals.css). Rendered here, from a cookie the
   * theme switch writes, rather than left to the pre-paint script alone: an
   * attribute that only JavaScript added is the kind React quietly drops when
   * it hydrates, and the room would snap back on some pages and not others. The
   * script still runs — it covers the first visit, before any cookie exists —
   * and writes the same value.
   */
  const cookieGlass = (await cookies()).get("bt-glass")?.value;
  const glass =
    cookieGlass === "gold" || cookieGlass === "ivory" || cookieGlass === "paper"
      ? cookieGlass
      : "terrace";

  return (
    <html
      // Hinglish is romanised Hindi, so it needs the script subtag — a bare
      // "hi" tells the browser to expect Devanagari and mispronounces it.
      lang={locale === "hi" ? "hi-Latn" : locale}
      suppressHydrationWarning
      data-pack={dataPack}
      data-glass={glass}
      // A CUSTOM theme's five colours ride as an inline style — highest
      // specificity there is, so they win over every [data-pack] block
      // (including light AND dark) without depending on stylesheet order.
      style={customVars as CSSProperties | undefined}
      className={`${inter.variable} ${poppins.variable} ${playfair.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME }} />
      </head>
      <body className="min-h-dvh bg-bg text-ink antialiased">
        <LanguageProvider locale={locale}>
          <ToastProvider>{children}</ToastProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}

