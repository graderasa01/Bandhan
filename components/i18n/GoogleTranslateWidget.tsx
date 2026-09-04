"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Languages } from "lucide-react";
import { cn } from "@/lib/utils";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "@/lib/i18n/config";
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
const STORAGE_KEY = "bt-page-language";
const GOOGLE_COOKIE = "googtrans";
const ENGINE_ID = "bt-google-translate-engine";

/** English is the clean reset/source; every other option is an Indian language. */
const PAGE_LANGUAGES = [
  { code: "en", native: "English", english: "English" },
  { code: "hi", native: "हिन्दी", english: "Hindi" },
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
const INCLUDED_LANGUAGES = PAGE_LANGUAGES.filter((language) => language.code !== "en")
  .map((language) => language.code)
  .join(",");

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

function applyRememberedLanguage() {
  const code = readRememberedLanguage();
  if (code === "en") return true;

  const select = document.querySelector<HTMLSelectElement>(`#${ENGINE_ID} select.goog-te-combo`);
  if (!select) return false;
  if (select.value !== code) {
    select.value = code;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }
  return true;
}

function mountEngine() {
  const TranslateElement = window.google?.translate?.TranslateElement;
  if (!TranslateElement) return;

  const container = ensureEngineHost();
  if (engineMounted || container.childElementCount > 0) {
    engineMounted = true;
    applyRememberedLanguage();
    return;
  }

  engineMounted = true;
  const observer = new MutationObserver(() => {
    if (applyRememberedLanguage()) observer.disconnect();
  });
  observer.observe(container, { childList: true, subtree: true });

  new TranslateElement(
    {
      pageLanguage: "en",
      includedLanguages: INCLUDED_LANGUAGES,
      autoDisplay: false,
      layout: TranslateElement.InlineLayout.SIMPLE,
    },
    ENGINE_ID,
  );
  applyRememberedLanguage();
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

function rememberLanguage(code: PageLanguageCode) {
  document.cookie = `${STORAGE_KEY}=${code};path=/;max-age=${LOCALE_COOKIE_MAX_AGE};samesite=lax`;
  try {
    window.localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // A blocked localStorage must not make the control unusable.
  }
}

function readRememberedLanguage(): PageLanguageCode {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && PAGE_LANGUAGE_CODES.has(stored)) return stored as PageLanguageCode;
  } catch {
    // Fall through to the cookie written by the translator itself.
  }

  const preferenceCookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${STORAGE_KEY}=`));
  const preference = preferenceCookie?.split("=").pop();
  if (preference && PAGE_LANGUAGE_CODES.has(preference)) return preference as PageLanguageCode;

  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${GOOGLE_COOKIE}=`));
  const code = cookie?.split("/").pop();
  return code && PAGE_LANGUAGE_CODES.has(code) ? (code as PageLanguageCode) : "en";
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

function setGoogleCookie(code: Exclude<PageLanguageCode, "en">) {
  document.cookie = `${GOOGLE_COOKIE}=/en/${code};path=/;max-age=${LOCALE_COOKIE_MAX_AGE};samesite=lax`;
}

/** "en" is this widget's idle default too, so a fresh visitor already shows it checked
 *  even though the page is still rendering the Hinglish default — check the real
 *  locale cookie rather than trusting that checkmark. */
function isPageActuallyEnglish() {
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${LOCALE_COOKIE}=`));
  return cookie?.split("=").pop() === "en";
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
  const [selected, setSelected] = useState<PageLanguageCode>("en");

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

  function pick(code: PageLanguageCode) {
    setOpen(false);
    if (code === selected && (code !== "en" || isPageActuallyEnglish())) return;

    setSelected(code);
    rememberLanguage(code);

    // Every option, English included, starts from the complete English dictionary:
    // Google only ever translates that source into the other Indian languages.
    document.cookie = `${LOCALE_COOKIE}=en;path=/;max-age=${LOCALE_COOKIE_MAX_AGE};samesite=lax`;
    if (code === "en") {
      expireGoogleCookie();
    } else {
      setGoogleCookie(code);
    }

    // A clean reload avoids React and translated DOM fighting over text nodes.
    window.location.reload();
  }

  const active = PAGE_LANGUAGES.find((language) => language.code === selected) ?? PAGE_LANGUAGES[0];
  const idleLabel = locale === "en" ? "Indian languages" : "भारतीय भाषाएँ";
  const buttonLabel = selected === "en" ? idleLabel : active.native;
  const menuTitle = locale === "en" ? "Translate this page" : "Page ki bhasha";
  const menuHint = locale === "en" ? "English and Indian languages only" : "English aur sirf Bharatiya bhashayein";

  return (
    <div ref={rootRef} className={cn("notranslate relative inline-flex", className)} translate="no">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${menuTitle}: ${active.english}`}
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
