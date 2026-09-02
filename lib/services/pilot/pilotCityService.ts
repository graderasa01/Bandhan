import "server-only";
import { prisma } from "@/lib/db/prisma";
import { createNotice } from "@/lib/services/notice/noticeService";
import { getOpsSettings } from "./opsSettings";
import type { CityDemandReason, PartnerServiceKind, PilotCityStatus, Prisma, Role } from "@prisma/client";

/**
 * Where BandhanTak is actually open, and how much of a city it can carry.
 *
 * ## The two questions this answers, which nothing answered before
 *
 * *"Are we in Kochi?"* — the app had no way to say no. A partner in a city with
 * no members could be approved and left to discover the emptiness themselves; a
 * buyer filtering to that city got a blank list with no explanation and no way
 * to be told when that changed.
 *
 * *"How many partners does Jaipur need?"* — nothing capped supply, and an
 * uncapped pilot is not generous, it is a room of partners each earning nothing
 * from a share of forty bookings. `PartnerAvailability.weeklyCapacity` is the
 * partner's own answer to how much they can take; this is the platform's answer
 * to how many of them a city should have at all.
 *
 * ## Why capacity is counted per service area
 *
 * A bureau listed for Jaipur and Ajmer appears to buyers in both, so it
 * occupies a slot in both. Counting only their home city would let one partner
 * cover twenty cities while the cap read as though nineteen were still empty —
 * and the cap exists to describe what a buyer sees, not where somebody lives.
 */

/** Free text typed by people on both sides, so the join has to be normalised. */
export function citySlug(city: string): string {
  return city.trim().toLowerCase().replace(/\s+/g, " ");
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export interface PilotCityRow {
  id: string;
  slug: string;
  city: string;
  state: string;
  status: PilotCityStatus;
  partnerCapacity: number;
  /** Partners whose approved listing covers this city right now. */
  listedPartners: number;
  /** Listings opted in and waiting for an admin, in this city. */
  pendingListings: number;
  /** People who asked for this city and have not been told it opened. */
  waiting: number;
  openedAt: string | null;
  note: string | null;
}

/**
 * Every city in the registry, with the three counts an admin decides on.
 *
 * The partner counts come from one grouped query rather than a count per city:
 * the registry is small, but a per-row count would make the page's cost a
 * function of how many cities the pilot has succeeded in opening, which is the
 * wrong thing to punish.
 */
export async function listPilotCities(): Promise<PilotCityRow[]> {
  const cities = await prisma.pilotCity.findMany({ orderBy: [{ status: "asc" }, { city: "asc" }] });
  if (cities.length === 0) return [];

  const slugs = cities.map((c) => c.slug);
  const [listedCounts, pendingCounts, waitingCounts] = await Promise.all([
    countPartnersByCity(slugs, { approvedOnly: true }),
    countPartnersByCity(slugs, { approvedOnly: false }),
    prisma.cityDemandSignal.groupBy({
      by: ["citySlug"],
      where: { citySlug: { in: slugs }, notifiedAt: null },
      _count: { _all: true },
    }),
  ]);

  const waitingBySlug = new Map(waitingCounts.map((w) => [w.citySlug, w._count._all]));

  return cities.map((c) => ({
    id: c.id,
    slug: c.slug,
    city: c.city,
    state: c.state,
    status: c.status,
    partnerCapacity: c.partnerCapacity,
    listedPartners: listedCounts.get(c.slug) ?? 0,
    pendingListings: pendingCounts.get(c.slug) ?? 0,
    waiting: waitingBySlug.get(c.slug) ?? 0,
    openedAt: c.openedAt?.toISOString() ?? null,
    note: c.note,
  }));
}

/**
 * How many partners cover each of these cities.
 *
 * `approvedOnly` separates the two counts an admin needs at once: who is
 * already visible to buyers (that is what the cap governs) and who is queued
 * behind them (that is whether the cap is about to bite).
 */
async function countPartnersByCity(
  slugs: string[],
  opts: { approvedOnly: boolean },
): Promise<Map<string, number>> {
  const listingWhere: Prisma.PartnerMarketplaceProfileWhereInput = opts.approvedOnly
    ? { isListed: true, approvedAt: { not: null } }
    : { isListed: true, approvedAt: null };

  const partners = await prisma.partner.findMany({
    where: {
      status: { in: ["APPROVED", "ACTIVE"] },
      marketplaceProfile: { is: listingWhere },
    },
    select: { id: true, city: true, serviceAreas: { select: { city: true } } },
  });

  const counts = new Map<string, number>();
  const wanted = new Set(slugs);
  for (const partner of partners) {
    for (const slug of coveredSlugs(partner)) {
      if (!wanted.has(slug)) continue;
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * The cities one partner occupies a slot in.
 *
 * Falls back to their home city when they have declared no service areas —
 * a partner with none is still visible in search and would otherwise consume
 * capacity nowhere while appearing to buyers somewhere.
 */
function coveredSlugs(partner: { city: string; serviceAreas: { city: string }[] }): Set<string> {
  const slugs = new Set(partner.serviceAreas.map((a) => citySlug(a.city)));
  if (slugs.size === 0) slugs.add(citySlug(partner.city));
  return slugs;
}

export async function getPilotCity(city: string) {
  return prisma.pilotCity.findUnique({ where: { slug: citySlug(city) } });
}

/* ------------------------------------------------------------------ */
/* The capacity gate                                                   */
/* ------------------------------------------------------------------ */

export interface CapacityVerdict {
  /** False only where a city in the registry is already full or not open. */
  ok: boolean;
  /** The city that refused, for the message. */
  city: string | null;
  capacity: number;
  listed: number;
  message: string | null;
}

/**
 * Whether this partner's listing may be approved.
 *
 * Called from `reviewListing`. Three deliberate shapes:
 *
 *  - A city **not in the registry** never blocks. The registry is an opinion an
 *    admin has entered, and its absence is silence, not a refusal — a pilot
 *    that stops working the moment somebody forgets to add a row is worse than
 *    no cap at all.
 *  - A **PAUSED or WAITLIST** city blocks. Approving a listing there would put
 *    a partner in front of buyers we have told there is nobody yet.
 *  - A **full OPEN** city blocks, and the fix is to raise the number — which is
 *    one field, audited. There is no "approve anyway", because an override that
 *    leaves no trace is how a cap becomes a formality.
 *
 * A partner covering several cities needs only *one* of them to have room: the
 * rest of their coverage is real work in cities that already said yes, and
 * refusing the whole listing over the fullest city would make a bureau's
 * expansion into a second city cost them their first.
 */
export async function checkListingCapacity(partnerId: string): Promise<CapacityVerdict> {
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { city: true, serviceAreas: { select: { city: true } } },
  });
  if (!partner) return { ok: true, city: null, capacity: 0, listed: 0, message: null };

  const slugs = [...coveredSlugs(partner)];
  const cities = await prisma.pilotCity.findMany({ where: { slug: { in: slugs } } });
  // Silence is not a refusal — see the header.
  if (cities.length === 0) return { ok: true, city: null, capacity: 0, listed: 0, message: null };

  const listedCounts = await countPartnersByCity(
    cities.map((c) => c.slug),
    { approvedOnly: true },
  );

  const blocked: CapacityVerdict[] = [];
  for (const city of cities) {
    const listed = listedCounts.get(city.slug) ?? 0;
    if (city.status === "OPEN" && listed < city.partnerCapacity) {
      return { ok: true, city: city.city, capacity: city.partnerCapacity, listed, message: null };
    }
    blocked.push({
      ok: false,
      city: city.city,
      capacity: city.partnerCapacity,
      listed,
      message:
        city.status === "OPEN"
          ? `${city.city} abhi bhara hua hai — ${listed}/${city.partnerCapacity} partner listed hain. Capacity badhaiye ya kisi aur ko hataiye.`
          : city.status === "WAITLIST"
            ? `${city.city} abhi khula nahi hai. Pehle city ko OPEN kijiye, warna partner ko un buyers ke saamne rakh denge jinse hum keh chuke hain ki yahan koi nahi hai.`
            : `${city.city} abhi rukka hua hai (PAUSED). Nayi listing yahan approve nahi hoti.`,
    });
  }

  // Every covered city refused. The first is the one to explain, and cities are
  // read in a stable order so the same listing gets the same sentence twice.
  return blocked[0]!;
}

/* ------------------------------------------------------------------ */
/* Buyer-side coverage                                                 */
/* ------------------------------------------------------------------ */

export type CoverageVerdict =
  /** Open, and somebody there can take the work. */
  | { state: "SERVED"; city: string; note: string | null }
  /** In the registry but not selling yet, or not any more. */
  | { state: "NOT_OPEN"; city: string; status: PilotCityStatus; note: string | null; reason: CityDemandReason }
  /** Open, but nobody has room or nobody does this service. */
  | { state: "NO_SUPPLY"; city: string; note: string | null; reason: CityDemandReason }
  /** Not a city we have an opinion about. */
  | { state: "UNKNOWN"; city: string; note: null; reason: CityDemandReason };

/**
 * What to tell a buyer who filtered to a city and found nothing, and which
 * demand signal that silence is worth.
 *
 * Takes the search result rather than re-querying it: the caller has just run
 * the exact query whose emptiness is the question, and running it again here
 * would risk the page and the message disagreeing about what is available.
 */
export async function cityCoverage(
  city: string,
  found: { accepting: boolean; full: boolean }[],
  kind?: PartnerServiceKind | null,
): Promise<CoverageVerdict> {
  const slug = citySlug(city);
  const row = await prisma.pilotCity.findUnique({ where: { slug } });
  const label = row?.city ?? city.trim();

  if (found.some((p) => p.accepting && !p.full)) {
    return { state: "SERVED", city: label, note: row?.note ?? null };
  }

  if (!row) {
    return { state: "UNKNOWN", city: label, note: null, reason: "NO_PILOT_CITY" };
  }
  if (row.status !== "OPEN") {
    return {
      state: "NOT_OPEN",
      city: label,
      status: row.status,
      note: row.note,
      reason: "NO_PILOT_CITY",
    };
  }

  return {
    state: "NO_SUPPLY",
    city: label,
    note: row.note,
    // "Nobody free" and "nobody who does this" are different facts about the
    // city and lead to different decisions — one needs the existing partners
    // chased, the other needs a partner of a kind we do not have.
    reason: found.length > 0 ? "ALL_PARTNERS_FULL" : kind ? "NO_PARTNER_FOR_KIND" : "ALL_PARTNERS_FULL",
  };
}

/* ------------------------------------------------------------------ */
/* Demand signals                                                      */
/* ------------------------------------------------------------------ */

export type DemandResult =
  | { ok: true; alreadyWaiting: boolean }
  | { ok: false; error: string; message: string; status: number };

/**
 * Somebody wanted something in a city that could not serve them.
 *
 * Requires a signed-in user, and that is the one real constraint on this
 * feature: the marketplace itself is public, so the *honest empty state* is
 * shown to everybody, but a promise to come back to somebody needs an account
 * to come back to. Collecting a stray phone number from a logged-out visitor
 * would be a new contact-collection surface with its own consent story, for a
 * waitlist that is meant to be small.
 *
 * Idempotent per person per city: asking twice is the same want, and the second
 * ask must not reset the clock or double the count an admin reads.
 */
export async function recordDemandSignal(params: {
  userId: string;
  city: string;
  state?: string | null;
  reason: CityDemandReason;
  serviceKind?: PartnerServiceKind | null;
}): Promise<DemandResult> {
  const city = params.city.trim();
  if (!city) return { ok: false, error: "CITY_REQUIRED", message: "Sheher ka naam likhiye.", status: 422 };
  if (city.length > 100) return { ok: false, error: "CITY_TOO_LONG", message: "Sheher ka naam bahut lamba hai.", status: 422 };

  const slug = citySlug(city);
  const pilotCity = await prisma.pilotCity.findUnique({ where: { slug }, select: { id: true, state: true } });

  const existing = await prisma.cityDemandSignal.findUnique({
    where: { userId_citySlug: { userId: params.userId, citySlug: slug } },
    select: { id: true },
  });
  if (existing) return { ok: true, alreadyWaiting: true };

  await prisma.cityDemandSignal.create({
    data: {
      citySlug: slug,
      city,
      state: params.state?.trim() || pilotCity?.state || null,
      pilotCityId: pilotCity?.id ?? null,
      userId: params.userId,
      reason: params.reason,
      serviceKind: params.serviceKind ?? null,
    },
  });

  return { ok: true, alreadyWaiting: false };
}

export interface DemandHotspot {
  citySlug: string;
  city: string;
  state: string | null;
  waiting: number;
  /** Whether the registry already has a row for it. */
  known: boolean;
  status: PilotCityStatus | null;
}

/**
 * Where people are asking and we are not. Sorted by how many, because that is
 * the order the next twelve partners should be recruited in.
 *
 * Only counts people who have not been told the city opened: once we have
 * answered somebody, their signal is history rather than a queue.
 */
export async function getDemandHotspots(limit = 10): Promise<DemandHotspot[]> {
  const grouped = await prisma.cityDemandSignal.groupBy({
    by: ["citySlug"],
    where: { notifiedAt: null },
    _count: { _all: true },
    orderBy: { _count: { citySlug: "desc" } },
    take: limit,
  });
  if (grouped.length === 0) return [];

  const slugs = grouped.map((g) => g.citySlug);
  const [cities, samples] = await Promise.all([
    prisma.pilotCity.findMany({ where: { slug: { in: slugs } }, select: { slug: true, city: true, state: true, status: true } }),
    // One row per slug for the display name of a city nobody has entered yet.
    prisma.cityDemandSignal.findMany({
      where: { citySlug: { in: slugs } },
      distinct: ["citySlug"],
      select: { citySlug: true, city: true, state: true },
    }),
  ]);

  const known = new Map(cities.map((c) => [c.slug, c]));
  const sample = new Map(samples.map((s) => [s.citySlug, s]));

  return grouped.map((g) => {
    const row = known.get(g.citySlug);
    const fallback = sample.get(g.citySlug);
    return {
      citySlug: g.citySlug,
      city: row?.city ?? fallback?.city ?? g.citySlug,
      state: row?.state ?? fallback?.state ?? null,
      waiting: g._count._all,
      known: Boolean(row),
      status: row?.status ?? null,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

export type CityResult = { ok: true; id: string; notified?: number } | { ok: false; error: string; message: string; status: number };

interface Actor {
  actorId: string;
  actorRole: Role;
}

function fail(error: string, message: string, status = 422): CityResult {
  return { ok: false, error, message, status };
}

/** Guard rail on the one number that decides how much supply a city gets. */
function validCapacity(capacity: number): boolean {
  return Number.isInteger(capacity) && capacity >= 0 && capacity <= 500;
}

export async function addPilotCity(
  input: { city: string; state: string; status?: PilotCityStatus; partnerCapacity?: number; note?: string | null },
  actor: Actor,
): Promise<CityResult> {
  const city = input.city.trim();
  const state = input.state.trim();
  if (!city || !state) return fail("VALIDATION", "Sheher aur rajya dono chahiye.");
  if (city.length > 100 || state.length > 100) return fail("VALIDATION", "Naam bahut lamba hai.");

  const slug = citySlug(city);
  const existing = await prisma.pilotCity.findUnique({ where: { slug }, select: { id: true } });
  if (existing) return fail("ALREADY_EXISTS", "Ye sheher pehle se list me hai.", 409);

  const settings = await getOpsSettings();
  const capacity = input.partnerCapacity ?? settings.defaultCityPartnerCapacity;
  if (!validCapacity(capacity)) return fail("OUT_OF_RANGE", "Capacity 0 se 500 ke beech rakhiye.");

  const status = input.status ?? "WAITLIST";
  const created = await prisma.pilotCity.create({
    data: {
      slug,
      city,
      state,
      status,
      partnerCapacity: capacity,
      note: input.note?.trim() || null,
      openedAt: status === "OPEN" ? new Date() : null,
      updatedBy: actor.actorId,
    },
  });

  // Signals recorded before the city existed now belong to it. Without this the
  // people who asked for a city are invisible on the very screen that just
  // added it.
  await prisma.cityDemandSignal.updateMany({
    where: { citySlug: slug, pilotCityId: null },
    data: { pilotCityId: created.id },
  });

  await audit(actor, "PILOT_CITY_ADDED", created.id, "", JSON.stringify({ city, state, status, capacity }));

  const notified = status === "OPEN" ? await notifyWaitlist(created.id) : 0;
  return { ok: true, id: created.id, notified };
}

export async function updatePilotCity(
  id: string,
  input: { status?: PilotCityStatus; partnerCapacity?: number; note?: string | null },
  actor: Actor,
): Promise<CityResult> {
  const current = await prisma.pilotCity.findUnique({ where: { id } });
  if (!current) return fail("NOT_FOUND", "Ye sheher nahi mila.", 404);

  const data: Prisma.PilotCityUpdateInput = {};

  if (input.partnerCapacity !== undefined) {
    if (!validCapacity(input.partnerCapacity)) return fail("OUT_OF_RANGE", "Capacity 0 se 500 ke beech rakhiye.");
    data.partnerCapacity = input.partnerCapacity;
  }
  if (input.note !== undefined) data.note = input.note?.trim() || null;
  if (input.status !== undefined && input.status !== current.status) {
    data.status = input.status;
    // Stamped once, on the first opening. A city paused for a fortnight and
    // reopened has been open since the day it launched, not since Tuesday.
    if (input.status === "OPEN" && !current.openedAt) data.openedAt = new Date();
  }

  if (Object.keys(data).length === 0) return fail("NOTHING_TO_DO", "Kuch badla nahi.");

  await prisma.pilotCity.update({ where: { id }, data: { ...data, updatedBy: actor.actorId } });
  await audit(
    actor,
    "PILOT_CITY_UPDATED",
    id,
    JSON.stringify({ status: current.status, partnerCapacity: current.partnerCapacity, note: current.note }),
    JSON.stringify(data),
  );

  const opening = input.status === "OPEN" && current.status !== "OPEN";
  const notified = opening ? await notifyWaitlist(id) : 0;
  return { ok: true, id, notified };
}

/**
 * Tell the people who asked that their city is open.
 *
 * Runs inside the request that opened the city rather than waiting for the
 * nightly job: the admin who flipped the switch is the person who wants to know
 * it reached somebody, and a waitlist that is only drained by a cron is a
 * waitlist that stays full when the cron is misconfigured. The job sweeps
 * whatever this could not reach — see `notifyOpenCityWaitlists`.
 *
 * Capped per run so one very popular city cannot turn an admin's click into a
 * request that pushes to thousands of phones inline.
 */
export async function notifyWaitlist(cityId: string, limit = 200): Promise<number> {
  const city = await prisma.pilotCity.findUnique({ where: { id: cityId } });
  if (!city || city.status !== "OPEN") return 0;

  // Opening a city is not the same as having somebody in it. The promise these
  // people were given was "jab yahan partner aayenge, bata denge", so the
  // message waits for a partner who is actually free — a city flipped open with
  // an empty roster sends nothing, and the sweep delivers it the day somebody
  // is listed. Telling three hundred families that partners are available and
  // handing them an empty page is worse than the silence it replaced.
  if (!(await cityHasFreePartner(city.slug))) return 0;

  const waiting = await prisma.cityDemandSignal.findMany({
    where: { citySlug: city.slug, notifiedAt: null },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true, userId: true },
  });
  if (waiting.length === 0) return 0;

  const now = new Date();
  for (const signal of waiting) {
    await createNotice({
      userId: signal.userId,
      kind: "SERVICE_UPDATE",
      title: `${city.city} me partner ab available hain`,
      body: `Aapne poocha tha — ${city.city} me verified partner ab list par hain. Dekh lijiye.`,
      href: `/partners?city=${encodeURIComponent(city.city)}`,
      relatedId: city.id,
    });
    // Marked one at a time: a bulk update after the loop would mark everybody
    // notified if the loop died halfway, and the notice nobody received is the
    // one this row exists to guarantee.
    await prisma.cityDemandSignal.update({ where: { id: signal.id }, data: { notifiedAt: now } });
  }

  return waiting.length;
}

/** Statuses that mean a booking is still on a partner's plate. Mirrors `getCapacity`. */
const ACTIVE_BOOKING_STATUSES = ["PAID", "ACCEPTED", "IN_PROGRESS", "DELIVERED", "DISPUTED"] as const;

/** What `PartnerAvailability.weeklyCapacity` defaults to when the row is absent. */
const DEFAULT_WEEKLY_CAPACITY = 5;

/**
 * Whether anybody in this city could take a booking today.
 *
 * Deliberately re-implemented from `getCapacity` rather than imported: this
 * module is imported *by* `partnerListingService`, and importing it back would
 * make the two files a runtime cycle. Two queries and a comparison is a cheaper
 * price than a cycle that works until somebody adds a top-level constant.
 */
async function cityHasFreePartner(slug: string): Promise<boolean> {
  const partners = await prisma.partner.findMany({
    where: {
      status: { in: ["APPROVED", "ACTIVE"] },
      services: { some: { isActive: true } },
      marketplaceProfile: { is: { isListed: true, approvedAt: { not: null } } },
    },
    select: {
      id: true,
      city: true,
      serviceAreas: { select: { city: true } },
      availability: { select: { acceptingBookings: true, weeklyCapacity: true, pausedUntil: true } },
    },
  });

  const inCity = partners.filter((p) => coveredSlugs(p).has(slug));
  if (inCity.length === 0) return false;

  const active = await prisma.serviceBooking.groupBy({
    by: ["partnerId"],
    where: { partnerId: { in: inCity.map((p) => p.id) }, status: { in: [...ACTIVE_BOOKING_STATUSES] } },
    _count: { _all: true },
  });
  const load = new Map(active.map((a) => [a.partnerId, a._count._all]));
  const now = new Date();

  return inCity.some((p) => {
    const paused = Boolean(p.availability?.pausedUntil && p.availability.pausedUntil > now);
    const accepting = (p.availability?.acceptingBookings ?? true) && !paused;
    const capacity = p.availability?.weeklyCapacity ?? DEFAULT_WEEKLY_CAPACITY;
    return accepting && (load.get(p.id) ?? 0) < capacity;
  });
}

/**
 * The safety net under `notifyWaitlist`: every open city, every person still
 * waiting on it.
 *
 * Three ways somebody ends up here rather than being told at the click. The
 * admin's own notify run is capped, so a city with three hundred waiting
 * finishes over the next few sweeps. A city opened before its partners were
 * listed sends nothing that day and everything the day somebody is. And a
 * person can join a waitlist for a city that is *already* open — the
 * marketplace says so when every partner in it is full — and is owed the
 * message when somebody frees up.
 */
export async function notifyOpenCityWaitlists(limitPerCity = 200): Promise<number> {
  const open = await prisma.pilotCity.findMany({
    where: { status: "OPEN", demandSignals: { some: { notifiedAt: null } } },
    select: { id: true },
  });

  let total = 0;
  for (const city of open) {
    total += await notifyWaitlist(city.id, limitPerCity);
  }
  return total;
}

async function audit(actor: Actor, actionType: string, targetId: string, previous: string, next: string) {
  await prisma.adminAuditLog.create({
    data: {
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      actionType,
      targetType: "pilot_city",
      targetId,
      previousValue: previous || null,
      newValue: next,
    },
  });
}
