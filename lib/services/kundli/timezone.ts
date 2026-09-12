/**
 * Local birth time → UTC, for any IANA zone, on the date it happened.
 *
 * A birth time is a wall-clock reading; the ephemeris wants an instant. For
 * an Indian birth the difference is a constant +5:30, but a person born in
 * London in July 1985 was on BST, and one born in Dubai never had daylight
 * saving at all. Node's ICU carries every zone's history, so the offset is
 * *computed for the date* here rather than looked up in a table that would be
 * wrong the year a country changed its rules.
 *
 * Pure — no `server-only`, no network — so `chart.ts` (which the check
 * scripts import directly) and the geocoder can share it.
 */

export const IST_OFFSET_MINUTES = 330;

/**
 * The UTC offset, in minutes, that `timeZoneId` had at `instant`; null when
 * the id is unknown to this runtime.
 */
export function offsetMinutesAt(timeZoneId: string, instant: Date): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZoneId,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(instant);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "NaN");
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    if (!Number.isFinite(asUtc)) return null;
    return Math.round((asUtc - instant.getTime()) / 60000);
  } catch {
    return null;
  }
}

/**
 * Local wall-clock (a calendar date + minutes past midnight in `timeZoneId`)
 * → the UTC instant. Two passes, because the offset can depend on the
 * instant it is being asked about (a DST switch on the birth day itself).
 */
export function localToUtc(year: number, month1: number, day: number, minutes: number, timeZoneId: string): Date | null {
  const naive = Date.UTC(year, month1 - 1, day, 0, minutes);
  const first = offsetMinutesAt(timeZoneId, new Date(naive));
  if (first === null) return null;
  let utc = naive - first * 60000;
  const second = offsetMinutesAt(timeZoneId, new Date(utc));
  if (second !== null && second !== first) utc = naive - second * 60000;
  return new Date(utc);
}

/** The offset the birth *date* had in `timeZoneId`, taken at local noon — the middle of the day. */
export function offsetForDate(timeZoneId: string, year: number, month1: number, day: number): number | null {
  return offsetMinutesAt(timeZoneId, new Date(Date.UTC(year, month1 - 1, day, 12)));
}
