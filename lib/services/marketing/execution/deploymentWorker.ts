import "server-only";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { LOCKED_DEPLOYMENT_STATUSES, PLATFORM_LABEL, type DeploymentStatusKey } from "@/lib/contracts/marketingExecution";
import { LEASE_MS, RECONCILE_GRACE_MS, claimDeployment, hasExternalObjects, loadDeployment, prepareDeploymentsForTask, recordEvent, refreshTaskStatus, type DeploymentWithRelations } from "./deploymentService";
import { isExecutionError, normaliseMetaError, normaliseProviderError } from "./executionErrors";
import { createGoogleActivationCard, runGoogleActivate, runGoogleCreate, syncGoogle } from "./googleExecutor";
import { AUTO_RESUMABLE_META_CODES, createMetaActivationCard, runMetaActivate, runMetaCreate, syncMeta } from "./metaExecutor";
import { outcome, type RunOutcome, type WorkerOptions } from "./workerShared";
import type { Role } from "@prisma/client";

export type { RunOutcome, WorkerOptions } from "./workerShared";

/**
 * The durable worker (doc 13 §8, doc 14 §17). One deployment, one lease,
 * one step at a time — and every step re-checks that the approval, the spec
 * hash and the lock are still what they were before it touches a provider.
 *
 * This file is the part both platforms share: claiming a queued row, taking
 * the lease for a sync, the admin verbs (retry / recheck / request
 * activation) and the recovery sweep. What happens once a row is held is the
 * platform's own executor:
 *
 *   `googleExecutor.ts` — MKT-2A: validate-only, one atomic PAUSED create,
 *                         one status write to activate.
 *   `metaExecutor.ts`   — MKT-2B: checkpointed PAUSED hierarchy (campaign →
 *                         ad sets → image → creatives → ads), children-first
 *                         activation with the campaign last, and the
 *                         compensating campaign pause for an unsafe read-back.
 *
 * A write that does not answer is UNKNOWN_OUTCOME; `syncDeployment` is the
 * only way out of it, and it searches by marker before it ever lets a retry
 * happen. Providers are injected so the checks drive all of this with fakes;
 * production builds them from the sealed connections.
 */

// ============================================================
// Entry: run whatever the row is queued for
// ============================================================

export async function runDeployment(deploymentId: string, opts: WorkerOptions = {}): Promise<RunOutcome> {
  const workerId = opts.workerId ?? `worker-${randomUUID().slice(0, 8)}`;
  const now = opts.now ?? (() => new Date());
  const dep = await loadDeployment(deploymentId);
  if (!dep) return outcome(false, null, "Deployment nahi mila.");

  if (dep.status === "QUEUED") {
    if (!(await claimDeployment(dep.id, workerId, "QUEUED", now()))) return outcome(false, dep.status, "Kisi aur worker ne claim kar liya.");
    await recordEvent(dep.id, "claim", "info", `Create attempt #${dep.attemptCount + 1} claimed (${workerId}).`);
    const held = (await loadDeployment(dep.id))!;
    return dep.platform === "META" ? runMetaCreate(held, workerId, opts, now) : runGoogleCreate(held, workerId, opts, now);
  }
  if (dep.status === "ACTIVATION_QUEUED") {
    if (!(await claimDeployment(dep.id, workerId, "ACTIVATION_QUEUED", now()))) return outcome(false, dep.status, "Kisi aur worker ne claim kar liya.");
    await recordEvent(dep.id, "claim", "info", `Activation attempt claimed (${workerId}).`);
    const held = (await loadDeployment(dep.id))!;
    return dep.platform === "META" ? runMetaActivate(held, workerId, opts, now) : runGoogleActivate(held, workerId, opts, now);
  }
  return outcome(false, dep.status, `Deployment ${dep.status} me hai — worker ke liye kuch nahi.`);
}

/** The platform's activation card for a PAUSED_READY row, or null when its read-back does not justify one. */
export async function createActivationCard(dep: DeploymentWithRelations, now: Date): Promise<string | null> {
  return dep.platform === "META" ? createMetaActivationCard(dep, now) : createGoogleActivationCard(dep, now);
}

// ============================================================
// Sync / reconcile (doc 13 §9.2, §17; doc 14 §14, §16) — admin button and recovery sweep
// ============================================================

const SYNCABLE: ReadonlySet<DeploymentStatusKey> = new Set<DeploymentStatusKey>(["UNKNOWN_OUTCOME", "PAUSED_READY", "ACTIVATION_PENDING", "LIVE", "PARTIAL", "FAILED_FINAL", "FAILED_RETRYABLE", "BLOCKED_CONFIG"]);

export async function syncDeployment(deploymentId: string, opts: WorkerOptions = {}): Promise<RunOutcome> {
  const workerId = opts.workerId ?? `sync-${randomUUID().slice(0, 8)}`;
  const now = opts.now ?? (() => new Date());
  const dep0 = await loadDeployment(deploymentId);
  if (!dep0) return outcome(false, null, "Deployment nahi mila.");
  if (!SYNCABLE.has(dep0.status)) return outcome(false, dep0.status, `Status ${dep0.status} me sync ka matlab nahi.`);
  if (dep0.status !== "UNKNOWN_OUTCOME" && !hasExternalObjects(dep0)) return outcome(false, dep0.status, "Provider par is deployment ka koi object nahi hai.");

  // Take the lease so a worker and a sync never touch the row together.
  const leaseCutoff = new Date(now().getTime() - LEASE_MS);
  const locked = await prisma.campaignDeployment.updateMany({ where: { id: dep0.id, status: dep0.status, OR: [{ lockedAt: null }, { lockedAt: { lt: leaseCutoff } }] }, data: { lockedAt: now(), lockedBy: workerId } });
  if (locked.count !== 1) return outcome(false, dep0.status, "Row abhi kisi worker ke paas hai — thodi der baad.");

  try {
    return dep0.platform === "META" ? await syncMeta(dep0, workerId, opts, now) : await syncGoogle(dep0, workerId, opts, now);
  } catch (err) {
    const e = isExecutionError(err) ? err : dep0.platform === "META" ? normaliseMetaError(err, "read") : normaliseProviderError(err, "read");
    // A failed *read* changes nothing about the row's truth: keep the status, drop the lease, note the error.
    await prisma.campaignDeployment.update({ where: { id: dep0.id }, data: { lockedAt: null, lockedBy: null } });
    await recordEvent(dep0.id, "sync", "error", `${e.code}: ${e.message}`);
    return outcome(true, dep0.status, e.message, e.toSafe());
  }
}

// ============================================================
// Admin verbs — retry / recheck / request activation
// ============================================================

export type DeploymentVerbResult = { ok: true; status: DeploymentStatusKey; message: string; run?: RunOutcome } | { ok: false; error: string; message: string; httpStatus: number };

/** Statuses from which a still-valid approval may be run again. PARTIAL is Meta's: some children exist, the worker resumes from the checkpoint. */
const RETRYABLE: ReadonlySet<DeploymentStatusKey> = new Set<DeploymentStatusKey>(["FAILED_RETRYABLE", "BLOCKED_CONFIG", "BLOCKED_CREATIVE", "PARTIAL"]);

export async function retryDeployment(deploymentId: string, actor: { id: string; role: Role }, opts: WorkerOptions = {}): Promise<DeploymentVerbResult> {
  const dep = await loadDeployment(deploymentId);
  if (!dep) return { ok: false, error: "NOT_FOUND", message: "Deployment nahi mila.", httpStatus: 404 };
  const now = (opts.now ?? (() => new Date()))();
  // UNKNOWN_OUTCOME is not in the set on purpose: an uncertain write is reconciled by Sync before anything is resent.
  if (!RETRYABLE.has(dep.status)) {
    return { ok: false, error: "NOT_RETRYABLE", message: `Status ${dep.status} me retry allowed nahi — pehle Sync karein.`, httpStatus: 409 };
  }
  const approval = dep.phase === "ACTIVATE" ? dep.activateApproval : dep.createApproval;
  if (!approval || approval.status !== "APPROVED" || approval.expiresAt <= now) {
    return { ok: false, error: "APPROVAL_INVALID", message: "Is phase ka approval ab valid nahi — 'Re-check readiness' se naya card banayein.", httpStatus: 409 };
  }
  const to: DeploymentStatusKey = dep.phase === "ACTIVATE" ? "ACTIVATION_QUEUED" : "QUEUED";
  const res = await prisma.campaignDeployment.updateMany({ where: { id: dep.id, status: dep.status, lockedAt: null }, data: { status: to, lastErrorCode: null, lastErrorMessage: null, lastErrorFix: null } });
  if (res.count !== 1) return { ok: false, error: "BUSY", message: "Row abhi busy hai.", httpStatus: 409 };
  await prisma.adminAuditLog.create({ data: { actorId: actor.id, actorRole: actor.role, actionType: "MARKETING_DEPLOYMENT_RETRY", targetType: "campaign_deployment", targetId: dep.id, newValue: `${dep.status} → ${to}` } });
  await recordEvent(dep.id, "retry", "info", `Admin retry (${dep.phase}) — marker search pehle, phir write.`);
  await refreshTaskStatus(dep.taskId);
  const run = await runDeployment(dep.id, opts);
  return { ok: true, status: run.status ?? to, message: run.message, run };
}

export async function recheckDeployment(deploymentId: string, actor: { id: string; role: Role }, opts: WorkerOptions = {}): Promise<DeploymentVerbResult> {
  const dep = await loadDeployment(deploymentId);
  if (!dep) return { ok: false, error: "NOT_FOUND", message: "Deployment nahi mila.", httpStatus: 404 };
  if (hasExternalObjects(dep)) return { ok: false, error: "HAS_OBJECTS", message: "Provider par objects hain — Sync karein, recheck nahi.", httpStatus: 409 };
  if (!["BLOCKED_CONFIG", "BLOCKED_CREATIVE", "CANCELLED", "FAILED_RETRYABLE", "CREATE_PENDING"].includes(dep.status)) {
    return { ok: false, error: "NOT_RECHECKABLE", message: `Status ${dep.status} me readiness recheck nahi hota.`, httpStatus: 409 };
  }
  await prepareDeploymentsForTask({ taskId: dep.taskId, actor, now: (opts.now ?? (() => new Date()))() });
  const after = await loadDeployment(dep.id);
  const status = after?.status ?? dep.status;
  return { ok: true, status, message: status === "CREATE_PENDING" ? "Ready — paused-create card taiyaar." : `${after?.lastErrorMessage ?? "Abhi bhi blocked."}${after?.lastErrorFix ? ` → ${after.lastErrorFix}` : ""}` };
}

export async function requestActivation(deploymentId: string, actor: { id: string; role: Role }, opts: WorkerOptions = {}): Promise<DeploymentVerbResult> {
  const dep = await loadDeployment(deploymentId);
  if (!dep) return { ok: false, error: "NOT_FOUND", message: "Deployment nahi mila.", httpStatus: 404 };
  if (dep.status !== "PAUSED_READY") return { ok: false, error: "NOT_PAUSED_READY", message: `Status ${dep.status} — activation card sirf PAUSED_READY par banta hai.`, httpStatus: 409 };
  // Fresh read-back first: the card must describe the campaign as it is now.
  const synced = await syncDeployment(dep.id, opts);
  const after = await loadDeployment(dep.id);
  if (!after || after.status !== "PAUSED_READY") return { ok: false, error: "SYNC_CHANGED", message: synced.message, httpStatus: 409 };
  if (after.lastErrorCode === "EXTERNAL_DRIFT") return { ok: false, error: "DRIFT", message: after.lastErrorMessage ?? "Provider par drift hai.", httpStatus: 409 };
  const approvalId = await createActivationCard(after, (opts.now ?? (() => new Date()))());
  if (!approvalId) return { ok: false, error: "NOT_READY", message: "Read-back approved budget/state se match nahi karta — card nahi bana.", httpStatus: 409 };
  await prisma.adminAuditLog.create({ data: { actorId: actor.id, actorRole: actor.role, actionType: "MARKETING_ACTIVATION_REQUESTED", targetType: "campaign_deployment", targetId: dep.id, newValue: approvalId } });
  await refreshTaskStatus(dep.taskId);
  return { ok: true, status: "ACTIVATION_PENDING", message: "Activation card bana — approve karne par spend shuru ho sakta hai." };
}

// ============================================================
// Recovery sweep (doc 13 §8, doc 14 §16)
// ============================================================

export interface RecoverySummary {
  staleLocksReleased: number;
  ran: { id: string; status: DeploymentStatusKey | null; message: string }[];
  reconciled: { id: string; status: DeploymentStatusKey | null; message: string }[];
  /** Meta paused-creates that stopped part-way on a retry-safe error and were resumed. Never an activation. */
  resumed: { id: string; status: DeploymentStatusKey | null; message: string }[];
  synced: { id: string; status: DeploymentStatusKey | null; message: string }[];
}

export async function recoverDeployments(opts: WorkerOptions & { limit?: number; syncOlderThanMs?: number } = {}): Promise<RecoverySummary> {
  const now = opts.now ?? (() => new Date());
  const limit = opts.limit ?? 5;
  const summary: RecoverySummary = { staleLocksReleased: 0, ran: [], reconciled: [], resumed: [], synced: [] };

  // 1. Expired leases: a worker that died mid-step. Before the write → back
  //    to the queue; during/after the write → uncertain, reconcile first.
  const cutoff = new Date(now().getTime() - LEASE_MS);
  const stale = await prisma.campaignDeployment.findMany({ where: { status: { in: [...LOCKED_DEPLOYMENT_STATUSES] }, lockedAt: { lt: cutoff } } });
  for (const d of stale) {
    const beforeWrite = d.status === "PREFLIGHT" || d.status === "VALIDATING";
    const to: DeploymentStatusKey = beforeWrite ? "QUEUED" : "UNKNOWN_OUTCOME";
    const res = await prisma.campaignDeployment.updateMany({
      where: { id: d.id, status: d.status, lockedAt: d.lockedAt },
      data: beforeWrite
        ? { status: to, lockedAt: null, lockedBy: null }
        : { status: to, lockedAt: null, lockedBy: null, lastErrorCode: "NETWORK_UNKNOWN_OUTCOME", lastErrorMessage: `Worker ${d.status} me ruk gaya (lease expire) — provider par kya bana, sync check karega.`, lastErrorFix: "'Sync from provider' chalayein." },
    });
    if (res.count === 1) {
      summary.staleLocksReleased += 1;
      await recordEvent(d.id, "recovery", "error", `Lease expire (${d.status}) → ${to}.`);
      await refreshTaskStatus(d.taskId);
    }
  }

  // 2. Queued work — both platforms; each executor re-checks its own gates.
  const queued = await prisma.campaignDeployment.findMany({ where: { status: { in: ["QUEUED", "ACTIVATION_QUEUED"] } }, orderBy: { updatedAt: "asc" }, take: limit });
  for (const d of queued) {
    const r = await runDeployment(d.id, opts);
    summary.ran.push({ id: d.id, status: r.status, message: r.message });
  }

  // 3. Uncertain outcomes past the grace window.
  const graceCutoff = new Date(now().getTime() - RECONCILE_GRACE_MS);
  const unknown = await prisma.campaignDeployment.findMany({ where: { status: "UNKNOWN_OUTCOME", OR: [{ lastWriteAttemptAt: null }, { lastWriteAttemptAt: { lt: graceCutoff } }] }, orderBy: { updatedAt: "asc" }, take: limit });
  for (const d of unknown) {
    const r = await syncDeployment(d.id, opts);
    summary.reconciled.push({ id: d.id, status: r.status, message: r.message });
  }

  // 4. A Meta paused-create that stopped part-way on a retry-safe error
  //    resumes under its still-valid card — objects it adds are PAUSED, so
  //    no spend can follow. Activation is never resumed here: a campaign goes
  //    ACTIVE only inside an admin's click (the approval, or "Retry safely").
  const partials = await prisma.campaignDeployment.findMany({
    where: { platform: "META", phase: "CREATE", status: "PARTIAL", lockedAt: null, lastErrorCode: { in: [...AUTO_RESUMABLE_META_CODES] } },
    include: { createApproval: true },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });
  for (const d of partials) {
    if (!d.createApproval || d.createApproval.status !== "APPROVED" || d.createApproval.expiresAt <= now()) continue;
    const res = await prisma.campaignDeployment.updateMany({ where: { id: d.id, status: "PARTIAL", lockedAt: null }, data: { status: "QUEUED" } });
    if (res.count !== 1) continue;
    await recordEvent(d.id, "recovery", "info", `Retry-safe PARTIAL create (${d.lastErrorCode}) — sweep ne resume kiya: marker search pehle, sirf missing objects PAUSED.`);
    const r = await runDeployment(d.id, opts);
    summary.resumed.push({ id: d.id, status: r.status, message: r.message });
  }

  // 5. Lightweight status sync for anything with provider objects (doc 13 §17, doc 14 §16).
  const syncCutoff = new Date(now().getTime() - (opts.syncOlderThanMs ?? 6 * 60 * 60 * 1000));
  const active = await prisma.campaignDeployment.findMany({
    where: { status: { in: ["PAUSED_READY", "ACTIVATION_PENDING", "LIVE"] }, OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: syncCutoff } }] },
    orderBy: { lastSyncedAt: "asc" },
    take: limit,
  });
  for (const d of active) {
    const r = await syncDeployment(d.id, opts);
    summary.synced.push({ id: d.id, status: r.status, message: r.message });
  }

  return summary;
}

export function platformLabel(platform: "GOOGLE_SEARCH" | "META"): string {
  return PLATFORM_LABEL[platform];
}
