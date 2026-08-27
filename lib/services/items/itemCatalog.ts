import "server-only";
import { prisma } from "@/lib/db/prisma";
import {
  BUILTIN_SERVICE_ITEMS,
  isBuiltinServiceItemCode,
  parseItemConfig,
  type ServiceItemConfig,
  type ServiceItemDefinition,
} from "@/lib/constants/serviceItems";
import type { ServiceItemKind } from "@prisma/client";

/**
 * The live à-la-carte catalog — "what can be bought once, and what does each
 * one give".
 *
 * Deliberately the same shape as `planCatalog.ts` (30-second cache, explicit
 * invalidate, never throws, degrades to the built-ins) because it answers the
 * same class of question for the same class of caller. Two catalogs that
 * behave differently under a DB hiccup would mean the subscription grid and
 * the item grid on the *same page* fail in different ways.
 *
 * ## One difference from plans, on purpose
 *
 * `getPlanCatalog()` falls back to the built-ins only when the table is
 * completely empty. Here the built-ins are merged *under* the rows always: a
 * code with no row is sold from `BUILTIN_SERVICE_ITEMS`, and a row with that
 * code overrides it field by field.
 *
 * The reason is Phase 1. Adding REACH_50 to the constants file has to be
 * enough to make it buyable on every environment, including ones whose seed
 * ran months ago. With plans that never came up — the four rungs shipped
 * together and no fifth was ever added in code. Items are explicitly a list
 * that grows.
 *
 * ## A config that does not parse makes the item unbuyable, not "best effort"
 *
 * `mergeItem` runs the same `parseItemConfig` the admin editor runs. A row
 * that fails it is returned with `isActive: false` and `configValid: false`
 * rather than dropped: dropping it would make a broken item look like a
 * deleted one on the admin screen, and the admin is the only person who can
 * fix it.
 */

export interface ServiceItemEntry extends ServiceItemDefinition {
  /** False for an admin-created item — the admin UI uses this to allow deletion. */
  isBuiltin: boolean;
  /** False when the stored config failed validation. Such an item is never sold. */
  configValid: boolean;
  /** Null until an admin has saved this item; built-ins start life row-less. */
  updatedAt: Date | null;
}

export interface ServiceItemCatalog {
  /** Every item, active or not, ordered for display. */
  all: ServiceItemEntry[];
  byCode: Record<string, ServiceItemEntry>;
}

const CACHE_TTL_MS = 30_000;
let cache: { at: number; catalog: ServiceItemCatalog } | null = null;

function builtinEntry(def: ServiceItemDefinition): ServiceItemEntry {
  return { ...def, isBuiltin: true, configValid: true, updatedAt: null };
}

function sortEntries(entries: ServiceItemEntry[]): ServiceItemEntry[] {
  return entries.sort((a, b) => a.displayOrder - b.displayOrder || a.code.localeCompare(b.code));
}

function builtinCatalog(): ServiceItemCatalog {
  const all = sortEntries(BUILTIN_SERVICE_ITEMS.map(builtinEntry));
  return { all, byCode: Object.fromEntries(all.map((e) => [e.code, e])) };
}

type ItemRow = {
  code: string;
  name: string;
  description: string;
  priceInPaise: number;
  kind: ServiceItemKind;
  config: unknown;
  isActive: boolean;
  isPublic: boolean;
  displayOrder: number;
  updatedAt: Date;
};

function mergeItem(row: ItemRow, builtin: ServiceItemDefinition | undefined): ServiceItemEntry {
  const parsed = parseItemConfig(row.kind, row.config);
  if (!parsed.ok) {
    console.error(`[items:catalog] ${row.code} has an unusable config: ${parsed.message}`);
  }

  // A broken config falls back to the built-in's config when there is one, so
  // a bad admin save on a built-in item degrades to "what it always was"
  // rather than to nothing. A custom item has nothing to fall back to and is
  // simply switched off.
  const config: ServiceItemConfig = parsed.ok ? parsed.config : (builtin?.config ?? { deliverable: "" });

  return {
    code: row.code,
    name: row.name || builtin?.name || row.code,
    description: row.description || builtin?.description || "",
    priceInPaise: row.priceInPaise,
    kind: row.kind,
    config,
    isActive: row.isActive && (parsed.ok || builtin !== undefined),
    isPublic: row.isPublic,
    displayOrder: row.displayOrder,
    isBuiltin: isBuiltinServiceItemCode(row.code),
    configValid: parsed.ok,
    updatedAt: row.updatedAt,
  };
}

async function loadCatalog(): Promise<ServiceItemCatalog> {
  const rows = await prisma.serviceItem.findMany({ orderBy: [{ displayOrder: "asc" }, { code: "asc" }] });

  const byCode = new Map<string, ServiceItemEntry>();
  for (const def of BUILTIN_SERVICE_ITEMS) byCode.set(def.code, builtinEntry(def));

  const builtinByCode = new Map(BUILTIN_SERVICE_ITEMS.map((d) => [d.code, d]));
  for (const row of rows) {
    byCode.set(row.code, mergeItem(row as ItemRow, builtinByCode.get(row.code)));
  }

  const all = sortEntries([...byCode.values()]);
  return { all, byCode: Object.fromEntries(all.map((e) => [e.code, e])) };
}

export async function getItemCatalog(): Promise<ServiceItemCatalog> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.catalog;
  try {
    const catalog = await loadCatalog();
    cache = { at: Date.now(), catalog };
    return catalog;
  } catch (err) {
    console.error(
      "[items:catalog] DB read failed, falling back to built-in items:",
      err instanceof Error ? err.message : String(err),
    );
    return builtinCatalog();
  }
}

/** Call after any write to `service_items` so the next read sees it. */
export function invalidateItemCatalog() {
  cache = null;
}

/** Null for a code nobody has ever defined — never a guess. */
export function itemOf(catalog: ServiceItemCatalog, code: string): ServiceItemEntry | null {
  return catalog.byCode[code] ?? null;
}

/** What a member is allowed to see and buy: active, public, and config-sound. */
export function purchasableItems(catalog: ServiceItemCatalog): ServiceItemEntry[] {
  return catalog.all.filter((i) => i.isActive && i.isPublic && i.configValid);
}
