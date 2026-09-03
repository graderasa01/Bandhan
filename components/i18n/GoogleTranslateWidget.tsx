"use client";

import { useEffect, useId } from "react";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    google?: {
      translate?: {
        TranslateElement: {
          new (
            options: { pageLanguage: string; autoDisplay: boolean; layout: number },
            elementId: string,
          ): unknown;
          InlineLayout: { SIMPLE: number };
        };
      };
    };
    googleTranslateElementInit?: () => void;
  }
}

const SCRIPT_SRC = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";

/** Module-scoped, not per-component: the `<script>` tag must only ever be requested once per page session, no matter how many widget instances mount (desktop pill + mobile drawer render at once on a few shells). */
let scriptRequested = false;

function mountInto(elementId: string) {
  const TranslateElement = window.google?.translate?.TranslateElement;
  if (!TranslateElement || !document.getElementById(elementId)) return;
  new TranslateElement(
    { pageLanguage: "en", autoDisplay: false, layout: TranslateElement.InlineLayout.SIMPLE },
    elementId,
  );
}

/**
 * Free Google "website translator" widget, bolted on beside the native
 * Hinglish/English toggle (LanguageToggle) for a visitor who wants a
 * language neither of those cover. Deliberately a bonus, not a replacement:
 * Google can only render textbook Hindi, not the hand-tuned Hinglish the
 * "hi" locale ships, so hi/en keep going through LanguageProvider untouched
 * — this never touches that cookie or context.
 *
 * `autoDisplay: false` matters: without it, Google auto-pops a translate
 * banner from the visitor's browser language on every load, fighting the
 * site's own deliberate Hinglish default.
 */
export default function GoogleTranslateWidget({ className }: { className?: string }) {
  const elementId = `gt-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  useEffect(() => {
    const container = document.getElementById(elementId);

    if (window.google?.translate?.TranslateElement) {
      mountInto(elementId);
      return () => {
        if (container) container.innerHTML = "";
      };
    }

    // Chain onto whatever init callback is already registered (another
    // instance's) rather than clobbering it, and remember it so cleanup can
    // hand the slot back — React (StrictMode in dev, or a real unmount/
    // remount) can tear this effect down before the script ever loads, and
    // without this the next mount would chain onto a dangling closure and
    // double-fire `mountInto` when the script finally does load.
    const prevInit = window.googleTranslateElementInit;
    const wrappedInit = () => {
      prevInit?.();
      mountInto(elementId);
    };
    window.googleTranslateElementInit = wrappedInit;

    if (!scriptRequested) {
      scriptRequested = true;
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      document.body.appendChild(script);
    }

    return () => {
      if (window.googleTranslateElementInit === wrappedInit) {
        window.googleTranslateElementInit = prevInit;
      }
      if (container) container.innerHTML = "";
    };
  }, [elementId]);

  return (
    <div
      className={cn(
        // Not a fixed height like the pill controls beside it: Google's
        // required "Powered by Google Translate" attribution wraps onto its
        // own line under the select, and a fixed height would clip it or
        // spill it past the rounded border.
        "inline-flex min-h-10 items-center gap-1.5 rounded-2xl border border-line bg-surface px-3 py-1.5",
        className,
      )}
      title="More languages, via Google Translate"
    >
      <Globe className="size-4 shrink-0 text-muted" aria-hidden />
      <div id={elementId} />
    </div>
  );
}
