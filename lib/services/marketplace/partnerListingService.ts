import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getServiceBand } from "./pricingControl";
import { checkListingCapacity } from "@/lib/services/pilot/pilotCityService";
import {
  MAX_ABOUT_CHARS,
  MAX_DELIVERABLE_CHARS,
  MAX_DELIVERABLES,
  MAX_HEADLINE_CHARS,
  MAX_SCOPE_CHARS,
  MAX_SERVICE_AREAS,
  SERVICE_KIND_BY_KEY,
  SERVICE_KINDS,
} from "./servicePolicy";
import type { PartnerServiceKind, Role } from "@prisma/client";

/**
 * What a partner controls about their own shopfront: whether they are listed,
 * where they work, how much they will take on, and what they sell at what
 * price.
 *
 * ## Two switches for one listing
 *
 * A partner appears on `/partners` only when `isListed` (their opt-in) **and**
 * `approvedAt` (an admin having looked) are both set. Neither alone is enough,
 * and that is the whole point: self-listing would put an unvetted bureau on a
 * public page under BandhanTak's name, and admin-listing alone would advertise
 * someone who never agreed to take bookings.
 *
 * Editing the listing content resets the approval — see `saveListing`. That is
 * the same rule photo verification already follows when the pixels change: what
 * an admin approved is no longer what would be shown.
 *
 * ## Prices are the partner's, within a band
 *
 * `SERVICE_KINDS` fixes the promise and a min/max price per kind. The floor
 * stops a ₹49 loss-leader from being used to buy ranking; the ceiling stops a
 * five-figure "package" being sold to a family under pressure. Neither is a
 * judgement about what the work is worth — they are the edges of the
 * experiment the plan explicitly calls a price experiment.
 */

export type ListingResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string; message: string; status: number };

function fail(error: string, message: string, status = 422): { ok: false; error: string; message: string; status: number } {
  return { ok: false, error, message, status };
}

/* ------------------------------------------------------------------ */
/* Listing profile                                                     */
/* ------------------------------------------------------------------ */

export interface ListingInput {
  isListed: boolean;
  headline: string | null;
  about: string | null;
  languages: string[];
}

export async function getListing(partnerId: string) {
  const [profile, areas, availability, services] = await Promise.all([
    prisma.partnerMarketplaceProfile.findUnique({ where: { partnerId } }),
    prisma.partnerServiceArea.findMany({ where: { partnerId }, orderBy: { city: "asc" } }),
    prisma.partnerAvailability.findUnique({ where: { partnerId } }),
    prisma.partnerService.findMany({ where: { partnerId }, orderBy: { kind: "asc" } }),
  ]);

  return {
    profile,
    areas,
    availability,
    services,
    /** Everything that must be true before the listing can go to an admin. */
    readiness: listingReadiness({ profile, areas, services }),
  };
}

export interface ListingReadiness {
  ready: boolean;
  missing: string[];
}

export function listingReadiness(input: {
  profile: { headline: string | null; languages: string[] } | null;
  areas: { id: string }[];
  services: { isActive: boolean }[];
}): ListingReadiness {
  const missing: string[] = [];
  if (!input.profile?.headline?.trim()) missing.push("Ek line ka headline");
  if ((input.profile?.languages.length ?? 0) === 0) missing.push("Kaunsi bhasha me kaam karte hain");
  if (input.areas.length === 0) missing.push("Kam se kam ek city");
  if (!input.services.some((s) => s.isActive)) missing.push("Kam se kam ek active service");
  return { ready: missing.length === 0, missing };
}

/**
 * Save the shopfront copy.
 *
 * Any content change clears a previous approval and pulls the card off the
 * public list until an admin looks again. The alternative — approve once,
 * edit freely — means the approval certifies nothing after the first edit.
 */
export async function saveListing(partnerId: string, input: ListingInput): Promise<ListingResult> {
  const headline = input.headline?.trim() || null;
  const about = input.about?.trim() || null;

  if (headline && headline.length > MAX_HEADLINE_CHARS) {
    return fail("VALIDATION_FAILED", `Headline ${MAX_HEADLINE_CHARS} characters se chhota rakhiye.`);
  }
  if (about && about.length > MAX_ABOUT_CHARS) {
    return fail("VALIDATION_FAILED", `Apne baare me ${MAX_ABOUT_CHARS} characters se kam likhiye.`);
  }

  const languages = [...new Set(input.languages.map((l) => l.trim()).filter(Boolean))].slice(0, 8);

  const existing = await prisma.partnerMarketplaceProfile.findUnique({ where: { partnerId } });
  const contentChanged =
    !existing ||
    existing.headline !== headline ||
    existing.about !== about ||
    existing.languages.join("|") !== languages.join("|");

  const data = {
    isListed: input.isListed,
    headline,
    about,
    languages,
    // Cleared on a content change, kept when the partner merely toggles
    // `isListed` off and on again — pausing your own listing should not cost
    // you a re-review.
    ...(contentChanged ? { approvedAt: null, approvedBy: null, rejectedAt: null, rejectionNote: null } : {}),
  };

  await prisma.partnerMarketplaceProfile.upsert({
    where: { partnerId },
    create: { partnerId, ...data },
    update: data,
  });

  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Service areas                                                       */
/* ------------------------------------------------------------------ */

export async function setServiceAreas(
  partnerId: string,
  cities: { city: string; state?: string | null }[],
): Promise<ListingResult> {
  const cleaned = cities
    .map((c) => ({ city: c.city.trim(), state: c.state?.trim() || null }))
    .filter((c) => c.city.length >= 2);

  if (cleaned.length > MAX_SERVICE_AREAS) {
    return fail("TOO_MANY", `Zyada se zyada ${MAX_SERVICE_AREAS} cities chun sakte hain.`);
  }

  const seen = new Set<string>();
  const unique = cleaned.filter((c) => {
    const key = c.city.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  await prisma.$transaction(async (tx) => {
    await tx.partnerServiceArea.deleteMany({ where: { partnerId } });
    if (unique.length > 0) {
      await tx.partnerServiceArea.createMany({
        data: unique.map((c) => ({ partnerId, city: c.city, state: c.state })),
      });
    }
  });

  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Availability                                                        */
/* ------------------------------------------------------------------ */

export async function setAvailability(
  partnerId: string,
  input: { acceptingBookings: boolean; weeklyCapacity: number; note?: string | null },
): Promise<ListingResult> {
  const weeklyCapacity = Math.max(0, Math.min(50, Math.round(input.weeklyCapacity)));
  const data = {
    acceptingBookings: input.acceptingBookings,
    weeklyCapacity,
    note: input.note?.trim() || null,
    // Phase 7 — switching yourself back on clears the automatic pause. The
    // pause is a brake on buyers reaching somebody who did not answer the last
    // two, not a punishment, so the partner's own decision to start again ends
    // it; what survives is the record (the escalation the admin already saw,
    // and the measured accept time on their public card).
    ...(input.acceptingBookings ? { autoPausedAt: null, autoPauseReason: null } : {}),
  };
  await prisma.partnerAvailability.upsert({
    where: { partnerId },
    create: { partnerId, ...data },
    update: data,
  });
  return { ok: true };
}

/**
 * Capacity as the buyer sees it: how many active bookings this partner is
 * already holding, against what they said they can hold.
 *
 * Counted live rather than stored, because a stored counter is one webhook
 * failure away from a partner being permanently "full".
 */
export async function getCapacity(partnerId: string): Promise<{
  accepting: boolean;
  capacity: number;
  active: number;
  full: boolean;
  note: string | null;
}> {
  const [availability, active] = await Promise.all([
    prisma.partnerAvailability.findUnique({ where: { partnerId } }),
    prisma.serviceBooking.count({
      where: { partnerId, status: { in: ["PAID", "ACCEPTED", "IN_PROGRESS", "DELIVERED", "DISPUTED"] } },
    }),
  ]);

  const capacity = availability?.weeklyCapacity ?? 5;
  const paused = Boolean(availability?.pausedUntil && availability.pausedUntil > new Date());
  const accepting = (availability?.acceptingBookings ?? true) && !paused;

  return {
    accepting,
    capacity,
    active,
    full: active >= capacity,
    note: availability?.note ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Services                                                            */
/* ------------------------------------------------------------------ */

export interface ServiceInput {
  kind: PartnerServiceKind;
  name: string;
  scope: string | null;
  deliverables: string[];
  priceInPaise: number;
  deliveryDays: number;
  acceptSlaHours: number | null;
  cancellationPolicy: string | null;
  isActive: boolean;
}

export async function upsertService(partnerId: string, input: ServiceInput): Promise<ListingResult<{ serviceId: string }>> {
  const spec = SERVICE_KIND_BY_KEY[input.kind];
  if (!spec) return fail("UNKNOWN_KIND", "Ye service type maujood nahi hai.");

  const name = input.name.trim();
  if (name.length < 3 || name.length > 80) {
    return fail("VALIDATION_FAILED", "Service ka naam 3 se 80 characters ka rakhiye.");
  }

  // The band an admin has set, falling back to the code default — a partner's
  // allowed price range is a lever the platform can move without a deploy.
  const band = await getServiceBand(input.kind);
  if (input.priceInPaise < band.minPricePaise || input.priceInPaise > band.maxPricePaise) {
    return fail(
      "PRICE_OUT_OF_BAND",
      `${spec.label} ki keemat ₹${band.minPricePaise / 100} se ₹${band.maxPricePaise / 100} ke beech honi chahiye.`,
    );
  }

  const scope = input.scope?.trim() || null;
  if (scope && scope.length > MAX_SCOPE_CHARS) {
    return fail("VALIDATION_FAILED", `Scope ${MAX_SCOPE_CHARS} characters se kam rakhiye.`);
  }

  const deliverables = input.deliverables
    .map((d) => d.trim())
    .filter((d) => d.length > 0 && d.length <= MAX_DELIVERABLE_CHARS)
    .slice(0, MAX_DELIVERABLES);

  // Every charge has a concrete deliverable — a Phase 2 acceptance criterion,
  // enforced here rather than trusted to the form.
  if (deliverables.length === 0) {
    return fail("NO_DELIVERABLES", "Kam se kam ek deliverable likhiye — kya cheez deliver hogi.");
  }

  const deliveryDays = Math.max(1, Math.min(90, Math.round(input.deliveryDays)));
  const acceptSlaHours =
    input.acceptSlaHours === null ? null : Math.max(2, Math.min(168, Math.round(input.acceptSlaHours)));

  const data = {
    name,
    scope,
    deliverables,
    priceInPaise: input.priceInPaise,
    deliveryDays,
    acceptSlaHours,
    cancellationPolicy: input.cancellationPolicy?.trim() || null,
    isActive: input.isActive,
  };

  const row = await prisma.partnerService.upsert({
    where: { partnerId_kind: { partnerId, kind: input.kind } },
    create: { partnerId, kind: input.kind, ...data },
    update: data,
    select: { id: true },
  });

  return { ok: true, serviceId: row.id };
}

/**
 * Deactivate rather than delete.
 *
 * A `ServiceBooking` points at its service with `onDelete: Restrict`, so a
 * partner cannot erase the description of work somebody already paid for. This
 * makes that a product behaviour rather than a foreign-key error.
 */
export async function deactivateService(partnerId: string, kind: PartnerServiceKind): Promise<ListingResult> {
  const updated = await prisma.partnerService.updateMany({
    where: { partnerId, kind },
    data: { isActive: false },
  });
  if (updated.count === 0) return fail("NOT_FOUND", "Ye service nahi mili.", 404);
  return { ok: true };
}

/** The editor's starting point for a kind the partner has not offered yet. */
export function blankServiceFor(kind: PartnerServiceKind): ServiceInput {
  const spec = SERVICE_KIND_BY_KEY[kind];
  return {
    kind,
    name: spec.label,
    scope: null,
    deliverables: [...spec.defaultDeliverables],
    priceInPaise: spec.minPricePaise,
    deliveryDays: spec.defaultDeliveryDays,
    acceptSlaHours: null,
    cancellationPolicy: null,
    isActive: true,
  };
}

export function serviceKindOptions() {
  return SERVICE_KINDS.map((s) => ({
    kind: s.kind,
    label: s.label,
    promise: s.promise,
    deliveryProof: s.deliveryProof,
    minPricePaise: s.minPricePaise,
    maxPricePaise: s.maxPricePaise,
  }));
}

/* ------------------------------------------------------------------ */
/* Admin review                                                        */
/* ------------------------------------------------------------------ */

export async function reviewListing(params: {
  partnerId: string;
  approve: boolean;
  note?: string | null;
  actorId: string;
  actorRole: Role;
}): Promise<ListingResult> {
  const { partnerId, approve, note, actorId, actorRole } = params;

  const profile = await prisma.partnerMarketplaceProfile.findUnique({ where: { partnerId } });
  if (!profile) return fail("NOT_FOUND", "Is partner ka listing request nahi mila.", 404);

  if (!approve && !note?.trim()) {
    return fail("REASON_REQUIRED", "Reject karne ka reason likhiye.");
  }

  // Phase 7 — the pilot's supply cap. Checked on approval and not on the
  // partner's own opt-in: a partner may always ask, and the city decides
  // whether asking turns into a listing buyers can see. Already-approved
  // listings are re-approvable (an edit resets `approvedAt`, and a city that
  // filled up in the meantime must not strand somebody who is already working
  // there) — hence the check only on a listing that is not currently live.
  if (approve && !profile.approvedAt) {
    const capacity = await checkListingCapacity(partnerId);
    if (!capacity.ok) return fail("CITY_FULL", capacity.message!, 409);
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.partnerMarketplaceProfile.update({
      where: { partnerId },
      data: approve
        ? { approvedAt: now, approvedBy: actorId, rejectedAt: null, rejectedBy: null, rejectionNote: null }
        : { approvedAt: null, approvedBy: null, rejectedAt: now, rejectedBy: actorId, rejectionNote: note!.trim() },
    });

    await tx.adminAuditLog.create({
      data: {
        actorId,
        actorRole,
        actionType: approve ? "PARTNER_LISTING_APPROVED" : "PARTNER_LISTING_REJECTED",
        targetType: "partner_marketplace_profile",
        targetId: partnerId,
        previousValue: profile.approvedAt ? "APPROVED" : profile.rejectedAt ? "REJECTED" : "PENDING",
        newValue: approve ? "APPROVED" : "REJECTED",
        reason: note?.trim() || null,
      },
    });
  });

  return { ok: true };
}

/** The admin queue: partners who opted in and are waiting to be looked at. */
export async function listPendingListings() {
  const rows = await prisma.partnerMarketplaceProfile.findMany({
    where: { isListed: true, approvedAt: null },
    orderBy: { updatedAt: "asc" },
    include: {
      partner: {
        select: { id: true, fullName: true, city: true, state: true, partnerType: true, status: true },
      },
    },
  });

  const withDetail = await Promise.all(
    rows.map(async (row) => {
      const [areas, services] = await Promise.all([
        prisma.partnerServiceArea.findMany({ where: { partnerId: row.partnerId }, select: { city: true } }),
        prisma.partnerService.findMany({
          where: { partnerId: row.partnerId, isActive: true },
          select: {
            id: true,
            kind: true,
            name: true,
            priceInPaise: true,
            // The platform's own price, so the review screen can show what
            // staff have overridden rather than only the partner's number.
            adminPricePaise: true,
            adminPriceNote: true,
            deliverables: true,
          },
        }),
      ]);
      return { ...row, areas: areas.map((a) => a.city), services };
    }),
  );

  return withDetail;
}
