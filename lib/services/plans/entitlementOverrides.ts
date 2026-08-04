import "server-only";
import { prisma } from "@/lib/db/prisma";
import {
  PLAN_FEATURE_TYPES,
  type CapabilityValueType,
  type PlanFeatureSet,
} from "@/lib/constants/plans";
import type { PlanCode, Role } from "@prisma/client";

/**
 * Per-user, admin-issued entitlement overrides.
 *
 * The one hard rule, enforced in `applyCapabilityOverride` below: an override
 * may only ever *raise* what a user can do. Never lower.
 *
 * Why: support already has a way to take access away (UserStatus SUSPENDED,
 * which is visible on the user record and understood everywhere). If this
 * table could also subtract, then "why can't this user chat" would have two
 * possible answers in two different places, and the answer would depend on
 * which one someone remembered to check. One direction keeps it answerable.
 */

export type CapabilityKey = keyof PlanFeatureSet;
export type CapabilityValue = boolean | number | null;

export interface ActiveOverrides {
  /** Highest plan an admin has granted by hand, if any. */
  planCode: PlanCode | null;
  /** Per-capability grants, already parsed and validated. */
  capabilities: Partial<Record<CapabilityKey, CapabilityValue>>;
  /** True when the user holds any active override — the ALLOWLIST rollout's test. */
  any: boolean;
}

const EMPTY: ActiveOverrides = { planCode: null, capabilities: {}, any: false };

/** Parses the stored JSON scalar and rejects anything the key's type disallows. */
export function parseCapabilityValue(
  key: CapabilityKey,
  raw: string | null,
): { ok: true; value: CapabilityValue } | { ok: false; message: string } {
  const type: CapabilityValueType = PLAN_FEATURE_TYPES[key];
  let parsed: unknown;
  try {
    parsed = raw === null ? null : JSON.parse(raw);
  } catch {
    return { ok: false, message: `"${raw}" ek valid value nahi hai.` };
  }

  if (type === "boolean") {
    if (typeof parsed !== "boolean") return { ok: false, message: `${key} ke liye sirf true/false chalega.` };
    return { ok: true, value: parsed };
  }
  if (type === "number") {
    if (typeof parsed !== "number" || !Number.isInteger(parsed) || parsed < 0) {
      return { ok: false, message: `${key} ke liye ek non-negative poora number chahiye.` };
    }
    return { ok: true, value: parsed };
  }
  // nullableNumber — null is "unlimited", not zero.
  if (parsed === null) return { ok: true, value: null };
  if (typeof parsed !== "number" || !Number.isInteger(parsed) || parsed < 0) {
    return { ok: false, message: `${key} ke liye number ya null (unlimited) chahiye.` };
  }
  return { ok: true, value: parsed };
}

/**
 * Merges one override onto a base value, keeping only the more generous side.
 * `null` on a nullableNumber key means unlimited and therefore always wins.
 */
export function applyCapabilityOverride(
  key: CapabilityKey,
  base: CapabilityValue,
  override: CapabilityValue,
): CapabilityValue {
  const type = PLAN_FEATURE_TYPES[key];
  if (type === "boolean") return Boolean(base) || Boolean(override);
  if (type === "number") return Math.max(Number(base ?? 0), Number(override ?? 0));
  // nullableNumber
  if (base === null || override === null) return null;
  return Math.max(Number(base), Number(override));
}

export async function getActiveOverrides(userId: string): Promise<ActiveOverrides> {
  const now = new Date();
  const rows = await prisma.userEntitlementOverride.findMany({
    where: {
      userId,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });
  if (rows.length === 0) return EMPTY;

  const capabilities: Partial<Record<CapabilityKey, CapabilityValue>> = {};
  let planCode: PlanCode | null = null;

  for (const row of rows) {
    if (row.planCode) {
      // Several plan overrides on one user is not expected, but if it happens
      // the more generous one should win rather than whichever sorted last.
      planCode = higherPlan(planCode, row.planCode);
      continue;
    }
    if (!row.capabilityKey || !(row.capabilityKey in PLAN_FEATURE_TYPES)) continue;
    const key = row.capabilityKey as CapabilityKey;
    const parsed = parseCapabilityValue(key, row.value);
    if (!parsed.ok) {
      console.error(`[entitlements] override ${row.id} has an unusable value for ${key}; ignoring.`);
      continue;
    }
    capabilities[key] =
      key in capabilities
        ? (applyCapabilityOverride(key, capabilities[key] ?? null, parsed.value) as CapabilityValue)
        : parsed.value;
  }

  return { planCode, capabilities, any: true };
}

const PLAN_RANK: Record<PlanCode, number> = { FREE: 0, BASIC: 1, STANDARD: 2, PREMIUM: 3 };

export function higherPlan(a: PlanCode | null, b: PlanCode | null): PlanCode | null {
  if (!a) return b;
  if (!b) return a;
  return PLAN_RANK[a] >= PLAN_RANK[b] ? a : b;
}

export type GrantOverrideInput = {
  userId: string;
  planCode?: PlanCode | null;
  capabilityKey?: CapabilityKey | null;
  value?: CapabilityValue;
  reason: string;
  expiresAt?: Date | null;
  actorId: string;
  actorRole: Role;
};

export type OverrideResult = { ok: true; id: string } | { ok: false; message: string; status: number };

export async function grantOverride(input: GrantOverrideInput): Promise<OverrideResult> {
  const { userId, planCode, capabilityKey, value, reason, expiresAt, actorId, actorRole } = input;

  if (!reason.trim()) {
    return { ok: false, message: "Reason likhna zaroori hai.", status: 422 };
  }
  if (Boolean(planCode) === Boolean(capabilityKey)) {
    return {
      ok: false,
      message: "Ya to poora plan override karein, ya ek capability — dono ek saath nahi.",
      status: 422,
    };
  }
  if (capabilityKey && !(capabilityKey in PLAN_FEATURE_TYPES)) {
    return { ok: false, message: "Aisi koi capability nahi hai.", status: 422 };
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return { ok: false, message: "User nahi mila.", status: 404 };

  const serialised = capabilityKey ? JSON.stringify(value ?? null) : null;
  if (capabilityKey && serialised) {
    const check = parseCapabilityValue(capabilityKey, serialised);
    if (!check.ok) return { ok: false, message: check.message, status: 422 };
  }

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.userEntitlementOverride.create({
      data: {
        userId,
        planCode: planCode ?? null,
        capabilityKey: capabilityKey ?? null,
        value: serialised,
        reason: reason.trim(),
        grantedBy: actorId,
        expiresAt: expiresAt ?? null,
      },
    });
    await tx.adminAuditLog.create({
      data: {
        actorId,
        actorRole,
        actionType: "ENTITLEMENT_OVERRIDE_GRANTED",
        targetType: "user",
        targetId: userId,
        newValue: planCode ? `plan=${planCode}` : `${capabilityKey}=${serialised}`,
        reason: reason.trim(),
      },
    });
    return created;
  });

  return { ok: true, id: row.id };
}

export interface OverrideRow {
  id: string;
  userId: string;
  userName: string;
  userEmail: string | null;
  planCode: PlanCode | null;
  capabilityKey: string | null;
  value: string | null;
  reason: string;
  expiresAt: Date | null;
  createdAt: Date;
}

/** Currently-active overrides, newest first — the admin page's "kaun kaun khula hai" list. */
export async function listActiveOverrides(limit = 50): Promise<OverrideRow[]> {
  const now = new Date();
  const rows = await prisma.userEntitlementOverride.findMany({
    where: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { fullName: true, email: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: r.user.fullName,
    userEmail: r.user.email,
    planCode: r.planCode,
    capabilityKey: r.capabilityKey,
    value: r.value,
    reason: r.reason,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
  }));
}

export async function revokeOverride(params: {
  overrideId: string;
  actorId: string;
  actorRole: Role;
  reason: string;
}): Promise<OverrideResult> {
  const { overrideId, actorId, actorRole, reason } = params;
  const existing = await prisma.userEntitlementOverride.findUnique({ where: { id: overrideId } });
  if (!existing) return { ok: false, message: "Override nahi mila.", status: 404 };
  if (existing.revokedAt) return { ok: true, id: overrideId };

  await prisma.$transaction(async (tx) => {
    await tx.userEntitlementOverride.update({
      where: { id: overrideId },
      data: { revokedAt: new Date() },
    });
    await tx.adminAuditLog.create({
      data: {
        actorId,
        actorRole,
        actionType: "ENTITLEMENT_OVERRIDE_REVOKED",
        targetType: "user",
        targetId: existing.userId,
        previousValue: existing.planCode ? `plan=${existing.planCode}` : `${existing.capabilityKey}=${existing.value}`,
        reason: reason.trim() || null,
      },
    });
  });

  return { ok: true, id: overrideId };
}
