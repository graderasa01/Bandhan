import type { Metadata, Viewport } from "next";
import type { CSSProperties } from "react";
import { Inter, Playfair_Display, Poppins } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";
import { getActiveTheme } from "@/lib/services/theme/siteThemeService";
import { getThemeRooms, themeRoomsCss } from "@/lib/services/theme/themeRoomService";
import { PHOTO_GLASS, resolveRoom } from "@/lib/theme/rooms";
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
 * There are four rooms (lib/theme/rooms.ts): `terrace` (Satin), `ivory`
 * (Day), `gold` (Night) and `paper` (Classic, the cream look that shipped on
 * bandhantak.com). Which of them are on, which is the default and which have
 * an admin's photo behind them is decided on /admin/theme, and the server
 * writes those answers onto <html> — `data-rooms`, `data-room-default`,
 * `data-photo-rooms` — so this script can apply them without a request.
 *
 * It writes three things. `data-room`: the room. `data-glass`: the material
 * every glass token reads — the room itself, except that a room with a photo
 * wears the `/bolo` glass (`terrace`). `data-photo`: on when the room shows a
 * photo instead of its drawing. And the `dark` class stays on for every room
 * but `paper`, the one light room — the app's dark-mode pass is written
 * against that class.
 *
 * Precedence is explicit: what the person last chose (localStorage), then the
 * cookie the server already rendered from, then the default — and a room the
 * admin has switched off is skipped at every step. Reading the cookie matters:
 * without it this script would overwrite a chosen room with the default on
 * any device whose local storage was cleared. The device's own light/dark
 * preference is deliberately NOT consulted: it cannot express a preference
 * between four named looks. Kept in sync with `ThemeToggle`.
 */
const NO_FLASH_THEME = `(function(){try{var r=document.documentElement;var on=(r.getAttribute("data-rooms")||"terrace,ivory,gold,paper").split(",");var ph=(r.getAttribute("data-photo-rooms")||"").split(",");var d=r.getAttribute("data-room-default")||on[0];var ok=function(x){return !!x&&on.indexOf(x)>-1};var s=null;try{s=localStorage.getItem("bt-glass")}catch(e){}var c=/(?:^|; )bt-glass=([a-z]+)/.exec(document.cookie);var t=ok(s)?s:c&&ok(c[1])?c[1]:d;var p=ph.indexOf(t)>-1;r.setAttribute("data-room",t);r.setAttribute("data-glass",p?"terrace":t);if(p){r.setAttribute("data-photo","")}else{r.removeAttribute("data-photo")}r.classList.toggle("dark",t!=="paper");if(!c||c[1]!==t){document.cookie="bt-glass="+t+";path=/;max-age=31536000;samesite=lax"}}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Site-wide colour pack (see /admin/theme) — resolved server-side so
  // there's no flash of the wrong palette. `getActiveTheme` never throws
  // (falls back to Kundan, the app's original look) so a DB hiccup here
  // can never take the whole site down.
  const { pack, customVars } = await getActiveTheme();
  const dataPack = pack === "CUSTOM" ? "kundan" : pack.toLowerCase();
  const locale = await getLocale();
  /**
   * Which room the page stands in (see lib/theme/rooms.ts and /admin/theme).
   * Rendered here, from a cookie the theme switch writes, rather than left to
   * the pre-paint script alone: an attribute that only JavaScript added is the
   * kind React quietly drops when it hydrates, and the room would snap back on
   * some pages and not others. The script still runs — it covers the first
   * visit, before any cookie exists — and writes the same values.
   *
   * A room the admin has switched off is never rendered: the cookie falls back
   * to the default. A room with a photo wears the `/bolo` glass, so its
   * `data-glass` is `terrace` whatever the room is called.
   */
  const themeRooms = await getThemeRooms();
  const room = resolveRoom((await cookies()).get("bt-glass")?.value, themeRooms);
  const photo = themeRooms.rooms.find((r) => r.id === room)?.photo ?? null;
  const glass = photo ? PHOTO_GLASS : room;
  const photoRooms = themeRooms.rooms.filter((r) => r.photo).map((r) => r.id);
  const photoCss = themeRoomsCss(themeRooms);

  return (
    <html
      // Hinglish is romanised Hindi, so it needs the script subtag — a bare
      // "hi" tells the browser to expect Devanagari and mispronounces it.
      lang={locale === "hi" ? "hi-Latn" : locale}
      suppressHydrationWarning
      data-pack={dataPack}
      data-glass={glass}
      data-room={room}
      data-photo={photo ? "" : undefined}
      // What the pre-paint script and the theme button need to know without
      // asking the server: which rooms are on (in cycle order), which one is
      // the default, and which ones stand in a photo.
      data-rooms={themeRooms.enabled.join(",")}
      data-room-default={themeRooms.defaultRoom}
      data-photo-rooms={photoRooms.join(",")}
      // A CUSTOM theme's five colours ride as an inline style — highest
      // specificity there is, so they win over every [data-pack] block
      // (including light AND dark) without depending on stylesheet order.
      style={customVars as CSSProperties | undefined}
      className={`${inter.variable} ${poppins.variable} ${playfair.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME }} />
        {/* Every photo room's photo, one rule per room (`themeRoomsCss`), so
            the theme button can switch to any of them without a page load. */}
        {photoCss && <style dangerouslySetInnerHTML={{ __html: photoCss }} />}
        {/* Only the room this page opens in is fetched ahead; the rest load
            when somebody switches to them. */}
        {photo && <link rel="preload" as="image" href={photo.backdropUrl} />}
        {photo && <link rel="preload" as="image" href={photo.imageUrl} fetchPriority="high" />}
      </head>
      <body className="min-h-dvh bg-bg text-ink antialiased">
        <LanguageProvider locale={locale}>
          <ToastProvider>{children}</ToastProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}

