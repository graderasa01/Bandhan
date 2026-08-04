import type { Metadata, Viewport } from "next";
import { Inter, Poppins } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${poppins.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME }} />
      </head>
      <body className="min-h-dvh bg-bg text-ink antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
