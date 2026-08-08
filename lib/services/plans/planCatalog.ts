import "server-only";
import { prisma } from "@/lib/db/prisma";
import {
  BUILTIN_PLAN_DEFAULTS,
  BUILTIN_PLAN_DURATION_LABEL,
  BUILTIN_PLAN_NAMES,
  BUILTIN_PLAN_ORDER,
  PLAN_FEATURE_KEYS,
  isBuiltinPlanCode,
  type BuiltinPlanCode,
  type PlanCode,
  type PlanFeatureSet,
} from "@/lib/constants/plans";

/**
 * The live plan catalog — the one place that answers "what plans exist and
 * what does each one grant".
 *
 * Replaces the four constants (`PLAN_ORDER`, `PLAN_NAMES`,
 * `PLAN_DURATION_LABEL`, `PLAN_FEATURES`) that used to be read directly all
 * over the app. Those still exist as `BUILTIN_*` defaults; nothing should read
 * them to answer a question about a *user*, because an admin can now both edit
 * the built-ins and create plans the constants have never heard of.
 *
 * ## Never throws
 *
 * A DB hiccup, an empty table, a plan row whose `features` JSON is malformed —
 * each falls back to the built-in ladder rather than failing. Every gate in
 * the app calls through here, so throwing would mean one bad row taking the
 * product down; degrading means it behaves like it did before this feature
 * shipped. Same defensive shape as `siteThemeService` and `aiConfigService`.
 *
 * 30-second cache so a saved change goes live without a restart while a busy
 * request doesn't cost a query per gate check.
 */

export type PlanCatalogEntry = {
  code: PlanCode;
  name: string;
  priceInPaise: number;
  durationLabel: string;
  rank: number;
  isActive: boolean;
  isPublic: boolean;
  displayOrder: number;
  features: PlanFeatureSet;
  /** False for an admin-created plan — the UI uses this to allow deletion. */
  isBuiltin: boolean;
};

export type PlanCatalog = {
  /** Every plan, active or not, ordered by rank. */
  all: PlanCatalogEntry[];
  byCode: Record<string, PlanCatalogEntry>;
  /** Codes ordered by rank — the replacement for `PLAN_ORDER`. */
  order: PlanCode[];
};

const CACHE_TTL_MS = 30_000;
let cache: { at: number; catalog: PlanCatalog } | null = null;

/** The catalog the app falls back to: exactly D-11's four plans. */
function builtinCatalog(): PlanCatalog {
  const all: PlanCatalogEntry[] = BUILTIN_PLAN_ORDER.map((code, i) => ({
    code,
    name: BUILTIN_PLAN_NAMES[code],
    priceInPaise: 0,
    durationLabel: BUILTIN_PLAN_DURATION_LABEL[code],
    rank: i,
    isActive: true,
    isPublic: code !== "FREE",
    displayOrder: i,
    features: BUILTIN_PLAN_DEFAULTS[code],
    isBuiltin: true,
  }));
  return {
    all,
    byCode: Object.fromEntries(all.map((e) => [e.code, e])),
    order: all.map((e) => e.code),
  };
}

/**
 * Stored JSON merged over a base feature set, key by key.
 *
 * Merging (rather than trusting the row wholesale) is what makes a `features`
 * blob written before a new capability existed safe: the missing key resolves
 * to the default instead of `undefined`, which at a gate would read as "no".
 * Values of the wrong shape are dropped for the same reason — one bad key
 * must not poison the whole plan.
 */
function mergeFeatures(base: PlanFeatureSet, stored: unknown): PlanFeatureSet {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return base;
  const raw = stored as Record<string, unknown>;
  const out = { ...base } as Record<string, unknown>;

  for (const key of PLAN_FEATURE_KEYS) {
    if (!(key in raw)) continue;
    const value = raw[key];
    const expected = typeof base[key];
    // `null` is meaningful ("unlimited") on the nullable number keys, and the
    // base value is a number there, so it has to be allowed through explicitly.
    if (value === null || typeof value === expected) {
      out[key] = value;
    }
  }
  return out as PlanFeatureSet;
}

async function loadCatalog(): Promise<PlanCatalog> {
  const rows = await prisma.plan.findMany({ orderBy: [{ rank: "asc" }, { displayOrder: "asc" }] });
  if (rows.length === 0) return builtinCatalog();

  const all: PlanCatalogEntry[] = rows.map((p) => {
    const builtin = isBuiltinPlanCode(p.code);
    // A custom plan has no ladder entry to fall back to; FREE's set is the
    // conservative floor — an admin who forgets a key grants nothing extra
    // rather than accidentally handing out Premium.
    const base = builtin ? BUILTIN_PLAN_DEFAULTS[p.code as BuiltinPlanCode] : BUILTIN_PLAN_DEFAULTS.FREE;
    return {
      code: p.code,
      name: p.name || p.code,
      priceInPaise: p.priceInPaise,
      durationLabel: p.durationLabel,
      rank: p.rank,
      isActive: p.isActive,
      isPublic: p.isPublic,
      displayOrder: p.displayOrder,
      features: mergeFeatures(base, p.features),
      isBuiltin: builtin,
    };
  });

  return {
    all,
    byCode: Object.fromEntries(all.map((e) => [e.code, e])),
    order: all.map((e) => e.code),
  };
}

export async function getPlanCatalog(): Promise<PlanCatalog> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.catalog;
  try {
    const catalog = await loadCatalog();
    cache = { at: Date.now(), catalog };
    return catalog;
  } catch (err) {
    console.error(
      "[plans:catalog] DB read failed, falling back to built-in ladder:",
      err instanceof Error ? err.message : String(err),
    );
    return builtinCatalog();
  }
}

/** Call after any write to `plans` so the next read sees it. */
export function invalidatePlanCatalog() {
  cache = null;
}

// ---------------------------------------------------------------- helpers
//
// Each takes the catalog rather than fetching it, so a caller that already has
// one (a page rendering several plans, a job looping over users) does not pay
// for a lookup per call.

/** An unknown code resolves to FREE's features — a plan that was deleted must not open gates. */
export function planFeaturesOf(catalog: PlanCatalog, code: PlanCode): PlanFeatureSet {
  return catalog.byCode[code]?.features ?? BUILTIN_PLAN_DEFAULTS.FREE;
}

export function planNameOf(catalog: PlanCatalog, code: PlanCode): string {
  return catalog.byCode[code]?.name ?? code;
}

export function rankOf(catalog: PlanCatalog, code: PlanCode): number {
  return catalog.byCode[code]?.rank ?? 0;
}

/** The more generous of two plans — what `PLAN_ORDER.indexOf()` comparisons used to do. */
export function higherOf(catalog: PlanCatalog, a: PlanCode, b: PlanCode): PlanCode {
  return rankOf(catalog, a) >= rankOf(catalog, b) ? a : b;
}

/**
 * The next plan up that a user could actually buy — active, public, and
 * strictly higher-ranked. Null at the top.
 */
export function nextPlanUp(catalog: PlanCatalog, code: PlanCode): PlanCode | null {
  const current = rankOf(catalog, code);
  const above = catalog.all
    .filter((p) => p.isActive && p.isPublic && p.rank > current)
    .sort((x, y) => x.rank - y.rank);
  return above[0]?.code ?? null;
}

/** The bottom of the ladder — what an un-subscribed user gets. Almost always "FREE". */
export function basePlanCode(catalog: PlanCatalog): PlanCode {
  return catalog.byCode.FREE ? "FREE" : (catalog.all[0]?.code ?? "FREE");
}
