import "server-only";
import { prisma } from "@/lib/db/prisma";
import { SERVICE_KIND_BY_KEY } from "./servicePolicy";
import { getCapacity } from "./partnerListingService";
import { cityCoverage, type CoverageVerdict } from "@/lib/services/pilot/pilotCityService";
import type { PartnerKycStatus, PartnerServiceKind, PartnerStatus, PartnerType, Prisma } from "@prisma/client";

/**
 * The public marketplace: who is listed, and what a buyer is told about them.
 *
 * ## What a card may contain
 *
 * Verified badge and KYC state, cities, languages, services and their prices,
 * current capacity, **measured** response time and completion rate, reviews
 * from completed bookings, and the cancellation rule. That is the plan's list,
 * and it is also the whole list: there is no field on this card for a phone
 * number, an email or an address, because "a raw contact list is never sold"
 * has to be a property of the page rather than a promise about it.
 *
 * ## Why the stats are measured, never declared
 *
 * A self-declared "responds in 2 hours" is marketing. Both numbers here come
 * out of the booking table — the median gap between a booking being paid for
 * and the partner accepting it, and the share of settled bookings that
 * actually completed. A partner cannot type either one, and a partner with too
 * few bookings gets `null` rather than a flattering default, because "new"
 * is an honest thing to show and "100%" from one booking is not.
 */

/** Below this, a percentage is noise dressed as evidence. */
const MIN_BOOKINGS_FOR_STATS = 3;

export interface PartnerCardStats {
  /** Median hours from payment to acceptance. Null until there is enough data. */
  medianAcceptHours: number | null;
  /** 0..100. Null until there is enough data. */
  completionRatePercent: number | null;
  completedBookings: number;
  averageRating: number | null;
  reviewCount: number;
}

export interface PartnerServiceCard {
  id: string;
  kind: PartnerServiceKind;
  kindLabel: string;
  promise: string;
  deliveryProof: string;
  name: string;
  scope: string | null;
  deliverables: string[];
  priceInPaise: number;
  deliveryDays: number;
  cancellationPolicy: string | null;
}

export interface PartnerCard {
  partnerId: string;
  displayName: string;
  partnerType: PartnerType;
  headline: string | null;
  about: string | null;
  languages: string[];
  cities: string[];
  /** Approved by an admin and in good standing — the badge on the card. */
  verified: boolean;
  kycStatus: PartnerKycStatus;
  accepting: boolean;
  full: boolean;
  capacityNote: string | null;
  services: PartnerServiceCard[];
  fromPricePaise: number | null;
  stats: PartnerCardStats;
}

export interface MarketplaceFilters {
  city?: string | null;
  language?: string | null;
  kind?: PartnerServiceKind | null;
  /** Hide partners who are paused or already at capacity. */
  availableOnly?: boolean;
  limit?: number;
}

/**
 * The one query that decides who is visible at all.
 *
 * Four conditions, and every one of them is a separate person's decision:
 * the partner opted in (`isListed`), an admin approved the listing
 * (`approvedAt`), the partner account is in good standing (`status`), and
 * there is something to actually buy (an active service). A partner suspended
 * this morning disappears from the marketplace this morning — the status is
 * read here, not cached onto the listing row.
 */
const LISTABLE_PARTNER_STATUSES: PartnerStatus[] = ["APPROVED", "ACTIVE"];

function listedPartnerWhere(): Prisma.PartnerWhereInput {
  return {
    status: { in: LISTABLE_PARTNER_STATUSES },
    services: { some: { isActive: true } },
  };
}

function listedWhere(): Prisma.PartnerMarketplaceProfileWhereInput {
  return {
    isListed: true,
    approvedAt: { not: null },
    partner: listedPartnerWhere(),
  };
}

/** One include, used by both the list and the single-card read, so the two can
 *  never disagree about what a card is built from. */
const CARD_INCLUDE = {
  partner: {
    select: {
      id: true,
      fullName: true,
      organizationName: true,
      partnerType: true,
      kyc: { select: { status: true } },
      serviceAreas: { select: { city: true }, orderBy: { city: "asc" } },
      services: { where: { isActive: true }, orderBy: { priceInPaise: "asc" } },
    },
  },
} satisfies Prisma.PartnerMarketplaceProfileInclude;

type ListingRow = Prisma.PartnerMarketplaceProfileGetPayload<{ include: typeof CARD_INCLUDE }>;

export async function searchPartners(filters: MarketplaceFilters = {}): Promise<PartnerCard[]> {
  return (await searchPartnersWithCoverage(filters)).partners;
}

/**
 * The same search, plus what to say when it comes back thin.
 *
 * Coverage is computed from the cards *before* `availableOnly` filters them,
 * because "there are three partners here and all are full" and "there is nobody
 * here" are different sentences and the filtered list cannot tell them apart.
 * One search, one verdict — a second query would let the list and the message
 * on the same screen disagree.
 *
 * Null coverage means no city filter: a nationwide search that returns nothing
 * is a statement about the whole product, not about a city, and there is no
 * waitlist to put anybody on.
 */
export async function searchPartnersWithCoverage(
  filters: MarketplaceFilters = {},
): Promise<{ partners: PartnerCard[]; coverage: CoverageVerdict | null }> {
  const limit = Math.min(50, Math.max(1, filters.limit ?? 24));
  const city = filters.city?.trim() || null;
  const language = filters.language?.trim() || null;

  // The partner-side conditions are built once and narrowed, rather than
  // spread over `listedWhere()` — a spread would silently drop the
  // status/active-service floor the moment a city or kind filter was applied,
  // which is exactly how a suspended partner ends up visible under a filter.
  const partnerWhere: Prisma.PartnerWhereInput = {
    ...listedPartnerWhere(),
    ...(city ? { serviceAreas: { some: { city: { equals: city, mode: "insensitive" } } } } : {}),
    ...(filters.kind ? { services: { some: { isActive: true, kind: filters.kind } } } : {}),
  };

  const rows = await prisma.partnerMarketplaceProfile.findMany({
    where: {
      isListed: true,
      approvedAt: { not: null },
      partner: partnerWhere,
      ...(language ? { languages: { has: language } } : {}),
    },
    orderBy: { approvedAt: "desc" },
    take: limit,
    include: CARD_INCLUDE,
  });

  const cards = await Promise.all(rows.map((row) => buildCard(row)));
  const coverage = city ? await cityCoverage(city, cards, filters.kind ?? null) : null;
  const partners = filters.availableOnly ? cards.filter((c) => c.accepting && !c.full) : cards;
  return { partners, coverage };
}

async function buildCard(row: ListingRow): Promise<PartnerCard> {
  const [capacity, stats] = await Promise.all([
    getCapacity(row.partnerId),
    getPartnerStats(row.partnerId),
  ]);

  const services: PartnerServiceCard[] = row.partner.services.map((s) => {
    const spec = SERVICE_KIND_BY_KEY[s.kind];
    return {
      id: s.id,
      kind: s.kind,
      kindLabel: spec.label,
      promise: spec.promise,
      deliveryProof: spec.deliveryProof,
      name: s.name,
      scope: s.scope,
      deliverables: s.deliverables,
      priceInPaise: s.priceInPaise,
      deliveryDays: s.deliveryDays,
      cancellationPolicy: s.cancellationPolicy,
    };
  });

  return {
    partnerId: row.partnerId,
    // The bureau's name where there is one, the person's otherwise. Never a
    // contact detail — see the header.
    displayName: row.partner.organizationName?.trim() || row.partner.fullName,
    partnerType: row.partner.partnerType,
    headline: row.headline,
    about: row.about,
    languages: row.languages,
    cities: row.partner.serviceAreas.map((a) => a.city),
    verified: Boolean(row.approvedAt),
    kycStatus: row.partner.kyc?.status ?? "NOT_STARTED",
    accepting: capacity.accepting,
    full: capacity.full,
    capacityNote: capacity.note,
    services,
    fromPricePaise: services.length > 0 ? Math.min(...services.map((s) => s.priceInPaise)) : null,
    stats,
  };
}

/** One partner's public card, or null if they are not (or no longer) listed. */
export async function getPartnerCard(partnerId: string): Promise<PartnerCard | null> {
  const row = await prisma.partnerMarketplaceProfile.findFirst({
    where: { partnerId, ...listedWhere() },
    include: CARD_INCLUDE,
  });
  if (!row) return null;
  return buildCard(row);
}

/* ------------------------------------------------------------------ */
/* Measured stats                                                      */
/* ------------------------------------------------------------------ */

export async function getPartnerStats(partnerId: string): Promise<PartnerCardStats> {
  const [accepted, settled, reviews] = await Promise.all([
    prisma.serviceBooking.findMany({
      where: { partnerId, acceptedAt: { not: null }, payment: { capturedAt: { not: null } } },
      select: { acceptedAt: true, payment: { select: { capturedAt: true } } },
      take: 200,
      orderBy: { acceptedAt: "desc" },
    }),
    prisma.serviceBooking.groupBy({
      by: ["status"],
      where: { partnerId, status: { in: ["COMPLETED", "CANCELLED", "REFUNDED", "EXPIRED_UNACCEPTED"] } },
      _count: { _all: true },
    }),
    prisma.serviceReview.findMany({
      where: { partnerId, hiddenAt: null },
      select: { rating: true },
    }),
  ]);

  const gaps = accepted
    .map((b) =>
      b.acceptedAt && b.payment?.capturedAt
        ? (b.acceptedAt.getTime() - b.payment.capturedAt.getTime()) / 3_600_000
        : null,
    )
    .filter((n): n is number => n !== null && n >= 0)
    .sort((a, b) => a - b);

  const medianAcceptHours =
    gaps.length >= MIN_BOOKINGS_FOR_STATS
      ? Math.round(
          gaps.length % 2 === 1
            ? gaps[(gaps.length - 1) / 2]
            : (gaps[gaps.length / 2 - 1] + gaps[gaps.length / 2]) / 2,
        )
      : null;

  const settledTotal = settled.reduce((n, s) => n + s._count._all, 0);
  const completed = settled.find((s) => s.status === "COMPLETED")?._count._all ?? 0;
  const completionRatePercent =
    settledTotal >= MIN_BOOKINGS_FOR_STATS ? Math.round((completed / settledTotal) * 100) : null;

  const averageRating =
    reviews.length > 0
      ? Math.round((reviews.reduce((n, r) => n + r.rating, 0) / reviews.length) * 10) / 10
      : null;

  return {
    medianAcceptHours,
    completionRatePercent,
    completedBookings: completed,
    averageRating,
    reviewCount: reviews.length,
  };
}

/** Filter options built from what is actually listed, not a hardcoded list. */
export async function getMarketplaceFacets(): Promise<{ cities: string[]; languages: string[] }> {
  const rows = await prisma.partnerMarketplaceProfile.findMany({
    where: listedWhere(),
    select: { languages: true, partner: { select: { serviceAreas: { select: { city: true } } } } },
  });

  const cities = new Set<string>();
  const languages = new Set<string>();
  for (const row of rows) {
    for (const l of row.languages) languages.add(l);
    for (const a of row.partner.serviceAreas) cities.add(a.city);
  }

  return {
    cities: [...cities].sort((a, b) => a.localeCompare(b)),
    languages: [...languages].sort((a, b) => a.localeCompare(b)),
  };
}
