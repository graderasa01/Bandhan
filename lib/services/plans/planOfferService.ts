import { prisma } from "@/lib/db/prisma";
import type { PlanOffer, PlanOfferKind, Role } from "@prisma/client";
import type { PlanCode } from "@/lib/constants/plans";

/**
 * Time-boxed price offers, resolved for display and for checkout.
 *
 * ## One offer wins, and it is the same one everywhere
 *
 * The pricing page, the subscription page and `quoteCheckout` all have to
 * agree on what a plan costs today, and the failure mode if they don't is the
 * worst kind: a user is shown ₹0 and charged ₹2,999. So resolution lives here
 * and nowhere else, and every surface calls `resolveOffers()`.
 *
 * Overlapping offers are allowed rather than blocked at write time — an admin
 * scheduling a Diwali sale over a running launch offer is a normal thing to do
 * and refusing it would just push them into deleting the first one. Instead
 * the tie is broken deterministically: **the cheapest price for the user
 * wins**, and `startsAt` descending settles an exact tie. The admin screen
 * shows which offer is live right now so the resolution is never a surprise.
 *
 * ## What an offer cannot do
 *
 * It cannot raise a price, and it cannot make one negative — `priceAfter` is
 * clamped into `[0, listPrice]`. A FLAT offer larger than the price is simply
 * a free month rather than a credit; nothing in the payment path knows how to
 * owe somebody money and this is not the place to teach it.
 */

export interface ActiveOffer {
  id: string;
  planCode: string;
  kind: PlanOfferKind;
  value: number;
  label: string;
  endsAt: Date;
  /** List price minus the offer, clamped to `[0, listPrice]`. */
  priceAfterPaise: number;
  /** `listPrice - priceAfterPaise`. What lands in `Payment.discountPaise`. */
  discountPaise: number;
  /** True when the offer takes the price to zero — the no-gateway path. */
  isFree: boolean;
}

/** The price an offer leaves behind. Pure, so the admin preview can call it. */
export function priceAfterOffer(
  listPricePaise: number,
  kind: PlanOfferKind,
  value: number,
): number {
  if (kind === "FREE") return 0;
  const off = kind === "PERCENT" ? Math.round((listPricePaise * value) / 100) : value;
  return Math.max(0, Math.min(listPricePaise, listPricePaise - off));
}

function toActiveOffer(offer: PlanOffer, listPricePaise: number): ActiveOffer {
  const priceAfterPaise = priceAfterOffer(listPricePaise, offer.kind, offer.value);
  return {
    id: offer.id,
    planCode: offer.planCode,
    kind: offer.kind,
    value: offer.value,
    label: offer.label,
    endsAt: offer.endsAt,
    priceAfterPaise,
    discountPaise: listPricePaise - priceAfterPaise,
    isFree: priceAfterPaise === 0,
  };
}

/**
 * Every plan's live offer, keyed by plan code.
 *
 * One query for all plans rather than one per plan: the pricing page renders
 * the whole catalog, and a per-plan lookup there is N round trips to answer a
 * question the database can answer once.
 */
export async function resolveOffers(
  listPriceByCode: Map<string, number>,
  now: Date = new Date(),
): Promise<Map<string, ActiveOffer>> {
  if (listPriceByCode.size === 0) return new Map();

  const live = await prisma.planOffer.findMany({
    where: {
      planCode: { in: [...listPriceByCode.keys()] },
      isActive: true,
      startsAt: { lte: now },
      endsAt: { gt: now },
    },
    orderBy: { startsAt: "desc" },
  });

  const best = new Map<string, ActiveOffer>();
  for (const offer of live) {
    const listPrice = listPriceByCode.get(offer.planCode);
    if (listPrice === undefined) continue;
    const candidate = toActiveOffer(offer, listPrice);
    const current = best.get(offer.planCode);
    // Cheapest wins; `live` is already startsAt-desc, so the first of an exact
    // tie is the most recently started one and later ones do not displace it.
    if (!current || candidate.priceAfterPaise < current.priceAfterPaise) {
      best.set(offer.planCode, candidate);
    }
  }
  return best;
}

/** Single-plan resolution, for the checkout path. */
export async function resolveOffer(
  planCode: PlanCode,
  listPricePaise: number,
  now: Date = new Date(),
): Promise<ActiveOffer | null> {
  const map = await resolveOffers(new Map([[planCode, listPricePaise]]), now);
  return map.get(planCode) ?? null;
}

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */

export interface AdminOfferRow {
  id: string;
  planCode: string;
  kind: PlanOfferKind;
  value: number;
  label: string;
  startsAt: Date;
  endsAt: Date;
  isActive: boolean;
  /** Live *now* — isActive plus the window, which is what the admin cares about. */
  isLive: boolean;
  priceAfterPaise: number;
}

export async function listOffers(
  listPriceByCode: Map<string, number>,
  now: Date = new Date(),
): Promise<AdminOfferRow[]> {
  const offers = await prisma.planOffer.findMany({ orderBy: { startsAt: "desc" } });
  return offers.map((o) => ({
    id: o.id,
    planCode: o.planCode,
    kind: o.kind,
    value: o.value,
    label: o.label,
    startsAt: o.startsAt,
    endsAt: o.endsAt,
    isActive: o.isActive,
    isLive: o.isActive && o.startsAt <= now && o.endsAt > now,
    priceAfterPaise: priceAfterOffer(listPriceByCode.get(o.planCode) ?? 0, o.kind, o.value),
  }));
}

export type OfferWriteResult =
  | { ok: true; offerId: string }
  | { ok: false; error: string; message: string; status: number };

const MAX_LABEL = 40;

function validate(params: {
  kind: PlanOfferKind;
  value: number;
  label: string;
  startsAt: Date;
  endsAt: Date;
}): { error: string; message: string; status: number } | null {
  const { kind, value, label, startsAt, endsAt } = params;

  if (!label.trim()) {
    return { error: "LABEL_REQUIRED", message: "Offer ka naam likhna zaroori hai — user ko yahi dikhta hai.", status: 422 };
  }
  if (label.length > MAX_LABEL) {
    return { error: "LABEL_TOO_LONG", message: `Offer ka naam ${MAX_LABEL} characters se chhota rakhein.`, status: 422 };
  }
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return { error: "INVALID_DATES", message: "Tareekh sahi nahi hai.", status: 422 };
  }
  if (endsAt <= startsAt) {
    return { error: "INVALID_WINDOW", message: "Offer ki end date start date ke baad honi chahiye.", status: 422 };
  }
  if (kind === "PERCENT" && (!Number.isInteger(value) || value < 1 || value > 100)) {
    return { error: "INVALID_VALUE", message: "Percent 1 se 100 ke beech hona chahiye.", status: 422 };
  }
  if (kind === "FLAT" && (!Number.isInteger(value) || value < 1)) {
    return { error: "INVALID_VALUE", message: "Flat discount ₹1 se zyada hona chahiye.", status: 422 };
  }
  return null;
}

export async function createOffer(params: {
  planCode: string;
  kind: PlanOfferKind;
  value: number;
  label: string;
  startsAt: Date;
  endsAt: Date;
  actorId: string;
  actorRole: Role;
}): Promise<OfferWriteResult> {
  const { planCode, kind, value, label, startsAt, endsAt, actorId, actorRole } = params;

  const invalid = validate({ kind, value, label, startsAt, endsAt });
  if (invalid) return { ok: false, ...invalid };

  const plan = await prisma.plan.findUnique({ where: { code: planCode } });
  if (!plan) return { ok: false, error: "NOT_FOUND", message: "Plan nahi mila.", status: 404 };
  // FREE is ₹0 by definition (D-10), so there is nothing an offer could take
  // off it — and a "free for a week" badge on the free plan reads as a bug.
  if (plan.code === "FREE") {
    return { ok: false, error: "PLAN_IMMUTABLE", message: "Free plan par offer ka koi matlab nahi.", status: 400 };
  }

  const offer = await prisma.$transaction(async (tx) => {
    const created = await tx.planOffer.create({
      data: { planCode, kind, value: kind === "FREE" ? 0 : value, label: label.trim(), startsAt, endsAt, createdBy: actorId },
    });
    await tx.adminAuditLog.create({
      data: {
        actorId,
        actorRole,
        actionType: "PLAN_OFFER_CREATED",
        targetType: "plan_offer",
        targetId: created.id,
        newValue: `${planCode} ${kind}${kind === "FREE" ? "" : ` ${value}`} — ${created.label} (${startsAt.toISOString()} → ${endsAt.toISOString()})`,
      },
    });
    return created;
  });

  return { ok: true, offerId: offer.id };
}

/**
 * Turn an offer on or off without touching its dates.
 *
 * Deliberately the only *edit* an offer supports. A live offer is a promise
 * somebody may already have seen on the pricing page; quietly rewriting its
 * percentage is how a user ends up charged more than the page said. To change
 * the terms, end this one and create the next — which is also what leaves an
 * honest trail.
 */
export async function setOfferActive(params: {
  offerId: string;
  isActive: boolean;
  actorId: string;
  actorRole: Role;
}): Promise<OfferWriteResult> {
  const { offerId, isActive, actorId, actorRole } = params;

  const existing = await prisma.planOffer.findUnique({ where: { id: offerId } });
  if (!existing) return { ok: false, error: "NOT_FOUND", message: "Offer nahi mila.", status: 404 };

  await prisma.$transaction(async (tx) => {
    await tx.planOffer.update({ where: { id: offerId }, data: { isActive } });
    await tx.adminAuditLog.create({
      data: {
        actorId,
        actorRole,
        actionType: isActive ? "PLAN_OFFER_RESUMED" : "PLAN_OFFER_STOPPED",
        targetType: "plan_offer",
        targetId: offerId,
        previousValue: String(existing.isActive),
        newValue: String(isActive),
      },
    });
  });

  return { ok: true, offerId };
}

export async function deleteOffer(params: {
  offerId: string;
  actorId: string;
  actorRole: Role;
}): Promise<OfferWriteResult> {
  const { offerId, actorId, actorRole } = params;

  const existing = await prisma.planOffer.findUnique({ where: { id: offerId } });
  if (!existing) return { ok: false, error: "NOT_FOUND", message: "Offer nahi mila.", status: 404 };

  await prisma.$transaction(async (tx) => {
    await tx.planOffer.delete({ where: { id: offerId } });
    await tx.adminAuditLog.create({
      data: {
        actorId,
        actorRole,
        actionType: "PLAN_OFFER_DELETED",
        targetType: "plan_offer",
        targetId: offerId,
        previousValue: `${existing.planCode} ${existing.kind} ${existing.value} — ${existing.label}`,
      },
    });
  });

  return { ok: true, offerId };
}
