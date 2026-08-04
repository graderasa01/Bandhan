import "server-only";
import { prisma } from "@/lib/db/prisma";
import { FEATURES, FEATURE_KEYS, type FeatureKey } from "@/lib/constants/features";
import type { FeatureRollout, Role } from "@prisma/client";

/**
 * Live rollout state per feature, cached in-process.
 *
 * Modelled directly on lib/ai/aiConfigService.ts — same 30s TTL, same
 * fall-back-to-code-defaults-on-DB-error rule. A database hiccup must never
 * take the whole app dark; it should just mean the last shipped defaults apply
 * for a few seconds.
 */
const CACHE_TTL_MS = 30_000;
let cache: { at: number; rollouts: Record<FeatureKey, FeatureRollout> } | null = null;

function codeDefaults(): Record<FeatureKey, FeatureRollout> {
  const out = {} as Record<FeatureKey, FeatureRollout>;
  for (const key of FEATURE_KEYS) out[key] = FEATURES[key].defaultRollout;
  return out;
}

async function loadAll(): Promise<Record<FeatureKey, FeatureRollout>> {
  const rows = await prisma.featureFlag.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const out = codeDefaults();
  for (const key of FEATURE_KEYS) {
    const row = byKey.get(key);
    if (row) out[key] = row.rollout;
  }
  return out;
}

export async function getAllRollouts(): Promise<Record<FeatureKey, FeatureRollout>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rollouts;
  try {
    const rollouts = await loadAll();
    cache = { at: Date.now(), rollouts };
    return rollouts;
  } catch (err) {
    console.error(
      "[features] DB read failed, falling back to code defaults:",
      err instanceof Error ? err.message : String(err),
    );
    return codeDefaults();
  }
}

export async function getRollout(key: FeatureKey): Promise<FeatureRollout> {
  return (await getAllRollouts())[key];
}

/**
 * Whether `userId` may use `key` right now.
 *
 * `hasOverride` is passed in rather than looked up here so that a caller which
 * already loaded a user's overrides (the common case — see
 * getEffectiveEntitlements) doesn't pay for a second query. ALLOWLIST is the
 * only mode that consults it.
 */
export function resolveAccess(rollout: FeatureRollout, hasOverride: boolean): "open" | "plan-gated" | "closed" {
  switch (rollout) {
    case "OFF":
      return "closed";
    case "ALL":
      return "open";
    case "ALLOWLIST":
      return hasOverride ? "open" : "closed";
    case "PLAN_GATED":
      return "plan-gated";
  }
}

export type FeatureFlagRow = {
  key: FeatureKey;
  label: string;
  description: string;
  built: boolean;
  rollout: FeatureRollout;
  isDefault: boolean;
  note: string | null;
  updatedAt: Date | null;
  updatedBy: string | null;
};

/** Every feature, whether or not it has a DB row yet — for /admin/features. */
export async function getAllFeatureFlags(): Promise<FeatureFlagRow[]> {
  const rows = await prisma.featureFlag.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return FEATURE_KEYS.map((key) => {
    const row = byKey.get(key);
    const def = FEATURES[key];
    return {
      key,
      label: def.label,
      description: def.description,
      built: def.built,
      rollout: row?.rollout ?? def.defaultRollout,
      isDefault: !row,
      note: row?.note ?? null,
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy ?? null,
    };
  });
}

export async function updateFeatureFlag(params: {
  key: FeatureKey;
  rollout: FeatureRollout;
  note?: string | null;
  actorId: string;
  actorRole: Role;
}): Promise<void> {
  const { key, rollout, note, actorId, actorRole } = params;

  const existing = await prisma.featureFlag.findUnique({ where: { key } });
  const previousValue = existing ? existing.rollout : `${FEATURES[key].defaultRollout} (default)`;

  await prisma.$transaction(async (tx) => {
    await tx.featureFlag.upsert({
      where: { key },
      create: { key, rollout, note: note ?? null, updatedBy: actorId },
      update: { rollout, note: note ?? null, updatedBy: actorId },
    });
    await tx.adminAuditLog.create({
      data: {
        actorId,
        actorRole,
        actionType: "FEATURE_FLAG_UPDATED",
        targetType: "feature_flag",
        targetId: key,
        previousValue,
        newValue: rollout,
        reason: note ?? null,
      },
    });
  });

  cache = null; // next read re-hits the DB
}
