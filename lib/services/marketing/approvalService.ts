import "server-only";
import { prisma } from "@/lib/db/prisma";
import { EXECUTABLE_APPROVAL_ACTIONS } from "@/lib/contracts/marketingAi";
import { EXECUTABLE_PLATFORMS, type DeploymentPlatform, type DeploymentStatusKey } from "@/lib/contracts/marketingExecution";
import { parseActivatePayload, parseCreatePausedPayload, type ActivateWritePayload, type CreatePausedWritePayload } from "@/lib/contracts/marketingExecutionPayloads";
import { executableWriteTool } from "@/lib/marketing/tools/registry";
import { payloadHashMatches, specHashOf } from "./execution/hashing";
import { prepareDeploymentsForTask, recordEvent, refreshTaskStatus, refsOf } from "./execution/deploymentService";
import { metaRefsOf } from "./execution/metaRefs";
import type { CampaignDeployment, MarketingApproval, Prisma, Role } from "@prisma/client";

/**
 * The approval gate (§10). One decision per card, by a named admin, on a
 * payload whose hash still matches what the card showed.
 *
 * MKT-1's `APPROVE_PACKAGE` is entirely internal: drafts and creatives flip
 * to APPROVED, the goal goes ACTIVE — and, since MKT-2, the deployment rows
 * are prepared (readiness check, a paused-create card per ready platform).
 *
 * MKT-2's two write cards are different in kind: approving one does not
 * execute anything *here*. The decision and the deployment's QUEUED state
 * land in one transaction (doc 13 §7.3, §8), the response says "queued",
 * and the worker does the provider work after the response has gone. A
 * second click on an already-approved card returns the same deployment —
 * never a second execution (§9).
 *
 * Every other action is refused with the phase that will carry it — not
 * silently marked approved, because an approval row that says EXECUTED
 * for something that never ran is the audit trail lying.
 */

export type ApprovalDecisionResult =
  | { ok: true; status: "EXECUTED" | "REJECTED" | "QUEUED"; deploymentId?: string; deploymentStatus?: DeploymentStatusKey }
  | { ok: false; error: string; message: string; status: number };

interface PackagePayload {
  runId: string;
  goalId: string;
  draftIds: string[];
  creativeIds: string[];
}

export async function decideApproval(params: {
  approvalId: string;
  decision: "APPROVE" | "REJECT";
  reason: string | null;
  actorId: string;
  actorRole: Role;
}): Promise<ApprovalDecisionResult> {
  const approval = await prisma.marketingApproval.findUnique({ where: { id: params.approvalId }, include: { task: true } });
  if (!approval) return { ok: false, error: "NOT_FOUND", message: "Approval nahi mila.", status: 404 };

  // Double click on a write card (§7.3): same deployment back, no second execution.
  if (approval.status !== "PENDING") {
    if (params.decision === "APPROVE" && (approval.action === "CREATE_PAUSED_CAMPAIGNS" || approval.action === "ACTIVATE_CAMPAIGNS") && approval.status !== "REJECTED" && approval.status !== "EXPIRED") {
      const dep = await prisma.campaignDeployment.findFirst({ where: { OR: [{ createApprovalId: approval.id }, { activateApprovalId: approval.id }] } });
      if (dep) return { ok: true, status: "QUEUED", deploymentId: dep.id, deploymentStatus: dep.status };
    }
    return { ok: false, error: "NOT_PENDING", message: `Ye approval pehle hi ${approval.status} hai.`, status: 409 };
  }
  if (approval.expiresAt <= new Date()) {
    await prisma.marketingApproval.update({ where: { id: approval.id }, data: { status: "EXPIRED" } });
    return { ok: false, error: "EXPIRED", message: "Approval expire ho gaya — 'Revise' se naya package banwayein.", status: 409 };
  }
  if (!payloadHashMatches(approval.payload, approval.payloadHash)) {
    return { ok: false, error: "PAYLOAD_MISMATCH", message: "Approval ka payload badal gaya hai — safety ke liye refuse. Naya package banwayein.", status: 409 };
  }

  const now = new Date();
  const actor = { id: params.actorId, role: params.actorRole };

  if (approval.action === "CREATE_PAUSED_CAMPAIGNS" || approval.action === "ACTIVATE_CAMPAIGNS") {
    return decideWriteCard(approval, params.decision, params.reason, actor, now);
  }

  if (params.decision === "REJECT") {
    const payload = approval.payload as unknown as Partial<PackagePayload>;
    await prisma.$transaction([
      prisma.marketingApproval.update({
        where: { id: approval.id },
        data: { status: "REJECTED", decidedBy: params.actorId, decidedAt: now, decisionReason: params.reason },
      }),
      prisma.campaignDraft.updateMany({ where: { id: { in: payload.draftIds ?? [] } }, data: { approvalStatus: "REJECTED" } }),
      prisma.creativeAsset.updateMany({ where: { id: { in: payload.creativeIds ?? [] } }, data: { reviewStatus: "REJECTED" } }),
      prisma.marketingTask.update({
        where: { id: approval.taskId },
        data: { status: "REJECTED", currentStep: "Package reject hua", blockingReason: params.reason },
      }),
      prisma.adminAuditLog.create({
        data: {
          actorId: params.actorId,
          actorRole: params.actorRole,
          actionType: "MARKETING_PACKAGE_REJECTED",
          targetType: "marketing_approval",
          targetId: approval.id,
          reason: params.reason,
          newValue: approval.payloadHash,
        },
      }),
    ]);
    return { ok: true, status: "REJECTED" };
  }

  if (!EXECUTABLE_APPROVAL_ACTIONS.has(approval.action)) {
    return {
      ok: false,
      error: "NOT_EXECUTABLE",
      message: `"${approval.action}" is release me execute nahi hota — ye agle phase me approval ke saath aayega.`,
      status: 422,
    };
  }

  const payload = approval.payload as unknown as PackagePayload;
  const result = { draftsApproved: payload.draftIds.length, creativesApproved: payload.creativeIds.length, executedAt: now.toISOString() };

  await prisma.$transaction([
    prisma.marketingApproval.update({
      where: { id: approval.id },
      data: {
        status: "EXECUTED",
        decidedBy: params.actorId,
        decidedAt: now,
        decisionReason: params.reason,
        executionResult: result as unknown as Prisma.InputJsonValue,
      },
    }),
    prisma.campaignDraft.updateMany({ where: { id: { in: payload.draftIds } }, data: { approvalStatus: "APPROVED" } }),
    prisma.creativeAsset.updateMany({ where: { id: { in: payload.creativeIds } }, data: { reviewStatus: "APPROVED" } }),
    prisma.marketingGoal.update({ where: { id: payload.goalId }, data: { status: "ACTIVE" } }),
    prisma.marketingTask.update({
      where: { id: approval.taskId },
      data: {
        status: "RESULT_READY",
        currentStep: "Package approved · platform readiness check ho raha hai",
        blockingReason: null,
      },
    }),
    prisma.adminAuditLog.create({
      data: {
        actorId: params.actorId,
        actorRole: params.actorRole,
        actionType: "MARKETING_PACKAGE_APPROVED",
        targetType: "marketing_approval",
        targetId: approval.id,
        reason: params.reason,
        newValue: JSON.stringify({ hash: approval.payloadHash, ...result }),
      },
    }),
  ]);

  // MKT-2 (§15 "After APPROVE_PACKAGE"): rows + readiness + per-platform
  // paused-create cards. No provider call happens here; a readiness failure
  // shows as a blocked deployment, never as a failed package approval.
  try {
    await prepareDeploymentsForTask({ taskId: approval.taskId, actor, now });
  } catch (err) {
    console.error("[marketing:approval] deployment prepare failed:", err instanceof Error ? err.message : String(err));
  }

  return { ok: true, status: "EXECUTED" };
}

// ============================================================
// MKT-2 write cards — decision + queue in one transaction
// ============================================================

/** The platform a write card names — read before any schema, so the executability gate can answer from it alone. */
function claimedPlatformOf(raw: unknown): DeploymentPlatform | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const platform = (raw as { platform?: unknown }).platform;
  return platform === "GOOGLE_SEARCH" || platform === "META" ? platform : null;
}

/** Both gates (doc 13 §18, doc 14 §17): the action, the platform set, and the registry's per-tool switch. */
function writeExecutable(action: MarketingApproval["action"], platform: DeploymentPlatform): boolean {
  return EXECUTABLE_APPROVAL_ACTIONS.has(action) && EXECUTABLE_PLATFORMS.has(platform) && executableWriteTool(action, platform) !== null;
}

/** An activation card must name exactly the objects this deployment verified PAUSED — Google by campaign resource, Meta by every id in the tree. */
function activationTargetMismatch(dep: CampaignDeployment, payload: ActivateWritePayload): string | null {
  if (payload.platform === "GOOGLE_SEARCH") {
    const campaign = refsOf(dep).campaign;
    return campaign && campaign === payload.externalCampaignRef ? null : "Card ka campaign deployment ke stored campaign se alag hai.";
  }
  const parsed = metaRefsOf(dep);
  if (!parsed.ok) return `Deployment ke stored Meta refs padhe nahi gaye: ${parsed.reason}`;
  const refs = parsed.refs;
  if (!refs.campaignId || refs.campaignId !== payload.campaignId) return "Card ka Meta campaign deployment ke stored campaign se alag hai.";
  const sameSet = (stored: string[], carded: string[]) => stored.length === carded.length && [...stored].sort().join(",") === [...carded].sort().join(",");
  if (
    !sameSet(Object.values(refs.adSets).map((x) => x.id), payload.adSetIds) ||
    !sameSet(Object.values(refs.ads).map((x) => x.id), payload.adIds) ||
    !sameSet(Object.values(refs.creatives).map((x) => x.id), payload.creativeIds)
  ) {
    return "Card ke ad set / ad / creative IDs deployment ke stored objects se alag hain.";
  }
  return null;
}

async function decideWriteCard(approval: MarketingApproval, decision: "APPROVE" | "REJECT", reason: string | null, actor: { id: string; role: Role }, now: Date): Promise<ApprovalDecisionResult> {
  const isCreate = approval.action === "CREATE_PAUSED_CAMPAIGNS";
  // The card names its platform and the platform picks the strict schema
  // (doc 14 Gap D). Whether that platform may execute at all is decided
  // first, from the name alone — a Meta card is "not executable" while the
  // Meta executor is switched off, whatever else its payload carries.
  const platform = claimedPlatformOf(approval.payload);
  if (!platform) return { ok: false, error: "PAYLOAD_INVALID", message: "Card ka payload typed schema se match nahi karta — refuse.", status: 409 };
  if (decision === "APPROVE" && !writeExecutable(approval.action, platform)) {
    return { ok: false, error: "NOT_EXECUTABLE", message: `${platform} ke liye "${approval.action}" is release me execute nahi hota.`, status: 422 };
  }
  const payload: CreatePausedWritePayload | ActivateWritePayload | null = isCreate ? parseCreatePausedPayload(approval.payload) : parseActivatePayload(approval.payload);
  if (!payload || payload.platform !== platform) return { ok: false, error: "PAYLOAD_INVALID", message: "Card ka payload typed schema se match nahi karta — refuse.", status: 409 };
  if (payload.taskId !== approval.taskId) return { ok: false, error: "PAYLOAD_MISMATCH", message: "Card kisi aur task ka hai.", status: 409 };

  const dep = await prisma.campaignDeployment.findUnique({ where: { id: payload.deploymentId }, include: { draft: true } });
  if (!dep || dep.draftId !== payload.draftId || dep.platform !== payload.platform) {
    return { ok: false, error: "DEPLOYMENT_MISMATCH", message: "Card ka deployment nahi mila ya platform alag hai.", status: 409 };
  }
  const linkedApprovalId = isCreate ? dep.createApprovalId : dep.activateApprovalId;
  if (linkedApprovalId !== approval.id) return { ok: false, error: "APPROVAL_STALE", message: "Ye card ab is deployment se juda nahi hai (naya card ban chuka hai).", status: 409 };

  // ---- reject: decision saved, nothing external changes (§13) --------------
  if (decision === "REJECT") {
    await prisma.$transaction(async (tx) => {
      await tx.marketingApproval.update({ where: { id: approval.id }, data: { status: "REJECTED", decidedBy: actor.id, decidedAt: now, decisionReason: reason } });
      if (isCreate) {
        await tx.campaignDeployment.updateMany({ where: { id: dep.id, status: "CREATE_PENDING" }, data: { status: "CANCELLED", lastErrorCode: null, lastErrorMessage: null, lastErrorFix: null } });
      } else {
        // The paused campaign stays paused; the row returns to the state that says so.
        await tx.campaignDeployment.updateMany({ where: { id: dep.id, status: "ACTIVATION_PENDING" }, data: { status: "PAUSED_READY" } });
      }
      await tx.adminAuditLog.create({
        data: { actorId: actor.id, actorRole: actor.role, actionType: isCreate ? "MARKETING_CREATE_PAUSED_REJECTED" : "MARKETING_ACTIVATION_REJECTED", targetType: "marketing_approval", targetId: approval.id, reason, newValue: approval.payloadHash },
      });
    });
    await recordEvent(dep.id, isCreate ? "create-card" : "activation-card", "info", `Admin ne reject kiya${reason ? `: ${reason}` : ""}. Platform par kuch nahi badla.`);
    await refreshTaskStatus(dep.taskId);
    return { ok: true, status: "REJECTED", deploymentId: dep.id };
  }

  // ---- approve: state? spec? target? (§7.3, §18) ---------------------------
  const expectedState: DeploymentStatusKey = isCreate ? "CREATE_PENDING" : "ACTIVATION_PENDING";
  if (dep.status !== expectedState) {
    return { ok: false, error: "WRONG_STATE", message: `Deployment ${dep.status} me hai, ${expectedState} nahi — card execute nahi ho sakta.`, status: 409 };
  }
  const liveSpecHash = specHashOf({ platform: dep.draft.platform, spec: dep.draft.spec, dailyBudgetPaise: dep.draft.dailyBudgetPaise, totalBudgetPaise: dep.draft.totalBudgetPaise });
  if (liveSpecHash !== payload.specHash || dep.specHash !== payload.specHash) {
    await prisma.marketingApproval.update({ where: { id: approval.id }, data: { status: "EXPIRED", decisionReason: "spec changed after card" } });
    await refreshTaskStatus(dep.taskId);
    return { ok: false, error: "SPEC_CHANGED", message: "Draft ka spec card banne ke baad badal gaya — card expire; 'Re-check readiness' se naya card banayein.", status: 409 };
  }
  if (!isCreate) {
    const mismatch = activationTargetMismatch(dep, payload as ActivateWritePayload);
    if (mismatch) return { ok: false, error: "CAMPAIGN_MISMATCH", message: mismatch, status: 409 };
  }

  const who = platform === "META" ? "Meta" : "Google";
  const queued: DeploymentStatusKey = isCreate ? "QUEUED" : "ACTIVATION_QUEUED";
  const ok = await prisma.$transaction(async (tx) => {
    const a = await tx.marketingApproval.updateMany({ where: { id: approval.id, status: "PENDING" }, data: { status: "APPROVED", decidedBy: actor.id, decidedAt: now, decisionReason: reason } });
    if (a.count !== 1) return false;
    const d = await tx.campaignDeployment.updateMany({ where: { id: dep.id, status: expectedState }, data: { status: queued, lastErrorCode: null, lastErrorMessage: null, lastErrorFix: null } });
    if (d.count !== 1) throw new Error("deployment moved during decision");
    await tx.marketingTask.update({ where: { id: dep.taskId }, data: { status: "WORKING", currentStep: isCreate ? `${who}: paused campaign banne ki queue me` : `${who}: activation queue me`, blockingReason: null } });
    await tx.adminAuditLog.create({
      data: {
        actorId: actor.id,
        actorRole: actor.role,
        actionType: isCreate ? "MARKETING_CREATE_PAUSED_APPROVED" : "MARKETING_ACTIVATION_APPROVED",
        targetType: "marketing_approval",
        targetId: approval.id,
        reason,
        newValue: JSON.stringify({ hash: approval.payloadHash, deploymentId: dep.id, platform: payload.platform, specHash: payload.specHash, dailyBudgetPaise: payload.dailyBudgetPaise }),
      },
    });
    return true;
  });
  if (!ok) {
    const again = await prisma.campaignDeployment.findUnique({ where: { id: dep.id } });
    return { ok: true, status: "QUEUED", deploymentId: dep.id, deploymentStatus: again?.status ?? queued };
  }
  await recordEvent(dep.id, isCreate ? "create-card" : "activation-card", "ok", `Admin approve — ${isCreate ? "paused create" : "activation"} queued. Provider write worker karega, is request me nahi.`);
  return { ok: true, status: "QUEUED", deploymentId: dep.id, deploymentStatus: queued };
}
