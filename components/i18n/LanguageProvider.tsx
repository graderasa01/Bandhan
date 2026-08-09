"use client";

import { createContext, useContext, useMemo } from "react";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { createTranslate, type Translate } from "@/lib/i18n/translate";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/**
 * Locale is resolved from the cookie in the root layout and handed down, so
 * server and client components render the same language on the same request —
 * a client-side cookie read here would hydrate against the server's markup.
 */
export function LanguageProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useT(): Translate {
  const locale = useLocale();
  return useMemo(() => createTranslate(locale), [locale]);
}
