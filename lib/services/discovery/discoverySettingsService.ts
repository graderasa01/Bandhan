import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { DiscoveryFilterMode } from "@prisma/client";

/**
 * `DiscoverySettings` — the handful of Advanced Discovery controls that are
 * not already a column on `ProfilePartnerPreferences` (see that model's
 * comment). Ownership is implicit throughout: every function here takes the
 * userId from the caller's own session (`requireUser()`), never from the
 * request body, so there is no id to check against an owner.
 */

export interface DiscoverySettingsDto {
  filterMode: DiscoveryFilterMode;
  verifiedOnly: boolean;
  minTrustScore: number | null;
  behaviorLearningEnabled: boolean;
  /** True once at least one "Reset learned behaviour" has happened. */
  hasBeenReset: boolean;
  /** Raw cutoff for `countEligibleSwipes`/`buildLearnedBehaviorProfile` — server-side use, not rendered directly. */
  behaviorResetAt: string | null;
  updatedAt: string;
}

const DEFAULTS: Omit<DiscoverySettingsDto, "updatedAt" | "hasBeenReset" | "behaviorResetAt"> = {
  filterMode: "FLEXIBLE",
  verifiedOnly: false,
  minTrustScore: null,
  behaviorLearningEnabled: true,
};

export async function getDiscoverySettings(userId: string): Promise<DiscoverySettingsDto> {
  const row = await prisma.discoverySettings.findUnique({ where: { userId } });
  if (!row) return { ...DEFAULTS, hasBeenReset: false, behaviorResetAt: null, updatedAt: new Date(0).toISOString() };
  return {
    filterMode: row.filterMode,
    verifiedOnly: row.verifiedOnly,
    minTrustScore: row.minTrustScore,
    behaviorLearningEnabled: row.behaviorLearningEnabled,
    hasBeenReset: row.behaviorResetAt !== null,
    behaviorResetAt: row.behaviorResetAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface DiscoverySettingsPatch {
  filterMode?: DiscoveryFilterMode;
  verifiedOnly?: boolean;
  minTrustScore?: number | null;
  behaviorLearningEnabled?: boolean;
}

/**
 * A pure settings save — never touches `behaviorResetAt`. "Pause learning" is
 * just `behaviorLearningEnabled: false` through this same function; "Reset
 * learned behaviour" is the dedicated `resetLearnedBehavior` below, kept
 * separate because it is destructive (drops every swipe collected so far
 * from the *learner*, though not from `SwipeAction` itself — see the schema
 * note) and deserves its own explicit control rather than living inside a
 * generic patch.
 *
 * Saved-filter changes apply to the *next* Reel generation only — this
 * function never touches today's already-persisted `DailyReel` row, which is
 * exactly what makes that promise true without any extra code here: nothing
 * in `getOrCreateTodayReel` re-runs once a row exists for today.
 */
export async function saveDiscoverySettings(userId: string, patch: DiscoverySettingsPatch): Promise<DiscoverySettingsDto> {
  const row = await prisma.discoverySettings.upsert({
    where: { userId },
    create: { userId, ...DEFAULTS, ...patch },
    update: patch,
  });
  return {
    filterMode: row.filterMode,
    verifiedOnly: row.verifiedOnly,
    minTrustScore: row.minTrustScore,
    behaviorLearningEnabled: row.behaviorLearningEnabled,
    hasBeenReset: row.behaviorResetAt !== null,
    behaviorResetAt: row.behaviorResetAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** "Reset learned behaviour" — swipes at or before now stop counting toward the learner; nothing is deleted. */
export async function resetLearnedBehavior(userId: string): Promise<void> {
  await prisma.discoverySettings.upsert({
    where: { userId },
    create: { userId, ...DEFAULTS, behaviorResetAt: new Date() },
    update: { behaviorResetAt: new Date() },
  });
}
