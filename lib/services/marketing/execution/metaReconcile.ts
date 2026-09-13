import type { DeliverySnapshot } from "@/lib/contracts/marketingExecution";
import type { MetaAdsWriteProvider, MetaCampaignTree, MetaCreativeSummary, MetaObjectSummary } from "@/lib/marketing/providers/metaAdsProvider";
import { nameCarriesChildTag } from "@/lib/marketing/mappers/metaCampaignMapper";
import { nameCarriesMarker } from "./idempotency";
import { normaliseMetaError } from "./executionErrors";
import { metaDeliveryOf, type MetaExternalRefs, type MetaReadBack, type MetaTargetExpectation } from "./metaRefs";

/**
 * Meta read-back and reconciliation (doc 14 §13-§16). Pure where it can be
 * — `verifyMetaTree` takes a tree and the stored refs and returns named
 * problems — and provider-driven only in the `find*` helpers, which are the
 * only way an unknown write outcome is ever resolved: search inside the
 * stored parent for the child's tag, never resend.
 */

const GONE = new Set(["DELETED", "ARCHIVED"]);
const START_TOLERANCE_MS = 36 * 3_600_000;
const TIME_SLACK_MS = 60_000;

export type MetaChildExpect = "PAUSED" | "ACTIVE" | "PAUSED_OR_ACTIVE";

export interface MetaTreeExpectation {
  marker: string;
  refs: MetaExternalRefs;
  /**
   * Configured statuses expected at each level. Activation flips children
   * first, so between steps (and on a retry) a child may already be ACTIVE
   * while the campaign is still PAUSED — `PAUSED_OR_ACTIVE` accepts exactly
   * that and nothing else. The campaign is always one exact status.
   */
  expect: { campaign: "PAUSED" | "ACTIVE"; adSets: MetaChildExpect; ads: MetaChildExpect };
}

export interface MetaTreeVerdict {
  ok: boolean;
  problems: string[];
  readBack: MetaReadBack;
  delivery: DeliverySnapshot;
}

function live<T extends { status: string }>(list: T[]): T[] {
  return list.filter((x) => !GONE.has((x.status ?? "").toUpperCase()));
}

function statusMatches(actual: string, want: MetaChildExpect | "PAUSED" | "ACTIVE"): boolean {
  const a = (actual ?? "").toUpperCase();
  return want === "PAUSED_OR_ACTIVE" ? a === "PAUSED" || a === "ACTIVE" : a === want;
}

function arrayOf(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/**
 * One targeting object — ours or Meta's read-back — reduced to the facts the
 * approval is about: geo keys, age, genders, interest ids, platforms and
 * positions, all sorted. Meta-added extras (location types, radius defaults,
 * device platforms, brand-safety settings) do not take part.
 */
export function normaliseTargeting(raw: unknown): MetaTargetExpectation | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const t = raw as Record<string, unknown>;
  const geo = (t.geo_locations && typeof t.geo_locations === "object" ? t.geo_locations : {}) as Record<string, unknown>;
  const geoKeys: string[] = [];
  for (const c of arrayOf(geo.countries)) geoKeys.push(`country:${String(c).toUpperCase()}`);
  for (const r of arrayOf(geo.regions)) geoKeys.push(`region:${String((r as { key?: unknown })?.key ?? "")}`);
  for (const c of arrayOf(geo.cities)) geoKeys.push(`city:${String((c as { key?: unknown })?.key ?? "")}`);
  const interestIds: string[] = [];
  for (const spec of arrayOf(t.flexible_spec)) {
    for (const i of arrayOf((spec as { interests?: unknown })?.interests)) interestIds.push(String((i as { id?: unknown })?.id ?? ""));
  }
  return {
    geoKeys: [...new Set(geoKeys)].sort(),
    ageMin: Number(t.age_min ?? 0),
    ageMax: Number(t.age_max ?? 0),
    genders: [...new Set(arrayOf(t.genders).map((g) => Number(g)))].sort((a, b) => a - b),
    interestIds: [...new Set(interestIds)].sort(),
    publisherPlatforms: [...new Set(arrayOf(t.publisher_platforms).map(String))].sort(),
    facebookPositions: [...new Set(arrayOf(t.facebook_positions).map(String))].sort(),
    instagramPositions: [...new Set(arrayOf(t.instagram_positions).map(String))].sort(),
  };
}

/** Which parts of two normalised targetings differ — named, so drift says what moved. */
export function targetingDiff(want: MetaTargetExpectation, got: MetaTargetExpectation | null): string[] {
  if (!got) return ["targeting read-back me nahi mili"];
  const out: string[] = [];
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  if (!same(want.geoKeys, got.geoKeys)) out.push(`geo [${got.geoKeys.join(", ")}] ≠ [${want.geoKeys.join(", ")}]`);
  if (want.ageMin !== got.ageMin || want.ageMax !== got.ageMax) out.push(`age ${got.ageMin}-${got.ageMax} ≠ ${want.ageMin}-${want.ageMax}`);
  if (!same(want.genders, got.genders)) out.push(`genders [${got.genders.join(",") || "all"}] ≠ [${want.genders.join(",") || "all"}]`);
  if (!same(want.interestIds, got.interestIds)) out.push(`interests [${got.interestIds.join(", ") || "none"}] ≠ [${want.interestIds.join(", ") || "none"}]`);
  if (!same(want.publisherPlatforms, got.publisherPlatforms) || !same(want.facebookPositions, got.facebookPositions) || !same(want.instagramPositions, got.instagramPositions)) {
    out.push(`placements ${[...got.publisherPlatforms, ...got.facebookPositions, ...got.instagramPositions].join("/")} ≠ ${[...want.publisherPlatforms, ...want.facebookPositions, ...want.instagramPositions].join("/")}`);
  }
  return out;
}

/**
 * The same destination, whichever way it was encoded: Meta may store `{` as
 * `%7B` in a link it was given literally. Anything else — another host, path
 * or parameter — is a different destination.
 */
export function sameLink(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const decode = (s: string) => {
    try {
      return decodeURI(s).replace(/%7B/gi, "{").replace(/%7D/gi, "}");
    } catch {
      return s;
    }
  };
  return decode(a) === decode(b);
}

/** Meta writes `+0530`; ISO wants `+05:30`. Epoch millis, or null for an unreadable value — never the host timezone's guess. */
export function metaTimeEpoch(value: string | null | undefined): number | null {
  if (!value) return null;
  const fixed = value.trim().replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  if (!/[zZ]$|[+-]\d{2}:\d{2}$/.test(fixed)) return null;
  const t = Date.parse(fixed);
  return Number.isFinite(t) ? t : null;
}

/**
 * "Exact object counts, ownership marker, budgets, destination, identities,
 * targets and configured states" (§13 step 9) — every mismatch is named so
 * the admin sees exactly what differs.
 */
export function verifyMetaTree(tree: MetaCampaignTree, exp: MetaTreeExpectation, now: Date): MetaTreeVerdict {
  const problems: string[] = [];
  const { refs, marker } = exp;
  const r = refs.resolved;
  const c = tree.campaign;

  if (!nameCarriesMarker(c.name, marker)) problems.push(`campaign name me marker [${marker}] nahi hai ("${c.name.slice(0, 60)}")`);
  if (refs.campaignId && c.id !== refs.campaignId) problems.push(`campaign ${c.id} ≠ stored ${refs.campaignId}`);
  if (r && c.objective && c.objective !== r.objective) problems.push(`objective ${c.objective} ≠ ${r.objective}`);
  if (!statusMatches(c.status, exp.expect.campaign)) problems.push(`campaign status ${c.status || "?"} ≠ ${exp.expect.campaign}`);
  if (r) {
    const want = r.specialAdCategories.filter((x) => x !== "NONE").sort().join(",");
    const got = c.specialAdCategories.filter((x) => x !== "NONE").sort().join(",");
    if (want !== got) problems.push(`special ad categories [${got || "NONE"}] ≠ approved [${want || "NONE"}]`);
  }

  const adSetsLive = live(tree.adSets);
  const adsLive = live(tree.ads);
  const creativesById = new Map(tree.creatives.map((x) => [x.id, x]));
  const adSetsByKey: MetaReadBack["adSets"] = {};
  const adsByKey: MetaReadBack["ads"] = {};
  let budgetSum = 0;
  const knownAdSetIds = new Set(Object.values(refs.adSets).map((x) => x.id));
  const knownAdIds = new Set(Object.values(refs.ads).map((x) => x.id));
  const extras: string[] = [];

  if (r) {
    const wantEnd = metaTimeEpoch(r.endTime);
    const wantStart = metaTimeEpoch(r.startTime);
    for (const key of r.adSetKeys) {
      const stored = refs.adSets[key];
      if (!stored) {
        problems.push(`ad set ${key} abhi bana nahi`);
        continue;
      }
      const hit = adSetsLive.find((s) => s.id === stored.id);
      if (!hit) {
        problems.push(`ad set ${key} (${stored.id}) provider par nahi mila`);
        continue;
      }
      if (hit.campaignId && hit.campaignId !== c.id) problems.push(`ad set ${key} campaign ${hit.campaignId} ≠ ${c.id}`);
      if (!nameCarriesChildTag(hit.name, marker, key)) problems.push(`ad set ${key} ke naam me tag nahi`);
      if (!statusMatches(hit.status, exp.expect.adSets)) problems.push(`ad set ${key} status ${hit.status || "?"} ≠ ${exp.expect.adSets}`);
      const wantBudget = String(r.adSetBudgetsPaise[key] ?? "");
      if (hit.dailyBudget === null || hit.dailyBudget !== wantBudget) problems.push(`ad set ${key} daily_budget ${hit.dailyBudget ?? "?"} ≠ approved ${wantBudget}`);
      if (hit.optimizationGoal && hit.optimizationGoal !== r.optimizationGoal) problems.push(`ad set ${key} optimization ${hit.optimizationGoal} ≠ ${r.optimizationGoal}`);
      if (hit.billingEvent && hit.billingEvent !== r.billingEvent) problems.push(`ad set ${key} billing ${hit.billingEvent} ≠ ${r.billingEvent}`);
      if (hit.destinationType && hit.destinationType !== r.destinationType) problems.push(`ad set ${key} destination ${hit.destinationType} ≠ ${r.destinationType}`);
      const wantTarget = r.adSetTargets[key];
      const diff = wantTarget ? targetingDiff(wantTarget, normaliseTargeting(hit.targeting)) : ["approved targeting stored nahi"];
      if (diff.length) problems.push(`ad set ${key} targeting approved se alag: ${diff.join("; ")}`);
      const gotEnd = metaTimeEpoch(hit.endTime);
      if (wantEnd === null || gotEnd === null || Math.abs(gotEnd - wantEnd) > TIME_SLACK_MS) problems.push(`ad set ${key} end_time ${hit.endTime ?? "?"} ≠ approved ${r.endTime}`);
      // Meta may move a past start to the moment of creation; it may not move it earlier, or days later.
      const gotStart = metaTimeEpoch(hit.startTime);
      if (wantStart === null || gotStart === null || gotStart < wantStart - TIME_SLACK_MS || gotStart > wantStart + START_TOLERANCE_MS) problems.push(`ad set ${key} start_time ${hit.startTime ?? "?"} ≠ approved ${r.startTime}`);
      budgetSum += Number(hit.dailyBudget ?? 0) || 0;
      adSetsByKey[key] = { id: hit.id, status: hit.status, effectiveStatus: hit.effectiveStatus, dailyBudget: hit.dailyBudget };
    }
    for (const key of r.adKeys) {
      const stored = refs.ads[key];
      if (!stored) {
        problems.push(`ad ${key} abhi bana nahi`);
        continue;
      }
      const hit = adsLive.find((a) => a.id === stored.id);
      if (!hit) {
        problems.push(`ad ${key} (${stored.id}) provider par nahi mila`);
        continue;
      }
      if (!nameCarriesChildTag(hit.name, marker, key)) problems.push(`ad ${key} ke naam me tag nahi`);
      if (!statusMatches(hit.status, exp.expect.ads)) problems.push(`ad ${key} status ${hit.status || "?"} ≠ ${exp.expect.ads}`);
      const parentSet = refs.adSets[stored.adSetKey];
      if (parentSet && hit.adSetId !== parentSet.id) problems.push(`ad ${key} ad set ${hit.adSetId} ≠ ${parentSet.id}`);
      const creative = refs.creatives[stored.creativeKey];
      if (creative && hit.creativeId !== creative.id) problems.push(`ad ${key} creative ${hit.creativeId ?? "?"} ≠ ${creative.id}`);
      const cr = hit.creativeId ? creativesById.get(hit.creativeId) : null;
      if (cr) {
        if (cr.pageId !== r.pageId) problems.push(`ad ${key} creative Page ${cr.pageId ?? "?"} ≠ ${r.pageId}`);
        if (!sameLink(cr.link, r.finalUrl)) problems.push(`ad ${key} destination approved URL nahi hai`);
        if (creative && cr.imageHash !== creative.imageHash) problems.push(`ad ${key} image hash approved media se alag`);
        const setUsesInstagram = (r.adSetTargets[stored.adSetKey]?.publisherPlatforms ?? []).includes("instagram");
        if (setUsesInstagram && cr.instagramUserId !== r.instagramActorId) problems.push(`ad ${key} Instagram identity ${cr.instagramUserId ?? "none"} ≠ ${r.instagramActorId ?? "none"}`);
        if (!setUsesInstagram && cr.instagramUserId) problems.push(`ad ${key} creative par Instagram identity ${cr.instagramUserId} hai jabki approved placement sirf Facebook hai`);
      } else if (hit.creativeId) {
        problems.push(`ad ${key} ka creative ${hit.creativeId} read-back me nahi mila`);
      }
      adsByKey[key] = { id: hit.id, status: hit.status, effectiveStatus: hit.effectiveStatus, reviewFeedback: hit.reviewFeedback, issues: hit.issues };
    }
  }
  for (const s of adSetsLive) if (s.name.includes(`[${marker}`) && !knownAdSetIds.has(s.id)) extras.push(`ad set ${s.id} "${s.name.slice(0, 40)}"`);
  for (const a of adsLive) if (a.name.includes(`[${marker}`) && !knownAdIds.has(a.id)) extras.push(`ad ${a.id} "${a.name.slice(0, 40)}"`);
  if (extras.length) problems.push(`marker wale extra objects jo approved hierarchy me nahi: ${extras.join(", ")}`);
  if (!r) problems.push("deployment par resolved spec nahi hai");

  const policyBits = adsLive.map((a) => a.reviewFeedback).filter((x): x is string => !!x);
  const policySummary = policyBits.length ? policyBits.join(" | ").slice(0, 300) : null;
  const readBack: MetaReadBack = {
    at: now.toISOString(),
    campaign: { status: c.status, effectiveStatus: c.effectiveStatus, configuredStatus: c.configuredStatus },
    adSets: adSetsByKey,
    ads: adsByKey,
    counts: { adSets: adSetsLive.length, creatives: tree.creatives.length, ads: adsLive.length },
    policySummary,
    dailyBudgetSumPaise: budgetSum,
    extras,
  };
  return { ok: problems.length === 0, problems, readBack, delivery: metaDeliveryOf(readBack) };
}

/** Ads Meta has refused or flagged — "No policy rejection requiring edit" before activation (§15). */
export function metaPolicyBlocks(rb: MetaReadBack): string[] {
  const out: string[] = [];
  for (const [key, ad] of Object.entries(rb.ads)) {
    const eff = (ad.effectiveStatus ?? "").toUpperCase();
    if (eff === "DISAPPROVED" || eff === "WITH_ISSUES") out.push(`ad ${key} ${eff}${ad.reviewFeedback ? ` — ${ad.reviewFeedback}` : ""}`);
  }
  return out;
}

// ============================================================
// Marker searches — the only answer to "did my write land?" (§14)
// ============================================================

export type MetaFind<T> = { kind: "none" } | { kind: "one"; object: T } | { kind: "many"; objects: T[] };

function decide<T extends { id: string }>(list: T[]): MetaFind<T> {
  if (list.length === 0) return { kind: "none" };
  if (list.length === 1) return { kind: "one", object: list[0] };
  return { kind: "many", objects: list };
}

export async function findMetaCampaign(provider: MetaAdsWriteProvider, marker: string): Promise<MetaFind<MetaObjectSummary>> {
  let found: MetaObjectSummary[];
  try {
    found = await provider.findCampaignsByMarker(marker);
  } catch (err) {
    throw normaliseMetaError(err, "read");
  }
  return decide(found.filter((c) => nameCarriesMarker(c.name, marker) && !GONE.has((c.status ?? "").toUpperCase())));
}

export async function findMetaAdSet(provider: MetaAdsWriteProvider, campaignId: string, marker: string, key: string): Promise<MetaFind<MetaObjectSummary>> {
  let found: MetaObjectSummary[];
  try {
    found = await provider.findAdSetsByMarker(campaignId, marker);
  } catch (err) {
    throw normaliseMetaError(err, "read");
  }
  return decide(found.filter((s) => nameCarriesChildTag(s.name, marker, key) && !GONE.has((s.status ?? "").toUpperCase())));
}

/**
 * A creative with the right tag but a different image, destination, Page or
 * Instagram identity is not ours to attach (§14 "verify Page/image/destination")
 * — it comes back as `many` with `mismatched` named, which the caller stops on.
 */
export async function findMetaCreative(
  provider: MetaAdsWriteProvider,
  marker: string,
  key: string,
  expect: { imageHash: string; link: string; pageId: string; instagramUserId: string | null },
): Promise<MetaFind<MetaCreativeSummary> & { mismatched?: string[] }> {
  let found: MetaCreativeSummary[];
  try {
    found = await provider.findCreativesByMarker(marker);
  } catch (err) {
    throw normaliseMetaError(err, "read");
  }
  const tagged = found.filter((c) => nameCarriesChildTag(c.name, marker, key) && !GONE.has((c.status ?? "").toUpperCase()));
  const mismatched = tagged.filter((c) => c.imageHash !== expect.imageHash || !sameLink(c.link, expect.link) || c.pageId !== expect.pageId || (c.instagramUserId ?? null) !== expect.instagramUserId).map((c) => c.id);
  if (mismatched.length) return { kind: "many", objects: tagged, mismatched };
  return decide(tagged);
}

export async function findMetaAd(provider: MetaAdsWriteProvider, adSetId: string, marker: string, key: string): Promise<MetaFind<MetaObjectSummary & { creativeId: string | null }>> {
  let found: Array<MetaObjectSummary & { creativeId: string | null }>;
  try {
    found = await provider.findAdsByMarker(adSetId, marker);
  } catch (err) {
    throw normaliseMetaError(err, "read");
  }
  return decide(found.filter((a) => nameCarriesChildTag(a.name, marker, key) && !GONE.has((a.status ?? "").toUpperCase())));
}
