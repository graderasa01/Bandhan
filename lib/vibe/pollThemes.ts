import type { PollTheme } from "@prisma/client";

/**
 * The weekly poll rotation.
 *
 * ## Why themed days instead of one shuffled bank
 *
 * A random daily question makes the Arena feel like trivia. A fixed weekly
 * theme makes it feel like a conversation that is going somewhere — a user
 * learns that Shukravaar is the uncomfortable one and Ravivaar is light, and
 * that expectation is itself a reason to come back. It also spreads the load
 * on the reader: seven consecutive heavy questions about money and in-laws
 * would quietly kill participation, and participation is what makes the
 * `sochFit` signal worth anything.
 *
 * ## The two content rules, and they are not negotiable
 *
 * 1. **No question may have a right answer.** The moment one option is the
 *    "good" one, users start performing instead of answering, and every
 *    downstream signal built on their votes becomes a measure of what they
 *    think we want to hear. Each option below is a stance a reasonable person
 *    actually holds.
 * 2. **Never caste, dowry, appearance, or income figures.** The first two are
 *    legally and socially radioactive, the second two produce a ranking of
 *    human beings. None of them belong in a public board where answers are
 *    attributed by name.
 *
 * ## Ordering
 *
 * Sunday-first (index 0) to match JavaScript's `getDay()`, so the lookup is an
 * array index rather than a map with an off-by-one waiting in it.
 */

const IST_OFFSET_MIN = 330;

/** Indexed by day-of-week, Sunday = 0. */
export const THEME_BY_DOW: PollTheme[] = [
  "HALKA", // Ravivaar
  "PARIVAAR", // Somvaar
  "PAISA", // Mangalvaar
  "CAREER", // Budhwaar
  "RITUALS", // Guruvaar
  "RED_FLAGS", // Shukravaar
  "SAPNE", // Shanivaar
];

export const THEME_LABEL: Record<PollTheme, string> = {
  PARIVAAR: "Parivaar",
  PAISA: "Paisa",
  CAREER: "Kaam aur ghar",
  RITUALS: "Reeti-riwaj",
  RED_FLAGS: "Red flags",
  SAPNE: "Sapne",
  HALKA: "Halka-fulka",
};

/** One line under the question, so the day's theme is legible without a legend. */
export const THEME_TAGLINE: Record<PollTheme, string> = {
  PARIVAAR: "Somvaar — ghar aur rishtedaari",
  PAISA: "Mangalvaar — paise ki soch",
  CAREER: "Budhwaar — kaam aur ghar ka balance",
  RITUALS: "Guruvaar — parampara kitni",
  RED_FLAGS: "Shukravaar — jo rishta tod sakta hai",
  SAPNE: "Shanivaar — aage ka sapna",
  HALKA: "Ravivaar — halka-fulka",
};

/**
 * Today's theme, read in IST.
 *
 * The published-poll key stays UTC (`todayUTCDate()` in pollService) and that
 * is fine: the theme only decides *which* poll gets stamped on the day's first
 * request. Once stamped, everyone that day re-reads the same row, so the
 * 00:00–05:30 IST window where the two calendars disagree can never show two
 * different users two different polls.
 */
export function themeForDate(d: Date = new Date()): PollTheme {
  const ist = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  return THEME_BY_DOW[ist.getUTCDay()];
}
