import "server-only";
import { prisma } from "@/lib/db/prisma";
import { SERVICE_KIND_BY_KEY, SERVICE_KINDS } from "./servicePolicy";
import { VERIFICATION_CATALOG, catalogFor } from "@/lib/services/verification/verificationCatalog";
import type { PartnerServiceKind, Role, VerificationKind } from "@prisma/client";

/**
 * Every price in this product, in one place an admin can actually reach.
 *
 * ## Why overrides instead of editable defaults
 *
 * The numbers still live in code — the service bands in `servicePolicy.ts`, the
 * verification fees in `verificationCatalog.ts` — and this file merges a stored
 * override over them. That is the same shape `Plan.features` uses, and it buys
 * the same two things: a fresh database boots with sensible prices instead of
 * nulls, and deleting an override restores a known-good value rather than
 * leaving a hole nobody can fill without a deploy.
 *
 * ## What an admin may not do here
 *
 * Rename a service or reword its promise. `SERVICE_KINDS` fixes both in code
 * because the one rule this marketplace cannot bend is that nothing may promise
 * a marriage — and a promise editable from an admin screen is a promise that
 * will eventually read "Guaranteed Rishta in 30 Days". Prices bend; claims do not.
 *
 * ## Zero is a real price
 *
 * A band floor of ₹0 and a per-service override of ₹0 are both legal, because
 * "free for the pilot city" and "free while we investigate this complaint" are
 * both things a real marketplace has to be able to do on a Tuesday afternoon
 * without a code change. The booking path handles a ₹0 price by skipping the
 * gateway rather than charging nothing through it — see `createBookingCheckout`.
 */

const CONFIG_ID = "default";

export interface ServiceBand {
  minPricePaise: number;
  maxPricePaise: number;
}

/** The stored shape of both override maps. Anything unparseable is ignored. */
type BandMap = Partial<Record<PartnerServiceKind, Partial<ServiceBand>>>;
type FeeMap = Partial<Record<VerificationKind, number>>;

function asBandMap(raw: unknown): BandMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as BandMap;
}

function asFeeMap(raw: unknown): FeeMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as FeeMap;
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

/**
 * The bands in force right now, one entry per service kind.
 *
 * A stored band is trusted only where it is coherent: a non-negative floor, and
 * a ceiling above it. A half-written override falls back to the code default
 * for that kind rather than making every price invalid.
 */
export async function getServiceBands(): Promise<Record<PartnerServiceKind, ServiceBand>> {
  const row = await prisma.partnerCommissionConfig.findUnique({
    where: { id: CONFIG_ID },
    select: { serviceBandOverrides: true },
  });
  const overrides = asBandMap(row?.serviceBandOverrides);

  const out = {} as Record<PartnerServiceKind, ServiceBand>;
  for (const spec of SERVICE_KINDS) {
    const o = overrides[spec.kind];
    const min = typeof o?.minPricePaise === "number" && o.minPricePaise >= 0 ? o.minPricePaise : spec.minPricePaise;
    const max = typeof o?.maxPricePaise === "number" && o.maxPricePaise > min ? o.maxPricePaise : spec.maxPricePaise;
    out[spec.kind] = max > min ? { minPricePaise: min, maxPricePaise: max } : {
      minPricePaise: spec.minPricePaise,
      maxPricePaise: spec.maxPricePaise,
    };
  }
  return out;
}

export async function getServiceBand(kind: PartnerServiceKind): Promise<ServiceBand> {
  return (await getServiceBands())[kind];
}

/** The verification fees in force, one entry per catalog kind. */
export async function getVerificationFees(): Promise<Record<VerificationKind, number>> {
  const row = await prisma.partnerCommissionConfig.findUnique({
    where: { id: CONFIG_ID },
    select: { verificationFeeOverrides: true },
  });
  const overrides = asFeeMap(row?.verificationFeeOverrides);

  const out = {} as Record<VerificationKind, number>;
  for (const entry of VERIFICATION_CATALOG) {
    const o = overrides[entry.kind];
    // Zero is legal and must survive: `?? entry.feePaise` alone would be fine,
    // but a stored 0 has to beat a catalog 199 and a `||` here would not.
    out[entry.kind] = typeof o === "number" && o >= 0 ? o : entry.feePaise;
  }
  return out;
}

export async function getVerificationFee(kind: VerificationKind): Promise<number> {
  return (await getVerificationFees())[kind];
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

export type PricingResult = { ok: true } | { ok: false; error: string; message: string; status: number };

function fail(error: string, message: string, status = 422): PricingResult {
  return { ok: false, error, message, status };
}

interface Actor {
  actorId: string;
  actorRole: Role;
}

async function audit(actor: Actor, actionType: string, targetId: string, previous: string, next: string, reason?: string) {
  await prisma.adminAuditLog.create({
    data: {
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      actionType,
      targetType: "pricing",
      targetId,
      previousValue: previous,
      newValue: next,
      reason: reason ?? null,
    },
  });
}

/** The four platform-wide service numbers. Each is validated on its own terms. */
export async function setServiceMoney(
  input: {
    platformFeeBps?: number;
    acceptSlaHours?: number;
    refundWindowDays?: number;
    minWithdrawalPaise?: number;
  },
  actor: Actor,
): Promise<PricingResult> {
  const current = await prisma.partnerCommissionConfig.findUnique({ where: { id: CONFIG_ID } });
  if (!current) return fail("NOT_CONFIGURED", "Commission config row nahi mila.", 500);

  const data: Record<string, number> = {};

  if (input.platformFeeBps !== undefined) {
    // Capped at 40%: above that the "partner keeps most of it" claim on the
    // listing screen stops being true, and a number a screen contradicts is
    // worse than no control at all.
    if (!Number.isInteger(input.platformFeeBps) || input.platformFeeBps < 0 || input.platformFeeBps > 4000) {
      return fail("OUT_OF_RANGE", "Platform fee 0% se 40% ke beech rakhiye.");
    }
    data.servicePlatformFeeBps = input.platformFeeBps;
  }
  if (input.acceptSlaHours !== undefined) {
    if (!Number.isInteger(input.acceptSlaHours) || input.acceptSlaHours < 1 || input.acceptSlaHours > 168) {
      return fail("OUT_OF_RANGE", "Accept ka time 1 ghante se 7 din ke beech rakhiye.");
    }
    data.serviceAcceptSlaHours = input.acceptSlaHours;
  }
  if (input.refundWindowDays !== undefined) {
    if (!Number.isInteger(input.refundWindowDays) || input.refundWindowDays < 0 || input.refundWindowDays > 30) {
      return fail("OUT_OF_RANGE", "Refund window 0 se 30 din ke beech rakhiye.");
    }
    data.serviceRefundWindowDays = input.refundWindowDays;
  }
  if (input.minWithdrawalPaise !== undefined) {
    if (!Number.isInteger(input.minWithdrawalPaise) || input.minWithdrawalPaise < 0) {
      return fail("OUT_OF_RANGE", "Minimum withdrawal galat hai.");
    }
    data.minWithdrawalPaise = input.minWithdrawalPaise;
  }

  if (Object.keys(data).length === 0) return fail("NOTHING_TO_DO", "Kuch badla nahi.");

  await prisma.partnerCommissionConfig.update({
    where: { id: CONFIG_ID },
    data: { ...data, updatedBy: actor.actorId },
  });
  await audit(
    actor,
    "PRICING_SERVICE_MONEY",
    CONFIG_ID,
    JSON.stringify({
      servicePlatformFeeBps: current.servicePlatformFeeBps,
      serviceAcceptSlaHours: current.serviceAcceptSlaHours,
      serviceRefundWindowDays: current.serviceRefundWindowDays,
      minWithdrawalPaise: current.minWithdrawalPaise,
    }),
    JSON.stringify(data),
  );
  return { ok: true };
}

/** One service kind's price band. A floor of zero is allowed and means free is possible. */
export async function setServiceBand(
  kind: PartnerServiceKind,
  band: ServiceBand,
  actor: Actor,
): Promise<PricingResult> {
  if (!SERVICE_KIND_BY_KEY[kind]) return fail("UNKNOWN_KIND", "Ye service kind nahi mili.", 404);
  if (!Number.isInteger(band.minPricePaise) || band.minPricePaise < 0) {
    return fail("OUT_OF_RANGE", "Sabse kam daam 0 ya usse zyada hona chahiye.");
  }
  if (!Number.isInteger(band.maxPricePaise) || band.maxPricePaise <= band.minPricePaise) {
    return fail("OUT_OF_RANGE", "Sabse zyada daam, sabse kam se bada hona chahiye.");
  }
  // The plan's own guard rail: a package sold to a family in distress. The
  // ceiling is editable, but not to any number somebody types at 2am.
  if (band.maxPricePaise > 10_00_000) {
    return fail("OUT_OF_RANGE", "₹10,000 se upar ka band abhi allow nahi hai.");
  }

  const row = await prisma.partnerCommissionConfig.findUnique({
    where: { id: CONFIG_ID },
    select: { serviceBandOverrides: true },
  });
  const overrides = asBandMap(row?.serviceBandOverrides);
  const previous = JSON.stringify(overrides[kind] ?? SERVICE_KIND_BY_KEY[kind]);
  overrides[kind] = band;

  await prisma.partnerCommissionConfig.update({
    where: { id: CONFIG_ID },
    data: { serviceBandOverrides: overrides, updatedBy: actor.actorId },
  });
  await audit(actor, "PRICING_SERVICE_BAND", kind, previous, JSON.stringify(band));
  return { ok: true };
}

/** One verification check's fee. Zero means free to ask for. */
export async function setVerificationFee(
  kind: VerificationKind,
  feePaise: number,
  actor: Actor,
): Promise<PricingResult> {
  const entry = VERIFICATION_CATALOG.find((e) => e.kind === kind);
  if (!entry) return fail("UNKNOWN_KIND", "Ye check nahi mila.", 404);
  if (!entry.requestable) {
    return fail("NOT_REQUESTABLE", "Ye check koi maang hi nahi sakta, iska daam bemaani hai.");
  }
  if (!Number.isInteger(feePaise) || feePaise < 0 || feePaise > 5_00_000) {
    return fail("OUT_OF_RANGE", "Fee 0 se ₹5,000 ke beech rakhiye.");
  }

  const row = await prisma.partnerCommissionConfig.findUnique({
    where: { id: CONFIG_ID },
    select: { verificationFeeOverrides: true },
  });
  const overrides = asFeeMap(row?.verificationFeeOverrides);
  const previous = String(overrides[kind] ?? catalogFor(kind).feePaise);
  overrides[kind] = feePaise;

  await prisma.partnerCommissionConfig.update({
    where: { id: CONFIG_ID },
    data: { verificationFeeOverrides: overrides, updatedBy: actor.actorId },
  });
  await audit(actor, "PRICING_VERIFICATION_FEE", kind, previous, String(feePaise));
  return { ok: true };
}

/**
 * The platform's own price for one partner's service — including free.
 *
 * `null` clears it and hands the price back to the partner untouched, which is
 * why the override is a separate column: their number was never overwritten.
 */
export async function setServicePriceOverride(
  serviceId: string,
  pricePaise: number | null,
  note: string,
  actor: Actor,
): Promise<PricingResult> {
  const service = await prisma.partnerService.findUnique({
    where: { id: serviceId },
    select: { id: true, kind: true, priceInPaise: true, adminPricePaise: true },
  });
  if (!service) return fail("NOT_FOUND", "Ye service nahi mili.", 404);

  if (pricePaise !== null) {
    if (!Number.isInteger(pricePaise) || pricePaise < 0) return fail("OUT_OF_RANGE", "Daam galat hai.");
    const band = await getServiceBand(service.kind);
    // Zero is always allowed regardless of the band: making something free is
    // the platform's own decision and is never "priced too low to be honest",
    // which is the only thing the floor is protecting against.
    if (pricePaise !== 0 && pricePaise > band.maxPricePaise) {
      return fail("OUT_OF_RANGE", "Ye daam is service ke band se upar hai.");
    }
  }

  const reason = note.trim();
  if (!reason) return fail("REASON_REQUIRED", "Wajah likhiye — partner ko yahi dikhega.");

  await prisma.partnerService.update({
    where: { id: serviceId },
    data: {
      adminPricePaise: pricePaise,
      adminPriceNote: pricePaise === null ? null : reason,
      adminPriceBy: pricePaise === null ? null : actor.actorId,
      adminPriceAt: pricePaise === null ? null : new Date(),
    },
  });
  await audit(
    actor,
    "PRICING_SERVICE_OVERRIDE",
    serviceId,
    String(service.adminPricePaise ?? service.priceInPaise),
    pricePaise === null ? "cleared" : String(pricePaise),
    reason,
  );
  return { ok: true };
}

/** What the buyer actually pays for a service. The one place that decides it. */
export function effectivePricePaise(service: { priceInPaise: number; adminPricePaise: number | null }): number {
  return service.adminPricePaise ?? service.priceInPaise;
}
