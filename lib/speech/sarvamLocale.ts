/**
 * Sarvam's BCP-47 language codes match this app's own locale strings (see
 * `LANGUAGE_META`) for every language except Odia, where Sarvam expects
 * "od-IN" instead of the "or-IN" this app speaks everywhere else.
 */
export function toSarvamLanguageCode(locale: string): string {
  return locale === "or-IN" ? "od-IN" : locale;
}
