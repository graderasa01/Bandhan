"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { LOCALES, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, LOCALE_LABELS } from "@/lib/i18n/config";
import { useLocale } from "./LanguageProvider";

/**
 * Two-state language switch, styled to sit beside ThemeToggle.
 *
 * Most copy renders in server components, so flipping the cookie is only half
 * the job — `router.refresh()` re-requests the tree so the new language
 * actually paints without a full reload.
 */
export default function LanguageToggle({ className }: { className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function pick(next: string) {
    if (next === locale) return;

    // The first toggle owns the hand-written Hinglish/English source. If an
    // automatic Indian-language translation was active, clear it before
    // changing source locale so the two systems never produce mixed copy.
    const automaticTranslationWasActive = document.cookie
      .split(";")
      .some((part) => part.trim().startsWith("googtrans="));
    try {
      window.localStorage.setItem("bt-page-lang", "off");
    } catch {
      // Cookie reset below is enough when storage is blocked.
    }
    document.cookie = `bt-page-lang=off;path=/;max-age=${LOCALE_COOKIE_MAX_AGE};samesite=lax`;
    const expired = "expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;samesite=lax";
    document.cookie = `googtrans=;${expired}`;
    const host = window.location.hostname;
    if (host.includes(".")) {
      document.cookie = `googtrans=;${expired};domain=${host}`;
      document.cookie = `googtrans=;${expired};domain=.${host}`;
    }

    document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=${LOCALE_COOKIE_MAX_AGE};samesite=lax`;
    if (automaticTranslationWasActive) {
      window.location.reload();
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div
      className={cn(
        "notranslate inline-flex h-10 items-center rounded-full border border-line bg-surface p-0.5",
        pending && "opacity-60",
        className,
      )}
      translate="no"
      role="group"
      aria-label="Language"
    >
      {LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => pick(code)}
          aria-pressed={locale === code}
          title={LOCALE_LABELS[code].full}
          className={cn(
            "h-9 rounded-full px-3 text-xs font-semibold transition-colors",
            locale === code
              ? "bg-primary text-primary-fg"
              : "text-muted hover:text-ink",
          )}
        >
          {LOCALE_LABELS[code].short}
        </button>
      ))}
    </div>
  );
}
