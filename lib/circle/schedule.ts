/**
 * Phase F — when the Serious Circle runs.
 *
 * ## Fixed slots, never "next available"
 *
 * Wednesday and Sunday, 8–10pm, every week, forever. The whole retention
 * mechanic is that a user can answer "kab hai?" from memory — a rolling or
 * admin-picked schedule destroys that, which is why these are constants and
 * not columns.
 *
 * Sunday evening is when Indian families are actually sitting together, and
 * marriage decisions here are rarely made alone. Wednesday exists to pull
 * people back mid-week rather than letting six days pass between touches.
 *
 * ## Why a hard-coded IST offset instead of a timezone library
 *
 * India observes no DST, so Asia/Kolkata is a constant +05:30 — there is
 * nothing for a tz database to tell us that this number doesn't. Adding a
 * dependency (or relying on the *server's* local zone, which is UTC in most
 * deployments and would silently run the event at 1:30am IST) buys nothing.
 */

const IST_OFFSET_MIN = 330;
const MS_PER_MIN = 60_000;
const MS_PER_HOUR = 3_600_000;

/** Sunday = 0, Wednesday = 3 — as read in IST, not in the server's zone. */
export const CIRCLE_SLOT_DAYS = [0, 3] as const;
export const CIRCLE_START_HOUR_IST = 20;
export const CIRCLE_DURATION_HOURS = 2;
/** Registration shuts this long before the doors open. This is the commitment moment. */
export const CIRCLE_REGISTRATION_LEAD_HOURS = 24;

const DOW_SLUG = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/**
 * All seven, not just the two slot days. A one-off event moved to a Saturday
 * — or any test that shifts an event's clock — would otherwise render a label
 * with a blank where the day should be.
 */
export const DOW_LABEL_HI: Record<number, string> = {
  0: "Ravivaar",
  1: "Somvaar",
  2: "Mangalvaar",
  3: "Budhwaar",
  4: "Guruvaar",
  5: "Shukravaar",
  6: "Shanivaar",
};

export interface CircleSlot {
  slug: string;
  startsAt: Date;
  endsAt: Date;
  registrationClosesAt: Date;
}

/** The IST calendar fields of a UTC instant. */
function istParts(d: Date) {
  const shifted = new Date(d.getTime() + IST_OFFSET_MIN * MS_PER_MIN);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    dow: shifted.getUTCDay(),
  };
}

/** The UTC instant of `hour:00` IST on the given IST calendar date. */
function istDateToUtc(year: number, month: number, day: number, hour: number): Date {
  return new Date(Date.UTC(year, month, day, hour, 0, 0, 0) - IST_OFFSET_MIN * MS_PER_MIN);
}

function buildSlot(year: number, month: number, day: number, dow: number): CircleSlot {
  const startsAt = istDateToUtc(year, month, day, CIRCLE_START_HOUR_IST);
  const iso = istDateToUtc(year, month, day, 12).toISOString().slice(0, 10);
  return {
    slug: `${iso}-${DOW_SLUG[dow]}`,
    startsAt,
    endsAt: new Date(startsAt.getTime() + CIRCLE_DURATION_HOURS * MS_PER_HOUR),
    registrationClosesAt: new Date(startsAt.getTime() - CIRCLE_REGISTRATION_LEAD_HOURS * MS_PER_HOUR),
  };
}

/**
 * The next `count` slots whose window has not yet *ended* at `now`.
 *
 * Uses "has not ended" rather than "has not started" so that a user loading
 * the page at 8:45pm on a Sunday gets the event they are currently inside as
 * slot 0, instead of being told the next one is on Wednesday while the room is
 * open around them.
 */
export function upcomingSlots(now = new Date(), count = 2): CircleSlot[] {
  const out: CircleSlot[] = [];
  const { year, month, day } = istParts(now);

  // 14 days is two full weeks — always enough to find 4 slots, and bounded so
  // a bad `count` can't spin.
  for (let offset = 0; offset < 14 && out.length < count; offset++) {
    const probe = new Date(Date.UTC(year, month, day + offset, 12));
    const p = istParts(probe);
    if (!CIRCLE_SLOT_DAYS.includes(p.dow as (typeof CIRCLE_SLOT_DAYS)[number])) continue;

    const slot = buildSlot(p.year, p.month, p.day, p.dow);
    if (slot.endsAt <= now) continue;
    out.push(slot);
  }
  return out;
}

/** Slot label a user can read back: "Ravivaar, 9 Aug · 8–10 PM". */
export function formatSlotLabel(startsAt: Date): string {
  const p = istParts(startsAt);
  const dateText = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  }).format(startsAt);
  const endHour = CIRCLE_START_HOUR_IST + CIRCLE_DURATION_HOURS;
  return `${DOW_LABEL_HI[p.dow]}, ${dateText} · ${to12h(CIRCLE_START_HOUR_IST)}–${to12h(endHour)}`;
}

function to12h(hour24: number): string {
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const h = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${h} ${suffix}`;
}
