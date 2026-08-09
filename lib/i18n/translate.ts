import { DEFAULT_LOCALE, type Locale } from "./config";
import en from "./dictionaries/en";

const DICTIONARIES: Partial<Record<Locale, Record<string, string>>> = { en };

export type Translate = (key: string, fallback: string) => string;

/**
 * Builds the `t` used by both server and client components.
 *
 * `fallback` is the Hinglish source copy, written inline at the call site. That
 * is deliberate: the source language never lives in a dictionary, so adding a
 * locale is purely additive and an untranslated key degrades to Hinglish rather
 * than to an empty string or a raw key.
 */
export function createTranslate(locale: Locale): Translate {
  const dict = locale === DEFAULT_LOCALE ? undefined : DICTIONARIES[locale];
  if (!dict) return (_key, fallback) => fallback;
  return (key, fallback) => dict[key] ?? fallback;
}

/**
 * Default for service/data-layer functions that take an optional `t`.
 *
 * Lets a function's signature grow a `t: Translate = noopT` parameter without
 * touching every existing caller — untouched call sites keep compiling and
 * keep rendering Hinglish, exactly like a missing dictionary key would.
 */
export const noopT: Translate = (_key, fallback) => fallback;
