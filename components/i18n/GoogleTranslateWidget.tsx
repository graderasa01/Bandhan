"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Languages } from "lucide-react";
import { cn } from "@/lib/utils";
import { LOCALE_COOKIE_MAX_AGE } from "@/lib/i18n/config";
import { useLocale } from "./LanguageProvider";

declare global {
  interface Window {
    google?: {
      translate?: {
        TranslateElement: {
          new (
            options: {
              pageLanguage: string;
              includedLanguages: string;
              autoDisplay: boolean;
              layout: number;
            },
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
/** v2 key: the old one stored "en" to mean "off", which is now a real target. */
const STORAGE_KEY = "bt-page-lang";
const OFF = "off";
const GOOGLE_COOKIE = "googtrans";
const ENGINE_ID = "bt-google-translate-engine";

/**
 * The site is authored in Hinglish — Hindi written in Latin script — and stays
 * that way, so the source is the visible page, never the hand-written English
 * dictionary. Declaring "hi" (not "auto") is what makes Google actually
 * translate that Romanized copy; on "auto" it reads only `<html lang>`.
 */
const SOURCE_LANGUAGE = "hi";

/**
 * Every option is a Google target, English included. Devanagari Hindi is
 * deliberately absent: Google treats Hinglish as Hindi already, so a `hi`
 * target no-ops on the Hinglish copy and only converts the stray English
 * buttons — a half-translated page is worse than none.
 */
const PAGE_LANGUAGES = [
  { code: "en", native: "English", english: "English" },
  { code: "bn", native: "বাংলা", english: "Bengali" },
  { code: "gu", native: "ગુજરાતી", english: "Gujarati" },
  { code: "kn", native: "ಕನ್ನಡ", english: "Kannada" },
  { code: "ml", native: "മലയാളം", english: "Malayalam" },
  { code: "mr", native: "मराठी", english: "Marathi" },
  { code: "pa", native: "ਪੰਜਾਬੀ", english: "Punjabi" },
  { code: "ta", native: "தமிழ்", english: "Tamil" },
  { code: "te", native: "తెలుగు", english: "Telugu" },
  { code: "ur", native: "اردو", english: "Urdu" },
  { code: "as", native: "অসমীয়া", english: "Assamese" },
  { code: "or", native: "ଓଡ଼ିଆ", english: "Odia" },
  { code: "ne", native: "नेपाली", english: "Nepali" },
] as const;

type PageLanguageCode = (typeof PAGE_LANGUAGES)[number]["code"];

const PAGE_LANGUAGE_CODES = new Set<string>(PAGE_LANGUAGES.map((language) => language.code));
const INCLUDED_LANGUAGES = PAGE_LANGUAGES.map((language) => language.code).join(",");

/** One request per page, even when desktop and mobile controls both mount. */
let scriptRequested = false;
let engineMounted = false;

function ensureEngineHost() {
  let container = document.getElementById(ENGINE_ID);
  if (container) return container;

  container = document.createElement("div");
  container.id = ENGINE_ID;
  container.className = "bt-google-translate-host";
  container.setAttribute("aria-hidden", "true");
  document.body.appendChild(container);
  return container;
}

/** The engine translates on load from the `googtrans` cookie alone — the SIMPLE
 *  layout renders an anchor, never a `select` we could drive after mount. */
function mountEngine() {
  const TranslateElement = window.google?.translate?.TranslateElement;
  if (!TranslateElement) return;

  const container = ensureEngineHost();
  if (engineMounted || container.childElementCount > 0) {
    engineMounted = true;
    return;
  }

  engineMounted = true;
  new TranslateElement(
    {
      pageLanguage: SOURCE_LANGUAGE,
      includedLanguages: INCLUDED_LANGUAGES,
      autoDisplay: false,
      layout: TranslateElement.InlineLayout.SIMPLE,
    },
    ENGINE_ID,
  );
}

function requestEngine() {
  if (window.google?.translate?.TranslateElement) {
    mountEngine();
    return;
  }
  if (scriptRequested) return;

  scriptRequested = true;
  window.googleTranslateElementInit = () => {
    mountEngine();
    suppressInjectedChrome();
  };

  const baseSrc = SCRIPT_SRC.split("?", 1)[0];
  const existing = document.querySelector<HTMLScriptElement>(`script[src^="${baseSrc}"]`);
  if (existing) {
    existing.addEventListener("load", mountEngine, { once: true });
    return;
  }

  const script = document.createElement("script");
  script.src = SCRIPT_SRC;
  script.async = true;
  document.body.appendChild(script);
}

function rememberLanguage(code: PageLanguageCode | null) {
  const value = code ?? OFF;
  document.cookie = `${STORAGE_KEY}=${value};path=/;max-age=${LOCALE_COOKIE_MAX_AGE};samesite=lax`;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // A blocked localStorage must not make the control unusable.
  }
}

/** null means "no Google translation" — the page renders its own Hinglish copy. */
function readRememberedLanguage(): PageLanguageCode | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === OFF) return null;
    if (stored && PAGE_LANGUAGE_CODES.has(stored)) return stored as PageLanguageCode;
  } catch {
    // Fall through to the cookie written by the translator itself.
  }

  const preferenceCookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${STORAGE_KEY}=`));
  const preference = preferenceCookie?.split("=").pop();
  if (preference === OFF) return null;
  if (preference && PAGE_LANGUAGE_CODES.has(preference)) return preference as PageLanguageCode;

  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${GOOGLE_COOKIE}=`));
  const code = cookie?.split("/").pop();
  return code && PAGE_LANGUAGE_CODES.has(code) ? (code as PageLanguageCode) : null;
}

function expireGoogleCookie() {
  const expired = "expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;samesite=lax";
  document.cookie = `${GOOGLE_COOKIE}=;${expired}`;

  // Google may write a domain cookie. Clear both shapes so English is a real reset.
  const host = window.location.hostname;
  if (host.includes(".")) {
    document.cookie = `${GOOGLE_COOKIE}=;${expired};domain=${host}`;
    document.cookie = `${GOOGLE_COOKIE}=;${expired};domain=.${host}`;
  }
}

function setGoogleCookie(code: PageLanguageCode) {
  document.cookie = `${GOOGLE_COOKIE}=/${SOURCE_LANGUAGE}/${code};path=/;max-age=${LOCALE_COOKIE_MAX_AGE};samesite=lax`;
}

/** Neutralise the late inline offset written when Google's toolbar is injected. */
function suppressInjectedChrome() {
  document.documentElement.style.setProperty("margin-top", "0px", "important");
  document.body.style.setProperty("top", "0px", "important");
  document.body.style.setProperty("margin-top", "0px", "important");
}

/**
 * The second language control. LanguageToggle remains the hand-written
 * Hinglish/English switch; this one translates the English source into major
 * Indian languages. Google's generated select is only the hidden engine.
 */
export default function GoogleTranslateWidget({ className }: { className?: string }) {
  const locale = useLocale();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<PageLanguageCode | null>(null);

  useEffect(() => {
    setSelected(readRememberedLanguage());
  }, []);

  useEffect(() => {
    requestEngine();
  }, []);

  useEffect(() => {
    suppressInjectedChrome();
    const observer = new MutationObserver(suppressInjectedChrome);
    observer.observe(document.body, { childList: true, attributes: true, attributeFilter: ["style"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function pick(code: PageLanguageCode | null) {
    setOpen(false);
    if (code === selected) return;

    setSelected(code);
    rememberLanguage(code);

    // The app's own locale is left alone: Google translates whatever the page
    // actually renders, so pages never need an English version to be translatable.
    if (code) {
      setGoogleCookie(code);
    } else {
      expireGoogleCookie();
    }

    // A clean reload avoids React and translated DOM fighting over text nodes.
    window.location.reload();
  }

  const active = PAGE_LANGUAGES.find((language) => language.code === selected);
  const idleLabel = locale === "en" ? "Translate" : "Anuvaad";
  const buttonLabel = active?.native ?? idleLabel;
  const menuTitle = locale === "en" ? "Translate this page" : "Page ka anuvaad";
  const menuHint = locale === "en" ? "English and Indian languages only" : "English aur sirf Bharatiya bhashayein";
  const resetLabel = locale === "en" ? "Original page" : "Original page";
  const resetHint = locale === "en" ? "No translation" : "Bina anuvaad ke";

  return (
    <div ref={rootRef} className={cn("notranslate relative inline-flex", className)} translate="no">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={active ? `${menuTitle}: ${active.english}` : menuTitle}
        title={buttonLabel}
        className={cn(
          "inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-line bg-surface px-2.5 text-xs font-semibold text-ink shadow-sm",
          "transition-colors hover:border-line-strong hover:bg-bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
          open && "border-primary/50 bg-bg-subtle",
        )}
      >
        <Languages className="size-4 shrink-0 text-primary-text" aria-hidden />
        <span className="hidden max-w-28 truncate sm:inline">{buttonLabel}</span>
        <ChevronDown className={cn("hidden size-3.5 text-muted transition-transform sm:block", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={menuTitle}
          className="absolute right-0 top-[calc(100%+0.5rem)] z-[80] w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-surface shadow-xl"
        >
          <div className="border-b border-line bg-bg-subtle px-4 py-3">
            <p className="text-sm font-semibold text-ink">{menuTitle}</p>
            <p className="mt-0.5 text-xs text-muted">{menuHint}</p>
          </div>

          <div className="grid max-h-80 grid-cols-2 gap-1 overflow-y-auto p-2">
            <button
              type="button"
              role="menuitemradio"
              aria-checked={selected === null}
              onClick={() => pick(null)}
              className={cn(
                "col-span-2 flex min-h-12 items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors",
                selected === null ? "bg-primary-soft text-primary-text" : "text-ink hover:bg-bg-subtle",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{resetLabel}</span>
                <span className="block truncate text-[0.6875rem] text-muted">{resetHint}</span>
              </span>
              {selected === null && <Check className="size-4 shrink-0" aria-hidden />}
            </button>

            {PAGE_LANGUAGES.map((language) => {
              const chosen = language.code === selected;
              return (
                <button
                  key={language.code}
                  type="button"
                  role="menuitemradio"
                  aria-checked={chosen}
                  onClick={() => pick(language.code)}
                  className={cn(
                    "flex min-h-12 items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors",
                    chosen ? "bg-primary-soft text-primary-text" : "text-ink hover:bg-bg-subtle",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{language.native}</span>
                    {language.native !== language.english && (
                      <span className="block truncate text-[0.6875rem] text-muted">{language.english}</span>
                    )}
                  </span>
                  {chosen && <Check className="size-4 shrink-0" aria-hidden />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
