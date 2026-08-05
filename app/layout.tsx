import type { Metadata, Viewport } from "next";
import type { CSSProperties } from "react";
import { Inter, Poppins } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";
import { getActiveTheme } from "@/lib/services/theme/siteThemeService";

/**
 * D-22 — exactly two families. Poppins for display, Inter for everything else.
 * Adding a third font to this file is a design-system violation.
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

export const metadata: Metadata = {
  title: {
    default: "BandhanTak — AI Powered Verified Matrimony",
    template: "%s · BandhanTak",
  },
  description:
    "Verified marriage profiles, AI biodata autofill, trust score aur privacy-first rishta journey. Partners ke liye transparent referral income.",
  keywords: ["matrimony", "shaadi", "rishta", "verified profiles", "AI matrimony", "BandhanTak"],
  appleWebApp: { capable: true, title: "BandhanTak", statusBarStyle: "default" },
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

  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-pack={dataPack}
      // A CUSTOM theme's five colours ride as an inline style — highest
      // specificity there is, so they win over every [data-pack] block
      // (including light AND dark) without depending on stylesheet order.
      style={customVars as CSSProperties | undefined}
      className={`${inter.variable} ${poppins.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME }} />
      </head>
      <body className="min-h-dvh bg-bg text-ink antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
