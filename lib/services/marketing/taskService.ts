import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getAiRoute } from "@/lib/ai/aiConfigService";
import { isGoogleConfigured } from "@/lib/auth/google";
import { isSecretBoxConfigured } from "@/lib/security/secretBox";
import {
  APPROVAL_PHASE,
  CHANNEL_LABEL,
  EXECUTABLE_APPROVAL_ACTIONS,
  type ApprovalPreview,
  type ApprovalRow,
  type CommandGoalInput,
  type CreativeRow,
  type DraftRow,
  type EvidenceSourceSummary,
  type GuardrailFlag,
  type MarketingChannel,
  type MarketingOverview,
  type RunRow,
  type TaskDetail,
  type TaskRow,
  type ThreadEntry,
  type ToolCallRecord,
} from "@/lib/contracts/marketingAi";
import type { MarketingPlan } from "@/lib/contracts/marketingPlanSchema";
import { recordDraftTool, type ToolRun } from "@/lib/marketing/tools/registry";
import { availableSources, buildMarketingContext, isKnownPublicPath, summariseSources, type MarketingContext } from "./contextBuilder";
import { askGrowthSaathi } from "./growthSaathi";
import { applyGuardrails } from "./packageGuardrails";
import { listConnectionStatus } from "./connectionService";
import { hashPayload } from "./execution/hashing";
import { hasExternalObjects, listDeploymentRows, toDeploymentSummary } from "./execution/deploymentService";
import { executableWriteTool } from "@/lib/marketing/tools/registry";
import { toCreativeMediaRow } from "./creativeMediaService";
import { EXECUTABLE_PLATFORMS, EXTERNAL_DEPLOYMENT_STATUSES, PLATFORM_LABEL, type DeploymentPlatform } from "@/lib/contracts/marketingExecution";
import { parseWriteApprovalPayload } from "@/lib/contracts/marketingExecutionPayloads";
import type { CampaignDeployment, CampaignDraft, CreativeAsset, MarketingApproval, MarketingGoal, MarketingRun, MarketingTask, Prisma, Role } from "@prisma/client";

export { hashPayload };

/**
 * A command's life: task → run → plan → drafts → approval (§2 Zone B, §16).
 *
 * `createTask` is what the POST route does; `runTask` is what runs after the
 * response has gone back (`after()` in the route) because a planning run
 * reads six providers and then waits on a long model call — a browser
 * request must not be held for that (§13). The queue polls.
 *
 * The state a task can be in is exactly the queue's vocabulary. The
 * transitions that matter:
 *
 *   WORKING ──plan with packages──▶ NEEDS_APPROVAL ──approve──▶ RESULT_READY
 *          ──plan, analysis only──▶ RESULT_READY
 *          ──one clarifying question──▶ BLOCKED ──admin answers──▶ WORKING
 *          ──packages but no budget cap──▶ BLOCKED (approval refused until a cap exists)
 *          ──model/provider failure──▶ FAILED (retryable: "revise" starts a new run)
 *
 * Nothing here touches a platform. `externalCampaignId` is written only by
 * the MKT-2 deployment worker after a provider read-back
 * (lib/services/marketing/execution/*).
 */

const APPROVAL_TTL_DAYS = 7;
const PAISE = 100;

function toRupeesLabel(rupees: number | null): string {
  return rupees === null ? "—" : `₹${Math.round(rupees).toLocaleString("en-IN")}`;
}

function threadOf(task: MarketingTask): ThreadEntry[] {
  const raw = task.thread;
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[]).filter((e): e is ThreadEntry => !!e && typeof e === "object" && "role" in e && "text" in e);
}

function goalInputOf(task: MarketingTask): CommandGoalInput | null {
  const raw = task.goalInput;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as CommandGoalInput;
}

// ============================================================
// Create / continue
// ============================================================

export async function createTask(params: { request: string; goalInput: CommandGoalInput | null; goalId: string | null; actorId: string }): Promise<MarketingTask> {
  const request = params.request.trim();
  const thread: ThreadEntry[] = [{ role: "admin", text: request, at: new Date().toISOString() }];
  return prisma.marketingTask.create({
    data: {
      requestedBy: params.actorId,
      request,
      thread: thread as unknown as Prisma.InputJsonValue,
      goalInput: (params.goalInput ?? undefined) as Prisma.InputJsonValue | undefined,
      goalId: params.goalId,
      status: "WORKING",
      currentStep: "Queue me — data padhna shuru hoga",
      channels: params.goalInput?.channels ?? [],
      budgetDailyPaise: params.goalInput?.dailyBudgetRupees ? Math.round(params.goalInput.dailyBudgetRupees * PAISE) : null,
      budgetTotalPaise: params.goalInput?.totalBudgetRupees ? Math.round(params.goalInput.totalBudgetRupees * PAISE) : null,
    },
  });
}

export type TaskWriteResult = { ok: true; taskId: string } | { ok: false; error: string; message: string; status: number };

/**
 * The admin replies to the model's one question, or asks for a revision.
 * Both append to the thread and re-run; both expire any pending approval,
 * because the package it covered is about to be replaced.
 */
export async function continueTask(params: { taskId: string; text: string; kind: "answer" | "revise"; actorId: string; actorRole: Role }): Promise<TaskWriteResult> {
  const task = await prisma.marketingTask.findUnique({ where: { id: params.taskId }, include: { deployments: true } });
  if (!task) return { ok: false, error: "NOT_FOUND", message: "Task nahi mila.", status: 404 };
  if (task.status === "WORKING") return { ok: false, error: "BUSY", message: "Ye task abhi chal raha hai — poora hone dijiye.", status: 409 };
  const text = params.text.trim();
  if (!text) return { ok: false, error: "VALIDATION_FAILED", message: "Kuch likhiye.", status: 422 };

  // MKT-2 (doc 13 §17): a package whose campaign exists (or may exist) on a
  // platform is not revised in place — a new run would draft a second
  // campaign next to the first. Manage that campaign where it lives, or
  // start a new task.
  const external = task.deployments.find((d) => EXTERNAL_DEPLOYMENT_STATUSES.has(d.status) || hasExternalObjects(d));
  if (external) {
    return {
      ok: false,
      error: "HAS_EXTERNAL_CAMPAIGN",
      message: `${PLATFORM_LABEL[external.platform]} par is package ka campaign ${external.status} hai — is task ko revise nahi kar sakte (duplicate campaign ban jaata). Naye package ke liye naya task dijiye; is campaign ko ${external.platform === "META" ? "Meta Ads Manager" : "Google Ads"} me manage karein.`,
      status: 409,
    };
  }

  const thread = [...threadOf(task), { role: "admin" as const, text, at: new Date().toISOString() }];

  await prisma.$transaction(async (tx) => {
    await tx.marketingApproval.updateMany({ where: { taskId: task.id, status: "PENDING" }, data: { status: "EXPIRED" } });
    // Deployments that never reached a platform are superseded by the new package.
    await tx.campaignDeployment.updateMany({
      where: { taskId: task.id, status: { in: ["CREATE_PENDING", "BLOCKED_CONFIG", "BLOCKED_CREATIVE", "FAILED_RETRYABLE", "FAILED_FINAL"] } },
      data: { status: "CANCELLED", lastErrorCode: null, lastErrorMessage: "Package revise hua — ye deployment superseded.", lastErrorFix: null },
    });
    await tx.marketingTask.update({
      where: { id: task.id },
      data: {
        thread: thread as unknown as Prisma.InputJsonValue,
        status: "WORKING",
        blockingReason: null,
        currentStep: params.kind === "answer" ? "Jawab mil gaya — dobara plan ban raha hai" : "Revision notes ke saath dobara plan ban raha hai",
      },
    });
    await tx.adminAuditLog.create({
      data: {
        actorId: params.actorId,
        actorRole: params.actorRole,
        actionType: params.kind === "answer" ? "MARKETING_TASK_ANSWERED" : "MARKETING_TASK_REVISED",
        targetType: "marketing_task",
        targetId: task.id,
        newValue: text.slice(0, 500),
      },
    });
  });

  return { ok: true, taskId: task.id };
}

// ============================================================
// The run
// ============================================================

async function step(taskId: string, currentStep: string): Promise<void> {
  await prisma.marketingTask.update({ where: { id: taskId }, data: { currentStep } });
}

async function failRun(runId: string, taskId: string, message: string): Promise<void> {
  await prisma.$transaction([
    prisma.marketingRun.update({ where: { id: runId }, data: { status: "FAILED", error: message.slice(0, 500), finishedAt: new Date() } }),
    prisma.marketingTask.update({
      where: { id: taskId },
      data: { status: "FAILED", currentStep: "Run fail hua", blockingReason: message.slice(0, 500) },
    }),
  ]);
}

export async function runTask(taskId: string, actor: { id: string; role: Role }): Promise<void> {
  const task = await prisma.marketingTask.findUnique({ where: { id: taskId }, include: { goal: true } });
  if (!task) return;

  const run = await prisma.marketingRun.create({ data: { taskId, status: "RUNNING" } });
  const goalInput = goalInputOf(task);
  const carried = carriedFromGoal(task.goal);

  try {
    await step(taskId, "BandhanTak, Google aur Meta ka data padh raha hoon…");
    // The model sees the form and, on a continued goal, what was settled
    // before — so a revision that says nothing about budget keeps the cap.
    const { context, toolRun } = await buildMarketingContext({ request: task.request, goalInput, carried, thread: threadOf(task) });

    await prisma.marketingRun.update({
      where: { id: run.id },
      data: { evidence: context as unknown as Prisma.InputJsonValue, toolsCalled: toolRun.records as unknown as Prisma.InputJsonValue },
    });

    await step(taskId, "Growth Saathi plan likh raha hai (1-3 minute)…");
    const answer = await askGrowthSaathi({ context, actorId: actor.id });
    if (!answer.ok) {
      await prisma.marketingRun.update({
        where: { id: run.id },
        data: {
          provider: answer.route?.provider ?? null,
          modelId: answer.route?.model ?? null,
          inputTokens: answer.usage?.inputTokens ?? null,
          outputTokens: answer.usage?.outputTokens ?? null,
        },
      });
      await failRun(run.id, taskId, answer.message);
      return;
    }

    await step(taskId, "Guardrails aur drafts…");
    const guarded = applyGuardrails({
      plan: answer.plan,
      goalInput,
      carried,
      requestText: `${task.request}\n${threadOf(task).map((t) => t.text).join("\n")}`,
      availableSources: availableSources(context),
      quotablePricesRupees: context.bandhantak.plans.data?.quotablePricesRupees ?? [],
      isKnownPublicPath,
    });
    const plan = guarded.plan;

    await persistOutcome({ task, run, toolRun, context, plan, flags: guarded.flags, budgetMissing: guarded.budgetMissing, dailyCap: guarded.dailyCapRupees, totalCap: guarded.totalCapRupees, answer, actor });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[marketing:task] run failed:", message);
    await failRun(run.id, taskId, message);
  }
}

/**
 * What an earlier run already settled for this goal — caps, target,
 * geography, channels. Fallbacks only: the admin's form on *this* command
 * wins outright, and a cap the admin states in a revision ("ab ₹300/day")
 * must beat the one stored last week, so these never override the model's
 * fresh extraction — they fill what it left null.
 */
function carriedFromGoal(goal: MarketingGoal | null): CommandGoalInput | null {
  if (!goal) return null;
  const out: CommandGoalInput = {
    windowDays: goal.windowDays,
    primaryConversion: goal.primaryConversion as CommandGoalInput["primaryConversion"],
  };
  if (goal.geography) out.geography = goal.geography;
  if (goal.audienceSide) out.audienceSide = goal.audienceSide as CommandGoalInput["audienceSide"];
  if (goal.target !== null) out.target = goal.target;
  if (goal.dailyBudgetPaise !== null) out.dailyBudgetRupees = goal.dailyBudgetPaise / PAISE;
  if (goal.totalBudgetPaise !== null) out.totalBudgetRupees = goal.totalBudgetPaise / PAISE;
  if (goal.allowedChannels.length) out.channels = goal.allowedChannels as MarketingChannel[];
  if (goal.constraints) out.constraints = goal.constraints;
  if (goal.stopLossRule) out.stopLossRule = goal.stopLossRule;
  return out;
}

interface PersistParams {
  task: MarketingTask & { goal: MarketingGoal | null };
  run: MarketingRun;
  toolRun: ToolRun;
  context: MarketingContext;
  plan: MarketingPlan;
  flags: GuardrailFlag[];
  budgetMissing: boolean;
  dailyCap: number | null;
  totalCap: number | null;
  answer: { route: { provider: string; model: string }; usage: { inputTokens: number; outputTokens: number } };
  actor: { id: string; role: Role };
}

async function persistOutcome(p: PersistParams): Promise<void> {
  const { task, run, plan } = p;
  const now = new Date();
  const summary = firstSentence(plan.diagnosis);

  // ---- A question, not a plan -------------------------------------------
  if (plan.clarifyingQuestion) {
    const thread = [...threadOf(task), { role: "saathi" as const, text: plan.clarifyingQuestion, at: now.toISOString() }];
    await prisma.$transaction([
      prisma.marketingRun.update({
        where: { id: run.id },
        data: runDone(p, "SUCCEEDED"),
      }),
      prisma.marketingTask.update({
        where: { id: task.id },
        data: {
          status: "BLOCKED",
          currentStep: "Growth Saathi ko ek jawab chahiye",
          blockingReason: plan.clarifyingQuestion,
          summary,
          thread: thread as unknown as Prisma.InputJsonValue,
        },
      }),
    ]);
    return;
  }

  // ---- Goal ---------------------------------------------------------------
  const goal = await upsertGoal(task, plan, p.dailyCap, p.totalCap, p.actor.id);

  // ---- Drafts and creatives (CREATE_DRAFT tier) ---------------------------
  const drafts: CampaignDraft[] = [];
  const creatives: CreativeAsset[] = [];
  const channels = new Set<string>(plan.recommendedPlan.channelChoices.map((c) => c.channel));

  if (plan.googleSearch) {
    const gs = plan.googleSearch;
    drafts.push(
      await prisma.campaignDraft.create({
        data: {
          taskId: task.id,
          goalId: goal.id,
          runId: run.id,
          platform: "GOOGLE_SEARCH",
          name: gs.campaignName,
          spec: gs as unknown as Prisma.InputJsonValue,
          dailyBudgetPaise: Math.round(gs.dailyBudgetRupees * PAISE),
          totalBudgetPaise: p.totalCap !== null ? Math.round(p.totalCap * PAISE) : null,
        },
      }),
    );
    recordDraftTool(p.toolRun, "google.campaign.draft", 1);
    recordDraftTool(p.toolRun, "ad.copy.create", gs.adGroups.reduce((n, ag) => n + ag.headlines.length + ag.descriptions.length, 0));
    channels.add("GOOGLE_SEARCH");
  }
  let metaDraftId: string | null = null;
  if (plan.meta) {
    const m = plan.meta;
    const draft = await prisma.campaignDraft.create({
      data: {
        taskId: task.id,
        goalId: goal.id,
        runId: run.id,
        platform: "META",
        name: m.campaignName,
        spec: m as unknown as Prisma.InputJsonValue,
        dailyBudgetPaise: Math.round(m.dailyBudgetRupees * PAISE),
        totalBudgetPaise: p.totalCap !== null ? Math.round(p.totalCap * PAISE) : null,
      },
    });
    drafts.push(draft);
    metaDraftId = draft.id;
    recordDraftTool(p.toolRun, "meta.campaign.draft", 1);
  }

  if (plan.creative) {
    const c = plan.creative;
    for (const hook of c.hooks) {
      creatives.push(
        await prisma.creativeAsset.create({
          data: { taskId: task.id, runId: run.id, draftId: metaDraftId, kind: "COPY", variantGroup: hook.id, title: `Hook · ${hook.angle}`, brief: hook as unknown as Prisma.InputJsonValue },
        }),
      );
    }
    for (const v of c.videos) {
      creatives.push(
        await prisma.creativeAsset.create({
          data: {
            taskId: task.id,
            runId: run.id,
            draftId: metaDraftId,
            kind: v.format === "REEL" ? "REEL" : "STORY",
            variantGroup: v.hookId,
            title: v.title,
            brief: v as unknown as Prisma.InputJsonValue,
          },
        }),
      );
    }
    for (const s of c.statics) {
      creatives.push(
        await prisma.creativeAsset.create({
          data: { taskId: task.id, runId: run.id, draftId: metaDraftId, kind: "IMAGE", variantGroup: s.hookId, title: s.headline, brief: s as unknown as Prisma.InputJsonValue },
        }),
      );
    }
    recordDraftTool(p.toolRun, "reel.brief.create", c.videos.filter((v) => v.format === "REEL").length);
    recordDraftTool(p.toolRun, "story.brief.create", c.videos.filter((v) => v.format === "STORY").length);
    recordDraftTool(p.toolRun, "creative.variants.create", c.hooks.length + c.statics.length);
  }
  if (plan.landing) {
    creatives.push(
      await prisma.creativeAsset.create({
        data: { taskId: task.id, runId: run.id, kind: "LANDING", title: `Landing · ${plan.landing.path}`, brief: plan.landing as unknown as Prisma.InputJsonValue },
      }),
    );
    recordDraftTool(p.toolRun, "landing.copy.create", 1);
  }
  recordDraftTool(p.toolRun, "strategy.create", 1);
  if (drafts.length) recordDraftTool(p.toolRun, "campaign.package.create", drafts.length);

  // ---- Approval -----------------------------------------------------------
  let approvalStatus: "NEEDS_APPROVAL" | "BLOCKED" | "RESULT_READY" = "RESULT_READY";
  let blockingReason: string | null = null;
  let currentStep = "Analysis taiyaar";

  if (drafts.length && !p.budgetMissing) {
    const payload = {
      runId: run.id,
      goalId: goal.id,
      draftIds: drafts.map((d) => d.id),
      creativeIds: creatives.map((c) => c.id),
      dailyCapRupees: p.dailyCap,
      totalCapRupees: p.totalCap,
    };
    const preview = buildApprovalPreview(plan, p.context, p.dailyCap, p.totalCap, p.flags);
    await prisma.marketingApproval.create({
      data: {
        taskId: task.id,
        action: "APPROVE_PACKAGE",
        payload: payload as Prisma.InputJsonValue,
        payloadHash: hashPayload(payload),
        preview: preview as unknown as Prisma.InputJsonValue,
        status: "PENDING",
        requestedBy: "growth-saathi",
        expiresAt: new Date(now.getTime() + APPROVAL_TTL_DAYS * 86_400_000),
      },
    });
    approvalStatus = "NEEDS_APPROVAL";
    currentStep = "Campaign package taiyaar — aapke approval ka intezaar";
  } else if (drafts.length && p.budgetMissing) {
    approvalStatus = "BLOCKED";
    blockingReason = "Package taiyaar hai par budget cap nahi mila. Neeche jawab me daily/total cap likhiye (jaise \"₹500/day, total ₹15,000\") — tab approval khulega.";
    currentStep = "Budget cap chahiye";
  }

  const thread = [...threadOf(task), { role: "saathi" as const, text: summary, at: now.toISOString() }];

  await prisma.$transaction([
    prisma.marketingRun.update({ where: { id: run.id }, data: runDone(p, "SUCCEEDED") }),
    prisma.marketingTask.update({
      where: { id: task.id },
      data: {
        goalId: goal.id,
        status: approvalStatus,
        currentStep,
        blockingReason,
        summary,
        channels: [...channels],
        budgetDailyPaise: p.dailyCap !== null ? Math.round(p.dailyCap * PAISE) : null,
        budgetTotalPaise: p.totalCap !== null ? Math.round(p.totalCap * PAISE) : null,
        thread: thread as unknown as Prisma.InputJsonValue,
      },
    }),
    prisma.adminAuditLog.create({
      data: {
        actorId: p.actor.id,
        actorRole: p.actor.role,
        actionType: "MARKETING_PLAN_GENERATED",
        targetType: "marketing_task",
        targetId: task.id,
        newValue: JSON.stringify({ runId: run.id, status: approvalStatus, drafts: drafts.length, creatives: creatives.length, flags: p.flags.length, model: `${p.answer.route.provider}:${p.answer.route.model}` }),
      },
    }),
  ]);
}

function runDone(p: PersistParams, status: "SUCCEEDED"): Prisma.MarketingRunUpdateInput {
  return {
    status,
    provider: p.answer.route.provider,
    modelId: p.answer.route.model,
    inputTokens: p.answer.usage.inputTokens,
    outputTokens: p.answer.usage.outputTokens,
    decisions: p.plan as unknown as Prisma.InputJsonValue,
    guardrailFlags: p.flags as unknown as Prisma.InputJsonValue,
    toolsCalled: p.toolRun.records as unknown as Prisma.InputJsonValue,
    inputsWereAggregate: true,
    finishedAt: new Date(),
  };
}

async function upsertGoal(task: MarketingTask & { goal: MarketingGoal | null }, plan: MarketingPlan, dailyCap: number | null, totalCap: number | null, actorId: string): Promise<MarketingGoal> {
  const g = plan.goal;
  const data = {
    name: g.name.slice(0, 120),
    objective: g.objective,
    geography: g.geography,
    audienceSide: g.audienceSide,
    windowDays: Math.max(1, Math.round(g.windowDays || 30)),
    primaryConversion: g.primaryConversion,
    baseline: (g.baseline ?? undefined) as Prisma.InputJsonValue | undefined,
    target: g.targetFromAdmin !== null ? Math.round(g.targetFromAdmin) : null,
    dailyBudgetPaise: dailyCap !== null ? Math.round(dailyCap * PAISE) : null,
    totalBudgetPaise: totalCap !== null ? Math.round(totalCap * PAISE) : null,
    allowedChannels: g.channels,
    constraints: g.constraints.join("\n") || null,
    stopLossRule: g.stopLossRule || null,
  };
  if (task.goal) {
    return prisma.marketingGoal.update({ where: { id: task.goal.id }, data });
  }
  return prisma.marketingGoal.create({ data: { ...data, status: "DRAFT", createdBy: actorId } });
}

function firstSentence(text: string): string {
  const s = text.split(/(?<=[.!?।])\s+/)[0] ?? text;
  return s.slice(0, 240);
}

/** §10 — the exact diff the admin approves. Every field is text so the card cannot hide a number. */
export function buildApprovalPreview(plan: MarketingPlan, context: MarketingContext, dailyCap: number | null, totalCap: number | null, flags: GuardrailFlag[]): ApprovalPreview {
  const conn = (p: string) => context.connections.find((c) => c.provider === p)?.health ?? "NOT_CONNECTED";
  const accounts: string[] = [];
  if (plan.googleSearch) accounts.push(`Google Ads (${conn("GOOGLE_ADS") === "CONNECTED" ? "connected" : "not connected yet"})`);
  if (plan.meta) accounts.push(`Meta Ads (${conn("META_ADS") === "CONNECTED" ? "connected" : "not connected yet"})`);

  const content: string[] = [];
  const firstGroup = plan.googleSearch?.adGroups[0];
  if (firstGroup?.headlines[0]) content.push(`Google: "${firstGroup.headlines[0]}" — ${firstGroup.descriptions[0] ?? ""}`.trim());
  const firstAd = plan.meta?.ads[0];
  if (firstAd) content.push(`Meta: "${firstAd.headline}" — ${firstAd.primaryText.slice(0, 120)}`);
  for (const v of plan.creative?.videos ?? []) content.push(`${v.format}: ${v.title} — hook: "${v.hook}"`);
  if (flags.length) content.push(`Guardrails ne ${flags.length} cheez badli/hataayi — detail neeche.`);

  const destinations = new Set<string>();
  if (plan.googleSearch) destinations.add(plan.googleSearch.landingPath);
  if (plan.meta) destinations.add(plan.meta.landingPath);
  if (plan.landing) destinations.add(plan.landing.path);

  const window = plan.meta?.schedule ? `${plan.meta.schedule.startDate} → ${plan.meta.schedule.endDate}` : `${plan.recommendedPlan.budget.windowDays} din`;

  return {
    account: accounts.length ? accounts.join(" · ") : "BandhanTak internal drafts",
    channel: plan.recommendedPlan.channelChoices.map((c) => `${CHANNEL_LABEL[c.channel]} ${c.budgetSharePct}%`).join(" · ") || "—",
    audience: plan.recommendedPlan.targetAudience,
    contentPreview: content,
    destination: [...destinations].join(", ") || "—",
    startEnd: window,
    dailyBudget: `${toRupeesLabel(plan.recommendedPlan.budget.dailyRupees)}/day${dailyCap !== null ? ` (cap ${toRupeesLabel(dailyCap)})` : " (koi cap nahi)"}`,
    totalBudget: `${toRupeesLabel(plan.recommendedPlan.budget.totalRupees)}${totalCap !== null ? ` (cap ${toRupeesLabel(totalCap)})` : ""}`,
    conversionEvent: plan.goal.primaryConversion,
    whatHappensNow:
      "Package BandhanTak ke andar APPROVED mark hoga aur goal ACTIVE. Platform par KUCH NAHI banega, koi paisa nahi lagega — Google ke liye alag \"Create paused on Google\" card banega (readiness pass hone par), uske baad alag \"Activate\" card; Meta paused-create aur Reel render agle phase me.",
    rollback: "Koi external asar nahi hai — kabhi bhi Reject ya Revise karein; drafts internal hi rehte hain.",
  };
}

// ============================================================
// Reads — the queue and the detail
// ============================================================

type TaskWithRelations = MarketingTask & {
  goal: MarketingGoal | null;
  /** Newest first. */
  runs: MarketingRun[];
  approvals: MarketingApproval[];
  drafts: { runId: string | null }[];
  creatives: { runId: string | null }[];
  deployments: Pick<CampaignDeployment, "id" | "platform" | "status" | "lastErrorCode">[];
};

function toTaskRow(t: TaskWithRelations): TaskRow {
  const lastRun = t.runs[0] ?? null;
  const pending = t.approvals.find((a) => a.status === "PENDING" && a.expiresAt > new Date()) ?? null;
  // The row describes the package that is current — the latest finished
  // run's — not everything every revision ever produced.
  const currentRunId = t.runs.find((r) => r.status === "SUCCEEDED")?.id ?? null;
  const decisions = (t.runs.find((r) => r.status === "SUCCEEDED")?.decisions ?? null) as MarketingPlan | null;
  return {
    id: t.id,
    request: t.request,
    status: t.status,
    currentStep: t.currentStep,
    blockingReason: t.blockingReason,
    summary: t.summary,
    channels: t.channels,
    budgetDailyPaise: t.budgetDailyPaise,
    budgetTotalPaise: t.budgetTotalPaise,
    goal: t.goal
      ? {
          id: t.goal.id,
          name: t.goal.name,
          objective: t.goal.objective,
          geography: t.goal.geography,
          primaryConversion: t.goal.primaryConversion,
          target: t.goal.target,
          dailyBudgetPaise: t.goal.dailyBudgetPaise,
          totalBudgetPaise: t.goal.totalBudgetPaise,
          status: t.goal.status,
        }
      : null,
    pendingApprovalId: pending?.id ?? null,
    deployments: t.deployments.map(toDeploymentSummary),
    draftCount: t.drafts.filter((d) => d.runId === currentRunId).length,
    creativeCount: t.creatives.filter((c) => c.runId === currentRunId).length,
    evidenceCount: Array.isArray(decisions?.evidence) ? decisions!.evidence.length : 0,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    lastRun: lastRun
      ? {
          id: lastRun.id,
          status: lastRun.status,
          error: lastRun.error,
          provider: lastRun.provider,
          modelId: lastRun.modelId,
          startedAt: lastRun.startedAt.toISOString(),
          finishedAt: lastRun.finishedAt?.toISOString() ?? null,
        }
      : null,
  };
}

const TASK_INCLUDE = {
  goal: true,
  // Two, not one: the newest run may still be RUNNING while the row has to
  // describe the last one that finished.
  runs: { orderBy: { startedAt: "desc" as const }, take: 2 },
  approvals: { orderBy: { createdAt: "desc" as const } },
  drafts: { select: { runId: true } },
  creatives: { select: { runId: true } },
  deployments: { select: { id: true, platform: true, status: true, lastErrorCode: true } },
};

export async function listTasks(limit = 50): Promise<TaskRow[]> {
  const rows = await prisma.marketingTask.findMany({ orderBy: { createdAt: "desc" }, take: limit, include: TASK_INCLUDE });
  return rows.map(toTaskRow);
}

export async function getOverview(): Promise<MarketingOverview> {
  const [connections, tasks, aiRoute] = await Promise.all([listConnectionStatus(), listTasks(), getAiRoute("marketingManager")]);
  return {
    generatedAt: new Date().toISOString(),
    connections,
    tasks,
    encryptionConfigured: isSecretBoxConfigured(),
    googleOAuthConfigured: isGoogleConfigured(),
    aiRoute,
  };
}

function toApprovalRow(a: MarketingApproval): ApprovalRow {
  const write = a.action === "CREATE_PAUSED_CAMPAIGNS" || a.action === "ACTIVATE_CAMPAIGNS" ? parseWriteApprovalPayload(a.payload) : null;
  const platform: DeploymentPlatform | null = write?.platform ?? null;
  return {
    id: a.id,
    action: a.action,
    status: a.status,
    // A write card is executable only for a platform this release can write to and whose tool is switched on (doc 13 §18, doc 14 §17).
    executable: EXECUTABLE_APPROVAL_ACTIONS.has(a.action) && (platform === null || (EXECUTABLE_PLATFORMS.has(platform) && executableWriteTool(a.action, platform) !== null)),
    platform,
    deploymentId: write?.deploymentId ?? null,
    preview: a.preview as unknown as ApprovalPreview,
    payloadHash: a.payloadHash,
    requestedBy: a.requestedBy,
    decidedBy: a.decidedBy,
    decidedAt: a.decidedAt?.toISOString() ?? null,
    decisionReason: a.decisionReason,
    expiresAt: a.expiresAt.toISOString(),
    executionResult: (a.executionResult as Record<string, unknown> | null) ?? null,
  };
}

function toRunRow(r: MarketingRun): RunRow {
  const evidence = r.evidence as MarketingContext | null;
  return {
    id: r.id,
    status: r.status,
    provider: r.provider,
    modelId: r.modelId,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    error: r.error,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
    toolsCalled: Array.isArray(r.toolsCalled) ? (r.toolsCalled as unknown as ToolCallRecord[]) : [],
    sources: evidence && typeof evidence === "object" && "bandhantak" in evidence ? safeSummarise(evidence) : [],
  };
}

function safeSummarise(ctx: MarketingContext): EvidenceSourceSummary[] {
  try {
    return summariseSources(ctx);
  } catch {
    return [];
  }
}

export async function getTaskDetail(taskId: string): Promise<TaskDetail | null> {
  const t = await prisma.marketingTask.findUnique({
    where: { id: taskId },
    include: {
      ...TASK_INCLUDE,
      runs: { orderBy: { startedAt: "desc" as const } },
      drafts: { orderBy: { createdAt: "asc" } },
      creatives: { orderBy: { createdAt: "asc" }, include: { media: { where: { status: { not: "INVALID" } }, orderBy: { createdAt: "asc" } } } },
    },
  });
  if (!t) return null;

  const row = toTaskRow(t);
  const latestDone = t.runs.find((r) => r.status === "SUCCEEDED") ?? null;
  const latestRunId = latestDone?.id ?? null;
  const deploymentRows = await listDeploymentRows(t.id);

  const drafts: DraftRow[] = t.drafts
    .filter((d) => !latestRunId || d.runId === latestRunId)
    .map((d) => ({
      id: d.id,
      platform: d.platform,
      name: d.name,
      spec: d.spec as Record<string, unknown>,
      dailyBudgetPaise: d.dailyBudgetPaise,
      totalBudgetPaise: d.totalBudgetPaise,
      approvalStatus: d.approvalStatus,
      externalCampaignId: d.externalCampaignId,
      externalStatus: d.externalStatus,
    }));
  const creatives: CreativeRow[] = t.creatives
    .filter((c) => !latestRunId || c.runId === latestRunId)
    .map((c) => ({ id: c.id, kind: c.kind, variantGroup: c.variantGroup, title: c.title, brief: c.brief as Record<string, unknown>, reviewStatus: c.reviewStatus, media: c.media.map(toCreativeMediaRow) }));

  return {
    ...row,
    thread: threadOf(t),
    plan: (latestDone?.decisions as MarketingPlan | null) ?? null,
    evidence: (latestDone?.evidence as Record<string, unknown> | null) ?? null,
    guardrailFlags: Array.isArray(latestDone?.guardrailFlags) ? (latestDone!.guardrailFlags as unknown as GuardrailFlag[]) : [],
    drafts,
    creatives,
    approvals: t.approvals.map(toApprovalRow),
    runs: t.runs.map(toRunRow),
    deploymentRows,
  };
}

/** The phase label the detail view shows next to a non-executable approval the model asked for. */
export function approvalPhaseLabel(action: keyof typeof APPROVAL_PHASE): string {
  return APPROVAL_PHASE[action];
}
