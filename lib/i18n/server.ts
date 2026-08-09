import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./config";
import { createTranslate, type Translate } from "./translate";

/** Reads the chosen language from the cookie. Server components only. */
export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** `const t = await getT()` inside any server component. */
export async function getT(): Promise<Translate> {
  return createTranslate(await getLocale());
}
