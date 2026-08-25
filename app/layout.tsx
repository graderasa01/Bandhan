import type { Metadata, Viewport } from "next";
import type { CSSProperties } from "react";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";
import { getActiveTheme } from "@/lib/services/theme/siteThemeService";
import { getLocale } from "@/lib/i18n/server";
import { LanguageProvider } from "@/components/i18n/LanguageProvider";

/**
 * D-22 — exactly two families. One display face, Inter for everything else.
 * Adding a *third* font to this file is a design-system violation; swapping
 * which face plays the display role is not.
 *
 * The display face is Playfair Display, not Poppins. Poppins is a geometric
 * sans — the same face half of B2B SaaS ships with — and on a page whose whole
 * argument is "this is the careful, premium way to find a rishta", a heading
 * that reads like a dashboard undercuts the copy underneath it. A high-contrast
 * serif is what the category's own vocabulary (invitations, cards, jewellery)
 * is already written in, so it earns the premium read without anyone having to
 * be told. Playfair rather than a display-only serif because these headings go
 * down to 1rem in card titles and carry numbers in the stat strip, and a face
 * that only works at 48px would have been a different kind of mistake.
 */
const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
  weight: ["500", "600", "700"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
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

/** Applies stored/system theme before first paint so there is no light flash. */
const NO_FLASH_THEME = `(function(){try{var s=localStorage.getItem("bt-theme");var d=s?s==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;if(d)document.documentElement.classList.add("dark")}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Site-wide colour pack (see /admin/theme) — resolved server-side so
  // there's no flash of the wrong palette. `getActiveTheme` never throws
  // (falls back to Kundan, the app's original look) so a DB hiccup here
  // can never take the whole site down.
  const { pack, customVars } = await getActiveTheme();
  const dataPack = pack === "CUSTOM" ? "kundan" : pack.toLowerCase();
  const locale = await getLocale();

  return (
    <html
      // Hinglish is romanised Hindi, so it needs the script subtag — a bare
      // "hi" tells the browser to expect Devanagari and mispronounces it.
      lang={locale === "hi" ? "hi-Latn" : locale}
      suppressHydrationWarning
      data-pack={dataPack}
      // A CUSTOM theme's five colours ride as an inline style — highest
      // specificity there is, so they win over every [data-pack] block
      // (including light AND dark) without depending on stylesheet order.
      style={customVars as CSSProperties | undefined}
      className={`${inter.variable} ${playfair.variable}`}
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
