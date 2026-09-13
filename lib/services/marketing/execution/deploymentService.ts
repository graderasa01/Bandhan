import "server-only";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/prisma";
import type { ApprovalPreview } from "@/lib/contracts/marketingAi";
import {
  ACTIVE_DEPLOYMENT_STATUSES,
  CREATE_EXECUTION_EFFECT,
  DEPLOYMENT_STATUS_META,
  DEPLOYMENT_STEP_LABEL,
  EXECUTABLE_PLATFORMS,
  GOOGLE_STEP_ORDER,
  META_CREATE_EXECUTION_EFFECT,
  META_STEP_ORDER,
  PLATFORM_LABEL,
  deliveryLabel,
  type DeliverySnapshot,
  type DeploymentActionKey,
  type DeploymentRow,
  type DeploymentStatusKey,
  type DeploymentStepKey,
  type DeploymentStepState,
  type DeploymentSummary,
  type MetaDeploymentFacts,
  type SafeExecutionError,
} from "@/lib/contracts/marketingExecution";
import { GoogleCreatePausedPayloadSchema, MetaCreatePausedPayloadSchema, type GoogleCreatePausedPayload, type MetaCreatePausedPayload } from "@/lib/contracts/marketingExecutionPayloads";
import { executableWriteTool } from "@/lib/marketing/tools/registry";
import { ExecutionError, isExecutionError } from "./executionErrors";
import { hashPayload, specHashOf } from "./hashing";
import { executionMarkerOf, idempotencyKeyOf } from "./idempotency";
import { googleReadiness, type GoogleReadiness } from "./preflight";
import { metaReadiness, type MetaReadiness } from "./metaPreflight";
import { metaCheckpointOf, metaDeliveryOf, metaRefsOf, type MetaExternalRefs } from "./metaRefs";
import { META_OBJECTIVE_MATRIX } from "@/lib/marketing/mappers/metaCampaignMapper";
import type { CampaignDeployment, CampaignDraft, MarketingApproval, MarketingGoal, MarketingTask, Prisma, Role } from "@prisma/client";

/**
 * The deployment row's owner (doc 13 §6, §8, §15; doc 14 §17). Everything
 * that changes `CampaignDeployment` goes through here, so the state machine
 * has one author:
 *
 *   • `prepareDeploymentsForTask` — after APPROVE_PACKAGE: one row per
 *     approved draft, a non-writing readiness check per platform, and a
 *     platform-specific CREATE_PAUSED card only when ready (never a fake
 *     card for a blocked platform).
 *   • the worker primitives — claim (conditional update = lease), guarded
 *     transitions, terminal failure with a safe error, events.
 *   • `refreshTaskStatus` — the task row tells the queue the per-platform
 *     truth without hiding it (Google activated + Meta blocked is two
 *     badges, not one).
 *   • the read side — `DeploymentRow`s for the detail sheet, never a token,
 *     never a raw provider payload; configured status and the provider's
 *     delivery/policy words kept apart (doc 14 Gap C).
 *
 * Provider-specific readiness and card copy dispatch on `draft.platform`;
 * the shared shape (row, lease, events, task line) is written once.
 */

export const LEASE_MS = 10 * 60 * 1000;
/** A provider must have had this long to commit before "nothing found" means "nothing was created" (§9.2). */
export const RECONCILE_GRACE_MS = 60 * 1000;
export const APPROVAL_TTL_DAYS = 7;
const PAISE = 100;

export type DeploymentWithRelations = CampaignDeployment & {
  draft: CampaignDraft;
  task: MarketingTask & { goal: MarketingGoal | null };
  createApproval: MarketingApproval | null;
  activateApproval: MarketingApproval | null;
};

export const DEPLOYMENT_INCLUDE = {
  draft: true,
  task: { include: { goal: true } },
  createApproval: true,
  activateApproval: true,
} as const;

export async function loadDeployment(id: string): Promise<DeploymentWithRelations | null> {
  return prisma.campaignDeployment.findUnique({ where: { id }, include: DEPLOYMENT_INCLUDE });
}

// ============================================================
// externalRefs shape — Google (Meta's strict shape lives in metaRefs.ts)
// ============================================================

export interface GoogleExternalRefs {
  customerId: string;
  campaign: string | null;
  campaignId: string | null;
  budget: string | null;
  adGroups: string[];
  keywords: string[];
  campaignCriteria: string[];
  ads: string[];
  resolved: {
    geo: { resourceName: string; name: string }[];
    languages: { resourceName: string; name: string }[];
    conversionAction: { resourceName: string; name: string } | null;
    startDate: string;
    endDate: string;
    timeZone: string;
    finalUrl: string;
    providerCampaignName: string;
    budgetMicros: string;
    isTestAccount: boolean;
  } | null;
  readBack: {
    at: string;
    status: string;
    budgetMicros: string | null;
    startDate: string | null;
    endDate: string | null;
    adGroups: number;
    keywords: number;
    ads: number;
    servingStatus: string | null;
    primaryStatus: string | null;
    /** Absent on rows written before MKT-2B. */
    adApprovalStatuses?: string[];
  } | null;
}

export function refsOf(dep: CampaignDeployment): GoogleExternalRefs {
  const raw = dep.externalRefs;
  const base: GoogleExternalRefs = { customerId: dep.accountRef ?? "", campaign: null, campaignId: null, budget: null, adGroups: [], keywords: [], campaignCriteria: [], ads: [], resolved: null, readBack: null };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  return { ...base, ...(raw as Partial<GoogleExternalRefs>) };
}

/** "Does this row own provider objects?" — the one question both platforms answer for the read side. */
export function hasExternalObjects(dep: CampaignDeployment): boolean {
  if (dep.platform === "META") {
    const parsed = metaRefsOf(dep);
    return parsed.ok ? !!parsed.refs.campaignId : true; // malformed refs: assume objects may exist
  }
  return !!refsOf(dep).campaign;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

// ============================================================
// Events
// ============================================================

export async function recordEvent(deploymentId: string, step: string, level: "info" | "ok" | "error", message: string, requestId: string | null = null): Promise<void> {
  try {
    await prisma.marketingExecutionEvent.create({ data: { deploymentId, step, level, message: message.slice(0, 500), requestId } });
  } catch (e) {
    console.error("[marketing:deployment] event write failed:", e instanceof Error ? e.message : String(e));
  }
}

// ============================================================
// After APPROVE_PACKAGE — rows, readiness, cards (§15)
// ============================================================

export interface PrepareResult {
  deployments: { id: string; platform: "GOOGLE_SEARCH" | "META"; status: DeploymentStatusKey; approvalId: string | null }[];
}

/** Statuses from which a fresh readiness check may (re)issue a create card — only before anything external exists. */
const RECHECKABLE: ReadonlySet<DeploymentStatusKey> = new Set<DeploymentStatusKey>(["BLOCKED_CONFIG", "BLOCKED_CREATIVE", "CANCELLED", "FAILED_RETRYABLE", "CREATE_PENDING"]);

export async function prepareDeploymentsForTask(params: { taskId: string; actor: { id: string; role: Role }; now?: Date }): Promise<PrepareResult> {
  const now = params.now ?? new Date();
  const task = await prisma.marketingTask.findUnique({ where: { id: params.taskId }, include: { goal: true, runs: { orderBy: { startedAt: "desc" } }, drafts: true, deployments: true } });
  if (!task) return { deployments: [] };
  const latestRunId = task.runs.find((r) => r.status === "SUCCEEDED")?.id ?? null;
  const approved = task.drafts.filter((d) => d.approvalStatus === "APPROVED" && (!latestRunId || d.runId === latestRunId));
  const out: PrepareResult["deployments"] = [];

  for (const draft of approved) {
    const existing = task.deployments.find((d) => d.draftId === draft.id) ?? null;
    const result = await ensureDeployment({ draft, task, existing, siblingDrafts: approved, actor: params.actor, now });
    out.push(result);
  }

  await refreshTaskStatus(task.id);
  return { deployments: out };
}

async function ensureDeployment(params: {
  draft: CampaignDraft;
  task: MarketingTask & { goal: MarketingGoal | null };
  existing: CampaignDeployment | null;
  siblingDrafts: CampaignDraft[];
  actor: { id: string; role: Role };
  now: Date;
}): Promise<PrepareResult["deployments"][number]> {
  const { draft, task, actor, now } = params;
  const specHash = specHashOf({ platform: draft.platform, spec: draft.spec, dailyBudgetPaise: draft.dailyBudgetPaise, totalBudgetPaise: draft.totalBudgetPaise });

  let dep = params.existing;
  if (!dep) {
    const id = randomUUID();
    dep = await prisma.campaignDeployment.create({
      data: {
        id,
        draftId: draft.id,
        taskId: task.id,
        platform: draft.platform,
        phase: "CREATE",
        status: "BLOCKED_CONFIG",
        specHash,
        idempotencyKey: idempotencyKeyOf({ platform: draft.platform, accountRef: null, draftId: draft.id, specHash, createApprovalId: null }),
        executionMarker: executionMarkerOf(id),
      },
    });
    await recordEvent(dep.id, "prepare", "info", `Deployment row bana (${PLATFORM_LABEL[draft.platform]}, marker ${dep.executionMarker}).`);
  } else if (!RECHECKABLE.has(dep.status) || hasExternalObjects(dep)) {
    // Anything past readiness — queued, created, live, failed-final — keeps its truth.
    return { id: dep.id, platform: dep.platform, status: dep.status, approvalId: dep.createApprovalId };
  }

  // A card that is still usable — pending, or approved with retries still
  // authorised — is the path; issuing a second card for the same draft would
  // be two authorisations for one execution.
  if (dep.createApprovalId) {
    const approval = await prisma.marketingApproval.findUnique({ where: { id: dep.createApprovalId } });
    const fresh = !!approval && approval.expiresAt > now;
    if (fresh && dep.status === "CREATE_PENDING" && approval!.status === "PENDING") {
      return { id: dep.id, platform: dep.platform, status: dep.status, approvalId: approval!.id };
    }
    if (fresh && approval!.status === "APPROVED" && (dep.status === "FAILED_RETRYABLE" || dep.status === "BLOCKED_CONFIG")) {
      return { id: dep.id, platform: dep.platform, status: dep.status, approvalId: approval!.id };
    }
  }

  // ---- platform without an executor — say so, no card (§15.6, doc 14 §17) ----
  if (!EXECUTABLE_PLATFORMS.has(draft.platform) || !executableWriteTool("CREATE_PAUSED_CAMPAIGNS", draft.platform)) {
    const err = new ExecutionError("NOT_EXECUTABLE_YET", `${PLATFORM_LABEL[draft.platform]} paused-create is release me executable nahi hai.`, {
      fix: "Doosre platform ka flow independently chalta hai.",
      status: "BLOCKED_CONFIG",
    });
    await prisma.campaignDeployment.update({ where: { id: dep.id }, data: { status: "BLOCKED_CONFIG", lastErrorCode: err.code, lastErrorMessage: err.message, lastErrorFix: err.fix } });
    return { id: dep.id, platform: dep.platform, status: "BLOCKED_CONFIG", approvalId: null };
  }

  // ---- readiness (no network), per platform ---------------------------------
  let card: { payload: GoogleCreatePausedPayload | MetaCreatePausedPayload; preview: ApprovalPreview; accountRef: string; accountLabel: string; currency: string; specHash: string; summary: string };
  try {
    card = draft.platform === "META" ? await metaCard(dep, draft, task, params.siblingDrafts, now) : await googleCard(dep, draft, task, params.siblingDrafts, now);
  } catch (err) {
    const e = isExecutionError(err) ? err : new ExecutionError("INTERNAL_ERROR", err instanceof Error ? err.message : String(err));
    const status: DeploymentStatusKey = e.status === "BLOCKED_CREATIVE" ? "BLOCKED_CREATIVE" : "BLOCKED_CONFIG";
    await prisma.campaignDeployment.update({
      where: { id: dep.id },
      data: { status, lastErrorCode: e.code, lastErrorMessage: e.message.slice(0, 500), lastErrorFix: e.fix },
    });
    await recordEvent(dep.id, "readiness", "error", `${e.code}: ${e.message}`);
    return { id: dep.id, platform: dep.platform, status, approvalId: null };
  }

  // ---- ready: card + row in one transaction (§7.3) --------------------------
  const approvalId = randomUUID();
  const idempotencyKey = idempotencyKeyOf({ platform: draft.platform, accountRef: card.accountRef, draftId: draft.id, specHash: card.specHash, createApprovalId: approvalId });

  await prisma.$transaction(async (tx) => {
    await tx.marketingApproval.updateMany({ where: { id: dep!.createApprovalId ?? "", status: "PENDING" }, data: { status: "EXPIRED" } });
    await tx.marketingApproval.create({
      data: {
        id: approvalId,
        taskId: task.id,
        action: "CREATE_PAUSED_CAMPAIGNS",
        payload: toJson(card.payload),
        payloadHash: hashPayload(card.payload),
        preview: toJson(card.preview),
        status: "PENDING",
        requestedBy: "growth-saathi",
        expiresAt: new Date(now.getTime() + APPROVAL_TTL_DAYS * 86_400_000),
      },
    });
    await tx.campaignDeployment.update({
      where: { id: dep!.id },
      data: {
        status: "CREATE_PENDING",
        phase: "CREATE",
        accountRef: card.accountRef,
        accountLabel: card.accountLabel || null,
        currency: card.currency,
        specHash: card.specHash,
        idempotencyKey,
        createApprovalId: approvalId,
        lastErrorCode: null,
        lastErrorMessage: null,
        lastErrorFix: null,
      },
    });
    await tx.adminAuditLog.create({
      data: {
        actorId: actor.id,
        actorRole: actor.role,
        actionType: "MARKETING_DEPLOYMENT_CARD_CREATED",
        targetType: "campaign_deployment",
        targetId: dep!.id,
        newValue: JSON.stringify({ approvalId, platform: draft.platform, specHash: card.specHash, marker: dep!.executionMarker }),
      },
    });
  });
  await recordEvent(dep.id, "readiness", "ok", `Ready — paused-create card bana (${card.summary}).`);
  return { id: dep.id, platform: dep.platform, status: "CREATE_PENDING", approvalId };
}

// ---- Google card ------------------------------------------------------------

async function googleCard(dep: CampaignDeployment, draft: CampaignDraft, task: MarketingTask & { goal: MarketingGoal | null }, siblingDrafts: CampaignDraft[], now: Date) {
  const readiness = await googleReadiness({ draft, goal: task.goal, siblingDrafts, marker: dep.executionMarker, now });
  const payload: GoogleCreatePausedPayload = {
    action: "CREATE_PAUSED_CAMPAIGNS",
    platform: "GOOGLE_SEARCH",
    taskId: task.id,
    draftId: draft.id,
    deploymentId: dep.id,
    goalId: task.goal?.id ?? draft.goalId ?? "",
    accountRef: readiness.accountRef,
    accountDisplayName: accountDisplay(readiness.accountLabel, readiness.accountRef),
    campaignName: readiness.spec.campaignName,
    providerCampaignName: readiness.providerCampaignName,
    executionMarker: dep.executionMarker,
    specHash: readiness.specHash,
    currency: readiness.currency,
    dailyBudgetPaise: readiness.dailyBudgetPaise,
    maxSpendPaise: readiness.maxSpendPaise,
    goalDailyCapPaise: readiness.goalDailyCapPaise,
    goalTotalCapPaise: readiness.goalTotalCapPaise,
    startAt: null,
    endAt: null,
    windowDays: readiness.windowDays,
    audienceSummary: `${readiness.spec.locations.join(", ")} · ${readiness.spec.language} · ${readiness.spec.network}`,
    landingUrls: [readiness.finalUrl],
    conversionAction: readiness.spec.conversionAction,
    biddingStrategy: readiness.spec.biddingStrategy,
    creativeAssetIds: [],
    deferred: readiness.deferred,
    executionEffect: CREATE_EXECUTION_EFFECT,
  };
  GoogleCreatePausedPayloadSchema.parse(payload);
  return {
    payload,
    preview: createCardPreview(payload, readiness),
    accountRef: readiness.accountRef,
    accountLabel: readiness.accountLabel,
    currency: readiness.currency,
    specHash: readiness.specHash,
    summary: `₹${readiness.dailyBudgetPaise / PAISE}/day, ${readiness.windowDays} din, max ₹${readiness.maxSpendPaise / PAISE}`,
  };
}

// ---- Meta card (doc 14 §7.1, §18) ----------------------------------------------

async function metaCard(dep: CampaignDeployment, draft: CampaignDraft, task: MarketingTask & { goal: MarketingGoal | null }, siblingDrafts: CampaignDraft[], now: Date) {
  const r = await metaReadiness({ draft, goal: task.goal, siblingDrafts, marker: dep.executionMarker, now });
  const mediaIds = [...new Set(r.dry.creatives.map((c) => c.mediaId))];
  const previewUrls = [...new Set(r.dry.creatives.map((c) => r.media[c.conceptId]?.url).filter((u): u is string => !!u))];
  const payload: MetaCreatePausedPayload = {
    action: "CREATE_PAUSED_CAMPAIGNS",
    platform: "META",
    taskId: task.id,
    draftId: draft.id,
    deploymentId: dep.id,
    goalId: task.goal?.id ?? draft.goalId ?? "",
    accountRef: r.accountRef,
    accountDisplayName: accountDisplay(r.accountLabel, r.accountRef),
    pageId: r.pageId,
    instagramActorId: r.instagramActorId,
    campaignName: r.spec.campaignName,
    providerCampaignName: r.providerCampaignName,
    executionMarker: dep.executionMarker,
    specHash: r.specHash,
    currency: r.currency,
    objective: r.spec.objective,
    dailyBudgetPaise: r.dry.summary.adSetBudgetSumPaise,
    maxSpendPaise: r.dry.summary.adSetBudgetSumPaise * r.windowDays,
    goalDailyCapPaise: r.goalDailyCapPaise,
    goalTotalCapPaise: r.goalTotalCapPaise,
    startAt: r.startDate,
    endAt: r.endDate,
    timeZone: r.timeZone,
    resolvedAudienceSummary: `${r.spec.audience.locations.join(", ")} · ${r.spec.audience.ageMin}-${r.spec.audience.ageMax} · ${r.spec.audience.genders.join("/")}${r.spec.audience.interests.length ? ` · interests: ${r.spec.audience.interests.join(", ")}` : " · broad"} (write se theek pehle har naam Meta par exact naam se ek hi ID me resolve hoga; exact match na mila ya ek se zyada mile to create ruk jaayega — koi guess nahi)`,
    resolvedPlacementSummary: r.dry.summary.placementSummary,
    landingUrls: [r.finalUrl],
    creativeMediaIds: mediaIds,
    creativePreviewUrls: previewUrls.map((u) => (u.startsWith("/") ? `${process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "https://bandhantak.com"}${u}` : u)),
    adSetKeys: r.dry.adSets.map((s) => s.key),
    adKeys: r.dry.ads.map((a) => a.key),
    specialAdCategories: (r.specialAdCategories.length ? r.specialAdCategories : ["NONE"]) as MetaCreatePausedPayload["specialAdCategories"],
    specialAdCategoryCountry: r.specialAdCategoryCountry,
    deferredRules: [...r.dry.deferred, ...r.dry.deferredRules],
    executionEffect: META_CREATE_EXECUTION_EFFECT,
  };
  MetaCreatePausedPayloadSchema.parse(payload);
  return {
    payload,
    preview: metaCreateCardPreview(payload, r),
    accountRef: r.accountRef,
    accountLabel: r.accountLabel,
    currency: r.currency,
    specHash: r.specHash,
    summary: `Meta ₹${payload.dailyBudgetPaise / PAISE}/day, ${r.dry.adSets.length} ad set / ${r.dry.ads.length} ad, ${r.startDate}→${r.endDate}, max ₹${payload.maxSpendPaise / PAISE}`,
  };
}

export function accountDisplay(label: string | null | undefined, ref: string | null | undefined): string {
  const suffix = ref ? `…${ref.slice(-4)}` : "";
  return label ? `${label} (${suffix})` : suffix || "—";
}

function rupees(paise: number | null): string {
  return paise === null ? "—" : `₹${Math.round(paise / PAISE).toLocaleString("en-IN")}`;
}

/** §13 — the Google create card. Every field is text so the card cannot hide a number. */
export function createCardPreview(p: GoogleCreatePausedPayload, r: GoogleReadiness): ApprovalPreview {
  const content = [
    `Campaign: "${p.providerCampaignName}" — PAUSED`,
    `${r.spec.adGroups.length} ad group · ${r.spec.adGroups.reduce((n, g) => n + g.keywords.length, 0)} keywords · ${r.spec.negativeKeywords.length} negatives · ${r.spec.adGroups.length} responsive search ad`,
    `Bidding: ${p.biddingStrategy}${r.spec.targetCpaRupees ? ` (target CPA ₹${r.spec.targetCpaRupees})` : ""} · conversion action "${p.conversionAction}" (account me ENABLED hona chahiye — preflight check karega)`,
    ...p.deferred.map((d) => `Deferred: ${d}`),
    ...r.warnings.map((w) => `Note: ${w}`),
  ];
  return {
    account: `Google Ads ${p.accountDisplayName} · ${p.currency}`,
    channel: "Google Search",
    audience: p.audienceSummary,
    contentPreview: content,
    destination: p.landingUrls.join(", "),
    startEnd: `Create hone ke din se ${p.windowDays} din (dates creation par settle hongi; activation card par exact dates dikhengi)`,
    dailyBudget: `${rupees(p.dailyBudgetPaise)}/day${p.goalDailyCapPaise !== null ? ` (goal cap ${rupees(p.goalDailyCapPaise)}/day)` : ""}`,
    totalBudget: `max ${rupees(p.maxSpendPaise)} (${p.windowDays} × ${rupees(p.dailyBudgetPaise)})${p.goalTotalCapPaise !== null ? ` · goal cap ${rupees(p.goalTotalCapPaise)}` : ""}`,
    conversionEvent: p.conversionAction,
    whatHappensNow: `Google Ads account ${p.accountDisplayName} par budget + campaign (PAUSED) + ad groups + keywords + ads ek atomic request me banenge; pehle validate-only, phir create. KOI SPEND NAHI — campaign paused rahega jab tak alag "Activate Google campaign" card approve na ho. Marker ${p.executionMarker} naam me rahega taaki retry kabhi duplicate na banaye.`,
    rollback: "Paused campaign Google Ads UI se kabhi bhi remove kar sakte hain; BandhanTak khud kuch delete nahi karta. Activation ke bina ek paisa nahi lagta.",
  };
}

/** Doc 14 §18 — the Meta create card: identity, permissions, creative, objective, resolved audience/placements, budgets, progress that will follow. */
export function metaCreateCardPreview(p: MetaCreatePausedPayload, r: MetaReadiness): ApprovalPreview {
  const sets = r.dry.adSets.map((s) => `Ad set ${s.key} "${s.name.replace(/\s*\[.*$/, "")}" — ${s.placements.join(" + ")} · ₹${s.dailyBudgetPaise / PAISE}/day · ${s.adKeys.length} ad — PAUSED`);
  const ads = r.dry.ads.map((a) => {
    const cr = r.dry.creatives.find((c) => c.key === a.creativeKey);
    const m = cr ? r.media[cr.conceptId] : null;
    return `Ad ${a.key} (creative ${a.creativeKey}) — image ${m ? `${m.width}×${m.height} APPROVED${m.productionReady ? "" : " (local disk — production me block)"}` : "?"} — PAUSED`;
  });
  const content = [
    `Campaign: "${p.providerCampaignName}" — ${p.objective} · ${r.dry.summary.optimizationGoal} / ${r.dry.summary.billingEvent} / ${r.dry.summary.destinationType} — PAUSED`,
    `Identity: Page ${r.pageName ? `"${r.pageName}" ` : ""}${p.pageId}${p.instagramActorId ? ` · Instagram ${r.instagramUsername ? `@${r.instagramUsername} ` : ""}${p.instagramActorId}` : " · Instagram: nahi (sirf Facebook Feed)"}`,
    `Permissions (last readiness check): read ${r.readPermission} · write ${r.writePermission} · access tier ${r.accessTier} (app-level, API se verify nahi hota)`,
    `Special ad categories: ${p.specialAdCategories.join(", ")}${p.specialAdCategoryCountry ? ` (${p.specialAdCategoryCountry})` : ""} — admin-configured`,
    ...sets,
    ...ads,
    ...p.deferredRules.map((d) => `Deferred: ${d}`),
    ...r.warnings.map((w) => `Note: ${w}`),
  ];
  return {
    account: `Meta Ads ${p.accountDisplayName} · ${p.currency}`,
    channel: `Meta — ${r.dry.summary.placementSummary || "feed"}`,
    audience: p.resolvedAudienceSummary,
    contentPreview: content,
    destination: p.landingUrls.join(", "),
    startEnd: `${p.startAt} → ${p.endAt} (${p.timeZone}) — ad sets par exact start/end time`,
    dailyBudget: `${rupees(p.dailyBudgetPaise)}/day (ad sets ka total; draft cap ${rupees(r.dailyBudgetPaise)})${p.goalDailyCapPaise !== null ? ` · goal cap ${rupees(p.goalDailyCapPaise)}/day` : ""}`,
    totalBudget: `max ${rupees(p.maxSpendPaise)} (${r.windowDays} × ${rupees(p.dailyBudgetPaise)})${p.goalTotalCapPaise !== null ? ` · goal cap ${rupees(p.goalTotalCapPaise)}` : ""}`,
    conversionEvent: r.conversion ? `pixel ${r.conversion.pixelId} · ${r.conversion.customEventType}` : "— (traffic objective; BandhanTak GA4/UTM se ginega)",
    whatHappensNow: `${META_CREATE_EXECUTION_EFFECT} Order: campaign → ad sets → image upload → creatives → ads, har step ke baad checkpoint; timeout par marker [${p.executionMarker}:key] se dhoondh kar attach, dobara create nahi. Write se theek pehle token/account/Page/IG/locations/interests dobara resolve honge; approved package se alag hue to ye card refuse hoga aur naya card banega. Sirf poori hierarchy read-back PAUSED milne par "Activate Meta campaign" ka alag card aayega.`,
    rollback: "Paused objects Ads Manager se kabhi bhi delete kar sakte hain; BandhanTak khud kuch delete nahi karta. Activation ke bina ek paisa nahi lagta.",
  };
}

// ============================================================
// Task status ← deployments (§15)
// ============================================================

const BLOCKING: ReadonlySet<DeploymentStatusKey> = new Set<DeploymentStatusKey>(["BLOCKED_CONFIG", "BLOCKED_CREATIVE", "FAILED_RETRYABLE", "FAILED_FINAL", "UNKNOWN_OUTCOME", "PARTIAL"]);

function stepText(d: CampaignDeployment): string {
  const label = PLATFORM_LABEL[d.platform];
  switch (d.status) {
    case "QUEUED":
      return `${label}: paused campaign banne ki queue me`;
    case "PREFLIGHT":
      return `${label}: preflight — account, spec, caps`;
    case "VALIDATING":
      return `${label}: provider validate-only (koi write nahi)`;
    case "CREATING":
      return d.platform === "META" ? `${label}: PAUSED hierarchy ban rahi hai (${d.checkpoint ?? "…"})` : `${label}: PAUSED campaign ban raha hai`;
    case "RECONCILING":
      return `${label}: provider se read-back`;
    case "ACTIVATION_QUEUED":
      return `${label}: activation queue me`;
    case "ACTIVATING":
      return d.platform === "META" ? `${label}: ads → ad sets → campaign activate ho rahe hain (${d.checkpoint ?? "…"})` : `${label}: campaign ENABLE ho raha hai`;
    default:
      return `${label}: ${DEPLOYMENT_STATUS_META[d.status].label}`;
  }
}

/**
 * The queue's one line must not hide multi-platform truth. Priority:
 * running > card pending > blocked > activated > done. A row that is only
 * "not executable yet" is informational and never blocks the task.
 */
export async function refreshTaskStatus(taskId: string): Promise<void> {
  const task = await prisma.marketingTask.findUnique({ where: { id: taskId }, include: { deployments: true, approvals: { where: { status: "PENDING" } }, runs: { orderBy: { startedAt: "desc" }, take: 1 } } });
  if (!task || !task.deployments.length) return;
  if (task.runs[0]?.status === "RUNNING") return;

  const now = new Date();
  const relevant = task.deployments.filter((d) => d.lastErrorCode !== "NOT_EXECUTABLE_YET");
  const active = relevant.find((d) => ACTIVE_DEPLOYMENT_STATUSES.has(d.status));
  const pending = task.approvals.find((a) => a.expiresAt > now);
  const blocked = relevant.find((d) => BLOCKING.has(d.status));
  const live = relevant.find((d) => d.status === "LIVE");

  // The one line names the deployment that decided the status first, then every other platform's own state — so "Google activated" never hides "Meta blocked" (doc 13 §15).
  const line = (text: string, primary: CampaignDeployment | null) =>
    [text, ...relevant.filter((d) => d.id !== primary?.id && d.status !== "CANCELLED").map((d) => `${PLATFORM_LABEL[d.platform]}: ${DEPLOYMENT_STATUS_META[d.status].label}`)].join(" · ").slice(0, 500);

  let data: Prisma.MarketingTaskUpdateInput;
  if (active) data = { status: "WORKING", currentStep: line(stepText(active), active), blockingReason: null };
  else if (pending) {
    const owner = relevant.find((d) => d.createApprovalId === pending.id || d.activateApprovalId === pending.id) ?? null;
    const what = pending.action === "ACTIVATE_CAMPAIGNS" ? "paused campaign ban gaya (no spend) — activation approval ka intezaar" : "paused-create card taiyaar — approval ka intezaar";
    data = { status: "NEEDS_APPROVAL", currentStep: line(owner ? `${PLATFORM_LABEL[owner.platform]}: ${what}` : what, owner), blockingReason: null };
  } else if (blocked) data = { status: "BLOCKED", currentStep: line(stepText(blocked), blocked), blockingReason: [blocked.lastErrorMessage, blocked.lastErrorFix].filter(Boolean).join(" → ").slice(0, 500) || DEPLOYMENT_STATUS_META[blocked.status].label };
  else if (live) {
    const d = deliveryOf(live);
    data = { status: "SCHEDULED_LIVE", currentStep: line(`${PLATFORM_LABEL[live.platform]} campaign activated — spend ho sakta hai · ${deliveryLabel(live.platform, d).text}`, live), blockingReason: null };
  } else {
    const paused = relevant.find((d) => d.status === "PAUSED_READY") ?? null;
    data = { status: "RESULT_READY", currentStep: line(paused ? `${PLATFORM_LABEL[paused.platform]} campaign paused hai — no spend; 'Request activation' se card banega` : "Package approved · deployments dekhein", paused), blockingReason: null };
  }
  await prisma.marketingTask.update({ where: { id: taskId }, data });
}

// ============================================================
// Worker primitives — lease, transitions, terminal failure
// ============================================================

export async function claimDeployment(id: string, workerId: string, from: "QUEUED" | "ACTIVATION_QUEUED", now: Date = new Date()): Promise<boolean> {
  const to: DeploymentStatusKey = from === "QUEUED" ? "PREFLIGHT" : "ACTIVATING";
  const leaseCutoff = new Date(now.getTime() - LEASE_MS);
  const res = await prisma.campaignDeployment.updateMany({
    where: { id, status: from, OR: [{ lockedAt: null }, { lockedAt: { lt: leaseCutoff } }] },
    data: { status: to, lockedAt: now, lockedBy: workerId, startedAt: now, attemptCount: { increment: 1 }, lastErrorCode: null, lastErrorMessage: null, lastErrorFix: null },
  });
  return res.count === 1;
}

/** A guarded step: only the lease holder, only from the expected status. Throws when the row moved. */
export async function transition(id: string, workerId: string, from: DeploymentStatusKey, to: DeploymentStatusKey, data: Prisma.CampaignDeploymentUpdateManyMutationInput = {}): Promise<void> {
  const res = await prisma.campaignDeployment.updateMany({ where: { id, status: from, lockedBy: workerId }, data: { ...data, status: to } });
  if (res.count !== 1) throw new ExecutionError("INTERNAL_ERROR", `Deployment ${id} ${from}→${to} nahi hua — kisi aur worker ne row badli.`, { retrySafe: false, status: "UNKNOWN_OUTCOME" });
}

/** A checkpoint write inside one status: only the lease holder. Throws when the lease is gone (§13 "checkpoint after every success"). */
export async function checkpointWrite(id: string, workerId: string, status: DeploymentStatusKey, data: Prisma.CampaignDeploymentUpdateManyMutationInput): Promise<void> {
  const res = await prisma.campaignDeployment.updateMany({ where: { id, status, lockedBy: workerId }, data });
  if (res.count !== 1) throw new ExecutionError("INTERNAL_ERROR", "Checkpoint likhte waqt deployment lock kho gaya.", { retrySafe: false, status: "UNKNOWN_OUTCOME" });
}

/** The row still belongs to this worker in this status — checked before every provider write (§8). */
export async function assertOwned(id: string, workerId: string, status: DeploymentStatusKey): Promise<CampaignDeployment> {
  const dep = await prisma.campaignDeployment.findUnique({ where: { id } });
  if (!dep || dep.status !== status || dep.lockedBy !== workerId) {
    throw new ExecutionError("INTERNAL_ERROR", "Deployment lock kho gaya — write nahi bheja.", { retrySafe: true, status: "FAILED_RETRYABLE" });
  }
  return dep;
}

export async function releaseLock(id: string): Promise<void> {
  await prisma.campaignDeployment.update({ where: { id }, data: { lockedAt: null, lockedBy: null } });
}

/**
 * Lands the row in the error's status with a safe message, releases the
 * lease, marks the phase's approval FAILED only when nothing can be retried
 * under it, and refreshes the task line.
 */
export async function failDeployment(dep: CampaignDeployment, err: ExecutionError, step: string, statusOverride?: DeploymentStatusKey): Promise<void> {
  const status = statusOverride ?? err.status;
  const data: Prisma.CampaignDeploymentUpdateInput = {
    status,
    lockedAt: null,
    lockedBy: null,
    lastErrorCode: err.code,
    lastErrorMessage: err.message.slice(0, 500),
    lastErrorFix: err.fix,
    providerRequestId: err.requestId ?? undefined,
  };
  await prisma.campaignDeployment.update({ where: { id: dep.id }, data });
  await recordEvent(dep.id, step, "error", `${err.code}: ${err.message}`, err.requestId);
  if (status === "FAILED_FINAL") {
    const approvalId = dep.phase === "ACTIVATE" ? dep.activateApprovalId : dep.createApprovalId;
    if (approvalId) {
      await prisma.marketingApproval.updateMany({
        where: { id: approvalId, status: "APPROVED" },
        data: { status: "FAILED", executionResult: toJson({ error: err.toSafe(), at: new Date().toISOString() }) },
      });
    }
  }
  await refreshTaskStatus(dep.taskId);
}

// ============================================================
// Read side — rows for the task detail (§19)
// ============================================================

function googleStepsFor(d: CampaignDeployment): DeploymentRow["steps"] {
  // Which step the row is at, and whether it is there in anger.
  let at: DeploymentStepKey | null = null;
  let error = false;
  let doneThrough = -1;
  switch (d.status) {
    case "CREATE_PENDING":
    case "QUEUED":
    case "CANCELLED":
      break;
    case "PREFLIGHT":
      at = "PREFLIGHT";
      break;
    case "VALIDATING":
      at = "VALIDATE";
      doneThrough = 0;
      break;
    case "CREATING":
    case "UNKNOWN_OUTCOME":
      at = "CREATE";
      doneThrough = 1;
      error = d.status === "UNKNOWN_OUTCOME";
      break;
    case "RECONCILING":
    case "PARTIAL":
      at = "VERIFY";
      doneThrough = 2;
      error = d.status === "PARTIAL";
      break;
    case "PAUSED_READY":
    case "ACTIVATION_PENDING":
    case "ACTIVATION_QUEUED":
      doneThrough = 3;
      break;
    case "ACTIVATING":
      at = "ACTIVATE";
      doneThrough = 3;
      break;
    case "LIVE":
      doneThrough = 4;
      break;
    case "BLOCKED_CONFIG":
    case "BLOCKED_CREATIVE":
    case "FAILED_RETRYABLE":
    case "FAILED_FINAL": {
      const refs = refsOf(d);
      if (d.phase === "ACTIVATE") {
        at = "ACTIVATE";
        doneThrough = 3;
      } else if (refs.campaign) {
        at = "VERIFY";
        doneThrough = 2;
      } else if (d.createApprovalId && d.attemptCount > 0) {
        at = d.lastErrorCode === "PROVIDER_VALIDATION_FAILED" || d.lastErrorCode === "POLICY_REJECTED" ? "VALIDATE" : "PREFLIGHT";
        doneThrough = at === "VALIDATE" ? 0 : -1;
      } else at = "PREFLIGHT";
      error = true;
      break;
    }
  }
  return GOOGLE_STEP_ORDER.map((key, i) => {
    let state: DeploymentStepState = "todo";
    if (i <= doneThrough) state = "done";
    if (key === at) state = error ? "error" : "active";
    return { key, label: DEPLOYMENT_STEP_LABEL[key], state };
  });
}

/** Meta's eight steps, derived from the stored refs (doc 14 §13) — the checkpoint column is display, the refs are truth. */
function metaStepsFor(d: CampaignDeployment): DeploymentRow["steps"] {
  const parsed = metaRefsOf(d);
  const refs = parsed.ok ? parsed.refs : null;
  const cp = refs ? metaCheckpointOf(refs) : "NONE";
  const order = META_STEP_ORDER;
  const idx = (k: DeploymentStepKey) => order.indexOf(k);
  // The step the refs prove complete through.
  const doneMap: Record<ReturnType<typeof metaCheckpointOf>, number> = {
    NONE: -1,
    PREFLIGHT_OK: idx("PREFLIGHT"),
    CAMPAIGN_CREATED_PAUSED: idx("CAMPAIGN"),
    ADSETS_CREATED_PAUSED: idx("ADSETS"),
    MEDIA_READY: idx("MEDIA"),
    CREATIVES_CREATED: idx("CREATIVES"),
    ADS_CREATED_PAUSED: idx("ADS"),
    TREE_VERIFIED_PAUSED: idx("VERIFY"),
  };
  let doneThrough = doneMap[cp];
  let at: DeploymentStepKey | null = null;
  let error = false;
  const busy = ACTIVE_DEPLOYMENT_STATUSES.has(d.status);
  const failed = ["BLOCKED_CONFIG", "BLOCKED_CREATIVE", "FAILED_RETRYABLE", "FAILED_FINAL", "UNKNOWN_OUTCOME", "PARTIAL"].includes(d.status);
  if (d.status === "LIVE") doneThrough = idx("ACTIVATE");
  else if (d.phase === "ACTIVATE") {
    doneThrough = Math.max(doneThrough, idx("VERIFY"));
    if (d.status === "ACTIVATING" || failed) {
      at = "ACTIVATE";
      error = failed;
    }
  } else if (busy || failed) {
    at = order[Math.min(doneThrough + 1, order.length - 1)];
    if (d.status === "PREFLIGHT" || (failed && doneThrough < 0)) at = "PREFLIGHT";
    error = failed;
  }
  if (d.status === "CREATE_PENDING" || d.status === "QUEUED" || d.status === "CANCELLED") {
    at = null;
    if (doneThrough < 0) doneThrough = -1;
  }
  return order.map((key, i) => {
    let state: DeploymentStepState = "todo";
    if (i <= doneThrough) state = "done";
    if (key === at) state = error ? "error" : "active";
    return { key, label: DEPLOYMENT_STEP_LABEL[key], state };
  });
}

function actionsFor(d: CampaignDeployment & { createApproval: MarketingApproval | null; activateApproval: MarketingApproval | null }, pendingApproval: MarketingApproval | null, now: Date): DeploymentActionKey[] {
  const external = hasExternalObjects(d);
  const out: DeploymentActionKey[] = [];
  if (d.lastErrorCode === "NOT_EXECUTABLE_YET") return out;
  const phaseApproval = d.phase === "ACTIVATE" ? d.activateApproval : d.createApproval;
  const retryAuthorised = !!phaseApproval && phaseApproval.status === "APPROVED" && phaseApproval.expiresAt > now;
  switch (d.status) {
    case "UNKNOWN_OUTCOME":
      out.push("SYNC");
      break;
    case "PAUSED_READY":
      out.push("SYNC");
      if (!pendingApproval) out.push("REQUEST_ACTIVATION");
      break;
    case "ACTIVATION_PENDING":
    case "LIVE":
      out.push("SYNC");
      break;
    case "PARTIAL":
      // Meta: some children exist — sync reconciles, retry resumes from the checkpoint under the still-valid card.
      out.push("SYNC");
      if (retryAuthorised) out.push("RETRY");
      break;
    case "FAILED_RETRYABLE":
    case "BLOCKED_CONFIG":
    case "BLOCKED_CREATIVE": {
      if (external) out.push("SYNC");
      if (retryAuthorised) out.push("RETRY");
      else if (d.phase === "CREATE" && !external) out.push("RECHECK");
      break;
    }
    case "CANCELLED":
      if (!external) out.push("RECHECK");
      break;
    case "CREATE_PENDING":
      if (!pendingApproval || pendingApproval.expiresAt <= now) out.push("RECHECK");
      break;
    case "FAILED_FINAL":
      if (external) out.push("SYNC");
      break;
    default:
      break;
  }
  return [...new Set(out)];
}

function safeErrorOf(d: CampaignDeployment): SafeExecutionError | null {
  if (!d.lastErrorCode || !d.lastErrorMessage) return null;
  const code = d.lastErrorCode as SafeExecutionError["code"];
  const reconnect = code === "AUTH_EXPIRED" || code === "META_TOKEN_INVALID" || code === "META_ADS_MANAGEMENT_MISSING";
  return { code, message: d.lastErrorMessage, fix: d.lastErrorFix, retrySafe: d.status === "FAILED_RETRYABLE", requestId: d.providerRequestId, reconnect };
}

/** Configured vs provider-reported delivery, from whatever the last read-back stored (doc 14 §7.4). */
export function deliveryOf(d: CampaignDeployment): DeliverySnapshot | null {
  if (d.platform === "META") {
    const parsed = metaRefsOf(d);
    const rb = parsed.ok ? parsed.refs.readBack : null;
    return rb ? metaDeliveryOf(rb) : null;
  }
  const rb = refsOf(d).readBack;
  if (!rb) return null;
  const approvals = rb.adApprovalStatuses ?? [];
  return {
    configuredStatus: rb.status,
    effectiveStatus: rb.primaryStatus,
    deliveryStatus: rb.servingStatus,
    policyStatus: approvals.length ? `ads ${approvals.join("/")}` : null,
    issues: [],
    snapshotAt: rb.at,
  };
}

function objectiveOf(spec: unknown): string | null {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) return null;
  const objective = (spec as { objective?: unknown }).objective;
  return typeof objective === "string" ? objective : null;
}

/** Doc 14 §6 — whether this release can execute the package's objective, and the one reason when it cannot. */
function objectiveSupportOf(objective: string | null, conn: Record<string, string>): MetaDeploymentFacts["objectiveSupport"] {
  if (!objective) return { supported: false, reason: "Package me Meta objective nahi hai." };
  const m = META_OBJECTIVE_MATRIX[objective];
  if (!m) return { supported: false, reason: `${objective} allow-list me nahi hai — OUTCOME_TRAFFIC par revise karein.` };
  if ("draftOnly" in m) return { supported: false, reason: m.draftOnly };
  if (m.needsConversion && !(conn.metaPixelId && conn.metaConversionEvent)) return { supported: false, reason: `${objective} ke liye Meta Pixel + conversion event mapping chahiye (Connections → Meta Ads) — warna OUTCOME_TRAFFIC par revise karein; silent downgrade nahi hota.` };
  return { supported: true, reason: null };
}

function settingsRecord(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === "string") out[k] = v;
  return out;
}

/** Permission lines come from the last "Check ad creation readiness" — the card never implies a permission nobody verified. */
function readinessOf(value: string | undefined): "READY" | "MISSING" | "UNVERIFIED" {
  return value === "true" ? "READY" : value === "false" ? "MISSING" : "UNVERIFIED";
}

/** `storedCheckpoint` is the deployment's column — shown only when the refs themselves cannot be read; parsed refs always win (they are the truth). */
function metaFactsOf(cp: MetaCreatePausedPayload | null, refs: MetaExternalRefs | null, storedCheckpoint: CampaignDeployment["checkpoint"], mediaRows: { id: string; publicUrl: string; status: string; width: number; height: number }[], conn: Record<string, string>, draftSpec: unknown): MetaDeploymentFacts {
  const r = refs?.resolved ?? null;
  const previews = (cp?.creativeMediaIds ?? []).map((id) => mediaRows.find((m) => m.id === id)).filter((m): m is NonNullable<typeof m> => !!m).map((m) => ({ mediaId: m.id, url: m.publicUrl, status: m.status, width: m.width, height: m.height }));
  const objective = r?.objective ?? cp?.objective ?? objectiveOf(draftSpec);
  return {
    pageId: r?.pageId ?? cp?.pageId ?? (conn.pageId || null),
    pageName: conn.pageName || null,
    instagramActorId: r?.instagramActorId ?? cp?.instagramActorId ?? null,
    instagramUsername: conn.igUsername || null,
    readPermission: readinessOf(conn.readReady),
    writePermission: readinessOf(conn.writeReady),
    accountAccess: conn.accountAccess === "READY" ? "READY" : conn.accountAccess === "MISSING" ? "MISSING" : "UNVERIFIED",
    accessTier: conn.accessTier || "UNVERIFIED",
    objective,
    objectiveSupport: objectiveSupportOf(objective, conn),
    resolvedAudienceSummary: r?.audienceSummary ?? cp?.resolvedAudienceSummary ?? null,
    resolvedPlacementSummary: r?.placementSummary ?? cp?.resolvedPlacementSummary ?? null,
    creativePreviews: previews,
    externalIds: {
      campaignId: refs?.campaignId ?? null,
      adSetIds: Object.values(refs?.adSets ?? {}).map((x) => x.id),
      creativeIds: Object.values(refs?.creatives ?? {}).map((x) => x.id),
      adIds: Object.values(refs?.ads ?? {}).map((x) => x.id),
    },
    checkpoint: refs ? metaCheckpointOf(refs) : storedCheckpoint,
    deferredRules: cp?.deferredRules ?? [],
  };
}

export async function listDeploymentRows(taskId: string): Promise<DeploymentRow[]> {
  const now = new Date();
  const rows = await prisma.campaignDeployment.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
    include: { draft: { select: { name: true, dailyBudgetPaise: true, totalBudgetPaise: true, spec: true } }, events: { orderBy: { at: "desc" }, take: 25 }, createApproval: true, activateApproval: true },
  });
  if (!rows.length) return [];
  const hasMeta = rows.some((r) => r.platform === "META");
  const [approvals, mediaRows, metaConnection] = await Promise.all([
    prisma.marketingApproval.findMany({ where: { taskId, status: "PENDING", expiresAt: { gt: now } } }),
    hasMeta ? prisma.marketingCreativeMedia.findMany({ where: { taskId }, select: { id: true, publicUrl: true, status: true, width: true, height: true } }) : Promise.resolve([]),
    hasMeta ? prisma.marketingConnection.findUnique({ where: { provider: "META_ADS" }, select: { settings: true } }) : Promise.resolve(null),
  ]);
  const metaConn = settingsRecord(metaConnection?.settings);

  return rows.map((d) => {
    const pending = approvals.find((a) => a.id === d.createApprovalId || a.id === d.activateApprovalId) ?? null;
    const meta = DEPLOYMENT_STATUS_META[d.status];
    const drift = d.lastErrorCode === "EXTERNAL_DRIFT" ? d.lastErrorMessage : null;
    const base = {
      id: d.id,
      draftId: d.draftId,
      platform: d.platform,
      phase: d.phase,
      status: d.status,
      statusLabel: meta.label,
      tone: meta.tone,
      accountDisplay: d.accountRef ? accountDisplay(d.accountLabel, d.accountRef) : null,
      currency: d.currency,
      executionMarker: d.executionMarker,
      externalStatus: d.externalStatus,
      dailyBudgetPaise: d.draft.dailyBudgetPaise,
      totalBudgetPaise: d.draft.totalBudgetPaise,
      lastSyncedAt: d.lastSyncedAt?.toISOString() ?? null,
      pausedVerifiedAt: d.pausedVerifiedAt?.toISOString() ?? null,
      activatedAt: d.activatedAt?.toISOString() ?? null,
      attemptCount: d.attemptCount,
      currentStep: stepText(d),
      safeError: drift ? null : safeErrorOf(d),
      drift,
      availableActions: actionsFor(d, pending, now),
      pendingApprovalId: pending?.id ?? null,
      delivery: deliveryOf(d),
      events: d.events
        .slice()
        .reverse()
        .map((e) => ({ step: e.step, level: e.level as "info" | "ok" | "error", message: e.message, at: e.at.toISOString() })),
    };
    if (d.platform === "META") {
      const parsed = metaRefsOf(d);
      const refs = parsed.ok ? parsed.refs : null;
      const cpParsed = d.createApproval ? MetaCreatePausedPayloadSchema.safeParse(d.createApproval.payload) : null;
      const cp = cpParsed?.success ? cpParsed.data : null;
      const rb = refs?.readBack ?? null;
      return {
        ...base,
        campaignName: refs?.resolved?.providerCampaignName ?? cp?.providerCampaignName ?? d.draft.name,
        externalCampaignId: refs?.campaignId ?? null,
        externalCampaignRef: refs?.campaignId ?? null,
        externalCounts: rb ? { adGroups: rb.counts.adSets, keywords: rb.counts.creatives, ads: rb.counts.ads } : refs?.campaignId ? { adGroups: Object.keys(refs.adSets).length, keywords: Object.keys(refs.creatives).length, ads: Object.keys(refs.ads).length } : null,
        startAt: refs?.resolved?.startDate ?? cp?.startAt ?? null,
        endAt: refs?.resolved?.endDate ?? cp?.endAt ?? null,
        steps: metaStepsFor(d),
        meta: metaFactsOf(cp, refs, d.checkpoint, mediaRows, metaConn, d.draft.spec),
        safeError: !parsed.ok && !drift ? { code: "INTERNAL_ERROR", message: `Stored refs padhe nahi gaye: ${parsed.reason}`, fix: "Human review — Ads Manager me marker se objects dekhein.", retrySafe: false, requestId: null } : base.safeError,
      };
    }
    const refs = refsOf(d);
    return {
      ...base,
      campaignName: refs.resolved?.providerCampaignName ?? d.draft.name,
      externalCampaignId: refs.campaignId,
      externalCampaignRef: refs.campaign,
      externalCounts: refs.readBack ? { adGroups: refs.readBack.adGroups, keywords: refs.readBack.keywords, ads: refs.readBack.ads } : null,
      startAt: refs.resolved?.startDate ?? null,
      endAt: refs.resolved?.endDate ?? null,
      steps: googleStepsFor(d),
      meta: null,
    };
  });
}

export function toDeploymentSummary(d: Pick<CampaignDeployment, "id" | "platform" | "status" | "lastErrorCode">): DeploymentSummary {
  return { id: d.id, platform: d.platform, status: d.status, notExecutableYet: d.lastErrorCode === "NOT_EXECUTABLE_YET" };
}
