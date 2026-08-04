import { prisma } from "@/lib/db/prisma";
import { PLAN_NAMES, PLAN_DURATION_LABEL, planFeatureBullets } from "@/lib/constants/plans";
import { MIN_PLAN_PRICE_RUPEES, MAX_PLAN_PRICE_RUPEES, MIN_COMMISSION_RUPEES, MAX_COMMISSION_RUPEES } from "./constants";
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

/**
 * D-12: one flat rate, not per-plan slabs — enforced structurally by there
 * being exactly one config row, not a table keyed by plan.
 */
export async function updateCommissionRate(params: {
  amountPaise: number;
  actorId: string;
  actorRole: Role;
}): Promise<CommissionRateUpdateResult> {
  const { amountPaise, actorId, actorRole } = params;

  const minPaise = MIN_COMMISSION_RUPEES * 100;
  const maxPaise = MAX_COMMISSION_RUPEES * 100;
  if (!Number.isInteger(amountPaise) || amountPaise < minPaise || amountPaise > maxPaise) {
    return {
      ok: false,
      error: "INVALID_AMOUNT",
      message: `Commission ₹${MIN_COMMISSION_RUPEES} se ₹${MAX_COMMISSION_RUPEES} ke beech honi chahiye.`,
      status: 422,
    };
  }

  const existing = await getCommissionConfig();

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.partnerCommissionConfig.update({
      where: { id: "default" },
      data: { flatAmountPaise: amountPaise, updatedBy: actorId },
    });

    await tx.adminAuditLog.create({
      data: {
        actorId,
        actorRole,
        actionType: "COMMISSION_RATE_UPDATED",
        targetType: "commission_config",
        targetId: "default",
        previousValue: String(existing.flatAmountPaise),
        newValue: String(amountPaise),
      },
    });

    return updated;
  });

  return { ok: true, config: result };
}
