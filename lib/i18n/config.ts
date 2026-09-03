/**
 * Site languages.
 *
 * `hi` is the source language: its copy lives inline in the components as the
 * second argument to `t()`, so there is no `hi` dictionary to keep in sync and
 * a missing translation can never blank out the UI — it falls back to Hinglish.
 * Every other locale is a dictionary file under `dictionaries/`.
 */
export const LOCALES = ["hi", "en"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "hi";

export const LOCALE_COOKIE = "bt-lang";

/** One year — the choice should outlive a browser restart. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const LOCALE_LABELS: Record<Locale, { short: string; full: string }> = {
  hi: { short: "HING", full: "Hinglish" },
  en: { short: "EN", full: "English" },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}
