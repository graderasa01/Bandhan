import "server-only";
import { prisma } from "@/lib/db/prisma";
import {
  PLAN_FEATURE_LABELS,
  PLAN_FEATURE_TYPES,
  type PlanCode,
  type CapabilityValueType,
  type PlanFeatureSet,
} from "@/lib/constants/plans";
import { createNotice } from "@/lib/services/notice/noticeService";
import { getPlanCatalog, planNameOf, rankOf, type PlanCatalog } from "./planCatalog";
import type { Role } from "@prisma/client";

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
  /**
   * When that plan grant lapses — `null` means never. Carried out of here so
   * the user's own subscription card can say "Premium — Admin ki taraf se,
   * 30 Aug tak" instead of silently showing an upgrade with no explanation
   * and no end date.
   */
  planExpiresAt: Date | null;
  /** Per-capability grants, already parsed and validated. */
  capabilities: Partial<Record<CapabilityKey, CapabilityValue>>;
  /** True when the user holds any active override — the ALLOWLIST rollout's test. */
  any: boolean;
}

const EMPTY: ActiveOverrides = { planCode: null, planExpiresAt: null, capabilities: {}, any: false };

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

  // Fetched once, after the early return — the common case (no overrides) pays
  // nothing for it, and this runs on effectively every authenticated request.
  const catalog = await getPlanCatalog();
  const capabilities: Partial<Record<CapabilityKey, CapabilityValue>> = {};
  let planCode: PlanCode | null = null;
  let planExpiresAt: Date | null = null;

  for (const row of rows) {
    if (row.planCode) {
      // Several plan overrides on one user is not expected, but if it happens
      // the more generous one should win rather than whichever sorted last.
      const winner = higherPlan(catalog, planCode, row.planCode);

      // The expiry has to follow the plan that actually won, and it cannot be
      // read off "whichever row came first" — two live PREMIUM grants with
      // different end dates would then show a date that depends on row order.
      if (planCode === null || winner !== planCode) {
        // A strictly better plan just took over: its own end date is the one
        // that matters, and the plan it displaced no longer sets anything.
        planCode = winner;
        planExpiresAt = row.expiresAt;
      } else if (row.planCode === planCode) {
        // Same plan granted twice — access genuinely runs to the *later* of
        // the two, and a null expiry (never) beats any date.
        planExpiresAt = laterExpiry(planExpiresAt, row.expiresAt);
      }
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

  return { planCode, planExpiresAt, capabilities, any: true };
}

/** `null` means "no expiry" and therefore always wins. */
function laterExpiry(a: Date | null, b: Date | null): Date | null {
  if (a === null || b === null) return null;
  return a >= b ? a : b;
}

/**
 * The more generous of two grants. Ranks come from the live catalog rather
 * than a hardcoded `{FREE:0, BASIC:1, …}` map — an admin can insert a plan
 * between two existing ones, and a stale map would quietly rank it last.
 */
export function higherPlan(catalog: PlanCatalog, a: PlanCode | null, b: PlanCode | null): PlanCode | null {
  if (!a) return b;
  if (!b) return a;
  return rankOf(catalog, a) >= rankOf(catalog, b) ? a : b;
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
  // Plan codes are free-form strings now (admins create plans), so the only
  // thing that can say whether one is real is the live catalog. Without this a
  // typo would store a grant that silently resolves to FREE's features.
  if (planCode && !(await getPlanCatalog()).byCode[planCode]) {
    return { ok: false, message: `"${planCode}" naam ka koi plan nahi hai.`, status: 422 };
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

  // Tell the user. Without this the grant was completely silent: their
  // features changed mid-session, their own subscription card kept saying
  // "Free" until the next server render, and nothing ever explained why any of
  // it happened. `createNotice` swallows its own errors and fires the push, so
  // a failure here can never undo a grant that already committed.
  //
  // Deliberately no `reason` in the body — that field is written for the audit
  // log and other admins ("VIP, sales call"), not for the user to read.
  //
  // Name from the live catalog, not a constant: an admin can rename a plan or
  // grant one they created, and "PREMIUM plan aapko mil gaya" would be both
  // wrong and shouty.
  const grantedPlanName = planCode ? planNameOf(await getPlanCatalog(), planCode) : "";

  await createNotice({
    userId,
    kind: "PLAN_GRANTED",
    title: planCode
      ? `${grantedPlanName} plan aapko mil gaya hai`
      : "Aapke liye ek feature khol diya gaya hai",
    body: planCode
      ? `BandhanTak team ne aapko ${grantedPlanName} plan diya hai${expiryPhrase(expiresAt)}. Koi payment nahi lagi.`
      : `${PLAN_FEATURE_LABELS[capabilityKey as CapabilityKey] ?? capabilityKey} ab aapke liye khula hai${expiryPhrase(expiresAt)}.`,
    href: "/user/subscription",
  });

  return { ok: true, id: row.id };
}

function expiryPhrase(expiresAt: Date | null | undefined): string {
  if (!expiresAt) return "";
  const on = expiresAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  return ` — ${on} tak`;
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
