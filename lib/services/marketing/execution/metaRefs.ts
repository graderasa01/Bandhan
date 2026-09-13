import { z } from "zod";
import type { DeliverySnapshot } from "@/lib/contracts/marketingExecution";
import type { CampaignDeployment } from "@prisma/client";

/**
 * `CampaignDeployment.externalRefs` for a Meta row — strict (doc 14 §7.2).
 * Google keeps its own shape in `deploymentService.refsOf`; a Meta row's
 * JSON passes through this schema before every use. Children are keyed by
 * their stable local key (`AS01`, `CR01`, `AD01`), never by position.
 *
 * Malformed or legacy JSON does not crash a worker: `metaRefsOf` returns a
 * typed failure the caller turns into a configuration error for human
 * review. An absent value is the empty, well-formed start state.
 */

const IdName = z.object({ id: z.string().min(1), name: z.string() }).strict();

/**
 * One ad set's approved audience and placements, in the normalised form both
 * sides of a comparison are reduced to (`normaliseTargeting` in
 * `metaReconcile.ts`): sorted keys and ids, no Meta-added extras.
 */
export const MetaTargetExpectationSchema = z
  .object({
    geoKeys: z.array(z.string()),
    ageMin: z.number().int(),
    ageMax: z.number().int(),
    /** Empty = all genders. */
    genders: z.array(z.number().int()),
    interestIds: z.array(z.string()),
    publisherPlatforms: z.array(z.string()),
    facebookPositions: z.array(z.string()),
    instagramPositions: z.array(z.string()),
  })
  .strict();
export type MetaTargetExpectation = z.infer<typeof MetaTargetExpectationSchema>;

export const MetaResolvedSchema = z
  .object({
    pageId: z.string().min(1),
    instagramActorId: z.string().min(1).nullable(),
    finalUrl: z.string().url(),
    timeZone: z.string().min(1),
    startDate: z.string().min(1),
    endDate: z.string().min(1),
    /** The exact `start_time` / `end_time` the ad sets were created with (account-timezone offset). */
    startTime: z.string().min(1),
    endTime: z.string().min(1),
    currency: z.string().length(3),
    objective: z.string().min(1),
    optimizationGoal: z.string().min(1),
    billingEvent: z.string().min(1),
    destinationType: z.string().min(1),
    providerCampaignName: z.string().min(1),
    specialAdCategories: z.array(z.string()),
    locations: z.record(z.string(), z.object({ key: z.string(), name: z.string(), type: z.string() }).strict()),
    interests: z.record(z.string(), z.object({ id: z.string(), name: z.string() }).strict()),
    /** The intended hierarchy — what "complete" means at verify time. */
    adSetKeys: z.array(z.string().min(1)).min(1),
    creativeKeys: z.array(z.string().min(1)).min(1),
    adKeys: z.array(z.string().min(1)).min(1),
    /** ad key → ad set key / creative key; creative key → media id. */
    adParents: z.record(z.string(), z.object({ adSetKey: z.string(), creativeKey: z.string() }).strict()),
    creativeMedia: z.record(z.string(), z.string()),
    adSetBudgetsPaise: z.record(z.string(), z.number().int().positive()),
    adSetBudgetSumPaise: z.number().int().positive(),
    adSetTargets: z.record(z.string(), MetaTargetExpectationSchema),
    audienceSummary: z.string(),
    placementSummary: z.string(),
    accountName: z.string().nullable(),
    /** Graph API version the resolution and every write of this deployment used (doc 14 §12, §24). */
    apiVersion: z.string().min(1),
    resolvedAt: z.string().min(1),
  })
  .strict();
export type MetaResolved = z.infer<typeof MetaResolvedSchema>;

export const MetaReadBackSchema = z
  .object({
    at: z.string(),
    campaign: z.object({ status: z.string(), effectiveStatus: z.string().nullable(), configuredStatus: z.string().nullable() }).strict(),
    adSets: z.record(z.string(), z.object({ id: z.string(), status: z.string(), effectiveStatus: z.string().nullable(), dailyBudget: z.string().nullable() }).strict()),
    ads: z.record(z.string(), z.object({ id: z.string(), status: z.string(), effectiveStatus: z.string().nullable(), reviewFeedback: z.string().nullable(), issues: z.array(z.string()) }).strict()),
    counts: z.object({ adSets: z.number().int(), creatives: z.number().int(), ads: z.number().int() }).strict(),
    policySummary: z.string().nullable(),
    dailyBudgetSumPaise: z.number().int(),
    /** Anything on the provider with our marker that is not in the intended hierarchy. */
    extras: z.array(z.string()),
  })
  .strict();
export type MetaReadBack = z.infer<typeof MetaReadBackSchema>;

export const MetaActivationSchema = z
  .object({
    adsEnabledAt: z.string().nullable(),
    adSetsEnabledAt: z.string().nullable(),
    campaignEnabledAt: z.string().nullable(),
    rolledBackAt: z.string().nullable(),
    rollbackReason: z.string().nullable(),
  })
  .strict();
export type MetaActivation = z.infer<typeof MetaActivationSchema>;

export const MetaExternalRefsSchema = z
  .object({
    platform: z.literal("META"),
    adAccountId: z.string(),
    campaignId: z.string().min(1).nullable(),
    campaignName: z.string().nullable(),
    adSets: z.record(z.string(), IdName),
    creatives: z.record(z.string(), IdName.extend({ mediaId: z.string(), imageHash: z.string() }).strict()),
    ads: z.record(z.string(), IdName.extend({ adSetKey: z.string(), creativeKey: z.string() }).strict()),
    media: z.record(z.string(), z.object({ imageHash: z.string(), url: z.string().nullable() }).strict()),
    resolved: MetaResolvedSchema.nullable(),
    readBack: MetaReadBackSchema.nullable(),
    activation: MetaActivationSchema.nullable(),
  })
  .strict();
export type MetaExternalRefs = z.infer<typeof MetaExternalRefsSchema>;

export function emptyMetaRefs(adAccountId: string): MetaExternalRefs {
  return { platform: "META", adAccountId, campaignId: null, campaignName: null, adSets: {}, creatives: {}, ads: {}, media: {}, resolved: null, readBack: null, activation: null };
}

export function emptyMetaActivation(): MetaActivation {
  return { adsEnabledAt: null, adSetsEnabledAt: null, campaignEnabledAt: null, rolledBackAt: null, rollbackReason: null };
}

export type MetaRefsParse = { ok: true; refs: MetaExternalRefs } | { ok: false; reason: string };

/** Strict parse of a Meta deployment's stored refs; an empty column is the empty state. */
export function metaRefsOf(dep: Pick<CampaignDeployment, "externalRefs" | "accountRef">): MetaRefsParse {
  const raw = dep.externalRefs;
  if (raw === null || raw === undefined) return { ok: true, refs: emptyMetaRefs(dep.accountRef ?? "") };
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, reason: "externalRefs JSON object nahi hai" };
  if (Object.keys(raw as object).length === 0) return { ok: true, refs: emptyMetaRefs(dep.accountRef ?? "") };
  const parsed = MetaExternalRefsSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, reason: `externalRefs ${issue ? `${issue.path.join(".")}: ${issue.message}` : "schema mismatch"}` };
  }
  return { ok: true, refs: parsed.data };
}

/** The Meta hierarchy is complete when every intended key has a stored id. */
export function metaHierarchyComplete(refs: MetaExternalRefs): boolean {
  const r = refs.resolved;
  if (!r || !refs.campaignId) return false;
  const mediaIds = [...new Set(Object.values(r.creativeMedia))];
  return r.adSetKeys.every((k) => !!refs.adSets[k]) && mediaIds.every((m) => !!refs.media[m]) && r.creativeKeys.every((k) => !!refs.creatives[k]) && r.adKeys.every((k) => !!refs.ads[k]);
}

/** The intended keys that have no stored id yet, named for an admin ("AS02, CR01"). */
export function metaMissingKeys(refs: MetaExternalRefs): string[] {
  const r = refs.resolved;
  if (!r) return ["resolution"];
  const missing: string[] = [];
  if (!refs.campaignId) missing.push("campaign");
  for (const k of r.adSetKeys) if (!refs.adSets[k]) missing.push(k);
  for (const m of [...new Set(Object.values(r.creativeMedia))]) if (!refs.media[m]) missing.push(`image ${m.slice(0, 8)}`);
  for (const k of r.creativeKeys) if (!refs.creatives[k]) missing.push(k);
  for (const k of r.adKeys) if (!refs.ads[k]) missing.push(k);
  return missing;
}

/** Which checkpoint the stored refs justify (doc 14 §13) — derived, never trusted from the column alone. */
export function metaCheckpointOf(refs: MetaExternalRefs): "PREFLIGHT_OK" | "CAMPAIGN_CREATED_PAUSED" | "ADSETS_CREATED_PAUSED" | "MEDIA_READY" | "CREATIVES_CREATED" | "ADS_CREATED_PAUSED" | "TREE_VERIFIED_PAUSED" | "NONE" {
  const r = refs.resolved;
  if (!r) return "NONE";
  if (!refs.campaignId) return "PREFLIGHT_OK";
  if (!r.adSetKeys.every((k) => !!refs.adSets[k])) return "CAMPAIGN_CREATED_PAUSED";
  const mediaIds = [...new Set(Object.values(r.creativeMedia))];
  if (!mediaIds.every((m) => !!refs.media[m])) return "ADSETS_CREATED_PAUSED";
  if (!r.creativeKeys.every((k) => !!refs.creatives[k])) return "MEDIA_READY";
  if (!r.adKeys.every((k) => !!refs.ads[k])) return "CREATIVES_CREATED";
  if (!refs.readBack) return "ADS_CREATED_PAUSED";
  return "TREE_VERIFIED_PAUSED";
}

function statusTally(list: string[]): string | null {
  if (!list.length) return null;
  const counts = new Map<string, number>();
  for (const s of list) counts.set(s || "UNKNOWN", (counts.get(s || "UNKNOWN") ?? 0) + 1);
  return [...counts.entries()].map(([s, n]) => (n > 1 ? `${s}×${n}` : s)).join(", ");
}

/**
 * Configured versus Meta's own review/delivery words (doc 14 Gap C, §7.4).
 * `deliveryStatus` is "ACTIVE" only when the campaign is effectively ACTIVE
 * *and* at least one intended ad is — a campaign whose ads are all still in
 * review is activated, not delivering.
 */
export function metaDeliveryOf(rb: MetaReadBack): DeliverySnapshot {
  const adStatuses = Object.values(rb.ads).map((a) => (a.effectiveStatus ?? a.status ?? "").toUpperCase());
  const campaignEffective = (rb.campaign.effectiveStatus ?? "").toUpperCase();
  const delivering = campaignEffective === "ACTIVE" && adStatuses.includes("ACTIVE");
  return {
    configuredStatus: rb.campaign.configuredStatus ?? rb.campaign.status,
    effectiveStatus: rb.campaign.effectiveStatus,
    deliveryStatus: delivering ? "ACTIVE" : adStatuses.length ? `ads ${statusTally(adStatuses)}` : rb.campaign.effectiveStatus,
    policyStatus: rb.policySummary,
    issues: Object.values(rb.ads)
      .flatMap((a) => a.issues)
      .slice(0, 5),
    snapshotAt: rb.at,
  };
}
