/**
 * The one place a kundli screen turns "this birth detail is missing" into a
 * link — so every CTA opens the *targeted* deck (only the fields the chart
 * needs, first one focused, back here when done) and never the full profile
 * journey.
 *
 * Contract with `InterviewMode` (`/profile/build`):
 *   `?mode=manual&fields=<keys>&field=<focus>&return=<path>`
 *
 * Built by hand rather than with `URLSearchParams` so the query reads exactly
 * as the deck documents it (`fields=birthTime,birthPlace`, `return=/user/…`);
 * commas and slashes are legal in a query string and both parsers agree.
 */

export const KUNDLI_PATH = "/user/kundli";

/** The three profile fields the chart is built from (`lib/profile/fields.ts`). */
export type KundliMissingField = "dateOfBirth" | "birthTime" | "birthPlace";

export function kundliFieldEditHref(missing: KundliMissingField, returnTo: string = KUNDLI_PATH): string {
  if (missing === "dateOfBirth") {
    return `/profile/build?mode=manual&fields=dateOfBirth&return=${returnTo}`;
  }
  // Time and place always travel together: a lagna needs both, and a user who
  // opens the deck for one usually has the other to hand. `field=` only picks
  // which of the two is focused first.
  return `/profile/build?mode=manual&fields=birthTime,birthPlace&field=${missing}&return=${returnTo}`;
}

/** Plain-English CTA label for the field a chart is waiting on. */
export function kundliFieldCtaLabel(missing: KundliMissingField): string {
  switch (missing) {
    case "dateOfBirth":
      return "Add Date of Birth";
    case "birthTime":
      return "Add Birth Time";
    case "birthPlace":
      return "Fix Birth Place";
  }
}
