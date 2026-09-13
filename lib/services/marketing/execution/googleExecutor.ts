import "server-only";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/prisma";
import type { ApprovalPreview } from "@/lib/contracts/marketingAi";
import { ACTIVATE_EXECUTION_EFFECT, ACTIVATION_WARNING } from "@/lib/contracts/marketingExecution";
import { ActivatePayloadSchema, CreatePausedPayloadSchema, type ActivatePayload, type CreatePausedPayload } from "@/lib/contracts/marketingExecutionPayloads";
import { executableWriteTool } from "@/lib/marketing/tools/registry";
import { createGoogleAdsWriteProvider } from "@/lib/marketing/connectors/googleAdsWrite";
import { addDays, calendarDateIn, microsToPaise } from "@/lib/marketing/mappers/googleSearchMapper";
import type { CampaignTree, GoogleAdsWriteProvider } from "@/lib/marketing/providers/googleAdsProvider";
import { resolveGoogleAdsAuth } from "../connectionService";
import {
  APPROVAL_TTL_DAYS,
  RECONCILE_GRACE_MS,
  accountDisplay,
  assertOwned,
  failDeployment,
  loadDeployment,
  recordEvent,
  refreshTaskStatus,
  refsOf,
  releaseLock,
  transition,
  type DeploymentWithRelations,
  type GoogleExternalRefs,
} from "./deploymentService";
import { ExecutionError, isExecutionError, normaliseProviderError } from "./executionErrors";
import { hashPayload, payloadHashMatches } from "./hashing";
import { googleReadiness, googleWritePreflight } from "./preflight";
import { reconcileByMarker, refsFromMutateResponse, refsFromTree, verifyTree, type OwnedRefs } from "./reconcile";
import { currentSpecHash, defaultProbeLanding, outcome, toJson, type RunOutcome, type WorkerOptions } from "./workerShared";

/**
 * The Google Search executor (doc 13 §8, §9, §11). Moved out of
 * `deploymentWorker.ts` unchanged when MKT-2B made the worker dispatch by
 * platform (doc 14 §17) — the worker now owns the claim, the lease for a
 * sync, retry/recheck/request-activation and the recovery sweep for both
 * platforms; this file owns what is Google-specific.
 *
 * Create phase:   preflight (provider facts, conversion action, geo, dates,
 *                 exact operations) → validate-only → reconcile-first
 *                 (marker search: an existing campaign is attached, never
 *                 duplicated) → ONE atomic PAUSED create → read-back →
 *                 PAUSED_READY → activation card.
 * Activate phase: just-in-time preflight (account, billing, landing
 *                 reachable, window not over) → read-back must still be the
 *                 approved PAUSED campaign → ONE status write → read-back
 *                 must say ENABLED → LIVE.
 *
 * A write that does not answer is UNKNOWN_OUTCOME; `syncGoogle` is the only
 * way out of it, and it searches before it ever lets a retry happen.
 */

async function defaultProvider(): Promise<GoogleAdsWriteProvider> {
  return createGoogleAdsWriteProvider(await resolveGoogleAdsAuth());
}

/** A provider that cannot be built (no grant, no developer token, decrypt failure) is a config block, not a crash. */
export async function googleProviderOf(opts: WorkerOptions): Promise<GoogleAdsWriteProvider> {
  try {
    if (opts.provider) return opts.provider;
    if (opts.providerFactory) return await opts.providerFactory();
    return await defaultProvider();
  } catch (err) {
    throw normaliseProviderError(err, "read");
  }
}

// ============================================================
// Approval checks shared by both phases (§7.3, §10.3-5)
// ============================================================

function verifyCreateApproval(dep: DeploymentWithRelations, now: Date): CreatePausedPayload {
  const a = dep.createApproval;
  if (!a || a.id !== dep.createApprovalId) throw new ExecutionError("APPROVAL_INVALID", "Create approval deployment se juda nahi hai.");
  if (a.status !== "APPROVED") throw new ExecutionError("APPROVAL_INVALID", `Create approval ${a.status} hai, APPROVED nahi.`);
  if (a.expiresAt <= now) throw new ExecutionError("APPROVAL_INVALID", "Create approval ka authorisation window (7 din) khatam.", { fix: "'Re-check readiness' se naya card banayein." });
  if (!payloadHashMatches(a.payload, a.payloadHash)) throw new ExecutionError("APPROVAL_INVALID", "Approval payload hash mismatch — refuse.");
  const parsed = CreatePausedPayloadSchema.safeParse(a.payload);
  if (!parsed.success) throw new ExecutionError("APPROVAL_INVALID", "Create approval payload typed schema se match nahi karta.");
  const p = parsed.data;
  if (p.deploymentId !== dep.id || p.draftId !== dep.draftId || p.platform !== dep.platform) throw new ExecutionError("APPROVAL_INVALID", "Approval kisi aur deployment/platform ka hai.");
  if (p.specHash !== dep.specHash) throw new ExecutionError("SPEC_CHANGED", "Approved spec hash deployment se alag hai.", { fix: "'Re-check readiness'." });
  if (!executableWriteTool("CREATE_PAUSED_CAMPAIGNS", "GOOGLE_SEARCH")) throw new ExecutionError("NOT_EXECUTABLE_YET", "google.campaign.create_paused executable nahi hai.");
  return p;
}

function verifyActivateApproval(dep: DeploymentWithRelations, now: Date): ActivatePayload {
  const a = dep.activateApproval;
  if (!a || a.id !== dep.activateApprovalId) throw new ExecutionError("APPROVAL_INVALID", "Activation approval deployment se juda nahi hai.");
  if (a.status !== "APPROVED") throw new ExecutionError("APPROVAL_INVALID", `Activation approval ${a.status} hai, APPROVED nahi.`);
  if (a.expiresAt <= now) throw new ExecutionError("APPROVAL_INVALID", "Activation approval ka window khatam.", { fix: "'Request activation' se naya card banayein." });
  if (!payloadHashMatches(a.payload, a.payloadHash)) throw new ExecutionError("APPROVAL_INVALID", "Approval payload hash mismatch — refuse.");
  const parsed = ActivatePayloadSchema.safeParse(a.payload);
  if (!parsed.success) throw new ExecutionError("APPROVAL_INVALID", "Activation payload typed schema se match nahi karta.");
  const p = parsed.data;
  const refs = refsOf(dep);
  if (p.deploymentId !== dep.id || p.draftId !== dep.draftId || p.platform !== dep.platform) throw new ExecutionError("APPROVAL_INVALID", "Approval kisi aur deployment/platform ka hai.");
  if (p.specHash !== dep.specHash) throw new ExecutionError("SPEC_CHANGED", "Approved spec hash deployment se alag hai.");
  if (!refs.campaign || p.externalCampaignRef !== refs.campaign) throw new ExecutionError("APPROVAL_INVALID", "Approval ka campaign resource stored campaign se alag hai.");
  if (!executableWriteTool("ACTIVATE_CAMPAIGNS", "GOOGLE_SEARCH")) throw new ExecutionError("NOT_EXECUTABLE_YET", "google.campaign.activate executable nahi hai.");
  return p;
}

// ============================================================
// Create phase
// ============================================================

export async function runGoogleCreate(dep: DeploymentWithRelations, workerId: string, opts: WorkerOptions, now: () => Date): Promise<RunOutcome> {
  let step = "preflight";
  try {
    const payload = verifyCreateApproval(dep, now());
    const provider = await googleProviderOf(opts);
    const siblings = await prisma.campaignDraft.findMany({ where: { taskId: dep.taskId, approvalStatus: "APPROVED", runId: dep.draft.runId } });

    const pre = await googleWritePreflight({ draft: dep.draft, goal: dep.task.goal, siblingDrafts: siblings, marker: dep.executionMarker, now: now(), provider, expectedSpecHash: payload.specHash });
    if (pre.readiness.accountRef !== payload.accountRef) throw new ExecutionError("ACCOUNT_NOT_READY", `Connection ka account ${pre.readiness.accountRef} approval ke ${payload.accountRef} se alag hai.`, { fix: "'Re-check readiness' se naya card banayein." });
    if (pre.readiness.dailyBudgetPaise !== payload.dailyBudgetPaise) throw new ExecutionError("SPEC_CHANGED", "Draft budget approval se alag hai.");

    const refsBefore = refsOf(dep);
    const resolved: NonNullable<GoogleExternalRefs["resolved"]> = {
      geo: pre.resolved.geo,
      languages: pre.resolved.languages,
      conversionAction: pre.resolved.conversionAction,
      startDate: pre.resolved.startDate,
      endDate: pre.resolved.endDate,
      timeZone: pre.resolved.timeZone,
      finalUrl: pre.resolved.finalUrl,
      providerCampaignName: pre.resolved.providerCampaignName,
      budgetMicros: pre.mapped.summary.budgetMicros,
      isTestAccount: pre.resolved.isTestAccount,
    };
    await transition(dep.id, workerId, "PREFLIGHT", "VALIDATING", { externalRefs: toJson({ ...refsBefore, customerId: pre.resolved.customerId, resolved }), checkpoint: "preflight" });
    await recordEvent(
      dep.id,
      "preflight",
      "ok",
      `Account ${pre.resolved.customerId}${pre.resolved.isTestAccount ? " (TEST account)" : ""} · ${pre.resolved.currency} · ${pre.resolved.timeZone} · geo ${pre.resolved.geo.map((g) => g.name).join(", ")} · ${pre.resolved.startDate}→${pre.resolved.endDate} · ${pre.mapped.operations.length} operations${pre.warnings.length ? ` · notes: ${pre.warnings.join(" | ").slice(0, 200)}` : ""}`,
    );

    // ---- validate-only: the same request, nothing written (§11.4) --------
    step = "validate";
    try {
      await provider.mutate(pre.mapped.operations, { validateOnly: true });
    } catch (err) {
      throw normaliseProviderError(err, "validate");
    }
    await recordEvent(dep.id, "validate", "ok", "Google validate-only pass — koi write nahi hua.");

    // ---- lock + spec still ours (§11.4.5) ---------------------------------
    await assertOwned(dep.id, workerId, "VALIDATING");
    if ((await currentSpecHash(dep.draftId)) !== payload.specHash) throw new ExecutionError("SPEC_CHANGED", "Validate ke baad draft badal gaya — write refuse.");

    // ---- reconcile-first: never create what already exists (§10.16) -------
    step = "reconcile";
    const existing = await reconcileByMarker(provider, dep.executionMarker);
    let refs: OwnedRefs;
    let requestId: string | null = null;
    let attached = false;
    if (existing.kind === "many") {
      throw new ExecutionError("RECONCILIATION_AMBIGUOUS", `Marker ${dep.executionMarker} wale ${existing.campaigns.length} campaigns mile — human review chahiye.`, {
        fix: `Google Ads me ${existing.campaigns.map((c) => c.id).join(", ")} dekhein; ek rakh kar baaki remove karein, phir Sync.`,
      });
    } else if (existing.kind === "one") {
      await recordEvent(dep.id, "reconcile", "info", `Marker ${dep.executionMarker} ka campaign ${existing.campaign.id} pehle se hai — create skip, attach.`);
      const tree = await readTree(provider, existing.campaign.resourceName);
      refs = refsFromTree(tree);
      attached = true;
      await transition(dep.id, workerId, "VALIDATING", "RECONCILING", { externalRefs: toJson({ ...refsOf(dep), customerId: pre.resolved.customerId, resolved, ...refs }), checkpoint: "attached" });
    } else {
      // ---- the one write (§11.5) ------------------------------------------
      step = "create";
      await transition(dep.id, workerId, "VALIDATING", "CREATING", { lastWriteAttemptAt: now(), checkpoint: "creating" });
      let resp;
      try {
        resp = await provider.mutate(pre.mapped.operations, { validateOnly: false });
      } catch (err) {
        throw normaliseProviderError(err, "write");
      }
      refs = refsFromMutateResponse(resp);
      requestId = resp.requestId;
      if (!refs.campaign) throw new ExecutionError("NETWORK_UNKNOWN_OUTCOME", "Create ka jawab aaya par campaign resource name nahi mila.", { fix: "'Sync from provider' chalayein." });
      await transition(dep.id, workerId, "CREATING", "RECONCILING", { externalRefs: toJson({ ...refsOf(dep), customerId: pre.resolved.customerId, resolved, ...refs }), checkpoint: "created", providerRequestId: requestId });
      await recordEvent(dep.id, "create", "ok", `PAUSED campaign ${refs.campaignId} + ${refs.adGroups.length} ad groups + ${refs.keywords.length} keywords + ${refs.ads.length} ads bane (ek atomic request).`, requestId);
    }

    // ---- read-back (§11.5) ---------------------------------------------------
    step = "verify";
    const tree = await readTree(provider, refs.campaign!);
    // An attached campaign was created by an earlier attempt — its dates were settled then, so they are the truth, not today's.
    const verdict = verifyTree(tree, {
      marker: dep.executionMarker,
      customerId: pre.resolved.customerId,
      budgetMicros: pre.mapped.summary.budgetMicros,
      expectedStatus: "PAUSED",
      finalUrl: pre.resolved.finalUrl,
      startDate: attached ? null : pre.resolved.startDate,
      endDate: attached ? null : pre.resolved.endDate,
    });
    if (!verdict.ok) {
      throw new ExecutionError("READBACK_MISMATCH", `Read-back approved spec se match nahi karta: ${verdict.problems.join(" · ")}`.slice(0, 400), {
        fix: "Google Ads me campaign dekhein; theek karke 'Sync from provider' chalayein. Activation tab tak nahi khulegi.",
      });
    }
    await markPausedReady((await loadDeployment(dep.id))!, workerId, tree, verdict.summary, now());
    const after = await loadDeployment(dep.id);
    return outcome(true, after?.status ?? "PAUSED_READY", "Paused campaign verified — no spend.");
  } catch (err) {
    const e = isExecutionError(err) ? err : new ExecutionError("INTERNAL_ERROR", err instanceof Error ? err.message : String(err), { retrySafe: step === "preflight" || step === "validate" });
    const fresh = (await prisma.campaignDeployment.findUnique({ where: { id: dep.id } })) ?? dep;
    await failDeployment(fresh, e, step);
    return outcome(true, e.status, e.message, e.toSafe());
  }
}

async function readTree(provider: GoogleAdsWriteProvider, campaignResourceName: string): Promise<CampaignTree> {
  let tree: CampaignTree | null;
  try {
    tree = await provider.readCampaignTree(campaignResourceName);
  } catch (err) {
    throw normaliseProviderError(err, "read");
  }
  if (!tree) throw new ExecutionError("NETWORK_UNKNOWN_OUTCOME", `Campaign ${campaignResourceName} read-back me nahi mila.`, { fix: "Thodi der baad 'Sync from provider' chalayein." });
  return tree;
}

/** PAUSED verified → row, draft summary, create card EXECUTED, activation card (§15 "After paused creation"). */
async function markPausedReady(dep: DeploymentWithRelations, workerId: string | null, tree: CampaignTree, summary: ReturnType<typeof verifyTree>["summary"], now: Date): Promise<void> {
  const refs = { ...refsOf(dep), ...refsFromTree(tree) };
  refs.readBack = { at: now.toISOString(), ...summary };
  // The provider's dates are the campaign's dates from here on (verified equal on a fresh create; settled earlier on an attach).
  if (refs.resolved) refs.resolved = { ...refs.resolved, startDate: tree.campaign.startDate ?? refs.resolved.startDate, endDate: tree.campaign.endDate ?? refs.resolved.endDate };
  const result = { campaign: refs.campaign, campaignId: refs.campaignId, budget: refs.budget, adGroups: refs.adGroups.length, keywords: refs.keywords.length, ads: refs.ads.length, externalStatus: summary.status, pausedVerifiedAt: now.toISOString(), marker: dep.executionMarker };

  await prisma.$transaction(async (tx) => {
    const where = workerId ? { id: dep.id, lockedBy: workerId } : { id: dep.id };
    const res = await tx.campaignDeployment.updateMany({
      where,
      data: { status: "PAUSED_READY", externalRefs: toJson(refs), externalStatus: summary.status, pausedVerifiedAt: now, lastSyncedAt: now, lockedAt: null, lockedBy: null, checkpoint: "paused_verified", lastErrorCode: null, lastErrorMessage: null, lastErrorFix: null },
    });
    if (res.count !== 1) throw new ExecutionError("INTERNAL_ERROR", "PAUSED_READY likhte waqt lock kho gaya.", { status: "UNKNOWN_OUTCOME" });
    await tx.campaignDraft.update({ where: { id: dep.draftId }, data: { externalCampaignId: refs.campaignId, externalStatus: summary.status } });
    if (dep.createApprovalId) {
      await tx.marketingApproval.updateMany({ where: { id: dep.createApprovalId, status: "APPROVED" }, data: { status: "EXECUTED", executionResult: toJson(result) } });
    }
  });
  await recordEvent(dep.id, "verify", "ok", `Read-back: campaign ${refs.campaignId} PAUSED · budget ${summary.budgetMicros} micros · ${summary.adGroups} ad groups / ${summary.keywords} keywords / ${summary.ads} ads · ${summary.startDate}→${summary.endDate}. No spend.`);
  await createGoogleActivationCard((await loadDeployment(dep.id))!, now);
  await refreshTaskStatus(dep.taskId);
}

// ============================================================
// Activation card (§7.2, §13)
// ============================================================

function rupees(paise: number | null): string {
  return paise === null ? "—" : `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

export async function createGoogleActivationCard(dep: DeploymentWithRelations, now: Date): Promise<string | null> {
  if (dep.status !== "PAUSED_READY") return null;
  const refs = refsOf(dep);
  const rb = refs.readBack;
  const resolved = refs.resolved;
  if (!refs.campaign || !refs.campaignId || !rb || !resolved || rb.status !== "PAUSED" || !rb.budgetMicros) return null;
  const create = dep.createApproval ? CreatePausedPayloadSchema.safeParse(dep.createApproval.payload) : null;
  const cp = create?.success ? create.data : null;
  const goal = dep.task.goal;
  const dailyBudgetPaise = dep.draft.dailyBudgetPaise ?? 0;
  if (microsToPaise(rb.budgetMicros) !== dailyBudgetPaise) return null; // never a card on a budget that is not the approved one
  const windowDays = Math.max(1, goal?.windowDays ?? cp?.windowDays ?? 30);

  const approvalId = randomUUID();
  const payload: ActivatePayload = {
    action: "ACTIVATE_CAMPAIGNS",
    platform: "GOOGLE_SEARCH",
    taskId: dep.taskId,
    draftId: dep.draftId,
    deploymentId: dep.id,
    goalId: goal?.id ?? cp?.goalId ?? dep.draft.goalId ?? "",
    externalCampaignRef: refs.campaign,
    externalCampaignId: refs.campaignId,
    verifiedExternalStatus: "PAUSED",
    pausedVerifiedAt: (dep.pausedVerifiedAt ?? now).toISOString(),
    accountRef: dep.accountRef ?? refs.customerId,
    accountDisplayName: accountDisplay(dep.accountLabel, dep.accountRef ?? refs.customerId),
    campaignName: dep.draft.name,
    providerCampaignName: resolved.providerCampaignName,
    executionMarker: dep.executionMarker,
    specHash: dep.specHash,
    currency: dep.currency ?? "INR",
    dailyBudgetPaise,
    verifiedBudgetMicros: Number(rb.budgetMicros),
    maxSpendPaise: dailyBudgetPaise * windowDays,
    goalDailyCapPaise: goal?.dailyBudgetPaise ?? null,
    goalTotalCapPaise: goal?.totalBudgetPaise ?? null,
    startAt: rb.startDate ?? resolved.startDate,
    endAt: rb.endDate ?? resolved.endDate,
    timeZone: resolved.timeZone,
    audienceSummary: `${resolved.geo.map((g) => g.name).join(", ")} · ${resolved.languages.map((l) => l.name).join(", ")}`,
    landingUrls: [resolved.finalUrl],
    conversionAction: resolved.conversionAction ? `${cp?.conversionAction ?? ""} → ${resolved.conversionAction.name}` : `${cp?.conversionAction ?? "—"} (account me mapped nahi)`,
    biddingStrategy: cp?.biddingStrategy ?? "—",
    externalCounts: { adGroups: rb.adGroups, keywords: rb.keywords, ads: rb.ads },
    activationEffect: ACTIVATE_EXECUTION_EFFECT,
  };
  ActivatePayloadSchema.parse(payload);

  const preview: ApprovalPreview = {
    account: `Google Ads ${payload.accountDisplayName} · ${payload.currency}${resolved.isTestAccount ? " · TEST account (serve/bill nahi hota)" : ""}`,
    channel: "Google Search",
    audience: payload.audienceSummary,
    contentPreview: [
      `Campaign ${payload.externalCampaignId} "${payload.providerCampaignName}" — provider status verified PAUSED (${new Date(payload.pausedVerifiedAt).toLocaleString("en-IN")})`,
      `${rb.adGroups} ad groups · ${rb.keywords} keywords · ${rb.ads} ads (read-back)`,
      `Bidding ${payload.biddingStrategy} · conversion ${payload.conversionAction}`,
      `Budget verified on provider: ${rb.budgetMicros} micros = ${rupees(microsToPaise(rb.budgetMicros))}/day`,
      ACTIVATION_WARNING,
    ],
    destination: payload.landingUrls.join(", "),
    startEnd: `${payload.startAt} → ${payload.endAt} (${payload.timeZone})`,
    dailyBudget: `${rupees(payload.dailyBudgetPaise)}/day${payload.goalDailyCapPaise !== null ? ` (goal cap ${rupees(payload.goalDailyCapPaise)}/day)` : ""}`,
    totalBudget: `max ${rupees(payload.maxSpendPaise)} is window me${payload.goalTotalCapPaise !== null ? ` · goal cap ${rupees(payload.goalTotalCapPaise)}` : ""}`,
    conversionEvent: cp?.conversionAction ?? "—",
    whatHappensNow: `${ACTIVATION_WARNING} Sirf campaign ${payload.externalCampaignId} ka status PAUSED → ENABLED hoga (koi budget/audience/URL change nahi); activation se theek pehle account, billing, landing page aur campaign dobara verify honge, aur LIVE tabhi likha jaayega jab Google read-back me ENABLED dikhaye.`,
    rollback: "Google Ads UI me kabhi bhi Pause karein — BandhanTak abhi auto-pause nahi karta (MKT-4). Stop-loss rule goal par likha hai; usse manually follow karein.",
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
  await recordEvent(dep.id, "activation-card", "ok", `Activation card bana — ${rupees(payload.dailyBudgetPaise)}/day, ${payload.startAt}→${payload.endAt}. Spend sirf approve ke baad.`);
  return approvalId;
}

// ============================================================
// Activate phase (§11.6)
// ============================================================

export async function runGoogleActivate(dep: DeploymentWithRelations, workerId: string, opts: WorkerOptions, now: () => Date): Promise<RunOutcome> {
  let step = "activate-preflight";
  try {
    const payload = verifyActivateApproval(dep, now());
    const provider = await googleProviderOf(opts);
    const refs = refsOf(dep);
    const resolved = refs.resolved;
    if (!refs.campaign || !resolved) throw new ExecutionError("APPROVAL_INVALID", "Deployment par campaign refs nahi hain.");

    // 6. account/config/approval/spec preflight repeat
    const siblings = await prisma.campaignDraft.findMany({ where: { taskId: dep.taskId, approvalStatus: "APPROVED", runId: dep.draft.runId } });
    const readiness = await googleReadiness({ draft: dep.draft, goal: dep.task.goal, siblingDrafts: siblings, marker: dep.executionMarker, now: now() });
    if (readiness.specHash !== payload.specHash) throw new ExecutionError("SPEC_CHANGED", "Draft spec activation approval se alag hai.");
    if (readiness.accountRef !== payload.accountRef) throw new ExecutionError("ACCOUNT_NOT_READY", "Connection ka account approval se alag hai.", { fix: "Connections check karein." });
    let account;
    try {
      account = await provider.describeAccount();
    } catch (err) {
      throw normaliseProviderError(err, "read");
    }
    if (account.customerId.replace(/[^0-9]/g, "") !== payload.accountRef) throw new ExecutionError("ACCOUNT_NOT_READY", `Credentials account ${account.customerId} ≠ approved ${payload.accountRef}.`);
    if ((account.currency ?? "").toUpperCase() !== payload.currency) throw new ExecutionError("INVALID_BUDGET", `Account currency ${account.currency ?? "?"} ≠ ${payload.currency}.`);
    const billing = await provider.hasApprovedBilling();
    if (billing === false && !account.isTestAccount) throw new ExecutionError("BILLING_NOT_READY", "Google Ads account par approved billing setup nahi hai — activation se spend shuru nahi ho sakta.", { fix: "Google Ads → Billing setup poora karein, phir Retry." });
    const probe = await (opts.probeLanding ?? defaultProbeLanding)(resolved.finalUrl);
    if (!probe.ok) throw new ExecutionError("INVALID_LANDING", `Landing URL reachable nahi (${probe.status ?? "no response"}): ${resolved.finalUrl}`, { fix: "Site live hai? DNS/deploy check karke Retry." });
    const today = calendarDateIn(resolved.timeZone, now());
    if (payload.endAt < addDays(today, 1)) throw new ExecutionError("INVALID_BUDGET", `Campaign window ${payload.endAt} ko khatam — activation ka matlab nahi.`, { fix: "'Revise Package' se naya window/package banayein.", status: "FAILED_FINAL" });

    // 1-5. refetch and match the approved paused campaign
    step = "activate-verify";
    const before = await readTree(provider, refs.campaign);
    const verdict = verifyTree(before, { marker: dep.executionMarker, customerId: payload.accountRef, budgetMicros: String(payload.verifiedBudgetMicros), expectedStatus: "PAUSED", finalUrl: resolved.finalUrl, startDate: payload.startAt, endDate: payload.endAt, campaignResourceName: refs.campaign });
    if (!verdict.ok) {
      throw new ExecutionError("READBACK_MISMATCH", `Campaign approval se alag hai, activate nahi karenge: ${verdict.problems.join(" · ")}`.slice(0, 400), {
        fix: "Google Ads me campaign ko approved state par laayein (PAUSED, same budget/dates), phir 'Sync from provider' aur naya activation card.",
      });
    }
    await recordEvent(dep.id, "activate-verify", "ok", `Just-in-time read-back: PAUSED, budget ${verdict.summary.budgetMicros}, ${verdict.summary.ads} ads — approved state se match.`);

    // 7. the one write
    step = "activate";
    await assertOwned(dep.id, workerId, "ACTIVATING");
    if ((await currentSpecHash(dep.draftId)) !== payload.specHash) throw new ExecutionError("SPEC_CHANGED", "Activation se pehle draft badal gaya.");
    await prisma.campaignDeployment.update({ where: { id: dep.id }, data: { lastWriteAttemptAt: now(), checkpoint: "activating" } });
    let requestId: string | null = null;
    try {
      requestId = (await provider.setCampaignStatus(refs.campaign, "ENABLED")).requestId;
    } catch (err) {
      const e = normaliseProviderError(err, "write");
      if (e.code === "NETWORK_UNKNOWN_OUTCOME") throw new ExecutionError("NETWORK_UNKNOWN_OUTCOME", "Activation write ka jawab nahi aaya — campaign ENABLED ho sakta hai.", { fix: "'Sync from provider' chalayein: ENABLED mila to LIVE, PAUSED mila to safe retry.", requestId: e.requestId });
      throw e;
    }

    // 8. read back — LIVE only on ENABLED
    step = "activate-readback";
    const after = await readTree(provider, refs.campaign);
    if (after.campaign.status !== "ENABLED") {
      throw new ExecutionError("READBACK_MISMATCH", `Activation ke baad Google status ${after.campaign.status || "?"} dikha, ENABLED nahi.`, { fix: "'Sync from provider' chalayein; PAUSED ho to Retry safe hai.", retrySafe: true, status: "FAILED_RETRYABLE", requestId });
    }
    await markLive((await loadDeployment(dep.id))!, workerId, after, now(), requestId);
    const final = await loadDeployment(dep.id);
    return outcome(true, final?.status ?? "LIVE", "Campaign LIVE — provider read-back ENABLED.");
  } catch (err) {
    const e = isExecutionError(err) ? err : new ExecutionError("INTERNAL_ERROR", err instanceof Error ? err.message : String(err), { retrySafe: step !== "activate" });
    const fresh = (await prisma.campaignDeployment.findUnique({ where: { id: dep.id } })) ?? dep;
    await failDeployment(fresh, e, step);
    return outcome(true, e.status, e.message, e.toSafe());
  }
}

async function markLive(dep: DeploymentWithRelations, workerId: string | null, tree: CampaignTree, now: Date, requestId: string | null): Promise<void> {
  const refs = refsOf(dep);
  refs.readBack = {
    at: now.toISOString(),
    status: tree.campaign.status,
    budgetMicros: tree.campaign.budgetAmountMicros,
    startDate: tree.campaign.startDate,
    endDate: tree.campaign.endDate,
    adGroups: tree.adGroups.length,
    keywords: tree.keywords.length,
    ads: tree.ads.length,
    servingStatus: tree.campaign.servingStatus,
    primaryStatus: tree.campaign.primaryStatus,
  };
  await prisma.$transaction(async (tx) => {
    const where = workerId ? { id: dep.id, lockedBy: workerId } : { id: dep.id };
    const res = await tx.campaignDeployment.updateMany({
      where,
      data: { status: "LIVE", externalRefs: toJson(refs), externalStatus: tree.campaign.status, activatedAt: now, lastSyncedAt: now, lockedAt: null, lockedBy: null, checkpoint: "live", providerRequestId: requestId ?? undefined, lastErrorCode: null, lastErrorMessage: null, lastErrorFix: null },
    });
    if (res.count !== 1) throw new ExecutionError("INTERNAL_ERROR", "LIVE likhte waqt lock kho gaya.", { status: "UNKNOWN_OUTCOME" });
    await tx.campaignDraft.update({ where: { id: dep.draftId }, data: { externalStatus: tree.campaign.status } });
    if (dep.activateApprovalId) {
      await tx.marketingApproval.updateMany({ where: { id: dep.activateApprovalId, status: "APPROVED" }, data: { status: "EXECUTED", executionResult: toJson({ campaign: refs.campaign, activatedAt: now.toISOString(), status: tree.campaign.status, primaryStatus: tree.campaign.primaryStatus }) } });
    }
    if (dep.task.goalId) await tx.marketingGoal.updateMany({ where: { id: dep.task.goalId }, data: { status: "ACTIVE" } });
  });
  await recordEvent(dep.id, "activate", "ok", `Google read-back ENABLED (primary status ${tree.campaign.primaryStatus ?? "—"}) — LIVE. Spend ab ho sakta hai.`, requestId);
  await refreshTaskStatus(dep.taskId);
}


/** Sync for a Google row whose lease the caller already holds (`syncDeployment`). Throws on a failed read; the caller keeps the status. */
export async function syncGoogle(dep0: DeploymentWithRelations, workerId: string, opts: WorkerOptions, now: () => Date): Promise<RunOutcome> {
  const provider = await googleProviderOf(opts);
  const dep = (await loadDeployment(dep0.id))!;
  const refs = refsOf(dep);

  if (dep.status === "UNKNOWN_OUTCOME" && dep.phase === "CREATE" && !refs.campaign) {
    const sinceWrite = dep.lastWriteAttemptAt ? now().getTime() - dep.lastWriteAttemptAt.getTime() : Number.POSITIVE_INFINITY;
    const found = await reconcileByMarker(provider, dep.executionMarker);
    if (found.kind === "many") {
      const e = new ExecutionError("RECONCILIATION_AMBIGUOUS", `Marker ${dep.executionMarker} wale ${found.campaigns.length} campaigns mile.`, { fix: `Google Ads me ${found.campaigns.map((c) => c.id).join(", ")} me se ek rakhein, baaki remove karein, phir Sync.` });
      await failDeployment(dep, e, "reconcile");
      return outcome(true, e.status, e.message, e.toSafe());
    }
    if (found.kind === "none") {
      if (sinceWrite < RECONCILE_GRACE_MS) {
        await releaseLock(dep.id);
        const wait = Math.ceil((RECONCILE_GRACE_MS - sinceWrite) / 1000);
        await recordEvent(dep.id, "reconcile", "info", `Marker abhi nahi mila; write ${Math.round(sinceWrite / 1000)}s pehle gaya tha — ${wait}s baad dobara sync.`);
        return outcome(true, "UNKNOWN_OUTCOME", `Provider ko commit ka waqt do — ${wait}s baad dobara Sync karein.`);
      }
      const e = new ExecutionError("NETWORK_UNKNOWN_OUTCOME", "Provider par marker ka koi campaign nahi mila — write laga hi nahi. Retry safe hai.", { fix: "'Retry safely' dabayein.", retrySafe: true, status: "FAILED_RETRYABLE" });
      await prisma.campaignDeployment.update({ where: { id: dep.id }, data: { status: "FAILED_RETRYABLE", lockedAt: null, lockedBy: null, lastErrorCode: e.code, lastErrorMessage: e.message, lastErrorFix: e.fix, checkpoint: "reconciled_none" } });
      await recordEvent(dep.id, "reconcile", "ok", "Marker search: kuch nahi mila (grace ke baad) — FAILED_RETRYABLE, duplicate ka risk nahi.");
      await refreshTaskStatus(dep.taskId);
      return outcome(true, "FAILED_RETRYABLE", e.message, e.toSafe());
    }
    await recordEvent(dep.id, "reconcile", "ok", `Marker ${dep.executionMarker} ka campaign ${found.campaign.id} mila — attach.`);
    const tree = await readTree(provider, found.campaign.resourceName);
    await prisma.campaignDeployment.update({ where: { id: dep.id }, data: { status: "RECONCILING", externalRefs: toJson({ ...refs, ...refsFromTree(tree) }), checkpoint: "attached" } });
    return verifyAfterSync((await loadDeployment(dep.id))!, workerId, tree, now());
  }

  const tree = await readTree(provider, refs.campaign!);
  return verifyAfterSync(dep, workerId, tree, now());
}

/** With a tree in hand: where should the row be now, given where it was? */
async function verifyAfterSync(dep: DeploymentWithRelations, workerId: string, tree: CampaignTree, now: Date): Promise<RunOutcome> {
  const refs = refsOf(dep);
  const resolved = refs.resolved;
  const base = {
    marker: dep.executionMarker,
    customerId: dep.accountRef ?? refs.customerId,
    budgetMicros: resolved?.budgetMicros ?? refs.readBack?.budgetMicros ?? "",
    finalUrl: resolved?.finalUrl ?? "",
    campaignResourceName: refs.campaign,
  };
  const status = tree.campaign.status;

  // ---- create phase: unknown / reconciling / failed-with-objects → PAUSED_READY only if it is exactly the approved paused campaign.
  // Dates are not an expectation here: whatever attempt made the campaign settled them, and read-back records them.
  if (dep.phase === "CREATE") {
    const verdict = verifyTree(tree, { ...base, expectedStatus: "PAUSED" });
    if (dep.status === "PAUSED_READY") return recordDrift(dep, tree, verdict, now);
    if (verdict.ok) {
      await markPausedReady(dep, workerId, tree, verdict.summary, now);
      return outcome(true, "ACTIVATION_PENDING", "Read-back verified — paused campaign attached, activation card bana. No spend.");
    }
    const e = new ExecutionError("READBACK_MISMATCH", `Provider par campaign approved spec se alag hai: ${verdict.problems.join(" · ")}`.slice(0, 400), { fix: "Google Ads me theek karein, phir Sync." });
    await failDeployment(dep, e, "sync");
    return outcome(true, e.status, e.message, e.toSafe());
  }

  // ---- activation phase ----------------------------------------------------
  if (dep.status === "LIVE") return recordDrift(dep, tree, verifyTree(tree, { ...base, expectedStatus: "ENABLED" }), now);
  if (status === "ENABLED") {
    if (dep.status === "ACTIVATION_PENDING") {
      // Someone enabled it outside BandhanTak while our card was still pending: the truth is LIVE, the card is void.
      await prisma.marketingApproval.updateMany({ where: { id: dep.activateApprovalId ?? "", status: "PENDING" }, data: { status: "EXPIRED" } });
      await recordEvent(dep.id, "sync", "error", "Campaign provider par ENABLED mila jabki activation card pending tha — BandhanTak ke bahar activate hua.");
    }
    await markLive(dep, workerId, tree, now, null);
    return outcome(true, "LIVE", "Provider ENABLED dikha raha hai — LIVE.");
  }
  if (dep.status === "UNKNOWN_OUTCOME" || dep.status === "FAILED_RETRYABLE") {
    const e = new ExecutionError("NETWORK_UNKNOWN_OUTCOME", `Provider par campaign abhi bhi ${status} hai — activation laga nahi. Retry safe hai.`, { fix: "'Retry safely' dabayein.", retrySafe: true, status: "FAILED_RETRYABLE" });
    await prisma.campaignDeployment.update({ where: { id: dep.id }, data: { status: "FAILED_RETRYABLE", externalStatus: status, lastSyncedAt: now, lockedAt: null, lockedBy: null, lastErrorCode: e.code, lastErrorMessage: e.message, lastErrorFix: e.fix } });
    await recordEvent(dep.id, "sync", "ok", `Read-back ${status} — activation nahi lagi thi, safe retry.`);
    await refreshTaskStatus(dep.taskId);
    return outcome(true, "FAILED_RETRYABLE", e.message, e.toSafe());
  }
  return recordDrift(dep, tree, verifyTree(tree, { ...base, expectedStatus: "PAUSED" }), now);
}

/** A manual change on the provider is shown, never overwritten (§17). */
async function recordDrift(dep: DeploymentWithRelations, tree: CampaignTree, verdict: ReturnType<typeof verifyTree>, now: Date): Promise<RunOutcome> {
  const { summary, problems } = verdict;
  const refs = refsOf(dep);
  refs.readBack = { at: now.toISOString(), ...summary };
  const drift = problems.length ? `Provider par BandhanTak ke bahar badlaav: ${problems.join(" · ")}. Budget/audience/URL/schedule badalne ke liye naya plan + approval chahiye.`.slice(0, 500) : null;
  await prisma.campaignDeployment.update({
    where: { id: dep.id },
    data: {
      externalRefs: toJson(refs),
      externalStatus: tree.campaign.status,
      lastSyncedAt: now,
      lockedAt: null,
      lockedBy: null,
      ...(drift ? { lastErrorCode: "EXTERNAL_DRIFT", lastErrorMessage: drift, lastErrorFix: null } : dep.lastErrorCode === "EXTERNAL_DRIFT" ? { lastErrorCode: null, lastErrorMessage: null, lastErrorFix: null } : {}),
    },
  });
  await prisma.campaignDraft.update({ where: { id: dep.draftId }, data: { externalStatus: tree.campaign.status } });
  await recordEvent(dep.id, "sync", drift ? "error" : "ok", drift ?? `Read-back ${tree.campaign.status} · budget ${summary.budgetMicros} · ${summary.ads} ads — approved state se match.`);
  return outcome(true, dep.status, drift ?? "Provider state match karta hai.");
}
