/**
 * Report reasons, shared by the client sheet and the server service.
 *
 * Lives in constants rather than in `reportService` because that module is
 * `server-only` — a client component importing it would fail the build. The
 * list is also the admin queue's filter vocabulary, so both sides genuinely
 * need the same array rather than two that drift.
 *
 * Fixed options plus a free-text box underneath: a pure free-text reason makes
 * the queue unsortable, and a pure fixed list guarantees the one thing that
 * actually happened is never on it.
 */
export const REPORT_REASONS = [
  "Galat ya jhoothi jaankari",
  "Bad-tameezi ya gaali",
  "Sexual ya galat baat",
  "Paise ya dahej ki demand",
  "Contact detail maang raha/rahi hai",
  "Fake profile lagti hai",
  "Kuch aur",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export function isReportReason(value: string): value is ReportReason {
  return (REPORT_REASONS as readonly string[]).includes(value);
}
