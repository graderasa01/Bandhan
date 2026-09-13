import { z } from "zod";
import {
  ACTIVATE_EXECUTION_EFFECT,
  CREATE_EXECUTION_EFFECT,
  META_ACTIVATE_EXECUTION_EFFECT,
  META_ACTIVATION_ORDER,
  META_CREATE_EXECUTION_EFFECT,
  META_ROLLBACK_EFFECT,
} from "./marketingExecution";

/**
 * Typed approval payloads for the two spend boundaries (doc 13 §7, doc 14
 * §7.1). A card's payload is no longer free-form JSON: the executor parses
 * it through these schemas before touching a provider, so a card that was
 * built for one deployment, one platform and one phase can only ever
 * authorise exactly that.
 *
 * The schemas are **platform-discriminated** (doc 14 Gap D): a Google card
 * carries Google fields (conversion action, bidding strategy, micros
 * read-back) and a Meta card carries Meta fields (Page/Instagram identity,
 * resolved audience, creative media ids, child object ids). The parser
 * chooses by `action + platform`, and every schema is `.strict()`, so a
 * Meta payload with a Google-only field — or the reverse — is not a card.
 *
 * Money is in **paise** here (integer). INR's minor unit is the paisa, which
 * is also what Meta's `daily_budget` takes for an INR account; Google's
 * micros are derived from integer paise with integer arithmetic (§10).
 *
 * Backward compatibility: the Google schemas are the MKT-2A shapes with the
 * platform literal narrowed, so every pending Google card written before
 * MKT-2B still parses and still hashes the same.
 */

// ============================================================
// Google Search (MKT-2A shapes, platform narrowed)
// ============================================================

export const GoogleCreatePausedPayloadSchema = z
  .object({
    action: z.literal("CREATE_PAUSED_CAMPAIGNS"),
    platform: z.literal("GOOGLE_SEARCH"),
    taskId: z.string().min(1),
    draftId: z.string().min(1),
    deploymentId: z.string().min(1),
    goalId: z.string().min(1),
    accountRef: z.string().min(1),
    accountDisplayName: z.string(),
    campaignName: z.string().min(1),
    /** The provider-facing name, marker included. */
    providerCampaignName: z.string().min(1),
    executionMarker: z.string().min(1),
    specHash: z.string().length(64),
    currency: z.string().length(3),
    dailyBudgetPaise: z.number().int().positive(),
    /** Daily × window — the most this campaign can spend inside its dates. */
    maxSpendPaise: z.number().int().positive(),
    /** The goal's admin caps, for the card. */
    goalDailyCapPaise: z.number().int().positive().nullable(),
    goalTotalCapPaise: z.number().int().positive().nullable(),
    /** Null = "the day the campaign is created" (§11.2: dates are settled at creation, shown on the activation card). */
    startAt: z.string().nullable(),
    endAt: z.string().nullable(),
    windowDays: z.number().int().positive(),
    audienceSummary: z.string(),
    landingUrls: z.array(z.string().url()).min(1),
    conversionAction: z.string().min(1),
    biddingStrategy: z.string().min(1),
    creativeAssetIds: z.array(z.string()),
    /** Package parts this release deliberately does not create — named, not dropped (§11.2). */
    deferred: z.array(z.string()),
    executionEffect: z.literal(CREATE_EXECUTION_EFFECT),
  })
  .strict();
export type GoogleCreatePausedPayload = z.infer<typeof GoogleCreatePausedPayloadSchema>;

export const GoogleActivatePayloadSchema = z
  .object({
    action: z.literal("ACTIVATE_CAMPAIGNS"),
    platform: z.literal("GOOGLE_SEARCH"),
    taskId: z.string().min(1),
    draftId: z.string().min(1),
    deploymentId: z.string().min(1),
    goalId: z.string().min(1),
    /** The provider resource name of the campaign — what activation will flip and nothing else. */
    externalCampaignRef: z.string().min(1),
    externalCampaignId: z.string().min(1),
    verifiedExternalStatus: z.literal("PAUSED"),
    pausedVerifiedAt: z.string().min(1),
    accountRef: z.string().min(1),
    accountDisplayName: z.string(),
    campaignName: z.string().min(1),
    providerCampaignName: z.string().min(1),
    executionMarker: z.string().min(1),
    specHash: z.string().length(64),
    currency: z.string().length(3),
    dailyBudgetPaise: z.number().int().positive(),
    /** What read-back saw on the provider — must equal `dailyBudgetPaise` or the card is never made. */
    verifiedBudgetMicros: z.number().int().positive(),
    maxSpendPaise: z.number().int().positive(),
    goalDailyCapPaise: z.number().int().positive().nullable(),
    goalTotalCapPaise: z.number().int().positive().nullable(),
    startAt: z.string().min(1),
    endAt: z.string().min(1),
    timeZone: z.string().min(1),
    audienceSummary: z.string(),
    landingUrls: z.array(z.string().url()).min(1),
    conversionAction: z.string().min(1),
    biddingStrategy: z.string().min(1),
    externalCounts: z.object({ adGroups: z.number().int(), keywords: z.number().int(), ads: z.number().int() }),
    activationEffect: z.literal(ACTIVATE_EXECUTION_EFFECT),
  })
  .strict();
export type GoogleActivatePayload = z.infer<typeof GoogleActivatePayloadSchema>;

/** MKT-2A names, kept so existing imports and the check scripts read unchanged. */
export const CreatePausedPayloadSchema = GoogleCreatePausedPayloadSchema;
export const ActivatePayloadSchema = GoogleActivatePayloadSchema;
export type CreatePausedPayload = GoogleCreatePausedPayload;
export type ActivatePayload = GoogleActivatePayload;

// ============================================================
// Meta (doc 14 §7.1)
// ============================================================

const SpecialAdCategorySchema = z.enum(["NONE", "CREDIT", "EMPLOYMENT", "HOUSING", "ISSUES_ELECTIONS_POLITICS", "FINANCIAL_PRODUCTS_SERVICES"]);

export const MetaCreatePausedPayloadSchema = z
  .object({
    action: z.literal("CREATE_PAUSED_CAMPAIGNS"),
    platform: z.literal("META"),
    taskId: z.string().min(1),
    draftId: z.string().min(1),
    deploymentId: z.string().min(1),
    goalId: z.string().min(1),
    /** `act_<id>` — the one ad account this card authorises. */
    accountRef: z.string().min(1),
    accountDisplayName: z.string(),
    pageId: z.string().min(1),
    /** Null when no Instagram placement is in the package. */
    instagramActorId: z.string().min(1).nullable(),
    campaignName: z.string().min(1),
    providerCampaignName: z.string().min(1),
    executionMarker: z.string().min(1),
    specHash: z.string().length(64),
    currency: z.string().length(3),
    objective: z.string().min(1),
    /** Sum of the executable ad sets' daily budgets — never above the draft's approved daily budget. */
    dailyBudgetPaise: z.number().int().positive(),
    maxSpendPaise: z.number().int().positive(),
    goalDailyCapPaise: z.number().int().positive().nullable(),
    goalTotalCapPaise: z.number().int().positive().nullable(),
    /** Package schedule (YYYY-MM-DD, account timezone) — Meta ad sets carry explicit start/end, so these are exact at card time. */
    startAt: z.string().min(1),
    endAt: z.string().min(1),
    timeZone: z.string().min(1),
    resolvedAudienceSummary: z.string(),
    resolvedPlacementSummary: z.string(),
    landingUrls: z.array(z.string().url()).min(1),
    /** `MarketingCreativeMedia` ids — the actual approved images, one per executable ad. */
    creativeMediaIds: z.array(z.string().min(1)).min(1),
    creativePreviewUrls: z.array(z.string().url()).min(1),
    /** Stable local child keys the mapper will create, so the card lists exactly what will exist. */
    adSetKeys: z.array(z.string().min(1)).min(1),
    adKeys: z.array(z.string().min(1)).min(1),
    specialAdCategories: z.array(SpecialAdCategorySchema),
    specialAdCategoryCountry: z.string().length(2).nullable(),
    /** Package rules this release does not implement — named on the card, never silently applied (frequency cap, stop-loss, exclusions). */
    deferredRules: z.array(z.string()),
    executionEffect: z.literal(META_CREATE_EXECUTION_EFFECT),
  })
  .strict();
export type MetaCreatePausedPayload = z.infer<typeof MetaCreatePausedPayloadSchema>;

export const MetaActivatePayloadSchema = z
  .object({
    action: z.literal("ACTIVATE_CAMPAIGNS"),
    platform: z.literal("META"),
    taskId: z.string().min(1),
    draftId: z.string().min(1),
    deploymentId: z.string().min(1),
    goalId: z.string().min(1),
    accountRef: z.string().min(1),
    accountDisplayName: z.string(),
    campaignId: z.string().min(1),
    adSetIds: z.array(z.string().min(1)).min(1),
    creativeIds: z.array(z.string().min(1)).min(1),
    adIds: z.array(z.string().min(1)).min(1),
    verifiedConfiguredStatus: z.literal("PAUSED"),
    pausedVerifiedAt: z.string().min(1),
    campaignName: z.string().min(1),
    providerCampaignName: z.string().min(1),
    executionMarker: z.string().min(1),
    specHash: z.string().length(64),
    currency: z.string().length(3),
    dailyBudgetPaise: z.number().int().positive(),
    /** Sum of the ad sets' `daily_budget` as read back — must equal `dailyBudgetPaise` or the card is never made. */
    verifiedDailyBudgetPaise: z.number().int().positive(),
    maxSpendPaise: z.number().int().positive(),
    goalDailyCapPaise: z.number().int().positive().nullable(),
    goalTotalCapPaise: z.number().int().positive().nullable(),
    objective: z.string().min(1),
    startAt: z.string().min(1),
    endAt: z.string().min(1),
    timeZone: z.string().min(1),
    resolvedAudienceSummary: z.string(),
    landingUrls: z.array(z.string().url()).min(1),
    pageId: z.string().min(1),
    instagramActorId: z.string().min(1).nullable(),
    creativeCount: z.number().int().positive(),
    activationOrder: z.literal(META_ACTIVATION_ORDER),
    rollbackEffect: z.literal(META_ROLLBACK_EFFECT),
    activationEffect: z.literal(META_ACTIVATE_EXECUTION_EFFECT),
  })
  .strict();
export type MetaActivatePayload = z.infer<typeof MetaActivatePayloadSchema>;

// ============================================================
// Parsing — by action + platform, never by "whatever fits"
// ============================================================

export type CreatePausedWritePayload = GoogleCreatePausedPayload | MetaCreatePausedPayload;
export type ActivateWritePayload = GoogleActivatePayload | MetaActivatePayload;
export type WriteApprovalPayload = CreatePausedWritePayload | ActivateWritePayload;

function discriminator(raw: unknown): { action: string; platform: string } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.action !== "string" || typeof r.platform !== "string") return null;
  return { action: r.action, platform: r.platform };
}

/** The exact schema for this action on this platform, or null when the pair is not a write card. */
export function writePayloadSchemaFor(action: string, platform: string): z.ZodTypeAny | null {
  if (action === "CREATE_PAUSED_CAMPAIGNS") {
    if (platform === "GOOGLE_SEARCH") return GoogleCreatePausedPayloadSchema;
    if (platform === "META") return MetaCreatePausedPayloadSchema;
    return null;
  }
  if (action === "ACTIVATE_CAMPAIGNS") {
    if (platform === "GOOGLE_SEARCH") return GoogleActivatePayloadSchema;
    if (platform === "META") return MetaActivatePayloadSchema;
    return null;
  }
  return null;
}

/** Parses a create card by its platform; null when it is not a strict match for that platform's schema. */
export function parseCreatePausedPayload(raw: unknown): CreatePausedWritePayload | null {
  const d = discriminator(raw);
  if (!d || d.action !== "CREATE_PAUSED_CAMPAIGNS") return null;
  const schema = writePayloadSchemaFor(d.action, d.platform);
  if (!schema) return null;
  const parsed = schema.safeParse(raw);
  return parsed.success ? (parsed.data as CreatePausedWritePayload) : null;
}

export function parseActivatePayload(raw: unknown): ActivateWritePayload | null {
  const d = discriminator(raw);
  if (!d || d.action !== "ACTIVATE_CAMPAIGNS") return null;
  const schema = writePayloadSchemaFor(d.action, d.platform);
  if (!schema) return null;
  const parsed = schema.safeParse(raw);
  return parsed.success ? (parsed.data as ActivateWritePayload) : null;
}

/** Parses either write payload; null when the JSON is not one of them (or is an MKT-1 package payload). */
export function parseWriteApprovalPayload(raw: unknown): WriteApprovalPayload | null {
  return parseCreatePausedPayload(raw) ?? parseActivatePayload(raw);
}
