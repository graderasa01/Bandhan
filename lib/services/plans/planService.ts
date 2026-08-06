import { prisma } from "@/lib/db/prisma";
import { PLAN_NAMES, PLAN_DURATION_LABEL, planFeatureBullets } from "@/lib/constants/plans";
import {
  MIN_PLAN_PRICE_RUPEES,
  MAX_PLAN_PRICE_RUPEES,
  MIN_COMMISSION_BPS,
  MAX_COMMISSION_BPS,
  MIN_TIER_BONUS_BPS,
  MAX_TIER_BONUS_BPS,
  MIN_TIER_THRESHOLD,
  MAX_TIER_THRESHOLD,
} from "./constants";
import { bpsToPercentDisplay } from "@/lib/partner/tier";
import type { Plan, PlanCode, PartnerCommissionConfig, Role } from "@prisma/client";

export type PlanWithFeatures = Plan & {
  name: string;
  featureBullets: string[];
  durationLabel: string;
};

export async function getAllPlans(): Promise<PlanWithFeatures[]> {
  const plans = await prisma.plan.findMany({ orderBy: { displayOrder: "asc" } });
  return plans.map((p) => ({
    ...p,
    name: PLAN_NAMES[p.code],
    featureBullets: planFeatureBullets(p.code),
    durationLabel: PLAN_DURATION_LABEL[p.code],
  }));
}

export type PlanPriceUpdateResult =
  | { ok: true; plan: Plan }
  | { ok: false; error: string; message: string; status: number };

/**
 * The only place a Plan's price ever changes. FREE is structurally immutable
 * (D-10: it's ₹0 by definition) — every other plan writes an AdminAuditLog
 * row in the same transaction as the price update.
 */
export async function updatePlanPrice(params: {
  planCode: PlanCode;
  priceInPaise: number;
  actorId: string;
  actorRole: Role;
}): Promise<PlanPriceUpdateResult> {
  const { planCode, priceInPaise, actorId, actorRole } = params;

  if (planCode === "FREE") {
    return {
      ok: false,
      error: "PLAN_IMMUTABLE",
      message: "Free plan ka price hamesha ₹0 rehta hai — badla nahi ja sakta.",
      status: 400,
    };
  }

  const minPaise = MIN_PLAN_PRICE_RUPEES * 100;
  const maxPaise = MAX_PLAN_PRICE_RUPEES * 100;
  if (!Number.isInteger(priceInPaise) || priceInPaise < minPaise || priceInPaise > maxPaise) {
    return {
      ok: false,
      error: "INVALID_PRICE",
      message: `Price ₹${MIN_PLAN_PRICE_RUPEES} se ₹${MAX_PLAN_PRICE_RUPEES} ke beech hona chahiye.`,
      status: 422,
    };
  }

  const plan = await prisma.plan.findUnique({ where: { code: planCode } });
  if (!plan) {
    return { ok: false, error: "NOT_FOUND", message: "Plan nahi mila.", status: 404 };
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.plan.update({
      where: { code: planCode },
      data: { priceInPaise, updatedBy: actorId },
    });

    await tx.adminAuditLog.create({
      data: {
        actorId,
        actorRole,
        actionType: "PLAN_PRICE_UPDATED",
        targetType: "plan",
        targetId: updated.id,
        previousValue: String(plan.priceInPaise),
        newValue: String(priceInPaise),
      },
    });

    return updated;
  });

  return { ok: true, plan: result };
}

/** Throws if the seed hasn't run — this row must always exist (§ seed.ts). */
export async function getCommissionConfig(): Promise<PartnerCommissionConfig> {
  const config = await prisma.partnerCommissionConfig.findUnique({ where: { id: "default" } });
  if (!config) {
    throw new Error("PartnerCommissionConfig row 'default' missing — run `npx prisma db seed`.");
  }
  return config;
}

export type CommissionRateUpdateResult =
  | { ok: true; config: PartnerCommissionConfig }
  | { ok: false; error: string; message: string; status: number };

/** Every field is optional — the admin form saves one control at a time. */
export type CommissionConfigPatch = Partial<{
  baseBps: number;
  silverBonusBps: number;
  goldBonusBps: number;
  silverThreshold: number;
  goldThreshold: number;
}>;

const BPS_FIELDS = ["baseBps", "silverBonusBps", "goldBonusBps"] as const;
const THRESHOLD_FIELDS = ["silverThreshold", "goldThreshold"] as const;

function rangeFor(field: keyof CommissionConfigPatch): { min: number; max: number; label: string } {
  if (field === "baseBps") {
    return { min: MIN_COMMISSION_BPS, max: MAX_COMMISSION_BPS, label: "Base commission" };
  }
  if (field === "silverBonusBps" || field === "goldBonusBps") {
    return {
      min: MIN_TIER_BONUS_BPS,
      max: MAX_TIER_BONUS_BPS,
      label: field === "silverBonusBps" ? "Silver bonus" : "Gold bonus",
    };
  }
  return {
    min: MIN_TIER_THRESHOLD,
    max: MAX_TIER_THRESHOLD,
    label: field === "silverThreshold" ? "Silver threshold" : "Gold threshold",
  };
}

/**
 * D-12, revised: the rate is a percentage of what the member paid, and the
 * only thing that moves it is the partner's earned tier. Still exactly one
 * config row and still nothing keyed by plan — enforced structurally, as
 * before, by there being no table to key.
 *
 * Validation runs against the *merged* config rather than the patch, because
 * the two cross-field rules (Gold must out-rank Silver in both money and
 * effort) can be broken by a single-field edit that looks fine on its own.
 */
export async function updateCommissionConfig(params: {
  patch: CommissionConfigPatch;
  actorId: string;
  actorRole: Role;
}): Promise<CommissionRateUpdateResult> {
  const { patch, actorId, actorRole } = params;

  const fields = [...BPS_FIELDS, ...THRESHOLD_FIELDS] as const;
  const supplied = fields.filter((f) => patch[f] !== undefined);
  if (supplied.length === 0) {
    return { ok: false, error: "NO_CHANGES", message: "Kuch badla nahi gaya.", status: 422 };
  }

  for (const field of supplied) {
    const value = patch[field] as number;
    const { min, max, label } = rangeFor(field);
    if (!Number.isInteger(value) || value < min || value > max) {
      const asPercent = field.endsWith("Bps");
      return {
        ok: false,
        error: "OUT_OF_RANGE",
        message: asPercent
          ? `${label} ${bpsToPercentDisplay(min)} se ${bpsToPercentDisplay(max)} ke beech honi chahiye.`
          : `${label} ${min} se ${max} ke beech hona chahiye.`,
        status: 422,
      };
    }
  }

  const existing = await getCommissionConfig();
  const merged = { ...existing, ...patch };

  if (merged.goldBonusBps < merged.silverBonusBps) {
    return {
      ok: false,
      error: "TIER_ORDER",
      message: "Gold ka bonus Silver se kam nahi ho sakta.",
      status: 422,
    };
  }
  if (merged.goldThreshold <= merged.silverThreshold) {
    return {
      ok: false,
      error: "TIER_ORDER",
      message: "Gold ka threshold Silver se zyada hona chahiye.",
      status: 422,
    };
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.partnerCommissionConfig.update({
      where: { id: "default" },
      data: { ...patch, updatedBy: actorId },
    });

    // One audit row per field actually changed — a single "config updated"
    // entry would leave a payout dispute unable to say which number moved.
    for (const field of supplied) {
      if (existing[field] === patch[field]) continue;
      await tx.adminAuditLog.create({
        data: {
          actorId,
          actorRole,
          actionType: "COMMISSION_RATE_UPDATED",
          targetType: "commission_config",
          targetId: field,
          previousValue: String(existing[field]),
          newValue: String(patch[field]),
        },
      });
    }

    return updated;
  });

  return { ok: true, config: result };
}
