import { prisma } from "@/lib/db/prisma";
import {
  PLAN_FEATURE_KEYS,
  PLAN_FEATURE_TYPES,
  planFeatureBullets,
  type PlanCode,
  type PlanFeatureSet,
} from "@/lib/constants/plans";
import { getPlanCatalog, invalidatePlanCatalog, type PlanCatalogEntry } from "./planCatalog";
import {
  MIN_PLAN_PRICE_RUPEES,
  MAX_PLAN_PRICE_RUPEES,
  MIN_COMMISSION_BPS,
  MAX_COMMISSION_BPS,
  MIN_TIER_BONUS_BPS,
  MAX_TIER_BONUS_BPS,
  MIN_TIER_THRESHOLD,
  MAX_TIER_THRESHOLD,
  MIN_REEL_PER_DAY,
  MAX_REEL_PER_DAY,
  MIN_MATURITY_DAYS,
  MAX_MATURITY_DAYS,
  MIN_WITHDRAWAL_FLOOR_PAISE,
  MAX_WITHDRAWAL_FLOOR_PAISE,
} from "./constants";
import { bpsToPercentDisplay } from "@/lib/partner/tier";
import type { Plan, PartnerCommissionConfig, Role } from "@prisma/client";

export type PlanWithFeatures = PlanCatalogEntry & {
  featureBullets: string[];
  /** What this plan actually grants today. Kept as its own field because the pricing UI quotes it directly. */
  effectiveReelPerDay: number;
};

/**
 * Reel cards per day for every plan.
 *
 * Thin wrapper over the catalog now — `reelPerDay` is just another key in
 * `features`, not a separate column with its own fallback rule. Kept as a
 * named function because several callers ask exactly this question.
 */
export async function getPlanReelLimits(): Promise<Record<PlanCode, number>> {
  const catalog = await getPlanCatalog();
  return Object.fromEntries(catalog.all.map((p) => [p.code, p.features.reelPerDay]));
}

export async function getAllPlans(): Promise<PlanWithFeatures[]> {
  const catalog = await getPlanCatalog();
  return catalog.all
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((p) => ({
      ...p,
      // The bullets are what a buyer reads on the pricing page, so they are
      // built from the plan's *resolved* feature set — never from a code
      // constant an admin has since moved away from.
      featureBullets: planFeatureBullets(p.features),
      effectiveReelPerDay: p.features.reelPerDay,
    }));
}

export type PlanWriteResult =
  | { ok: true; plan: Plan }
  | { ok: false; error: string; message: string; status: number };

/** Uppercase A–Z and underscores. Codes end up in URLs, audit logs and payment rows. */
const CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,23}$/;

/**
 * Validates a partial feature patch against `PLAN_FEATURE_TYPES`.
 *
 * The types table is what stops "15" arriving for a boolean or a negative
 * `familySeats` reaching a gate. `reelPerDay` keeps its own tighter bounds
 * (MIN/MAX_REEL_PER_DAY) — it was already an admin control with a considered
 * range and opening the rest of the ladder is no reason to widen it.
 */
function validateFeaturePatch(patch: Record<string, unknown>): { ok: true } | { ok: false; message: string } {
  for (const [key, value] of Object.entries(patch)) {
    if (!PLAN_FEATURE_KEYS.includes(key as keyof PlanFeatureSet)) {
      return { ok: false, message: `"${key}" naam ka koi feature nahi hai.` };
    }
    const type = PLAN_FEATURE_TYPES[key as keyof PlanFeatureSet];

    if (type === "boolean") {
      if (typeof value !== "boolean") return { ok: false, message: `${key} sirf true/false ho sakta hai.` };
      continue;
    }
    if (type === "nullableNumber" && value === null) continue;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      return {
        ok: false,
        message:
          type === "nullableNumber"
            ? `${key} ek poora number ya null (unlimited) hona chahiye.`
            : `${key} ek non-negative poora number hona chahiye.`,
      };
    }
    if (key === "reelPerDay" && (value < MIN_REEL_PER_DAY || value > MAX_REEL_PER_DAY)) {
      return {
        ok: false,
        message: `Roz ke rishtey ${MIN_REEL_PER_DAY} se ${MAX_REEL_PER_DAY} ke beech hone chahiye.`,
      };
    }
  }
  return { ok: true };
}

export type PlanPatch = Partial<{
  name: string;
  priceInPaise: number;
  durationLabel: string;
  rank: number;
  displayOrder: number;
  isActive: boolean;
  isPublic: boolean;
  features: Record<string, unknown>;
}>;

/**
 * Edits an existing plan — name, price, ladder position, visibility, or any
 * capability in its feature set.
 *
 * This is the function D-11 deliberately did not have. See lib/constants/plans.ts's
 * header for why it exists now.
 *
 * Two rules survive from the old design:
 *   • FREE stays ₹0 (D-10 — it is free by definition, not by configuration).
 *   • Feature edits merge over what is stored, so saving one capability never
 *     silently resets the other twenty.
 */
export async function updatePlan(params: {
  planCode: PlanCode;
  patch: PlanPatch;
  actorId: string;
  actorRole: Role;
}): Promise<PlanWriteResult> {
  const { planCode, patch, actorId, actorRole } = params;

  const plan = await prisma.plan.findUnique({ where: { code: planCode } });
  if (!plan) return { ok: false, error: "NOT_FOUND", message: "Plan nahi mila.", status: 404 };

  if (patch.priceInPaise !== undefined) {
    if (planCode === "FREE" && patch.priceInPaise !== 0) {
      return {
        ok: false,
        error: "PLAN_IMMUTABLE",
        message: "Free plan ka price hamesha ₹0 rehta hai — badla nahi ja sakta.",
        status: 400,
      };
    }
    const minPaise = planCode === "FREE" ? 0 : MIN_PLAN_PRICE_RUPEES * 100;
    const maxPaise = MAX_PLAN_PRICE_RUPEES * 100;
    if (!Number.isInteger(patch.priceInPaise) || patch.priceInPaise < minPaise || patch.priceInPaise > maxPaise) {
      return {
        ok: false,
        error: "INVALID_PRICE",
        message: `Price ₹${MIN_PLAN_PRICE_RUPEES} se ₹${MAX_PLAN_PRICE_RUPEES} ke beech hona chahiye.`,
        status: 422,
      };
    }
  }

  if (patch.name !== undefined && patch.name.trim().length < 2) {
    return { ok: false, error: "VALIDATION_FAILED", message: "Plan ka naam likhiye.", status: 422 };
  }

  let mergedFeatures: Record<string, unknown> | undefined;
  if (patch.features) {
    const check = validateFeaturePatch(patch.features);
    if (!check.ok) return { ok: false, error: "VALIDATION_FAILED", message: check.message, status: 422 };
    const stored = (plan.features ?? {}) as Record<string, unknown>;
    mergedFeatures = { ...stored, ...patch.features };
  }

  const changed: string[] = [];
  if (patch.name !== undefined) changed.push(`name=${patch.name.trim()}`);
  if (patch.priceInPaise !== undefined) changed.push(`price=${patch.priceInPaise}`);
  if (patch.rank !== undefined) changed.push(`rank=${patch.rank}`);
  if (patch.isActive !== undefined) changed.push(`active=${patch.isActive}`);
  if (patch.isPublic !== undefined) changed.push(`public=${patch.isPublic}`);
  if (patch.features) changed.push(...Object.entries(patch.features).map(([k, v]) => `${k}=${JSON.stringify(v)}`));
  if (changed.length === 0) {
    return { ok: false, error: "NO_CHANGES", message: "Kuch badla nahi gaya.", status: 422 };
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.plan.update({
      where: { code: planCode },
      data: {
        ...(patch.name !== undefined && { name: patch.name.trim() }),
        ...(patch.priceInPaise !== undefined && { priceInPaise: patch.priceInPaise }),
        ...(patch.durationLabel !== undefined && { durationLabel: patch.durationLabel.trim() }),
        ...(patch.rank !== undefined && { rank: patch.rank }),
        ...(patch.displayOrder !== undefined && { displayOrder: patch.displayOrder }),
        ...(patch.isActive !== undefined && { isActive: patch.isActive }),
        ...(patch.isPublic !== undefined && { isPublic: patch.isPublic }),
        ...(mergedFeatures !== undefined && { features: mergedFeatures as object }),
        updatedBy: actorId,
      },
    });

    await tx.adminAuditLog.create({
      data: {
        actorId,
        actorRole,
        actionType: "PLAN_UPDATED",
        targetType: "plan",
        targetId: updated.id,
        previousValue: `${plan.name} · ₹${plan.priceInPaise / 100}`,
        newValue: changed.join(", ").slice(0, 900),
      },
    });

    return updated;
  });

  invalidatePlanCatalog();
  return { ok: true, plan: result };
}

/**
 * Creates a plan that D-11 never had.
 *
 * A new plan starts from an existing one's resolved feature set (`cloneFrom`,
 * default FREE) rather than from an empty object: a plan with no capabilities
 * is not a cheaper plan, it is a broken one, and starting from FREE means the
 * worst an admin can forget is to *add* something.
 */
export async function createPlan(params: {
  code: string;
  name: string;
  priceInPaise: number;
  durationLabel?: string;
  rank?: number;
  cloneFrom?: PlanCode;
  actorId: string;
  actorRole: Role;
}): Promise<PlanWriteResult> {
  const { actorId, actorRole } = params;
  const code = params.code.trim().toUpperCase();

  if (!CODE_PATTERN.test(code)) {
    return {
      ok: false,
      error: "VALIDATION_FAILED",
      message: "Code sirf BADE akshar, ank aur underscore — jaise MINI ya SAAL_BHAR.",
      status: 422,
    };
  }
  if (params.name.trim().length < 2) {
    return { ok: false, error: "VALIDATION_FAILED", message: "Plan ka naam likhiye.", status: 422 };
  }
  const minPaise = MIN_PLAN_PRICE_RUPEES * 100;
  const maxPaise = MAX_PLAN_PRICE_RUPEES * 100;
  if (!Number.isInteger(params.priceInPaise) || params.priceInPaise < minPaise || params.priceInPaise > maxPaise) {
    return {
      ok: false,
      error: "INVALID_PRICE",
      message: `Price ₹${MIN_PLAN_PRICE_RUPEES} se ₹${MAX_PLAN_PRICE_RUPEES} ke beech hona chahiye.`,
      status: 422,
    };
  }

  const existing = await prisma.plan.findUnique({ where: { code } });
  if (existing) {
    return { ok: false, error: "DUPLICATE", message: `"${code}" naam ka plan pehle se hai.`, status: 409 };
  }

  const catalog = await getPlanCatalog();
  const source = catalog.byCode[params.cloneFrom ?? "FREE"] ?? catalog.byCode.FREE;
  const maxRank = Math.max(...catalog.all.map((p) => p.rank), 0);
  const maxOrder = Math.max(...catalog.all.map((p) => p.displayOrder), 0);

  const result = await prisma.$transaction(async (tx) => {
    const created = await tx.plan.create({
      data: {
        code,
        name: params.name.trim(),
        priceInPaise: params.priceInPaise,
        durationLabel: params.durationLabel?.trim() || "per month",
        rank: params.rank ?? maxRank + 1,
        displayOrder: maxOrder + 1,
        isActive: true,
        isPublic: true,
        features: source ? ({ ...source.features } as object) : undefined,
      },
    });

    await tx.adminAuditLog.create({
      data: {
        actorId,
        actorRole,
        actionType: "PLAN_CREATED",
        targetType: "plan",
        targetId: created.id,
        newValue: `${code} · ${created.name} · ₹${created.priceInPaise / 100}${params.cloneFrom ? ` (clone of ${params.cloneFrom})` : ""}`,
      },
    });

    return created;
  });

  invalidatePlanCatalog();
  return { ok: true, plan: result };
}

/**
 * Removes a plan — only ever one nobody has ever been on.
 *
 * A plan with history is deactivated instead (`isActive: false`), never
 * deleted: `subscriptions` and `payments` reference the code by value, and a
 * deleted plan would turn a past member's row into an unanswerable question.
 * Built-in plans can't be deleted at all — the ladder's defaults, the seed and
 * `basePlanCode()` all assume FREE exists.
 */
export async function deletePlan(params: {
  planCode: PlanCode;
  actorId: string;
  actorRole: Role;
}): Promise<{ ok: true } | { ok: false; error: string; message: string; status: number }> {
  const { planCode, actorId, actorRole } = params;

  const catalog = await getPlanCatalog();
  if (catalog.byCode[planCode]?.isBuiltin) {
    return {
      ok: false,
      error: "PLAN_IMMUTABLE",
      message: "Built-in plan delete nahi ho sakta — deactivate kar dijiye.",
      status: 400,
    };
  }

  const plan = await prisma.plan.findUnique({ where: { code: planCode } });
  if (!plan) return { ok: false, error: "NOT_FOUND", message: "Plan nahi mila.", status: 404 };

  const [subs, payments, overrides] = await Promise.all([
    prisma.subscription.count({ where: { planCode } }),
    prisma.payment.count({ where: { planCode } }),
    prisma.userEntitlementOverride.count({ where: { planCode } }),
  ]);
  if (subs + payments + overrides > 0) {
    return {
      ok: false,
      error: "PLAN_IN_USE",
      message: `Is plan par ${subs} subscription aur ${payments} payment ka record hai — delete nahi, deactivate kijiye.`,
      status: 409,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.plan.delete({ where: { code: planCode } });
    await tx.adminAuditLog.create({
      data: {
        actorId,
        actorRole,
        actionType: "PLAN_DELETED",
        targetType: "plan",
        targetId: plan.id,
        previousValue: `${plan.code} · ${plan.name}`,
      },
    });
  });

  invalidatePlanCatalog();
  return { ok: true };
}

export type PlanPriceUpdateResult =
  | { ok: true; plan: Plan }
  | { ok: false; error: string; message: string; status: number };

/**
 * Price-only edit. FREE is structurally immutable (D-10: it's ₹0 by
 * definition) — every other plan writes an AdminAuditLog row in the same
 * transaction as the price update.
 *
 * Kept alongside the broader `updatePlan` because the pricing page saves the
 * price control on its own and this path's audit row (`PLAN_PRICE_UPDATED`,
 * old → new in rupees) is the one a revenue question actually wants.
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

  invalidatePlanCatalog();
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
  /** Payout controls — see the fields' own notes in schema.prisma. */
  maturityDays: number;
  minWithdrawalPaise: number;
  autoApproveAfterMaturity: boolean;
}>;

const BPS_FIELDS = ["baseBps", "silverBonusBps", "goldBonusBps"] as const;
const THRESHOLD_FIELDS = ["silverThreshold", "goldThreshold"] as const;
const PAYOUT_NUMBER_FIELDS = ["maturityDays", "minWithdrawalPaise"] as const;

type NumericConfigField =
  | (typeof BPS_FIELDS)[number]
  | (typeof THRESHOLD_FIELDS)[number]
  | (typeof PAYOUT_NUMBER_FIELDS)[number];

function rangeFor(field: NumericConfigField): { min: number; max: number; label: string } {
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
  if (field === "maturityDays") {
    return { min: MIN_MATURITY_DAYS, max: MAX_MATURITY_DAYS, label: "Refund window (din)" };
  }
  if (field === "minWithdrawalPaise") {
    return {
      min: MIN_WITHDRAWAL_FLOOR_PAISE,
      max: MAX_WITHDRAWAL_FLOOR_PAISE,
      label: "Minimum withdrawal",
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

  const fields = [...BPS_FIELDS, ...THRESHOLD_FIELDS, ...PAYOUT_NUMBER_FIELDS] as const;
  const supplied = fields.filter((f) => patch[f] !== undefined);
  // `autoApproveAfterMaturity` is a boolean, so it has no range to check — it
  // still counts as a change, or toggling it alone would be rejected.
  if (supplied.length === 0 && patch.autoApproveAfterMaturity === undefined) {
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
