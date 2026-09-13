import "server-only";
import { createHash, randomUUID } from "crypto";
import { prisma } from "@/lib/db/prisma";
import type { ApprovalPreview } from "@/lib/contracts/marketingAi";
import {
  EXECUTABLE_PLATFORMS,
  META_ACTIVATE_EXECUTION_EFFECT,
  META_ACTIVATION_ORDER,
  META_ACTIVATION_WARNING,
  META_ROLLBACK_EFFECT,
  deliveryLabel,
  type DeploymentStatusKey,
  type ExecutionErrorCode,
} from "@/lib/contracts/marketingExecution";
import { MetaActivatePayloadSchema, MetaCreatePausedPayloadSchema, type MetaActivatePayload, type MetaCreatePausedPayload } from "@/lib/contracts/marketingExecutionPayloads";
import { executableWriteTool } from "@/lib/marketing/tools/registry";
import { isConnectorError } from "@/lib/marketing/connectors/http";
import { normaliseAdAccountId } from "@/lib/marketing/connectors/metaAds";
import { META_API_VERSION } from "@/lib/marketing/connectors/metaGraph";
import { calendarDateIn } from "@/lib/marketing/mappers/googleSearchMapper";
import type { MetaAdSetTemplate, MetaAdTemplate, MetaCreativeTemplate, MetaMapResult } from "@/lib/marketing/mappers/metaCampaignMapper";
import type { MetaAdsWriteProvider, MetaCampaignTree } from "@/lib/marketing/providers/metaAdsProvider";
import { marketingCreativeStorage, probePublicImageUrl } from "@/lib/marketing/storage/marketingCreativeStorage";
import { resolveMetaAdsWriteProvider } from "../connectionService";
import { META_ACCOUNT_WRITE_TASKS, META_WRITE_PERMISSION } from "../metaReadinessEvaluator";
import {
  APPROVAL_TTL_DAYS,
  RECONCILE_GRACE_MS,
  accountDisplay,
  assertOwned,
  checkpointWrite,
  failDeployment,
  loadDeployment,
  recordEvent,
  refreshTaskStatus,
  releaseLock,
  transition,
  type DeploymentWithRelations,
} from "./deploymentService";
import { ExecutionError, isExecutionError, normaliseMetaError } from "./executionErrors";
import { hashPayload, payloadHashMatches } from "./hashing";
import { nameCarriesMarker } from "./idempotency";
import { metaReadiness, metaWritePreflight, windowDaysOf, type MetaMediaFact, type MetaWritePreflightResult } from "./metaPreflight";
import { findMetaAd, findMetaAdSet, findMetaCampaign, findMetaCreative, metaPolicyBlocks, normaliseTargeting, verifyMetaTree, type MetaChildExpect, type MetaTreeVerdict } from "./metaReconcile";
import { emptyMetaActivation, metaCheckpointOf, metaHierarchyComplete, metaMissingKeys, metaRefsOf, type MetaExternalRefs, type MetaResolved } from "./metaRefs";
import { currentSpecHash, defaultProbeLanding, outcome, toJson, type RunOutcome, type WorkerOptions } from "./workerShared";

/**
 * The Meta executor (doc 14 §13-§16). A Meta campaign is not one atomic
 * request like Google's: it is a campaign, its ad sets, an uploaded image,
 * creatives and ads — five kinds of write, each of which can land and lose
 * its answer. So this executor is built around one idea: **every object is
 * looked for before it is made, and remembered the moment it exists.**
 *
 * Paused create (after "Create paused on Meta"):
 *
 *   preflight (token, account, Page/IG, exact-name targeting, media, card
 *   still matches) → campaign PAUSED → ad sets PAUSED → image → creatives →
 *   ads PAUSED → full read-back → PAUSED_READY → "Activate Meta campaign" card.
 *
 *   Each step first searches for its stable tag (`[BT:<marker>:AS01]`) inside
 *   the stored parent; one match is attached, several stop for a human, none
 *   means one write (`retries: 0`). The id and checkpoint are written after
 *   every success. A lost answer is UNKNOWN_OUTCOME; only Sync — by marker,
 *   after a grace window — decides whether it landed.
 *
 * Activation (after its own card):
 *
 *   just-in-time checks → the tree must still be the approved paused
 *   hierarchy → ads ACTIVE → read-back → ad sets ACTIVE → read-back → account
 *   and budget once more → campaign ACTIVE **last** → full read-back → LIVE.
 *
 *   Until that last write the campaign is PAUSED, so nothing before it can
 *   spend: a failure there is PARTIAL and a retry continues. If the campaign
 *   reads back ACTIVE but the hierarchy is not the approved one, the same
 *   execution pauses the campaign again — the rollback the activation card
 *   described — and records why.
 */

/**
 * Errors a paused-create stopped on that the recovery sweep may resume by
 * itself — throttling, failed reads, and a hierarchy Sync found incomplete —
 * nothing a human must fix first. Resuming only ever searches by marker and
 * adds PAUSED objects.
 */
export const AUTO_RESUMABLE_META_CODES: readonly ExecutionErrorCode[] = ["RATE_LIMITED", "INTERNAL_ERROR", "PROVIDER_PARTIAL_FAILURE"];

const rupees = (paise: number | null): string => (paise === null ? "—" : `₹${Math.round(paise / 100).toLocaleString("en-IN")}`);

// ============================================================
// Provider, gates, approvals
// ============================================================

async function metaProviderOf(opts: WorkerOptions): Promise<MetaAdsWriteProvider> {
  try {
    if (opts.metaProvider) return opts.metaProvider;
    if (opts.metaProviderFactory) return await opts.metaProviderFactory();
    return await resolveMetaAdsWriteProvider();
  } catch (err) {
    if (isConnectorError(err) && err.code === "NOT_FOUND" && err.status === null) {
      throw new ExecutionError("ACCOUNT_NOT_READY", `Meta connection configured nahi: ${err.message}`, { fix: "Connections → Meta Ads: token + ad account ID set karein, phir 'Check ad creation readiness'." });
    }
    throw normaliseMetaError(err, "read");
  }
}

/** Both gates, read at execution time — a tool switched off after its card was approved still writes nothing. */
function metaGateOpen(action: "CREATE_PAUSED_CAMPAIGNS" | "ACTIVATE_CAMPAIGNS"): boolean {
  return EXECUTABLE_PLATFORMS.has("META") && executableWriteTool(action, "META") !== null;
}

function sameIdSet(stored: string[], carded: string[]): boolean {
  return stored.length === carded.length && [...stored].sort().join(",") === [...carded].sort().join(",");
}

function verifyMetaCreateApproval(dep: DeploymentWithRelations, now: Date): MetaCreatePausedPayload {
  const a = dep.createApproval;
  if (!a || a.id !== dep.createApprovalId) throw new ExecutionError("APPROVAL_INVALID", "Create approval deployment se juda nahi hai.");
  if (a.status !== "APPROVED") throw new ExecutionError("APPROVAL_INVALID", `Create approval ${a.status} hai, APPROVED nahi.`);
  if (a.expiresAt <= now) throw new ExecutionError("APPROVAL_INVALID", "Create approval ka authorisation window (7 din) khatam.", { fix: "'Re-check Meta readiness' se naya card banayein." });
  if (!payloadHashMatches(a.payload, a.payloadHash)) throw new ExecutionError("APPROVAL_INVALID", "Approval payload hash mismatch — refuse.");
  const parsed = MetaCreatePausedPayloadSchema.safeParse(a.payload);
  if (!parsed.success) throw new ExecutionError("APPROVAL_INVALID", "Create approval payload Meta typed schema se match nahi karta.");
  const p = parsed.data;
  if (p.deploymentId !== dep.id || p.draftId !== dep.draftId || p.platform !== dep.platform) throw new ExecutionError("APPROVAL_INVALID", "Approval kisi aur deployment/platform ka hai.");
  if (p.specHash !== dep.specHash) throw new ExecutionError("SPEC_CHANGED", "Approved spec hash deployment se alag hai.", { fix: "'Re-check Meta readiness'." });
  if (!metaGateOpen("CREATE_PAUSED_CAMPAIGNS")) throw new ExecutionError("NOT_EXECUTABLE_YET", "meta.campaign.create_paused is waqt executable nahi hai — koi write nahi bheja.", { status: "BLOCKED_CONFIG" });
  return p;
}

function verifyMetaActivateApproval(dep: DeploymentWithRelations, refs: MetaExternalRefs, now: Date): MetaActivatePayload {
  const a = dep.activateApproval;
  if (!a || a.id !== dep.activateApprovalId) throw new ExecutionError("APPROVAL_INVALID", "Activation approval deployment se juda nahi hai.");
  if (a.status !== "APPROVED") throw new ExecutionError("APPROVAL_INVALID", `Activation approval ${a.status} hai, APPROVED nahi.`);
  if (a.expiresAt <= now) throw new ExecutionError("APPROVAL_INVALID", "Activation approval ka window khatam.", { fix: "'Request activation' se naya card banayein." });
  if (!payloadHashMatches(a.payload, a.payloadHash)) throw new ExecutionError("APPROVAL_INVALID", "Approval payload hash mismatch — refuse.");
  const parsed = MetaActivatePayloadSchema.safeParse(a.payload);
  if (!parsed.success) throw new ExecutionError("APPROVAL_INVALID", "Activation payload Meta typed schema se match nahi karta.");
  const p = parsed.data;
  if (p.deploymentId !== dep.id || p.draftId !== dep.draftId || p.platform !== dep.platform) throw new ExecutionError("APPROVAL_INVALID", "Approval kisi aur deployment/platform ka hai.");
  if (p.specHash !== dep.specHash) throw new ExecutionError("SPEC_CHANGED", "Approved spec hash deployment se alag hai.");
  if (
    refs.campaignId !== p.campaignId ||
    !sameIdSet(Object.values(refs.adSets).map((x) => x.id), p.adSetIds) ||
    !sameIdSet(Object.values(refs.ads).map((x) => x.id), p.adIds) ||
    !sameIdSet(Object.values(refs.creatives).map((x) => x.id), p.creativeIds)
  ) {
    throw new ExecutionError("APPROVAL_INVALID", "Activation card ke campaign/ad set/ad/creative IDs deployment ke stored objects se alag hain.");
  }
  if (!metaGateOpen("ACTIVATE_CAMPAIGNS")) throw new ExecutionError("NOT_EXECUTABLE_YET", "meta.campaign.activate is waqt executable nahi hai — koi status write nahi bheja.", { status: "BLOCKED_CONFIG" });
  return p;
}

// ============================================================
// Paused create
// ============================================================

interface CreateCtx {
  dep: DeploymentWithRelations;
  workerId: string;
  provider: MetaAdsWriteProvider;
  opts: WorkerOptions;
  now: () => Date;
  specHash: string;
  /** Always the latest stored truth — replaced, never mutated, after every provider success. */
  refs: MetaExternalRefs;
}

function ambiguous(what: string, ids: string[]): ExecutionError {
  return new ExecutionError("RECONCILIATION_AMBIGUOUS", `${what} — human review chahiye; kuch naya nahi banaya.`, {
    fix: `Ads Manager me ${ids.join(", ") || "marker wale objects"} dekhein; galat/duplicate hataayein, phir 'Sync from Meta'.`,
  });
}

async function saveRefs(ctx: CreateCtx, checkpoint: string): Promise<void> {
  await checkpointWrite(ctx.dep.id, ctx.workerId, "CREATING", { externalRefs: toJson(ctx.refs), checkpoint });
}

/** Before every write: the lease is ours, the draft is still the approved one, and the intent is on the row (doc 14 §14). */
async function beforeWrite(ctx: CreateCtx, intent: string): Promise<void> {
  await assertOwned(ctx.dep.id, ctx.workerId, "CREATING");
  if ((await currentSpecHash(ctx.dep.draftId)) !== ctx.specHash) throw new ExecutionError("SPEC_CHANGED", "Write se pehle draft badal gaya — write refuse.", { fix: "'Re-check Meta readiness'." });
  await checkpointWrite(ctx.dep.id, ctx.workerId, "CREATING", { lastWriteAttemptAt: ctx.now(), checkpoint: intent });
}

/** What the card showed must still be what is about to be created (§10 "create a fresh execution approval … do not reuse a stale approval"). */
function assertCreateCardMatches(card: MetaCreatePausedPayload, pre: MetaWritePreflightResult): void {
  const r = pre.readiness;
  const m = pre.mapped;
  const diffs: string[] = [];
  if (r.accountRef !== card.accountRef) diffs.push(`ad account ${r.accountRef} ≠ card ${card.accountRef}`);
  if (pre.resolved.pageId !== card.pageId) diffs.push(`Page ${pre.resolved.pageId} ≠ card ${card.pageId}`);
  if ((pre.resolved.instagramActorId ?? null) !== (card.instagramActorId ?? null)) diffs.push(`Instagram ${pre.resolved.instagramActorId ?? "none"} ≠ card ${card.instagramActorId ?? "none"}`);
  if (m.campaign.objective !== card.objective) diffs.push(`objective ${m.campaign.objective} ≠ card ${card.objective}`);
  if (m.summary.adSetBudgetSumPaise !== card.dailyBudgetPaise) diffs.push(`ad set budgets ${rupees(m.summary.adSetBudgetSumPaise)}/day ≠ card ${rupees(card.dailyBudgetPaise)}/day`);
  if (m.adSets.map((s) => s.key).join(",") !== card.adSetKeys.join(",")) diffs.push("ad sets card se alag");
  if (m.ads.map((a) => a.key).join(",") !== card.adKeys.join(",")) diffs.push("ads card se alag");
  if (!sameIdSet([...new Set(m.creatives.map((c) => c.mediaId))], card.creativeMediaIds)) diffs.push("approved images card se alag");
  if (!card.landingUrls.includes(r.finalUrl)) diffs.push("landing URL card se alag");
  const cats = (x: string[]) => x.filter((c) => c !== "NONE").sort().join(",");
  if (cats(m.campaign.special_ad_categories) !== cats(card.specialAdCategories)) diffs.push("special ad categories card se alag");
  if (pre.resolved.endDate !== card.endAt) diffs.push(`end date ${pre.resolved.endDate} ≠ card ${card.endAt}`);
  if (pre.resolved.startDate < card.startAt) diffs.push(`start date ${pre.resolved.startDate} card ke ${card.startAt} se pehle`);
  if (diffs.length) {
    throw new ExecutionError("SPEC_CHANGED", `Write se theek pehle verified facts approved card se alag hain: ${diffs.join(" · ")}`.slice(0, 480), { fix: "'Re-check Meta readiness' se naya card banayein — us par exact values dikhengi." });
  }
}

function buildResolved(pre: MetaWritePreflightResult, now: Date): MetaResolved {
  const m = pre.mapped;
  const res = pre.resolved;
  const first = m.adSets[0];
  return {
    pageId: res.pageId,
    instagramActorId: res.instagramActorId,
    finalUrl: pre.readiness.finalUrl,
    timeZone: res.timeZone,
    startDate: res.startDate,
    endDate: res.endDate,
    startTime: first.body.start_time,
    endTime: first.body.end_time,
    currency: res.currency,
    objective: m.campaign.objective,
    optimizationGoal: m.summary.optimizationGoal,
    billingEvent: m.summary.billingEvent,
    destinationType: m.summary.destinationType,
    providerCampaignName: m.campaign.name,
    specialAdCategories: m.campaign.special_ad_categories,
    locations: Object.fromEntries(Object.entries(res.locations).map(([k, v]) => [k, { key: v.key, name: v.name, type: v.type }])),
    interests: Object.fromEntries(Object.entries(res.interests).map(([k, v]) => [k, { id: v.id, name: v.name }])),
    adSetKeys: m.adSets.map((s) => s.key),
    creativeKeys: m.creatives.map((c) => c.key),
    adKeys: m.ads.map((a) => a.key),
    adParents: Object.fromEntries(m.ads.map((a) => [a.key, { adSetKey: a.adSetKey, creativeKey: a.creativeKey }])),
    creativeMedia: Object.fromEntries(m.creatives.map((c) => [c.key, c.mediaId])),
    adSetBudgetsPaise: Object.fromEntries(m.adSets.map((s) => [s.key, s.dailyBudgetPaise])),
    adSetBudgetSumPaise: m.summary.adSetBudgetSumPaise,
    adSetTargets: Object.fromEntries(m.adSets.map((s) => [s.key, normaliseTargeting(s.body.targeting)!])),
    audienceSummary: m.summary.audienceSummary,
    placementSummary: m.summary.placementSummary,
    accountName: res.accountName,
    apiVersion: META_API_VERSION(),
    resolvedAt: now.toISOString(),
  };
}

/** A resumed create must build the same hierarchy the first attempt started — anything else is not a resume. */
function structureDiff(stored: MetaResolved, fresh: MetaResolved): string[] {
  const diffs: string[] = [];
  const cmp = (label: string, a: unknown, b: unknown) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push(label);
  };
  cmp("ad sets", stored.adSetKeys, fresh.adSetKeys);
  cmp("creatives", stored.creativeKeys, fresh.creativeKeys);
  cmp("ads", stored.adKeys, fresh.adKeys);
  cmp("ad parents", stored.adParents, fresh.adParents);
  cmp("images", stored.creativeMedia, fresh.creativeMedia);
  cmp("budgets", stored.adSetBudgetsPaise, fresh.adSetBudgetsPaise);
  cmp("targeting", stored.adSetTargets, fresh.adSetTargets);
  cmp("schedule", [stored.startTime, stored.endTime], [fresh.startTime, fresh.endTime]);
  cmp("destination", stored.finalUrl, fresh.finalUrl);
  cmp("identity", [stored.pageId, stored.instagramActorId], [fresh.pageId, fresh.instagramActorId]);
  cmp("objective", [stored.objective, stored.optimizationGoal, stored.billingEvent], [fresh.objective, fresh.optimizationGoal, fresh.billingEvent]);
  return diffs;
}

async function readTree(provider: MetaAdsWriteProvider, campaignId: string): Promise<MetaCampaignTree> {
  let tree: MetaCampaignTree | null;
  try {
    tree = await provider.readCampaignTree(campaignId);
  } catch (err) {
    throw normaliseMetaError(err, "read");
  }
  if (!tree) throw new ExecutionError("INTERNAL_ERROR", `Campaign ${campaignId} read-back me nahi mila — Meta abhi commit kar raha hoga, ya bahar delete hua.`, { fix: "Thodi der baad 'Sync from Meta'.", retrySafe: true });
  return tree;
}

/** Campaign found or created, then read back before any child is hung under it (§13.3). */
async function ensureCampaign(ctx: CreateCtx, mapped: MetaMapResult): Promise<void> {
  const marker = ctx.dep.executionMarker;
  if (!ctx.refs.campaignId) {
    const found = await findMetaCampaign(ctx.provider, marker);
    if (found.kind === "many") throw ambiguous(`Marker [${marker}] wale ${found.objects.length} campaigns mile`, found.objects.map((o) => o.id));
    if (found.kind === "one") {
      ctx.refs = { ...ctx.refs, campaignId: found.object.id, campaignName: found.object.name };
      await saveRefs(ctx, metaCheckpointOf(ctx.refs));
      await recordEvent(ctx.dep.id, "campaign", "info", `Marker [${marker}] ka campaign ${found.object.id} pehle se hai — attach, create skip.`);
    } else {
      await beforeWrite(ctx, "campaign:writing");
      let res;
      try {
        res = await ctx.provider.createCampaignPaused(mapped.campaign);
      } catch (err) {
        throw normaliseMetaError(err, "write");
      }
      ctx.refs = { ...ctx.refs, campaignId: res.id, campaignName: mapped.campaign.name };
      await saveRefs(ctx, metaCheckpointOf(ctx.refs));
      await recordEvent(ctx.dep.id, "campaign", "ok", `PAUSED campaign ${res.id} bana (${mapped.campaign.objective}, ad-set budget sharing off).`, res.requestId);
    }
  }
  let shell: MetaCampaignTree | null;
  try {
    shell = await ctx.provider.readCampaignTree(ctx.refs.campaignId!);
  } catch (err) {
    throw normaliseMetaError(err, "read");
  }
  if (!shell) {
    await recordEvent(ctx.dep.id, "campaign", "info", "Campaign abhi read-back me nahi dikha (Meta commit ho raha hoga) — poori hierarchy ke baad verify hoga.");
    return;
  }
  const problems: string[] = [];
  if (!nameCarriesMarker(shell.campaign.name, marker)) problems.push("campaign naam me marker nahi");
  if (shell.campaign.objective && shell.campaign.objective !== mapped.campaign.objective) problems.push(`objective ${shell.campaign.objective} ≠ ${mapped.campaign.objective}`);
  if ((shell.campaign.status ?? "").toUpperCase() !== "PAUSED") problems.push(`status ${shell.campaign.status || "?"} ≠ PAUSED`);
  if (problems.length) throw new ExecutionError("READBACK_MISMATCH", `Campaign read-back approved se alag: ${problems.join(" · ")}`, { fix: "Ads Manager me campaign dekhein; approved state par laakar 'Sync from Meta'." });
}

async function ensureAdSet(ctx: CreateCtx, tpl: MetaAdSetTemplate): Promise<void> {
  const marker = ctx.dep.executionMarker;
  const campaignId = ctx.refs.campaignId!;
  const found = await findMetaAdSet(ctx.provider, campaignId, marker, tpl.key);
  if (found.kind === "many") throw ambiguous(`Ad set ${tpl.key} ke ${found.objects.length} objects mile (tag [${marker}:${tpl.key}])`, found.objects.map((o) => o.id));
  let id: string;
  let name: string;
  let requestId: string | null = null;
  const attached = found.kind === "one";
  if (found.kind === "one") {
    id = found.object.id;
    name = found.object.name;
  } else {
    await beforeWrite(ctx, `adset:${tpl.key}:writing`);
    let res;
    try {
      res = await ctx.provider.createAdSetPaused({ ...tpl.body, campaign_id: campaignId });
    } catch (err) {
      throw normaliseMetaError(err, "write");
    }
    id = res.id;
    name = tpl.name;
    requestId = res.requestId;
  }
  ctx.refs = { ...ctx.refs, adSets: { ...ctx.refs.adSets, [tpl.key]: { id, name } } };
  await saveRefs(ctx, metaCheckpointOf(ctx.refs));
  await recordEvent(ctx.dep.id, "adsets", attached ? "info" : "ok", attached ? `Ad set ${tpl.key} (${id}) pehle se tha — attach.` : `PAUSED ad set ${tpl.key} ${id} bana — ${rupees(tpl.dailyBudgetPaise)}/day · ${tpl.placements.join(" + ")}.`, requestId);
}

async function recordProviderImageRef(mediaId: string, accountRef: string, hash: string, now: Date): Promise<void> {
  try {
    const row = await prisma.marketingCreativeMedia.findUnique({ where: { id: mediaId }, select: { providerRefs: true } });
    const prev = row?.providerRefs && typeof row.providerRefs === "object" && !Array.isArray(row.providerRefs) ? (row.providerRefs as Record<string, unknown>) : {};
    await prisma.marketingCreativeMedia.update({ where: { id: mediaId }, data: { providerRefs: toJson({ ...prev, [accountRef]: { hash, at: now.toISOString() } }) } });
  } catch (e) {
    console.error("[marketing:meta] providerRefs write failed:", e instanceof Error ? e.message : String(e));
  }
}

async function readMediaBytes(opts: WorkerOptions, storageKey: string): Promise<Buffer | null> {
  return opts.readMedia ? opts.readMedia(storageKey) : marketingCreativeStorage.read(storageKey);
}

/** Meta's image hash is content-derived — so the account is asked for the bytes before they are sent, and a re-run never uploads twice. */
async function ensureImage(ctx: CreateCtx, fact: MetaMediaFact): Promise<void> {
  const bytes = await readMediaBytes(ctx.opts, fact.storageKey);
  if (!bytes) throw new ExecutionError("CREATIVE_MISSING", `Approved image ${fact.mediaId} storage se padhi nahi gayi.`, { fix: "Image dobara attach + approve karein." });
  if (createHash("sha256").update(bytes).digest("hex") !== fact.sha256) {
    throw new ExecutionError("CREATIVE_INVALID", `Stored image ${fact.mediaId} ka content approved hash se alag hai — upload nahi karenge.`, { fix: "Image dobara attach + approve karein." });
  }
  const md5 = createHash("md5").update(bytes).digest("hex");
  let existing;
  try {
    existing = await ctx.provider.findImageByHash(md5);
  } catch (err) {
    throw normaliseMetaError(err, "read");
  }
  let hash: string;
  let url: string | null;
  let requestId: string | null = null;
  if (existing) {
    hash = existing.hash;
    url = existing.url;
  } else {
    await beforeWrite(ctx, `media:${fact.mediaId}:writing`);
    let res;
    try {
      res = await ctx.provider.uploadOrResolveImage({ bytes, filename: `${ctx.dep.executionMarker.replace(/:/g, "-")}-${fact.sha256.slice(0, 12)}.${fact.storageKey.endsWith(".png") ? "png" : "jpg"}`, sha256: fact.sha256 });
    } catch (err) {
      throw normaliseMetaError(err, "write");
    }
    hash = res.hash;
    url = res.url;
    requestId = res.requestId;
  }
  ctx.refs = { ...ctx.refs, media: { ...ctx.refs.media, [fact.mediaId]: { imageHash: hash, url } } };
  await saveRefs(ctx, metaCheckpointOf(ctx.refs));
  await recordProviderImageRef(fact.mediaId, ctx.refs.adAccountId, hash, ctx.now());
  await recordEvent(ctx.dep.id, "media", existing ? "info" : "ok", existing ? `Image ${fact.mediaId.slice(0, 8)} Meta par pehle se thi (hash ${hash.slice(0, 10)}…) — upload skip.` : `Image ${fact.mediaId.slice(0, 8)} upload hui (hash ${hash.slice(0, 10)}…).`, requestId);
}

async function ensureCreative(ctx: CreateCtx, tpl: MetaCreativeTemplate): Promise<void> {
  const marker = ctx.dep.executionMarker;
  const media = ctx.refs.media[tpl.mediaId];
  if (!media) throw new ExecutionError("INTERNAL_ERROR", `Creative ${tpl.key} se pehle image ${tpl.mediaId} ready nahi.`, { retrySafe: true });
  const body = tpl.build(media.imageHash);
  const spec = body.object_story_spec;
  const found = await findMetaCreative(ctx.provider, marker, tpl.key, { imageHash: media.imageHash, link: spec.link_data.link, pageId: spec.page_id, instagramUserId: spec.instagram_user_id ?? null });
  if (found.kind === "many") {
    throw ambiguous(found.mismatched?.length ? `Creative ${tpl.key} tag wala object mila par image/URL/Page/Instagram approved se alag hai` : `Creative ${tpl.key} ke ${found.objects.length} objects mile`, found.objects.map((o) => o.id));
  }
  let id: string;
  let name: string;
  let requestId: string | null = null;
  const attached = found.kind === "one";
  if (found.kind === "one") {
    id = found.object.id;
    name = found.object.name;
  } else {
    await beforeWrite(ctx, `creative:${tpl.key}:writing`);
    let res;
    try {
      res = await ctx.provider.createAdCreative(body);
    } catch (err) {
      throw normaliseMetaError(err, "write");
    }
    id = res.id;
    name = tpl.name;
    requestId = res.requestId;
  }
  ctx.refs = { ...ctx.refs, creatives: { ...ctx.refs.creatives, [tpl.key]: { id, name, mediaId: tpl.mediaId, imageHash: media.imageHash } } };
  await saveRefs(ctx, metaCheckpointOf(ctx.refs));
  await recordEvent(ctx.dep.id, "creatives", attached ? "info" : "ok", attached ? `Creative ${tpl.key} (${id}) pehle se tha — attach.` : `Creative ${tpl.key} ${id} bana — Page ${spec.page_id}${spec.instagram_user_id ? ` · IG ${spec.instagram_user_id}` : ""} · Advantage+ creative features OPT_OUT.`, requestId);
}

async function ensureAd(ctx: CreateCtx, tpl: MetaAdTemplate): Promise<void> {
  const marker = ctx.dep.executionMarker;
  const adSet = ctx.refs.adSets[tpl.adSetKey];
  const creative = ctx.refs.creatives[tpl.creativeKey];
  if (!adSet || !creative) throw new ExecutionError("INTERNAL_ERROR", `Ad ${tpl.key} ke parent (ad set ${tpl.adSetKey} / creative ${tpl.creativeKey}) ready nahi.`, { retrySafe: true });
  const found = await findMetaAd(ctx.provider, adSet.id, marker, tpl.key);
  if (found.kind === "many") throw ambiguous(`Ad ${tpl.key} ke ${found.objects.length} objects mile (ad set ${adSet.id})`, found.objects.map((o) => o.id));
  if (found.kind === "one" && found.object.creativeId && found.object.creativeId !== creative.id) {
    throw ambiguous(`Ad ${tpl.key} tag wala ad mila par uska creative ${found.object.creativeId} approved ${creative.id} nahi`, [found.object.id]);
  }
  let id: string;
  let name: string;
  let requestId: string | null = null;
  const attached = found.kind === "one";
  if (found.kind === "one") {
    id = found.object.id;
    name = found.object.name;
  } else {
    await beforeWrite(ctx, `ad:${tpl.key}:writing`);
    let res;
    try {
      res = await ctx.provider.createAdPaused(tpl.build(adSet.id, creative.id));
    } catch (err) {
      throw normaliseMetaError(err, "write");
    }
    id = res.id;
    name = tpl.name;
    requestId = res.requestId;
  }
  ctx.refs = { ...ctx.refs, ads: { ...ctx.refs.ads, [tpl.key]: { id, name, adSetKey: tpl.adSetKey, creativeKey: tpl.creativeKey } } };
  await saveRefs(ctx, metaCheckpointOf(ctx.refs));
  await recordEvent(ctx.dep.id, "ads", attached ? "info" : "ok", attached ? `Ad ${tpl.key} (${id}) pehle se tha — attach.` : `PAUSED ad ${tpl.key} ${id} bana (ad set ${tpl.adSetKey}, creative ${tpl.creativeKey}).`, requestId);
}

function uniqueMediaFacts(media: Record<string, MetaMediaFact>): MetaMediaFact[] {
  const seen = new Map<string, MetaMediaFact>();
  for (const fact of Object.values(media)) if (!seen.has(fact.mediaId)) seen.set(fact.mediaId, fact);
  return [...seen.values()];
}

export async function runMetaCreate(dep: DeploymentWithRelations, workerId: string, opts: WorkerOptions, now: () => Date): Promise<RunOutcome> {
  let step = "meta-preflight";
  try {
    const card = verifyMetaCreateApproval(dep, now());
    const parsed = metaRefsOf(dep);
    if (!parsed.ok) throw new ExecutionError("RECONCILIATION_AMBIGUOUS", `Stored Meta refs padhe nahi gaye: ${parsed.reason}`, { fix: "Human review — Ads Manager me marker se objects dekhein." });
    const provider = await metaProviderOf(opts);
    const siblings = await prisma.campaignDraft.findMany({ where: { taskId: dep.taskId, approvalStatus: "APPROVED", runId: dep.draft.runId } });
    const stored = parsed.refs.campaignId ? parsed.refs.resolved : null;
    const pre = await metaWritePreflight({ draft: dep.draft, goal: dep.task.goal, siblingDrafts: siblings, marker: dep.executionMarker, now: now(), provider, expectedSpecHash: card.specHash, probeUrl: opts.probeUrl, stored });
    assertCreateCardMatches(card, pre);
    let resolved = buildResolved(pre, now());
    if (stored) {
      const diffs = structureDiff(stored, resolved);
      if (diffs.length) throw new ExecutionError("RECONCILIATION_AMBIGUOUS", `Pehle bane objects ki structure ab ki mapping se alag hai (${diffs.join(", ")}) — adhoori hierarchy ko doosre spec se poora nahi karenge.`, { fix: "Human review — Ads Manager me paused objects dekhein." });
      resolved = stored;
    }
    const ctx: CreateCtx = { dep, workerId, provider, opts, now, specHash: card.specHash, refs: { ...parsed.refs, platform: "META", adAccountId: pre.readiness.accountRef, resolved } };
    await transition(dep.id, workerId, "PREFLIGHT", "CREATING", { externalRefs: toJson(ctx.refs), checkpoint: metaCheckpointOf(ctx.refs) });
    await recordEvent(
      dep.id,
      "preflight",
      "ok",
      `Account ${pre.resolved.accountId} · ${pre.resolved.currency} · ${pre.resolved.timeZone} · Page ${pre.resolved.pageId}${pre.resolved.instagramActorId ? ` · IG ${pre.resolved.instagramActorId}` : ""} · ${resolved.adSetKeys.length} ad set / ${resolved.adKeys.length} ad · ${resolved.startDate}→${resolved.endDate} · API ${resolved.apiVersion}${stored ? " · resume" : ""}${pre.warnings.length ? ` · notes: ${pre.warnings.join(" | ").slice(0, 160)}` : ""}`,
    );

    step = "meta-campaign";
    await ensureCampaign(ctx, pre.mapped);
    step = "meta-adsets";
    for (const tpl of pre.mapped.adSets) if (!ctx.refs.adSets[tpl.key]) await ensureAdSet(ctx, tpl);
    step = "meta-media";
    for (const fact of uniqueMediaFacts(pre.readiness.media)) if (!ctx.refs.media[fact.mediaId]) await ensureImage(ctx, fact);
    step = "meta-creatives";
    for (const tpl of pre.mapped.creatives) if (!ctx.refs.creatives[tpl.key]) await ensureCreative(ctx, tpl);
    step = "meta-ads";
    for (const tpl of pre.mapped.ads) if (!ctx.refs.ads[tpl.key]) await ensureAd(ctx, tpl);

    step = "meta-verify";
    const tree = await readTree(provider, ctx.refs.campaignId!);
    const verdict = verifyMetaTree(tree, { marker: dep.executionMarker, refs: ctx.refs, expect: { campaign: "PAUSED", adSets: "PAUSED", ads: "PAUSED" } }, now());
    if (!verdict.ok) {
      throw new ExecutionError("READBACK_MISMATCH", `Read-back approved hierarchy se match nahi karta: ${verdict.problems.join(" · ")}`.slice(0, 480), { fix: "Ads Manager me dekhein; theek karke 'Sync from Meta'. Activation card tab tak nahi banega." });
    }
    await markMetaPausedReady((await loadDeployment(dep.id))!, workerId, ctx.refs, verdict, now());
    const after = await loadDeployment(dep.id);
    return outcome(true, after?.status ?? "PAUSED_READY", "Meta PAUSED hierarchy verified — no spend.");
  } catch (err) {
    return failMetaRun(dep.id, err, step, "CREATE");
  }
}

// ============================================================
// Failure → the row's status (§13 "Partial success", §15 "Partial/uncertain activation")
// ============================================================

/** With objects on Meta these are for a human, not a retry. */
const FINAL_WITH_OBJECTS: ReadonlySet<ExecutionErrorCode> = new Set<ExecutionErrorCode>(["RECONCILIATION_AMBIGUOUS", "READBACK_MISMATCH", "APPROVAL_INVALID", "SPEC_CHANGED", "GUARDRAIL_FAILED"]);

function createFailureStatus(e: ExecutionError, hasObjects: boolean): DeploymentStatusKey {
  if (e.status === "UNKNOWN_OUTCOME") return "UNKNOWN_OUTCOME";
  if (!hasObjects) return e.code === "SPEC_CHANGED" ? "BLOCKED_CONFIG" : e.status;
  if (FINAL_WITH_OBJECTS.has(e.code)) return "FAILED_FINAL";
  // Objects exist and all of them are PAUSED: stop here, keep the card, let a retry resume from the checkpoint.
  return "PARTIAL";
}

function activateFailureStatus(e: ExecutionError, step: string): DeploymentStatusKey {
  if (step === "meta-activate-campaign") return e.code === "NETWORK_UNKNOWN_OUTCOME" || e.status === "UNKNOWN_OUTCOME" ? "UNKNOWN_OUTCOME" : "PARTIAL";
  // The campaign is still PAUSED while ads and ad sets are switched on — nothing can spend, a retry continues.
  if (step === "meta-activate-ads" || step === "meta-activate-adsets") return e.code === "RECONCILIATION_AMBIGUOUS" ? "FAILED_FINAL" : "PARTIAL";
  return e.status;
}

async function failMetaRun(depId: string, err: unknown, step: string, phase: "CREATE" | "ACTIVATE"): Promise<RunOutcome> {
  const e = isExecutionError(err) ? err : new ExecutionError("INTERNAL_ERROR", err instanceof Error ? err.message : String(err), { retrySafe: true });
  const fresh = await prisma.campaignDeployment.findUnique({ where: { id: depId } });
  if (!fresh) return outcome(true, e.status, e.message, e.toSafe());
  const parsed = metaRefsOf(fresh);
  const hasObjects = parsed.ok ? !!parsed.refs.campaignId : true;
  const status = phase === "CREATE" ? createFailureStatus(e, hasObjects) : activateFailureStatus(e, step);
  if (phase === "CREATE" && !hasObjects && e.code === "SPEC_CHANGED" && fresh.createApprovalId) {
    // The card no longer describes what would be created: it is spent, a re-check issues one with the verified values.
    await prisma.marketingApproval.updateMany({ where: { id: fresh.createApprovalId, status: "APPROVED" }, data: { status: "EXPIRED", decisionReason: "verified facts changed after approval" } });
  }
  await failDeployment(fresh, e, step, status);
  return outcome(true, status, e.message, { ...e.toSafe(), retrySafe: status === "PARTIAL" || status === "FAILED_RETRYABLE" });
}

// ============================================================
// PAUSED_READY → activation card
// ============================================================

async function markMetaPausedReady(dep: DeploymentWithRelations, workerId: string | null, refs: MetaExternalRefs, verdict: MetaTreeVerdict, now: Date): Promise<void> {
  const next: MetaExternalRefs = { ...refs, readBack: verdict.readBack };
  const result = {
    campaignId: next.campaignId,
    adSets: Object.values(next.adSets).map((x) => x.id),
    creatives: Object.values(next.creatives).map((x) => x.id),
    ads: Object.values(next.ads).map((x) => x.id),
    pausedVerifiedAt: now.toISOString(),
    marker: dep.executionMarker,
    apiVersion: next.resolved?.apiVersion ?? null,
  };
  await prisma.$transaction(async (tx) => {
    const where = workerId ? { id: dep.id, lockedBy: workerId } : { id: dep.id };
    const res = await tx.campaignDeployment.updateMany({
      where,
      data: { status: "PAUSED_READY", externalRefs: toJson(next), externalStatus: verdict.readBack.campaign.status, pausedVerifiedAt: now, lastSyncedAt: now, lockedAt: null, lockedBy: null, checkpoint: "TREE_VERIFIED_PAUSED", lastErrorCode: null, lastErrorMessage: null, lastErrorFix: null },
    });
    if (res.count !== 1) throw new ExecutionError("INTERNAL_ERROR", "PAUSED_READY likhte waqt lock kho gaya.", { status: "UNKNOWN_OUTCOME" });
    await tx.campaignDraft.update({ where: { id: dep.draftId }, data: { externalCampaignId: next.campaignId, externalStatus: verdict.readBack.campaign.status } });
    if (dep.createApprovalId) await tx.marketingApproval.updateMany({ where: { id: dep.createApprovalId, status: "APPROVED" }, data: { status: "EXECUTED", executionResult: toJson(result) } });
  });
  await recordEvent(
    dep.id,
    "verify",
    "ok",
    `Read-back: campaign ${next.campaignId} PAUSED · ${Object.keys(next.adSets).length} ad set / ${Object.keys(next.creatives).length} creative / ${Object.keys(next.ads).length} ad PAUSED · ${rupees(verdict.readBack.dailyBudgetSumPaise)}/day · targeting, dates, Page/IG, URL aur images approved se match. No spend.`,
  );
  await createMetaActivationCard((await loadDeployment(dep.id))!, now);
  await refreshTaskStatus(dep.taskId);
}

/**
 * The "Activate Meta campaign" card (doc 14 §7.1, §15, §18) — only on a
 * verified read-back whose budget is the approved one, naming every object
 * the activation will touch, the order, the spend warning and the rollback.
 */
export async function createMetaActivationCard(dep: DeploymentWithRelations, now: Date): Promise<string | null> {
  if (dep.status !== "PAUSED_READY") return null;
  const parsed = metaRefsOf(dep);
  if (!parsed.ok) return null;
  const refs = parsed.refs;
  const r = refs.resolved;
  const rb = refs.readBack;
  if (!r || !rb || !refs.campaignId || !metaHierarchyComplete(refs)) return null;
  if ((rb.campaign.status ?? "").toUpperCase() !== "PAUSED") return null;
  const childOk = (status: string | undefined) => ["PAUSED", "ACTIVE"].includes((status ?? "").toUpperCase());
  if (!r.adSetKeys.every((k) => childOk(rb.adSets[k]?.status)) || !r.adKeys.every((k) => childOk(rb.ads[k]?.status))) return null;
  // Never a card on a budget that is not the approved one.
  if (rb.dailyBudgetSumPaise !== r.adSetBudgetSumPaise) return null;
  const cpParsed = dep.createApproval ? MetaCreatePausedPayloadSchema.safeParse(dep.createApproval.payload) : null;
  const cp = cpParsed?.success ? cpParsed.data : null;
  if (cp && cp.dailyBudgetPaise !== rb.dailyBudgetSumPaise) return null;

  const goal = dep.task.goal;
  const windowDays = windowDaysOf(r.startDate, r.endDate);
  const accountRef = dep.accountRef ?? refs.adAccountId;
  const approvalId = randomUUID();
  const payload: MetaActivatePayload = {
    action: "ACTIVATE_CAMPAIGNS",
    platform: "META",
    taskId: dep.taskId,
    draftId: dep.draftId,
    deploymentId: dep.id,
    goalId: goal?.id ?? cp?.goalId ?? dep.draft.goalId ?? "",
    accountRef,
    accountDisplayName: accountDisplay(dep.accountLabel, accountRef),
    campaignId: refs.campaignId,
    adSetIds: r.adSetKeys.map((k) => refs.adSets[k].id),
    creativeIds: r.creativeKeys.map((k) => refs.creatives[k].id),
    adIds: r.adKeys.map((k) => refs.ads[k].id),
    verifiedConfiguredStatus: "PAUSED",
    pausedVerifiedAt: (dep.pausedVerifiedAt ?? now).toISOString(),
    campaignName: dep.draft.name,
    providerCampaignName: r.providerCampaignName,
    executionMarker: dep.executionMarker,
    specHash: dep.specHash,
    currency: dep.currency ?? r.currency,
    dailyBudgetPaise: r.adSetBudgetSumPaise,
    verifiedDailyBudgetPaise: rb.dailyBudgetSumPaise,
    maxSpendPaise: r.adSetBudgetSumPaise * windowDays,
    goalDailyCapPaise: goal?.dailyBudgetPaise ?? null,
    goalTotalCapPaise: goal?.totalBudgetPaise ?? null,
    objective: r.objective,
    startAt: r.startDate,
    endAt: r.endDate,
    timeZone: r.timeZone,
    resolvedAudienceSummary: r.audienceSummary,
    landingUrls: [r.finalUrl],
    pageId: r.pageId,
    instagramActorId: r.instagramActorId,
    creativeCount: r.creativeKeys.length,
    activationOrder: META_ACTIVATION_ORDER,
    rollbackEffect: META_ROLLBACK_EFFECT,
    activationEffect: META_ACTIVATE_EXECUTION_EFFECT,
  };
  MetaActivatePayloadSchema.parse(payload);

  const alreadyActive = [...r.adKeys.filter((k) => (rb.ads[k]?.status ?? "").toUpperCase() === "ACTIVE"), ...r.adSetKeys.filter((k) => (rb.adSets[k]?.status ?? "").toUpperCase() === "ACTIVE")];
  const preview: ApprovalPreview = {
    account: `Meta Ads ${payload.accountDisplayName} · ${payload.currency}`,
    channel: `Meta — ${r.placementSummary}`,
    audience: r.audienceSummary,
    contentPreview: [
      `Campaign ${payload.campaignId} "${r.providerCampaignName}" — ${r.objective} · read-back PAUSED (${new Date(payload.pausedVerifiedAt).toLocaleString("en-IN")})`,
      ...r.adSetKeys.map((k) => `Ad set ${k} ${refs.adSets[k].id} — ${rupees(r.adSetBudgetsPaise[k] ?? null)}/day (Meta par verified) · ${rb.adSets[k]?.status ?? "?"}`),
      ...r.adKeys.map((k) => {
        const creative = refs.creatives[r.adParents[k].creativeKey];
        const ad = rb.ads[k];
        return `Ad ${k} ${refs.ads[k].id} → creative ${creative.id} (image ${creative.imageHash.slice(0, 10)}…) · ${ad?.status ?? "?"}${ad?.effectiveStatus ? ` · Meta: ${ad.effectiveStatus}` : ""}`;
      }),
      `Identity: Page ${r.pageId}${r.instagramActorId ? ` · Instagram ${r.instagramActorId}` : " · sirf Facebook"}`,
      `Activation order: ${META_ACTIVATION_ORDER} — campaign sabse last`,
      ...(alreadyActive.length ? [`Pehle se ACTIVE (campaign PAUSED hai isliye spend nahi): ${alreadyActive.join(", ")}`] : []),
      ...(rb.policySummary ? [`Meta review: ${rb.policySummary}`] : []),
      META_ACTIVATION_WARNING,
    ],
    destination: payload.landingUrls.join(", "),
    startEnd: `${payload.startAt} → ${payload.endAt} (${payload.timeZone}) — ad sets par exact start/end time`,
    dailyBudget: `${rupees(payload.dailyBudgetPaise)}/day (Meta read-back: ${rupees(payload.verifiedDailyBudgetPaise)})${payload.goalDailyCapPaise !== null ? ` · goal cap ${rupees(payload.goalDailyCapPaise)}/day` : ""}`,
    totalBudget: `max ${rupees(payload.maxSpendPaise)} (${windowDays} × ${rupees(payload.dailyBudgetPaise)})${payload.goalTotalCapPaise !== null ? ` · goal cap ${rupees(payload.goalTotalCapPaise)}` : ""}`,
    conversionEvent: r.optimizationGoal === "OFFSITE_CONVERSIONS" ? "Meta pixel conversion (connection mapping)" : "— (traffic objective; BandhanTak GA4/UTM se ginega)",
    whatHappensNow: `${META_ACTIVATION_WARNING} Theek pehle token (ads_management), account (ACTIVE, ${payload.currency}), Page/Instagram, landing page, image URLs aur poori hierarchy (PAUSED campaign, same budget/target/URL/image) dobara verify hongi. Phir ${META_ACTIVATION_ORDER}, har step ke baad read-back. Campaign ACTIVE hone ke baad bhi Meta ka review/delivery status alag dikhega — "activated" ka matlab "delivering" nahi.`,
    rollback: `${META_ROLLBACK_EFFECT} Ads Manager se kabhi bhi Pause kar sakte hain; BandhanTak baad me auto-pause nahi karta (MKT-4).`,
  };

  await prisma.$transaction(async (tx) => {
    if (dep.activateApprovalId) await tx.marketingApproval.updateMany({ where: { id: dep.activateApprovalId, status: "PENDING" }, data: { status: "EXPIRED" } });
    await tx.marketingApproval.create({
      data: {
        id: approvalId,
        taskId: dep.taskId,
        action: "ACTIVATE_CAMPAIGNS",
        payload: toJson(payload),
        payloadHash: hashPayload(payload),
        preview: toJson(preview),
        status: "PENDING",
        requestedBy: "growth-saathi",
        expiresAt: new Date(now.getTime() + APPROVAL_TTL_DAYS * 86_400_000),
      },
    });
    const res = await tx.campaignDeployment.updateMany({ where: { id: dep.id, status: "PAUSED_READY" }, data: { status: "ACTIVATION_PENDING", phase: "ACTIVATE", activateApprovalId: approvalId } });
    if (res.count !== 1) throw new ExecutionError("INTERNAL_ERROR", "Activation card likhte waqt row badal gayi.");
  });
  await recordEvent(dep.id, "activation-card", "ok", `Meta activation card bana — ${rupees(payload.dailyBudgetPaise)}/day, ${payload.startAt}→${payload.endAt}, order ${META_ACTIVATION_ORDER}. Spend sirf approve ke baad.`);
  return approvalId;
}

// ============================================================
// Activation — children first, campaign last (§15)
// ============================================================

async function checkMetaAccountNow(provider: MetaAdsWriteProvider, expect: { accountRef: string; currency: string }): Promise<void> {
  let caps;
  try {
    caps = await provider.inspectTokenCapabilities();
  } catch (err) {
    throw normaliseMetaError(err, "read");
  }
  if (!caps.granted.includes(META_WRITE_PERMISSION)) throw new ExecutionError("META_ADS_MANAGEMENT_MISSING", `Token par ${META_WRITE_PERMISSION} ab nahi hai.`, { fix: "Token ads_management ke saath dobara generate karein; 'Check ad creation readiness'.", reconnect: true });
  let account;
  try {
    account = await provider.describeAccount();
  } catch (err) {
    throw normaliseMetaError(err, "read");
  }
  if (normaliseAdAccountId(account.id) !== expect.accountRef) throw new ExecutionError("ACCOUNT_NOT_READY", `Credentials account ${account.id} kholte hain, card ${expect.accountRef} ka hai.`, { fix: "Connections me ad account ID check karein." });
  if (account.accountStatus !== 1) throw new ExecutionError("META_AD_ACCOUNT_DISABLED", `Ad account status ${account.accountStatus ?? "?"} — ACTIVE (1) nahi; activation se spend shuru nahi ho sakta.`, { fix: "Ads Manager me account/billing theek karein, phir 'Retry safely'." });
  if (account.tasks !== null && !account.tasks.some((t) => META_ACCOUNT_WRITE_TASKS.includes(t))) throw new ExecutionError("META_AD_ACCOUNT_FORBIDDEN", `Token ke tasks ${account.tasks.join(", ") || "none"} — ADVERTISE/MANAGE nahi.`, { fix: "Business Manager → Ad accounts → 'Manage campaigns' access." });
  if ((account.currency ?? "").toUpperCase() !== expect.currency) throw new ExecutionError("META_ACCOUNT_CURRENCY_MISMATCH", `Account currency ${account.currency ?? "?"} ≠ card ${expect.currency}.`, { fix: `${expect.currency} account connect karein.` });
}

async function checkMetaIdentityNow(provider: MetaAdsWriteProvider, pageId: string, instagramActorId: string | null): Promise<void> {
  let visible = false;
  try {
    const pages = await provider.listPromotablePages();
    visible = pages.some((p) => p.id === pageId);
  } catch {
    visible = false;
  }
  if (!visible) {
    let direct;
    try {
      direct = await provider.describePage(pageId);
    } catch (err) {
      throw normaliseMetaError(err, "read");
    }
    if (!direct) throw new ExecutionError("META_PAGE_NOT_ASSIGNED", `Page ${pageId} token ko ab nahi dikhta — ads us Page ke naam se chalenge.`, { fix: "Business Manager → Pages → system user ko 'Create ads' dein." });
  }
  if (instagramActorId) {
    let actors;
    try {
      actors = await provider.listInstagramActors(pageId);
    } catch (err) {
      throw normaliseMetaError(err, "read");
    }
    if (!actors.some((a) => a.id === instagramActorId)) throw new ExecutionError("META_INSTAGRAM_NOT_ASSIGNED", `Instagram ${instagramActorId} Page ${pageId} se ab linked nahi hai.`, { fix: "Page settings → Linked accounts → Instagram." });
  }
}

async function beforeStatusWrite(dep: DeploymentWithRelations, workerId: string, specHash: string, now: () => Date, intent: string): Promise<void> {
  await assertOwned(dep.id, workerId, "ACTIVATING");
  if ((await currentSpecHash(dep.draftId)) !== specHash) throw new ExecutionError("SPEC_CHANGED", "Activation se pehle draft badal gaya.");
  await checkpointWrite(dep.id, workerId, "ACTIVATING", { lastWriteAttemptAt: now(), checkpoint: intent });
}

function expectTree(marker: string, refs: MetaExternalRefs, campaign: "PAUSED" | "ACTIVE", adSets: MetaChildExpect, ads: MetaChildExpect) {
  return { marker, refs, expect: { campaign, adSets, ads } };
}

export async function runMetaActivate(dep: DeploymentWithRelations, workerId: string, opts: WorkerOptions, now: () => Date): Promise<RunOutcome> {
  let step = "meta-activate-preflight";
  try {
    const parsed = metaRefsOf(dep);
    if (!parsed.ok) throw new ExecutionError("RECONCILIATION_AMBIGUOUS", `Stored Meta refs padhe nahi gaye: ${parsed.reason}`, { fix: "Human review — Ads Manager me marker se objects dekhein." });
    let refs = parsed.refs;
    const card = verifyMetaActivateApproval(dep, refs, now());
    const r = refs.resolved;
    if (!r || !refs.campaignId || !metaHierarchyComplete(refs)) throw new ExecutionError("APPROVAL_INVALID", "Deployment par poori Meta hierarchy ke refs nahi hain — activate nahi karenge.");
    const campaignId = refs.campaignId;
    const provider = await metaProviderOf(opts);
    const marker = dep.executionMarker;

    // ---- just-in-time: spec, media, account, identity, window, landing ----------
    const siblings = await prisma.campaignDraft.findMany({ where: { taskId: dep.taskId, approvalStatus: "APPROVED", runId: dep.draft.runId } });
    const readiness = await metaReadiness({ draft: dep.draft, goal: dep.task.goal, siblingDrafts: siblings, marker, now: now() });
    if (readiness.specHash !== card.specHash) throw new ExecutionError("SPEC_CHANGED", "Draft spec activation card se alag hai.");
    if (readiness.accountRef !== card.accountRef) throw new ExecutionError("ACCOUNT_NOT_READY", "Connection ka ad account card se alag hai.", { fix: "Connections check karein." });
    const approvedMedia = uniqueMediaFacts(readiness.media).map((m) => m.mediaId);
    if (!sameIdSet(approvedMedia, [...new Set(Object.values(r.creativeMedia))])) {
      throw new ExecutionError("CREATIVE_INVALID", "Ads jin images se bane the wo ab approved set nahi hain (badli ya reject hui) — activate nahi karenge.", { fix: "Approved image ke saath 'Revise Package' se naya package banayein.", status: "FAILED_FINAL" });
    }
    await checkMetaAccountNow(provider, { accountRef: card.accountRef, currency: card.currency });
    await checkMetaIdentityNow(provider, card.pageId, card.instagramActorId);
    const today = calendarDateIn(r.timeZone, now());
    if (card.endAt < today) throw new ExecutionError("INVALID_BUDGET", `Campaign window ${card.endAt} ko khatam — activation ka matlab nahi.`, { fix: "'Revise Package' se naya window/package banayein.", status: "FAILED_FINAL" });
    const landing = await (opts.probeLanding ?? defaultProbeLanding)(r.finalUrl);
    if (!landing.ok) throw new ExecutionError("INVALID_LANDING", `Landing URL reachable nahi (${landing.status ?? "no response"}): ${r.finalUrl}`, { fix: "Site live hai? DNS/deploy check karke 'Retry safely'." });
    const probe = opts.probeUrl ?? ((url: string) => probePublicImageUrl(url));
    for (const fact of uniqueMediaFacts(readiness.media)) {
      if (!fact.productionReady && !/^https:\/\//.test(fact.url)) continue;
      const verdict = await probe(fact.url);
      if (!verdict.ok) throw new ExecutionError("CREATIVE_INVALID", `Image ${fact.mediaId.slice(0, 8)} ka public URL reachable nahi: ${verdict.reason ?? verdict.status ?? "?"}.`, { fix: "S3_PUBLIC_URL / bucket access check karke 'Retry safely'." });
    }

    // ---- the tree must still be the approved paused hierarchy --------------------
    step = "meta-activate-verify";
    const before = verifyMetaTree(await readTree(provider, campaignId), expectTree(marker, refs, "PAUSED", "PAUSED_OR_ACTIVE", "PAUSED_OR_ACTIVE"), now());
    if (!before.ok) {
      throw new ExecutionError("READBACK_MISMATCH", `Meta hierarchy approved state se alag hai, activate nahi karenge: ${before.problems.join(" · ")}`.slice(0, 480), {
        fix: "Ads Manager me objects approved state par laayein (campaign PAUSED, same budget/target/URL/image), phir 'Sync from Meta' aur naya activation card.",
      });
    }
    if (before.readBack.dailyBudgetSumPaise !== card.verifiedDailyBudgetPaise) {
      throw new ExecutionError("READBACK_MISMATCH", `Ad sets ka budget ab ${rupees(before.readBack.dailyBudgetSumPaise)}/day hai, card par ${rupees(card.verifiedDailyBudgetPaise)}/day tha.`, { fix: "Naya activation card chahiye." });
    }
    const policy = metaPolicyBlocks(before.readBack);
    if (policy.length) throw new ExecutionError("POLICY_REJECTED", `Meta review ne ads roke: ${policy.join(" · ")}`.slice(0, 400), { fix: "Ads Manager me review feedback dekhein; 'Revise Package' se copy/creative sudhaarein." });
    await recordEvent(dep.id, "activate-verify", "ok", `Just-in-time read-back: campaign PAUSED · ${r.adSetKeys.length} ad set / ${r.adKeys.length} ad approved state me · ${rupees(before.readBack.dailyBudgetSumPaise)}/day.`);
    refs = { ...refs, activation: refs.activation ?? emptyMetaActivation() };

    // ---- 1. ads ----------------------------------------------------------------
    step = "meta-activate-ads";
    for (const key of r.adKeys) {
      if ((before.readBack.ads[key]?.status ?? "").toUpperCase() === "ACTIVE") continue;
      await beforeStatusWrite(dep, workerId, card.specHash, now, `activate:ad:${key}`);
      try {
        await provider.setAdStatus(refs.ads[key].id, "ACTIVE");
      } catch (err) {
        throw normaliseMetaError(err, "write");
      }
    }
    const afterAds = verifyMetaTree(await readTree(provider, campaignId), expectTree(marker, refs, "PAUSED", "PAUSED_OR_ACTIVE", "ACTIVE"), now());
    if (!afterAds.ok) throw new ExecutionError("READBACK_MISMATCH", `Ads activate ke baad read-back: ${afterAds.problems.join(" · ")}`.slice(0, 400), { fix: "'Retry safely' — campaign PAUSED hai, spend nahi ho raha." });
    refs = { ...refs, readBack: afterAds.readBack, activation: { ...refs.activation!, adsEnabledAt: now().toISOString() } };
    await checkpointWrite(dep.id, workerId, "ACTIVATING", { externalRefs: toJson(refs), checkpoint: "ADS_ACTIVE" });
    await recordEvent(dep.id, "activate-ads", "ok", `${r.adKeys.length} ads ACTIVE (configured) — campaign abhi PAUSED, spend nahi.`);

    // ---- 2. ad sets --------------------------------------------------------------
    step = "meta-activate-adsets";
    for (const key of r.adSetKeys) {
      if ((afterAds.readBack.adSets[key]?.status ?? "").toUpperCase() === "ACTIVE") continue;
      await beforeStatusWrite(dep, workerId, card.specHash, now, `activate:adset:${key}`);
      try {
        await provider.setAdSetStatus(refs.adSets[key].id, "ACTIVE");
      } catch (err) {
        throw normaliseMetaError(err, "write");
      }
    }
    const afterSets = verifyMetaTree(await readTree(provider, campaignId), expectTree(marker, refs, "PAUSED", "ACTIVE", "ACTIVE"), now());
    if (!afterSets.ok) throw new ExecutionError("READBACK_MISMATCH", `Ad sets activate ke baad read-back: ${afterSets.problems.join(" · ")}`.slice(0, 400), { fix: "'Retry safely' — campaign PAUSED hai, spend nahi ho raha." });
    refs = { ...refs, readBack: afterSets.readBack, activation: { ...refs.activation!, adSetsEnabledAt: now().toISOString() } };
    await checkpointWrite(dep.id, workerId, "ACTIVATING", { externalRefs: toJson(refs), checkpoint: "ADSETS_ACTIVE" });
    await recordEvent(dep.id, "activate-adsets", "ok", `${r.adSetKeys.length} ad sets ACTIVE (configured) — campaign abhi bhi PAUSED.`);

    // ---- 3. campaign, last -------------------------------------------------------
    step = "meta-activate-campaign-check";
    await checkMetaAccountNow(provider, { accountRef: card.accountRef, currency: card.currency });
    if (afterSets.readBack.dailyBudgetSumPaise !== card.verifiedDailyBudgetPaise) {
      throw new ExecutionError("READBACK_MISMATCH", `Campaign activate se theek pehle budget ${rupees(afterSets.readBack.dailyBudgetSumPaise)}/day mila, card ${rupees(card.verifiedDailyBudgetPaise)}/day.`, { fix: "Campaign PAUSED hai. Naya activation card chahiye." });
    }
    await beforeStatusWrite(dep, workerId, card.specHash, now, "activate:campaign");
    step = "meta-activate-campaign";
    try {
      await provider.setCampaignStatus(campaignId, "ACTIVE");
    } catch (err) {
      const e = normaliseMetaError(err, "write");
      if (e.code === "NETWORK_UNKNOWN_OUTCOME") {
        throw new ExecutionError("NETWORK_UNKNOWN_OUTCOME", "Campaign activate write ka jawab nahi aaya — campaign ACTIVE ho sakta hai.", { fix: "'Sync from Meta' chalayein: ACTIVE + hierarchy sahi mili to LIVE; PAUSED mila to safe retry.", requestId: e.requestId });
      }
      throw e;
    }

    // ---- 4. read back ------------------------------------------------------------
    step = "meta-activate-readback";
    let after: MetaCampaignTree;
    try {
      after = await readTree(provider, campaignId);
    } catch (err) {
      const e = isExecutionError(err) ? err : normaliseMetaError(err, "read");
      throw new ExecutionError("NETWORK_UNKNOWN_OUTCOME", `Campaign activate write gaya par read-back nahi mila (${e.message.slice(0, 120)}) — state uncertain.`, { fix: "'Sync from Meta' chalayein.", status: "UNKNOWN_OUTCOME" });
    }
    if ((after.campaign.status ?? "").toUpperCase() !== "ACTIVE") {
      throw new ExecutionError("READBACK_MISMATCH", `Activation ke baad Meta campaign ${after.campaign.status || "?"} dikha, ACTIVE nahi — spend shuru nahi hua.`, { fix: "'Sync from Meta'; PAUSED ho to 'Retry safely'.", retrySafe: true, status: "FAILED_RETRYABLE" });
    }
    const final = verifyMetaTree(after, expectTree(marker, refs, "ACTIVE", "ACTIVE", "ACTIVE"), now());
    if (!final.ok) return rollbackMetaActivation(dep, workerId, provider, refs, final, now);
    await markMetaLive((await loadDeployment(dep.id))!, workerId, refs, final, now(), "activation");
    const done = await loadDeployment(dep.id);
    return outcome(true, done?.status ?? "LIVE", "Meta campaign activated — ads → ad sets → campaign, read-back ACTIVE.");
  } catch (err) {
    return failMetaRun(dep.id, err, step, "ACTIVATE");
  }
}

/**
 * The compensation the activation card described, and nothing more: the
 * campaign read back ACTIVE but the hierarchy is not the approved one, so the
 * same execution pauses the campaign and reads it back. A rollback that cannot
 * be confirmed is never quiet — it is an urgent UNKNOWN_OUTCOME naming the
 * campaign to pause by hand.
 */
async function rollbackMetaActivation(dep: DeploymentWithRelations, workerId: string, provider: MetaAdsWriteProvider, refs: MetaExternalRefs, verdict: MetaTreeVerdict, now: () => Date): Promise<RunOutcome> {
  const campaignId = refs.campaignId!;
  const reason = verdict.problems.join(" · ").slice(0, 300);
  await recordEvent(dep.id, "rollback", "error", `Campaign ACTIVE hua par hierarchy unsafe: ${reason} — approved rollback: campaign PAUSED.`);
  let paused = false;
  let rollbackProblem: string | null = null;
  try {
    await provider.setCampaignStatus(campaignId, "PAUSED");
    const check = await provider.readCampaignTree(campaignId);
    paused = (check?.campaign.status ?? "").toUpperCase() === "PAUSED";
    if (!paused) rollbackProblem = `read-back ${check?.campaign.status ?? "missing"}`;
  } catch (err) {
    rollbackProblem = normaliseMetaError(err, "write").message.slice(0, 160);
  }
  const at = now();
  const next: MetaExternalRefs = {
    ...refs,
    readBack: verdict.readBack,
    activation: { ...(refs.activation ?? emptyMetaActivation()), campaignEnabledAt: at.toISOString(), rolledBackAt: paused ? at.toISOString() : null, rollbackReason: reason },
  };
  await prisma.campaignDeployment.updateMany({ where: { id: dep.id, lockedBy: workerId }, data: { externalRefs: toJson(next), externalStatus: paused ? "PAUSED" : "ACTIVE", lastSyncedAt: at } });
  const fresh = (await prisma.campaignDeployment.findUnique({ where: { id: dep.id } }))!;
  if (paused) {
    const e = new ExecutionError("READBACK_MISMATCH", `Activation read-back unsafe tha (${reason}) — campaign turant PAUSED kiya, rollback verified. Spend band.`, { fix: "Ads Manager me mismatch theek karein, phir 'Sync from Meta' — approved state me mila to naya activation card.", status: "FAILED_FINAL" });
    await failDeployment(fresh, e, "meta-rollback", "FAILED_FINAL");
    return outcome(true, "FAILED_FINAL", e.message, e.toSafe());
  }
  const urgent = new ExecutionError("NETWORK_UNKNOWN_OUTCOME", `URGENT: Meta campaign ${campaignId} ACTIVE hai aur hierarchy unsafe (${reason}); rollback confirm nahi hua (${rollbackProblem}). Ads Manager me campaign turant PAUSE karein.`, {
    fix: `Ads Manager → campaign ${campaignId} → Pause. Phir 'Sync from Meta'.`,
    status: "UNKNOWN_OUTCOME",
  });
  await failDeployment(fresh, urgent, "meta-rollback", "UNKNOWN_OUTCOME");
  return outcome(true, "UNKNOWN_OUTCOME", urgent.message, urgent.toSafe());
}

async function markMetaLive(dep: DeploymentWithRelations, workerId: string | null, refs: MetaExternalRefs, verdict: MetaTreeVerdict, now: Date, source: "activation" | "sync"): Promise<void> {
  const next: MetaExternalRefs = { ...refs, readBack: verdict.readBack, activation: { ...(refs.activation ?? emptyMetaActivation()), campaignEnabledAt: refs.activation?.campaignEnabledAt ?? now.toISOString() } };
  const delivery = deliveryLabel("META", verdict.delivery);
  await prisma.$transaction(async (tx) => {
    const where = workerId ? { id: dep.id, lockedBy: workerId } : { id: dep.id };
    const res = await tx.campaignDeployment.updateMany({
      where,
      data: { status: "LIVE", externalRefs: toJson(next), externalStatus: verdict.readBack.campaign.status, activatedAt: now, lastSyncedAt: now, lockedAt: null, lockedBy: null, checkpoint: "LIVE", lastErrorCode: null, lastErrorMessage: null, lastErrorFix: null },
    });
    if (res.count !== 1) throw new ExecutionError("INTERNAL_ERROR", "LIVE likhte waqt lock kho gaya.", { status: "UNKNOWN_OUTCOME" });
    await tx.campaignDraft.update({ where: { id: dep.draftId }, data: { externalStatus: verdict.readBack.campaign.status } });
    if (dep.activateApprovalId) {
      await tx.marketingApproval.updateMany({ where: { id: dep.activateApprovalId, status: "APPROVED" }, data: { status: "EXECUTED", executionResult: toJson({ campaignId: next.campaignId, activatedAt: now.toISOString(), delivery: verdict.delivery, order: META_ACTIVATION_ORDER }) } });
    }
    if (dep.task.goalId) await tx.marketingGoal.updateMany({ where: { id: dep.task.goalId }, data: { status: "ACTIVE" } });
  });
  await recordEvent(
    dep.id,
    source === "activation" ? "activate" : "sync",
    "ok",
    `Meta read-back: campaign + ${Object.keys(next.adSets).length} ad sets + ${Object.keys(next.ads).length} ads ACTIVE (configured) — activated, spend ho sakta hai. ${delivery.text}.`,
  );
  await refreshTaskStatus(dep.taskId);
}

// ============================================================
// Sync / reconcile (§14, §16)
// ============================================================

interface Reconciled {
  refs: MetaExternalRefs;
  attached: string[];
  ambiguous: { what: string; ids: string[] } | null;
}

/** Every intended object that has no stored id is looked for by its tag, inside its stored parent. Found once → attached; found twice → a human. Reads only. */
async function reconcileMissing(provider: MetaAdsWriteProvider, dep: DeploymentWithRelations, refs: MetaExternalRefs, opts: WorkerOptions): Promise<Reconciled> {
  const marker = dep.executionMarker;
  const r = refs.resolved;
  const attached: string[] = [];
  let next = refs;
  const stop = (what: string, ids: string[]): Reconciled => ({ refs: next, attached, ambiguous: { what, ids } });

  if (!next.campaignId) {
    const found = await findMetaCampaign(provider, marker);
    if (found.kind === "many") return stop(`Marker [${marker}] wale ${found.objects.length} campaigns`, found.objects.map((o) => o.id));
    if (found.kind === "one") {
      if (!r) return stop(`Marker [${marker}] ka campaign mila par deployment par resolved spec nahi`, [found.object.id]);
      next = { ...next, campaignId: found.object.id, campaignName: found.object.name };
      attached.push(`campaign ${found.object.id}`);
    }
  }
  if (!next.campaignId || !r) return { refs: next, attached, ambiguous: null };
  const campaignId = next.campaignId;

  for (const key of r.adSetKeys) {
    if (next.adSets[key]) continue;
    const found = await findMetaAdSet(provider, campaignId, marker, key);
    if (found.kind === "many") return stop(`Ad set ${key} ke ${found.objects.length} objects`, found.objects.map((o) => o.id));
    if (found.kind === "one") {
      next = { ...next, adSets: { ...next.adSets, [key]: { id: found.object.id, name: found.object.name } } };
      attached.push(`${key} ${found.object.id}`);
    }
  }

  const missingMedia = [...new Set(Object.values(r.creativeMedia))].filter((m) => !next.media[m]);
  if (missingMedia.length) {
    const rows = await prisma.marketingCreativeMedia.findMany({ where: { id: { in: missingMedia } } });
    for (const row of rows) {
      const bytes = await readMediaBytes(opts, row.storageKey);
      if (!bytes) continue;
      let image;
      try {
        image = await provider.findImageByHash(createHash("md5").update(bytes).digest("hex"));
      } catch (err) {
        throw normaliseMetaError(err, "read");
      }
      if (image) {
        next = { ...next, media: { ...next.media, [row.id]: { imageHash: image.hash, url: image.url } } };
        attached.push(`image ${row.id.slice(0, 8)}`);
      }
    }
  }

  for (const key of r.creativeKeys) {
    if (next.creatives[key]) continue;
    const mediaId = r.creativeMedia[key];
    const media = mediaId ? next.media[mediaId] : undefined;
    if (!mediaId || !media) continue;
    const setKey = Object.values(r.adParents).find((p) => p.creativeKey === key)?.adSetKey;
    const usesInstagram = !!setKey && (r.adSetTargets[setKey]?.publisherPlatforms ?? []).includes("instagram") && !!r.instagramActorId;
    const found = await findMetaCreative(provider, marker, key, { imageHash: media.imageHash, link: r.finalUrl, pageId: r.pageId, instagramUserId: usesInstagram ? r.instagramActorId : null });
    if (found.kind === "many") return stop(found.mismatched?.length ? `Creative ${key} tag wala object approved image/URL/Page/IG se alag` : `Creative ${key} ke ${found.objects.length} objects`, found.objects.map((o) => o.id));
    if (found.kind === "one") {
      next = { ...next, creatives: { ...next.creatives, [key]: { id: found.object.id, name: found.object.name, mediaId, imageHash: media.imageHash } } };
      attached.push(`${key} ${found.object.id}`);
    }
  }

  for (const key of r.adKeys) {
    if (next.ads[key]) continue;
    const parent = r.adParents[key];
    const adSet = parent ? next.adSets[parent.adSetKey] : undefined;
    if (!parent || !adSet) continue;
    const found = await findMetaAd(provider, adSet.id, marker, key);
    if (found.kind === "many") return stop(`Ad ${key} ke ${found.objects.length} objects`, found.objects.map((o) => o.id));
    if (found.kind === "one") {
      const creative = next.creatives[parent.creativeKey];
      if (creative && found.object.creativeId && found.object.creativeId !== creative.id) return stop(`Ad ${key} tag wala ad mila par creative approved se alag`, [found.object.id]);
      next = { ...next, ads: { ...next.ads, [key]: { id: found.object.id, name: found.object.name, adSetKey: parent.adSetKey, creativeKey: parent.creativeKey } } };
      attached.push(`${key} ${found.object.id}`);
    }
  }
  return { refs: next, attached, ambiguous: null };
}

/** A manual change on Meta is shown, never overwritten (§16). */
async function recordMetaDrift(dep: DeploymentWithRelations, refs: MetaExternalRefs, verdict: MetaTreeVerdict, now: Date, urgent = false): Promise<RunOutcome> {
  const next: MetaExternalRefs = { ...refs, readBack: verdict.readBack };
  const drift = verdict.problems.length
    ? `${urgent ? "URGENT — campaign Meta par ACTIVE hai: " : ""}Meta par BandhanTak ke bahar badlaav: ${verdict.problems.join(" · ")}. Budget/audience/URL/schedule/creative badalne ke liye naya plan + approval chahiye.`.slice(0, 500)
    : null;
  await prisma.campaignDeployment.update({
    where: { id: dep.id },
    data: {
      externalRefs: toJson(next),
      externalStatus: verdict.readBack.campaign.status,
      lastSyncedAt: now,
      lockedAt: null,
      lockedBy: null,
      ...(drift ? { lastErrorCode: "EXTERNAL_DRIFT", lastErrorMessage: drift, lastErrorFix: urgent ? "Ads Manager me campaign dekhein; unsafe ho to wahin Pause karein." : null } : dep.lastErrorCode === "EXTERNAL_DRIFT" ? { lastErrorCode: null, lastErrorMessage: null, lastErrorFix: null } : {}),
    },
  });
  await prisma.campaignDraft.update({ where: { id: dep.draftId }, data: { externalStatus: verdict.readBack.campaign.status } });
  await recordEvent(dep.id, "sync", drift ? "error" : "ok", drift ?? `Read-back ${verdict.readBack.campaign.status} · ${rupees(verdict.readBack.dailyBudgetSumPaise)}/day · ${Object.keys(verdict.readBack.ads).length} ads — approved state se match. ${deliveryLabel("META", verdict.delivery).text}.`);
  if (drift) await refreshTaskStatus(dep.taskId);
  return outcome(true, dep.status, drift ?? "Meta state approved state se match karta hai.");
}

/** Whether the create the row was sending when its answer was lost is now stored — then nothing is left to wait for. Null when the checkpoint names no create. */
function inFlightLanded(checkpoint: string | null, refs: MetaExternalRefs): boolean | null {
  const m = /^(campaign|adset|media|creative|ad)(?::([^:]+))?:writing$/.exec(checkpoint ?? "");
  if (!m) return null;
  const key = m[2] ?? "";
  switch (m[1]) {
    case "campaign":
      return !!refs.campaignId;
    case "adset":
      return !!refs.adSets[key];
    case "media":
      return !!refs.media[key];
    case "creative":
      return !!refs.creatives[key];
    default:
      return !!refs.ads[key];
  }
}

/** Sync for a Meta row whose lease the caller already holds (`syncDeployment`). Reads, attaches what it finds, moves the row to the state the read-back justifies. */
export async function syncMeta(dep0: DeploymentWithRelations, workerId: string, opts: WorkerOptions, now: () => Date): Promise<RunOutcome> {
  const provider = await metaProviderOf(opts);
  const dep = (await loadDeployment(dep0.id))!;
  const parsed = metaRefsOf(dep);
  if (!parsed.ok) throw new ExecutionError("RECONCILIATION_AMBIGUOUS", `Stored Meta refs padhe nahi gaye: ${parsed.reason}`, { fix: "Human review — Ads Manager me marker se objects dekhein." });
  let refs = parsed.refs;
  const marker = dep.executionMarker;

  // ---- create phase ------------------------------------------------------------
  if (dep.phase === "CREATE") {
    if (dep.status === "PAUSED_READY") {
      const verdict = verifyMetaTree(await readTree(provider, refs.campaignId!), expectTree(marker, refs, "PAUSED", "PAUSED", "PAUSED"), now());
      return recordMetaDrift(dep, refs, verdict, now());
    }
    const rec = await reconcileMissing(provider, dep, refs, opts);
    if (rec.ambiguous) {
      const e = ambiguous(rec.ambiguous.what, rec.ambiguous.ids);
      await failDeployment(dep, e, "reconcile", "FAILED_FINAL");
      return outcome(true, "FAILED_FINAL", e.message, e.toSafe());
    }
    refs = rec.refs;
    if (rec.attached.length) {
      await prisma.campaignDeployment.updateMany({ where: { id: dep.id, lockedBy: workerId }, data: { externalRefs: toJson(refs), checkpoint: metaCheckpointOf(refs) } });
      await recordEvent(dep.id, "reconcile", "ok", `Marker search se attach: ${rec.attached.join(", ")} — dobara create nahi.`);
    }
    if (!metaHierarchyComplete(refs)) {
      const sinceWrite = dep.lastWriteAttemptAt ? now().getTime() - dep.lastWriteAttemptAt.getTime() : Number.POSITIVE_INFINITY;
      const missing = metaMissingKeys(refs).join(", ");
      if (dep.status === "UNKNOWN_OUTCOME" && sinceWrite < RECONCILE_GRACE_MS && inFlightLanded(dep.checkpoint, refs) !== true) {
        await releaseLock(dep.id);
        const wait = Math.ceil((RECONCILE_GRACE_MS - sinceWrite) / 1000);
        await recordEvent(dep.id, "reconcile", "info", `Abhi nahi mile: ${missing}; write ${Math.round(sinceWrite / 1000)}s pehle gaya tha — ${wait}s baad dobara sync.`);
        return outcome(true, "UNKNOWN_OUTCOME", `Meta ko commit ka waqt do — ${wait}s baad dobara Sync karein.`);
      }
      if (dep.status === "FAILED_FINAL") {
        await releaseLock(dep.id);
        await recordEvent(dep.id, "reconcile", "info", `Hierarchy adhoori (${missing}); row FAILED_FINAL hi rahegi — human review.`);
        return outcome(true, "FAILED_FINAL", `Hierarchy adhoori hai (${missing}) — human review.`);
      }
      const status: DeploymentStatusKey = refs.campaignId ? "PARTIAL" : "FAILED_RETRYABLE";
      const e = refs.campaignId
        ? new ExecutionError("PROVIDER_PARTIAL_FAILURE", `Meta par hierarchy adhoori hai — nahi mile: ${missing}. Jo bana hai wo PAUSED hai.`, { fix: "'Retry safely' — pehle marker search, phir sirf missing objects PAUSED banenge.", retrySafe: true, status })
        : new ExecutionError("NETWORK_UNKNOWN_OUTCOME", "Meta par marker ka koi object nahi mila — write laga hi nahi. Retry safe hai.", { fix: "'Retry safely' dabayein.", retrySafe: true, status });
      await prisma.campaignDeployment.update({ where: { id: dep.id }, data: { status, lockedAt: null, lockedBy: null, lastErrorCode: e.code, lastErrorMessage: e.message.slice(0, 500), lastErrorFix: e.fix, checkpoint: metaCheckpointOf(refs) } });
      await recordEvent(dep.id, "reconcile", "ok", `Marker search ke baad ${status} (missing: ${missing}) — duplicate ka risk nahi.`);
      await refreshTaskStatus(dep.taskId);
      return outcome(true, status, e.message, e.toSafe());
    }
    const verdict = verifyMetaTree(await readTree(provider, refs.campaignId!), expectTree(marker, refs, "PAUSED", "PAUSED", "PAUSED"), now());
    if (verdict.ok) {
      await markMetaPausedReady(dep, workerId, refs, verdict, now());
      const after = await loadDeployment(dep.id);
      return outcome(true, after?.status ?? "ACTIVATION_PENDING", "Read-back verified — PAUSED hierarchy poori mili, activation card bana. No spend.");
    }
    const e = new ExecutionError("READBACK_MISMATCH", `Meta par hierarchy approved spec se alag hai: ${verdict.problems.join(" · ")}`.slice(0, 480), { fix: "Ads Manager me theek karein, phir 'Sync from Meta'." });
    await failDeployment(dep, e, "sync", "FAILED_FINAL");
    return outcome(true, "FAILED_FINAL", e.message, e.toSafe());
  }

  // ---- activation phase ----------------------------------------------------------
  const tree = await readTree(provider, refs.campaignId!);
  if (dep.status === "LIVE") return recordMetaDrift(dep, refs, verifyMetaTree(tree, expectTree(marker, refs, "ACTIVE", "ACTIVE", "ACTIVE"), now()), now());

  const approval = dep.activateApproval;
  const inFlight = !!approval && approval.status === "APPROVED" && ["UNKNOWN_OUTCOME", "FAILED_RETRYABLE", "PARTIAL", "BLOCKED_CONFIG"].includes(dep.status);
  if ((tree.campaign.status ?? "").toUpperCase() === "ACTIVE") {
    const verdict = verifyMetaTree(tree, expectTree(marker, refs, "ACTIVE", "ACTIVE", "ACTIVE"), now());
    if (verdict.ok) {
      if (dep.status === "ACTIVATION_PENDING") {
        await prisma.marketingApproval.updateMany({ where: { id: dep.activateApprovalId ?? "", status: "PENDING" }, data: { status: "EXPIRED" } });
        await recordEvent(dep.id, "sync", "error", "Campaign Meta par ACTIVE mila jabki activation card pending tha — BandhanTak ke bahar activate hua.");
      }
      await markMetaLive(dep, workerId, refs, verdict, now(), "sync");
      return outcome(true, "LIVE", "Meta campaign ACTIVE aur hierarchy approved — activated.");
    }
    // Inside an approved activation that has not finished: the compensation it described. Anywhere else: report, never an automatic pause (§16).
    if (inFlight) return rollbackMetaActivation(dep, workerId, provider, refs, verdict, now);
    return recordMetaDrift(dep, refs, verdict, now(), true);
  }

  const verdict = verifyMetaTree(tree, expectTree(marker, refs, "PAUSED", "PAUSED_OR_ACTIVE", "PAUSED_OR_ACTIVE"), now());
  if (dep.status === "UNKNOWN_OUTCOME") {
    const e = new ExecutionError("NETWORK_UNKNOWN_OUTCOME", "Meta par campaign abhi bhi PAUSED hai — activation nahi lagi. Retry safe hai.", { fix: "'Retry safely' dabayein.", retrySafe: true, status: "FAILED_RETRYABLE" });
    await prisma.campaignDeployment.update({
      where: { id: dep.id },
      data: { status: "FAILED_RETRYABLE", externalRefs: toJson({ ...refs, readBack: verdict.readBack }), externalStatus: tree.campaign.status, lastSyncedAt: now(), lockedAt: null, lockedBy: null, lastErrorCode: e.code, lastErrorMessage: e.message, lastErrorFix: e.fix },
    });
    await recordEvent(dep.id, "sync", "ok", "Read-back: campaign PAUSED — activation nahi lagi thi, safe retry.");
    await refreshTaskStatus(dep.taskId);
    return outcome(true, "FAILED_RETRYABLE", e.message, e.toSafe());
  }
  if (dep.status === "FAILED_FINAL" && verdict.ok) {
    // After a verified rollback (or a fix in Ads Manager): paused and approved again, so a fresh card can be requested.
    await prisma.campaignDeployment.update({
      where: { id: dep.id },
      data: { status: "PAUSED_READY", externalRefs: toJson({ ...refs, readBack: verdict.readBack }), externalStatus: tree.campaign.status, lastSyncedAt: now(), lockedAt: null, lockedBy: null, lastErrorCode: null, lastErrorMessage: null, lastErrorFix: null },
    });
    await recordEvent(dep.id, "sync", "ok", "Campaign PAUSED aur hierarchy approved state me — 'Request activation' se naya card ban sakta hai.");
    await refreshTaskStatus(dep.taskId);
    return outcome(true, "PAUSED_READY", "Campaign PAUSED aur approved state me — naya activation card request kar sakte hain.");
  }
  return recordMetaDrift(dep, refs, verdict, now());
}
