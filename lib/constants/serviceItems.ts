import type { ServiceItemKind } from "@prisma/client";
import { PLAN_FEATURE_LABELS, PLAN_FEATURE_TYPES, type PlanFeatureSet } from "./plans";

/**
 * The shape of an à-la-carte item, and the built-in ones.
 *
 * Stands to `service_items` exactly as `lib/constants/plans.ts` stands to
 * `plans`: the table is the live catalog and an admin edits it without a
 * deploy, while this file owns the things a deploy *is* required for — which
 * kinds exist, what config each kind legally carries, and the defaults the app
 * falls back to when the table is empty or unreachable.
 *
 * ## Why the built-ins are merged under the table rather than seeded into it
 *
 * `Plan` seeds rows and `getPlanCatalog()` falls back wholesale if the table is
 * empty. Items take the narrower route (see `itemCatalog.ts`): a built-in with
 * no row is sold from this file, and a row with the same code overrides it key
 * by key. That difference is deliberate — Phase 1 adds REACH_50 and
 * CITY_SPOTLIGHT to the array below, and with a seed-based catalog those two
 * would exist in code but be unbuyable on any environment whose seed had
 * already run. Merging means adding an item is one array entry.
 *
 * ## Client-safe on purpose
 *
 * No `server-only`, no Prisma client, no DB. The buy cards and the admin
 * editor both need `SERVICE_ITEM_KIND_LABELS` and `parseItemConfig`, and a
 * second, client-side copy of "what is a legal config" is how the two drift
 * until the editor happily saves something the fulfilment path cannot read.
 */

/** Buys one `PlanFeatureSet` capability for a fixed number of days. */
export interface EntitlementWindowConfig {
  capabilityKey: keyof PlanFeatureSet;
  /** Matches the key's `PLAN_FEATURE_TYPES` entry. `null` = unlimited. */
  value: boolean | number | null;
  days: number;
}

/** Buys placement in other members' decks. Nothing fulfils this yet — Phase 1. */
export interface SpotlightCampaignConfig {
  /** Unique eligible members the campaign promises to reach. Never impressions. */
  reach: number;
  /** Hard stop, even if the reach was never delivered. */
  maxDays: number;
}

/** Buys one generated deliverable. Nothing fulfils this yet — Phase 5. */
export interface AiDeliverableConfig {
  /** Which deliverable to produce. Matched against a registry when Phase 5 lands. */
  deliverable: string;
}

export type ServiceItemConfig = EntitlementWindowConfig | SpotlightCampaignConfig | AiDeliverableConfig;

export interface ServiceItemDefinition {
  code: string;
  name: string;
  description: string;
  priceInPaise: number;
  kind: ServiceItemKind;
  config: ServiceItemConfig;
  isActive: boolean;
  isPublic: boolean;
  displayOrder: number;
}

export const SERVICE_ITEM_KIND_LABELS: Record<ServiceItemKind, string> = {
  ENTITLEMENT_WINDOW: "Feature, kuch din ke liye",
  SPOTLIGHT_CAMPAIGN: "Spotlight campaign",
  AI_DELIVERABLE: "Ek report / list",
};

/**
 * What the app sells today.
 *
 * Three packs, which is the whole launch list: an entitlement window and two
 * Spotlight campaigns. Boost is deliberately absent — `scoreRecentActivity`
 * caps at 100, so for anyone who touched their profile today the +15% is
 * arithmetically zero, and the best case is worth under two points of a final
 * score. Selling that is a refund waiting to happen.
 *
 * An item only belongs here once `fulfilItemPayment` can actually deliver it.
 * One that can be bought but not fulfilled is worse than one that does not
 * exist.
 */
export const BUILTIN_SERVICE_ITEMS: ServiceItemDefinition[] = [
  {
    code: "DISCOVERY_WEEK",
    name: "Discovery Week",
    description:
      "Saat din ke liye Advanced Discovery — apni search, apne filters, aur Reel jo aapke swipes se seekhti hai.",
    priceInPaise: 14_900,
    kind: "ENTITLEMENT_WINDOW",
    config: { capabilityKey: "advancedDiscovery", value: true, days: 7 },
    isActive: true,
    isPublic: true,
    displayOrder: 0,
  },
  {
    code: "REACH_50",
    name: "Reach 50",
    description:
      "Aapki profile 50 aise logon tak pahunchegi jo aapki bhi pasand hain aur jinki pasand me aap hain.",
    priceInPaise: 9_900,
    kind: "SPOTLIGHT_CAMPAIGN",
    config: { reach: 50, maxDays: 3 },
    isActive: true,
    isPublic: true,
    displayOrder: 1,
  },
  {
    code: "CITY_SPOTLIGHT",
    name: "City Spotlight",
    description:
      "Apni chuni hui city me 150 eligible logon tak — ek hafte ke andar, aur poore hisaab ke saath.",
    priceInPaise: 24_900,
    kind: "SPOTLIGHT_CAMPAIGN",
    config: { reach: 150, maxDays: 7 },
    isActive: true,
    isPublic: true,
    displayOrder: 2,
  },
];

export const BUILTIN_SERVICE_ITEM_CODES = new Set(BUILTIN_SERVICE_ITEMS.map((i) => i.code));

export function isBuiltinServiceItemCode(code: string): boolean {
  return BUILTIN_SERVICE_ITEM_CODES.has(code);
}

// ------------------------------------------------------------------ config

export type ParsedConfig<T = ServiceItemConfig> = { ok: true; config: T } | { ok: false; message: string };

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function positiveInt(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw <= 0) return null;
  return raw;
}

/**
 * Validates a stored/submitted config against its kind.
 *
 * Every caller goes through here — the admin editor before saving, the catalog
 * after reading, and fulfilment before acting. An item whose config does not
 * parse is treated as unbuyable rather than fulfilled on a guess: the failure
 * mode of guessing is charging someone and giving them the wrong thing, which
 * is the one outcome this whole path exists to avoid.
 *
 * The `capabilityKey` check is against `PLAN_FEATURE_TYPES`, the same map the
 * admin override editor validates against — so an item can never sell a
 * capability that no gate in the app reads.
 */
export function parseItemConfig(kind: ServiceItemKind, raw: unknown): ParsedConfig {
  const obj = asRecord(raw);
  if (!obj) return { ok: false, message: "Config ek object hona chahiye." };

  if (kind === "ENTITLEMENT_WINDOW") {
    const key = obj.capabilityKey;
    if (typeof key !== "string" || !(key in PLAN_FEATURE_TYPES)) {
      return { ok: false, message: `"${String(key)}" naam ki koi capability nahi hai.` };
    }
    const capabilityKey = key as keyof PlanFeatureSet;
    const days = positiveInt(obj.days);
    if (days === null) return { ok: false, message: "Days ek poora number hona chahiye, 1 ya usse zyada." };

    const type = PLAN_FEATURE_TYPES[capabilityKey];
    const value = obj.value;
    if (type === "boolean") {
      if (value !== true) {
        // `false` would be a purchase that takes something away — and
        // `UserEntitlementOverride` refuses to lower anything anyway, so it
        // would be money for a row that does nothing.
        return { ok: false, message: `${PLAN_FEATURE_LABELS[capabilityKey]} ke liye value sirf true ho sakti hai.` };
      }
    } else if (type === "number") {
      if (positiveInt(value) === null) {
        return { ok: false, message: `${PLAN_FEATURE_LABELS[capabilityKey]} ke liye ek positive number chahiye.` };
      }
    } else {
      // nullableNumber — `null` is "unlimited", which is a legal thing to sell.
      if (value !== null && positiveInt(value) === null) {
        return {
          ok: false,
          message: `${PLAN_FEATURE_LABELS[capabilityKey]} ke liye positive number ya null (unlimited) chahiye.`,
        };
      }
    }

    return { ok: true, config: { capabilityKey, value: value as boolean | number | null, days } };
  }

  if (kind === "SPOTLIGHT_CAMPAIGN") {
    const reach = positiveInt(obj.reach);
    const maxDays = positiveInt(obj.maxDays);
    if (reach === null) return { ok: false, message: "Reach ek positive poora number hona chahiye." };
    if (maxDays === null) return { ok: false, message: "Max days ek positive poora number hona chahiye." };
    return { ok: true, config: { reach, maxDays } };
  }

  const deliverable = obj.deliverable;
  if (typeof deliverable !== "string" || !deliverable.trim()) {
    return { ok: false, message: "Deliverable ka naam likhna zaroori hai." };
  }
  return { ok: true, config: { deliverable: deliverable.trim() } };
}

/** One line describing what the buyer gets, built from the config rather than retyped. */
export function itemPromiseLine(kind: ServiceItemKind, config: ServiceItemConfig): string {
  if (kind === "ENTITLEMENT_WINDOW") {
    const c = config as EntitlementWindowConfig;
    return `${PLAN_FEATURE_LABELS[c.capabilityKey] ?? c.capabilityKey} — ${c.days} din ke liye`;
  }
  if (kind === "SPOTLIGHT_CAMPAIGN") {
    const c = config as SpotlightCampaignConfig;
    return `${c.reach} eligible logon tak — zyada se zyada ${c.maxDays} din me`;
  }
  return (config as AiDeliverableConfig).deliverable;
}
