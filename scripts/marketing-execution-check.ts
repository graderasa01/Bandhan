import "./_env";
// A developer's env may hold a live Meta token and ids; with Meta executable they must be unreachable here too.
import "./_stubs/marketingNetworkIsolation";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/db/prisma";
import { ConnectorError } from "../lib/marketing/connectors/http";
import { CreatePausedPayloadSchema, ActivatePayloadSchema } from "../lib/contracts/marketingExecutionPayloads";
import { decideApproval } from "../lib/services/marketing/approvalService";
import { listDeploymentRows, prepareDeploymentsForTask } from "../lib/services/marketing/execution/deploymentService";
import { hashPayload } from "../lib/services/marketing/execution/hashing";
import { recheckDeployment, recoverDeployments, requestActivation, retryDeployment, runDeployment, syncDeployment } from "../lib/services/marketing/execution/deploymentWorker";
import { continueTask } from "../lib/services/marketing/taskService";
import { fixturePlan } from "./_stubs/marketingFixtures";
import { FakeGoogleAds, googleValidationError } from "./_stubs/fakeGoogleAds";
import type { MarketingConnection, Prisma } from "@prisma/client";

/**
 * MKT-2 execution, end to end, against the local database with a fake
 * Google Ads (doc 13 §20). No network, no model, no real ad account —
 * every "provider" call is `scripts/_stubs/fakeGoogleAds.ts`, which records
 * what the worker asked it to do. That record is the evidence:
 *
 *   • the first mutate is validate-only and the real one is sent once;
 *   • a double click, a parallel worker, a timeout and a retry never add a
 *     second real create;
 *   • an unknown outcome is reconciled by marker before any retry;
 *   • creation ends PAUSED and activation needs its own card, its own
 *     preflight and a read-back that says ENABLED.
 *
 * Run: `npx tsx scripts/marketing-execution-check.ts` (Docker Postgres up).
 * Fixtures are tagged, created per case and deleted at the end; the
 * GOOGLE_ADS connection row is snapshotted and restored.
 */

process.env.NEXT_PUBLIC_APP_URL = "https://bandhantak.com";
process.env.APP_URL = "https://bandhantak.com";
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "mkt2-check-client";
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "mkt2-check-secret";
process.env.GOOGLE_ADS_DEVELOPER_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "mkt2-check-dev-token";
if (!process.env.SECRETS_ENCRYPTION_KEY) process.env.SECRETS_ENCRYPTION_KEY = "0".repeat(64);

const TAG = `[mkt2-check ${randomUUID().slice(0, 8)}]`;
const ACTOR = { id: "mkt2-check-admin", role: "ADMIN" as const };
const CUSTOMER = "1234567890";

let failures = 0;
let checks = 0;
const queue: Array<{ label: string; fn: () => Promise<void> }> = [];
function check(label: string, fn: () => Promise<void>) {
  queue.push({ label, fn });
}

// ---- clock the worker reads ------------------------------------------------
let clock = Date.now();
const now = () => new Date(clock);
const advance = (ms: number) => {
  clock += ms;
};

// ---- fixtures ---------------------------------------------------------------
const createdTaskIds: string[] = [];
const createdGoalIds: string[] = [];

async function makeTask(opts: { dailyCapPaise?: number | null; totalCapPaise?: number | null; windowDays?: number; googleDailyPaise?: number; withMeta?: boolean } = {}) {
  const plan = fixturePlan({ dailyRupees: 500 });
  const goal = await prisma.marketingGoal.create({
    data: {
      name: `${TAG} goal`,
      objective: "VERIFIED_PROFILE",
      geography: "Jaipur",
      audienceSide: "women",
      windowDays: opts.windowDays ?? 30,
      primaryConversion: "verification_completed",
      dailyBudgetPaise: opts.dailyCapPaise === undefined ? 50_000 : opts.dailyCapPaise,
      totalBudgetPaise: opts.totalCapPaise === undefined ? 1_500_000 : opts.totalCapPaise,
      allowedChannels: ["GOOGLE_SEARCH", "INSTAGRAM_REELS"],
      status: "ACTIVE",
      createdBy: ACTOR.id,
    },
  });
  createdGoalIds.push(goal.id);
  const task = await prisma.marketingTask.create({
    data: { goalId: goal.id, requestedBy: ACTOR.id, request: `${TAG} Jaipur me ₹500/day, total ₹15,000`, status: "RESULT_READY", channels: ["GOOGLE_SEARCH"], budgetDailyPaise: 50_000, budgetTotalPaise: 1_500_000 },
  });
  createdTaskIds.push(task.id);
  const run = await prisma.marketingRun.create({ data: { taskId: task.id, status: "SUCCEEDED", decisions: plan as unknown as Prisma.InputJsonValue, finishedAt: new Date() } });
  const google = await prisma.campaignDraft.create({
    data: {
      taskId: task.id,
      goalId: goal.id,
      runId: run.id,
      platform: "GOOGLE_SEARCH",
      name: plan.googleSearch!.campaignName,
      spec: plan.googleSearch as unknown as Prisma.InputJsonValue,
      dailyBudgetPaise: opts.googleDailyPaise ?? 30_000,
      totalBudgetPaise: 1_500_000,
      approvalStatus: "APPROVED",
    },
  });
  let meta = null;
  if (opts.withMeta === true) {
    meta = await prisma.campaignDraft.create({
      data: { taskId: task.id, goalId: goal.id, runId: run.id, platform: "META", name: plan.meta!.campaignName, spec: plan.meta as unknown as Prisma.InputJsonValue, dailyBudgetPaise: 20_000, totalBudgetPaise: 1_500_000, approvalStatus: "APPROVED" },
    });
  }
  return { goal, task, run, google, meta };
}

async function pendingApproval(taskId: string, action: "CREATE_PAUSED_CAMPAIGNS" | "ACTIVATE_CAMPAIGNS") {
  return prisma.marketingApproval.findFirst({ where: { taskId, action, status: "PENDING" }, orderBy: { createdAt: "desc" } });
}

async function googleDeployment(taskId: string) {
  const dep = await prisma.campaignDeployment.findFirst({ where: { taskId, platform: "GOOGLE_SEARCH" }, include: { createApproval: true, activateApproval: true } });
  assert.ok(dep, "google deployment exists");
  return dep;
}

/** Package approved → card → approve → QUEUED. The common prefix of most cases. */
async function toQueued(opts: Parameters<typeof makeTask>[0] = {}) {
  const f = await makeTask(opts);
  await prepareDeploymentsForTask({ taskId: f.task.id, actor: ACTOR, now: now() });
  const card = await pendingApproval(f.task.id, "CREATE_PAUSED_CAMPAIGNS");
  assert.ok(card, "create card exists");
  const r = await decideApproval({ approvalId: card.id, decision: "APPROVE", reason: null, actorId: ACTOR.id, actorRole: ACTOR.role });
  assert.equal(r.ok, true);
  const dep = await googleDeployment(f.task.id);
  assert.equal(dep.status, "QUEUED");
  return { ...f, card, dep };
}

async function toActivationPending(fake: FakeGoogleAds, opts: Parameters<typeof makeTask>[0] = {}) {
  const f = await toQueued(opts);
  const r = await runDeployment(f.dep.id, { provider: fake, workerId: "w-happy", now });
  assert.equal(r.status, "ACTIVATION_PENDING", r.message);
  const dep = await googleDeployment(f.task.id);
  const card = await pendingApproval(f.task.id, "ACTIVATE_CAMPAIGNS");
  assert.ok(card, "activation card exists");
  return { ...f, dep, activateCard: card };
}

// ============================================================
// Connection row — the fake account the readiness check reads
// ============================================================

let connectionSnapshot: MarketingConnection | null = null;

async function installFakeConnection() {
  connectionSnapshot = await prisma.marketingConnection.findUnique({ where: { provider: "GOOGLE_ADS" } });
  const data = {
    accountRef: CUSTOMER,
    accountLabel: "Fake BandhanTak",
    settings: { currency: "INR", timeZone: "Asia/Kolkata", isManager: "false", isTestAccount: "true" } as Prisma.InputJsonValue,
    scopes: ["https://www.googleapis.com/auth/adwords"],
    status: "CONNECTED" as const,
    secretCipherText: "fake",
    secretIv: "fake",
    secretAuthTag: "fake",
    secretKind: "GOOGLE_REFRESH_TOKEN",
    grantedAt: new Date(),
    grantedBy: ACTOR.id,
    lastSyncAt: new Date(),
    lastErrorCode: null,
    lastErrorMessage: null,
    lastErrorAt: null,
  };
  await prisma.marketingConnection.upsert({ where: { provider: "GOOGLE_ADS" }, create: { provider: "GOOGLE_ADS", ...data }, update: data });
}

async function restoreConnection() {
  if (connectionSnapshot) {
    const { id, provider, createdAt, updatedAt, ...rest } = connectionSnapshot;
    void id;
    void createdAt;
    void updatedAt;
    await prisma.marketingConnection.update({ where: { provider }, data: { ...rest, settings: (rest.settings ?? undefined) as Prisma.InputJsonValue | undefined } });
  } else {
    await prisma.marketingConnection.deleteMany({ where: { provider: "GOOGLE_ADS" } });
  }
}

// ============================================================
// 1. After APPROVE_PACKAGE — rows, readiness, cards (§15)
// ============================================================

check("package approval prepares one Google deployment + create card and an honest Meta block (no Meta connection here), idempotently", async () => {
  const f = await makeTask({ withMeta: true });
  const r1 = await prepareDeploymentsForTask({ taskId: f.task.id, actor: ACTOR, now: now() });
  assert.equal(r1.deployments.length, 2);
  const google = await googleDeployment(f.task.id);
  assert.equal(google.status, "CREATE_PENDING");
  assert.ok(google.createApprovalId);
  assert.equal(google.accountRef, CUSTOMER);
  assert.equal(google.currency, "INR");
  assert.match(google.executionMarker, /^BT:[0-9a-f]{10}$/);
  const card = await pendingApproval(f.task.id, "CREATE_PAUSED_CAMPAIGNS");
  assert.ok(card);
  assert.equal(card.id, google.createApprovalId);
  const payload = CreatePausedPayloadSchema.parse(card.payload);
  assert.equal(payload.deploymentId, google.id);
  assert.equal(payload.dailyBudgetPaise, 30_000);
  assert.equal(payload.maxSpendPaise, 900_000);
  assert.equal(payload.startAt, null);
  assert.equal(payload.landingUrls[0], "https://bandhantak.com/register?utm_source=google&utm_medium=cpc&utm_campaign=jaipur-verified-women-2026-09&utm_content={creative}");
  assert.equal(payload.deferred.length, 2);
  assert.equal(hashPayload(card.payload), card.payloadHash);
  const preview = card.preview as { whatHappensNow: string; totalBudget: string };
  assert.match(preview.whatHappensNow, /KOI SPEND NAHI/);
  assert.match(preview.totalBudget, /max ₹9,000/);
  const meta = await prisma.campaignDeployment.findFirst({ where: { taskId: f.task.id, platform: "META" } });
  assert.equal(meta?.status, "BLOCKED_CONFIG");
  assert.equal(meta?.lastErrorCode, "ACCOUNT_NOT_READY", "Meta is executable, but this check has no Meta connection: an honest block, never a card");
  assert.equal(await pendingApproval(f.task.id, "ACTIVATE_CAMPAIGNS"), null);
  assert.equal((await prisma.marketingApproval.count({ where: { taskId: f.task.id } })), 1, "no Meta card, no second Google card");
  const task = await prisma.marketingTask.findUnique({ where: { id: f.task.id } });
  assert.equal(task?.status, "NEEDS_APPROVAL");

  const r2 = await prepareDeploymentsForTask({ taskId: f.task.id, actor: ACTOR, now: now() });
  assert.deepEqual(r2.deployments.map((d) => d.id).sort(), r1.deployments.map((d) => d.id).sort());
  assert.equal((await prisma.marketingApproval.count({ where: { taskId: f.task.id } })), 1, "prepare is idempotent");
  assert.equal((await prisma.campaignDeployment.count({ where: { taskId: f.task.id } })), 2);
});

check("readiness blocks a package that cannot fit its own caps, with the fix; re-check after the fix issues the card", async () => {
  const f = await makeTask({ totalCapPaise: 500_000 });
  await prepareDeploymentsForTask({ taskId: f.task.id, actor: ACTOR, now: now() });
  const dep = await googleDeployment(f.task.id);
  assert.equal(dep.status, "BLOCKED_CONFIG");
  assert.equal(dep.lastErrorCode, "INVALID_BUDGET");
  assert.match(dep.lastErrorMessage ?? "", /goal total cap/);
  assert.ok(dep.lastErrorFix);
  assert.equal(await pendingApproval(f.task.id, "CREATE_PAUSED_CAMPAIGNS"), null, "no fake card for a blocked platform");
  assert.equal((await prisma.marketingTask.findUnique({ where: { id: f.task.id } }))?.status, "BLOCKED");
  const rows = await listDeploymentRows(f.task.id);
  const g = rows.find((r) => r.platform === "GOOGLE_SEARCH")!;
  assert.deepEqual(g.availableActions, ["RECHECK"]);
  assert.equal(g.safeError?.code, "INVALID_BUDGET");

  await prisma.marketingGoal.update({ where: { id: f.goal.id }, data: { totalBudgetPaise: 1_500_000 } });
  const r = await recheckDeployment(dep.id, ACTOR, { now });
  assert.equal(r.ok && r.status, "CREATE_PENDING");
  assert.ok(await pendingApproval(f.task.id, "CREATE_PAUSED_CAMPAIGNS"));
});

check("readiness blocks when the connection is not CONNECTED, naming the todo", async () => {
  await prisma.marketingConnection.update({ where: { provider: "GOOGLE_ADS" }, data: { status: "NEEDS_ATTENTION", lastErrorMessage: "token revoked" } });
  try {
    const f = await makeTask();
    await prepareDeploymentsForTask({ taskId: f.task.id, actor: ACTOR, now: now() });
    const dep = await googleDeployment(f.task.id);
    assert.equal(dep.status, "BLOCKED_CONFIG");
    assert.equal(dep.lastErrorCode, "ACCOUNT_NOT_READY");
    assert.match(dep.lastErrorFix ?? "", /token revoked|Connect/);
  } finally {
    await prisma.marketingConnection.update({ where: { provider: "GOOGLE_ADS" }, data: { status: "CONNECTED", lastErrorMessage: null } });
  }
});

// ============================================================
// 2. Approval rules (§7.3, §20.2)
// ============================================================

check("tampered hash, expiry and an edited budget all refuse the card; a Google card never authorises Meta", async () => {
  const f = await makeTask({ withMeta: true });
  await prepareDeploymentsForTask({ taskId: f.task.id, actor: ACTOR, now: now() });
  const card = (await pendingApproval(f.task.id, "CREATE_PAUSED_CAMPAIGNS"))!;

  await prisma.marketingApproval.update({ where: { id: card.id }, data: { payloadHash: "0".repeat(64) } });
  let r = await decideApproval({ approvalId: card.id, decision: "APPROVE", reason: null, actorId: ACTOR.id, actorRole: ACTOR.role });
  assert.equal(!r.ok && r.error, "PAYLOAD_MISMATCH");
  await prisma.marketingApproval.update({ where: { id: card.id }, data: { payloadHash: card.payloadHash } });

  await prisma.marketingApproval.update({ where: { id: card.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  r = await decideApproval({ approvalId: card.id, decision: "APPROVE", reason: null, actorId: ACTOR.id, actorRole: ACTOR.role });
  assert.equal(!r.ok && r.error, "EXPIRED");
  assert.equal((await prisma.marketingApproval.findUnique({ where: { id: card.id } }))?.status, "EXPIRED");

  // A fresh card, then the draft budget changes underneath it.
  const dep = await googleDeployment(f.task.id);
  const rc = await recheckDeployment(dep.id, ACTOR, { now });
  assert.equal(rc.ok && rc.status, "CREATE_PENDING");
  const card2 = (await pendingApproval(f.task.id, "CREATE_PAUSED_CAMPAIGNS"))!;
  assert.notEqual(card2.id, card.id);
  await prisma.campaignDraft.update({ where: { id: f.google.id }, data: { dailyBudgetPaise: 40_000 } });
  r = await decideApproval({ approvalId: card2.id, decision: "APPROVE", reason: null, actorId: ACTOR.id, actorRole: ACTOR.role });
  assert.equal(!r.ok && r.error, "SPEC_CHANGED");
  assert.equal((await prisma.marketingApproval.findUnique({ where: { id: card2.id } }))?.status, "EXPIRED");
  assert.equal((await googleDeployment(f.task.id)).status, "CREATE_PENDING", "no write was queued");

  // A Meta-platform card with the same action is refused before any state changes.
  const metaDep = (await prisma.campaignDeployment.findFirst({ where: { taskId: f.task.id, platform: "META" } }))!;
  const metaPayload = { ...CreatePausedPayloadSchema.parse(card2.payload), platform: "META" as const, deploymentId: metaDep.id, draftId: metaDep.draftId };
  const metaCard = await prisma.marketingApproval.create({
    data: { taskId: f.task.id, action: "CREATE_PAUSED_CAMPAIGNS", payload: metaPayload as unknown as Prisma.InputJsonValue, payloadHash: hashPayload(metaPayload), preview: {}, status: "PENDING", requestedBy: "test", expiresAt: new Date(Date.now() + 86_400_000) },
  });
  await prisma.campaignDeployment.update({ where: { id: metaDep.id }, data: { createApprovalId: metaCard.id, status: "CREATE_PENDING", specHash: metaPayload.specHash } });
  r = await decideApproval({ approvalId: metaCard.id, decision: "APPROVE", reason: null, actorId: ACTOR.id, actorRole: ACTOR.role });
  assert.equal(!r.ok && r.error, "PAYLOAD_INVALID", "a Google-shaped payload is not a Meta card, whatever its platform field says");
  assert.equal((await prisma.campaignDeployment.findUnique({ where: { id: metaDep.id } }))?.status, "CREATE_PENDING");
});

check("reject saves the decision and cancels the pending deployment; re-check brings a fresh card", async () => {
  const f = await makeTask();
  await prepareDeploymentsForTask({ taskId: f.task.id, actor: ACTOR, now: now() });
  const card = (await pendingApproval(f.task.id, "CREATE_PAUSED_CAMPAIGNS"))!;
  const r = await decideApproval({ approvalId: card.id, decision: "REJECT", reason: "budget pehle badlo", actorId: ACTOR.id, actorRole: ACTOR.role });
  assert.equal(r.ok && r.status, "REJECTED");
  const dep = await googleDeployment(f.task.id);
  assert.equal(dep.status, "CANCELLED");
  assert.equal((await prisma.marketingApproval.findUnique({ where: { id: card.id } }))?.status, "REJECTED");
  const rc = await recheckDeployment(dep.id, ACTOR, { now });
  assert.equal(rc.ok && rc.status, "CREATE_PENDING");
  const again = await googleDeployment(f.task.id);
  assert.notEqual(again.createApprovalId, card.id);
  assert.equal(again.executionMarker, dep.executionMarker, "marker survives a new card");
});

check("approve queues exactly one deployment; a double click returns the same one and changes nothing", async () => {
  const f = await toQueued();
  const task = await prisma.marketingTask.findUnique({ where: { id: f.task.id } });
  assert.equal(task?.status, "WORKING");
  assert.equal((await prisma.marketingApproval.findUnique({ where: { id: f.card.id } }))?.status, "APPROVED");
  const again = await decideApproval({ approvalId: f.card.id, decision: "APPROVE", reason: null, actorId: ACTOR.id, actorRole: ACTOR.role });
  assert.equal(again.ok && again.status, "QUEUED");
  assert.equal(again.ok && again.deploymentId, f.dep.id);
  assert.equal((await prisma.campaignDeployment.count({ where: { draftId: f.google.id } })), 1);
  assert.equal((await prisma.marketingApproval.findUnique({ where: { id: f.card.id } }))?.decidedAt?.getTime(), (await prisma.marketingApproval.findUnique({ where: { id: f.card.id } }))?.decidedAt?.getTime());
  // A second row for the same draft+platform is impossible by constraint.
  await assert.rejects(prisma.campaignDeployment.create({ data: { draftId: f.google.id, taskId: f.task.id, platform: "GOOGLE_SEARCH", specHash: "x", idempotencyKey: randomUUID(), executionMarker: `BT:${randomUUID().slice(0, 10)}` } }));
  // Leave nothing queued behind: the recovery sweep later in this file runs every QUEUED row it finds.
  await prisma.campaignDeployment.update({ where: { id: f.dep.id }, data: { status: "CANCELLED" } });
});

// ============================================================
// 3. The worker with a fake provider (§20.3-20.4)
// ============================================================

let happy: Awaited<ReturnType<typeof toActivationPending>> | null = null;
const happyFake = new FakeGoogleAds();

check("create phase: validate-only first, one atomic PAUSED create, read-back, PAUSED_READY → activation card, no spend", async () => {
  happy = await toActivationPending(happyFake);
  const methods = happyFake.calls.map((c) => `${c.method}${c.validateOnly === undefined ? "" : c.validateOnly ? ":validate" : ":write"}`);
  assert.deepEqual(methods, ["describeAccount", "listEnabledConversionActions", "resolveGeoTarget", "hasApprovedBilling", "mutate:validate", "findCampaignsByMarker", "mutate:write", "readCampaignTree"]);
  assert.equal(happyFake.validateMutates().length, 1);
  assert.equal(happyFake.realMutates().length, 1);
  const ops = happyFake.realMutates()[0].args as Array<Record<string, { create: Record<string, unknown> }>>;
  assert.equal(ops[1].campaignOperation.create.status, "PAUSED");
  assert.ok(String(ops[1].campaignOperation.create.name).includes(`[${happy.dep.executionMarker}]`));
  assert.equal(JSON.stringify(happyFake.validateMutates()[0].args), JSON.stringify(happyFake.realMutates()[0].args), "validated exactly what was written");

  const dep = happy.dep;
  assert.equal(dep.status, "ACTIVATION_PENDING");
  assert.equal(dep.phase, "ACTIVATE");
  assert.ok(dep.pausedVerifiedAt);
  assert.equal(dep.externalStatus, "PAUSED");
  assert.equal(dep.lockedBy, null);
  const refs = dep.externalRefs as { campaign: string; campaignId: string; budget: string; adGroups: string[]; keywords: string[]; ads: string[]; resolved: { startDate: string; endDate: string; conversionAction: { name: string } | null } };
  assert.match(refs.campaign, /^customers\/1234567890\/campaigns\/\d+$/);
  assert.ok(refs.budget);
  assert.equal(refs.adGroups.length, 1);
  assert.equal(refs.keywords.length, 2);
  assert.equal(refs.ads.length, 1);
  assert.equal(refs.resolved.conversionAction?.name, "verification_completed");
  assert.equal(refs.resolved.endDate, (await import("../lib/marketing/mappers/googleSearchMapper")).addDays(refs.resolved.startDate, 29));
  const stored = happyFake.store.get(refs.campaign)!;
  assert.equal(stored.status, "PAUSED", "the fake account holds a PAUSED campaign — nothing can serve");

  const draft = await prisma.campaignDraft.findUnique({ where: { id: happy.google.id } });
  assert.equal(draft?.externalCampaignId, refs.campaignId);
  assert.equal(draft?.externalStatus, "PAUSED");
  const createCard = await prisma.marketingApproval.findUnique({ where: { id: happy.card.id } });
  assert.equal(createCard?.status, "EXECUTED");
  assert.equal((createCard?.executionResult as { campaignId: string }).campaignId, refs.campaignId);

  const act = ActivatePayloadSchema.parse(happy.activateCard.payload);
  assert.equal(act.verifiedExternalStatus, "PAUSED");
  assert.equal(act.externalCampaignRef, refs.campaign);
  assert.equal(act.verifiedBudgetMicros, 300_000_000);
  assert.equal(act.dailyBudgetPaise, 30_000);
  assert.match((happy.activateCard.preview as { whatHappensNow: string }).whatHappensNow, /spend start ho sakta hai/);
  assert.equal((await prisma.marketingTask.findUnique({ where: { id: happy.task.id } }))?.status, "NEEDS_APPROVAL");

  const rows = await listDeploymentRows(happy.task.id);
  const g = rows.find((r) => r.platform === "GOOGLE_SEARCH")!;
  assert.deepEqual(g.steps.map((s) => s.state), ["done", "done", "done", "done", "todo"]);
  assert.deepEqual(g.availableActions, ["SYNC"]);
  assert.equal(g.pendingApprovalId, happy.activateCard.id);
  assert.ok(g.events.some((e) => e.step === "validate" && e.level === "ok"));
  const json = JSON.stringify(rows);
  assert.ok(!/Bearer|developer-token|refresh/i.test(json), "no secret material in rows");

  // Running again does nothing: the row is waiting on a human.
  const idle = await runDeployment(dep.id, { provider: happyFake, now });
  assert.equal(idle.ran, false);
  assert.equal(happyFake.realMutates().length, 1);
});

check("the create card cannot be replayed as an activation", async () => {
  assert.ok(happy);
  const r = await decideApproval({ approvalId: happy.card.id, decision: "APPROVE", reason: null, actorId: ACTOR.id, actorRole: ACTOR.role });
  assert.equal(r.ok && r.status, "QUEUED");
  assert.equal(r.ok && r.deploymentStatus, "ACTIVATION_PENDING", "idempotent echo of where the deployment already is");
  assert.equal(happyFake.activations().length, 0);
  assert.equal((await googleDeployment(happy.task.id)).status, "ACTIVATION_PENDING");
});

check("two workers, one lease: a parallel run claims once and the provider sees one create", async () => {
  const fake = new FakeGoogleAds();
  fake.mutateDelayMs = 150;
  const f = await toQueued();
  const [a, b] = await Promise.all([runDeployment(f.dep.id, { provider: fake, workerId: "w-a", now }), runDeployment(f.dep.id, { provider: fake, workerId: "w-b", now })]);
  assert.equal([a, b].filter((r) => r.ran).length, 1, "exactly one claim");
  assert.equal(fake.realMutates().length, 1);
  assert.equal((await googleDeployment(f.task.id)).status, "ACTIVATION_PENDING");
});

check("write timeout → UNKNOWN_OUTCOME; sync waits out the grace window, then 'nothing found' is a safe retry, and the retry creates once", async () => {
  const fake = new FakeGoogleAds();
  fake.failRealMutate = new ConnectorError("TIMEOUT", "google-ads: 60s me jawab nahi aaya.");
  fake.storeDespiteFailure = false;
  const f = await toQueued();
  const r = await runDeployment(f.dep.id, { provider: fake, workerId: "w-t", now });
  assert.equal(r.status, "UNKNOWN_OUTCOME");
  assert.equal(r.error?.code, "NETWORK_UNKNOWN_OUTCOME");
  assert.equal(r.error?.retrySafe, false);
  let dep = await googleDeployment(f.task.id);
  assert.equal(dep.status, "UNKNOWN_OUTCOME");
  assert.ok(dep.lastWriteAttemptAt);
  assert.equal(dep.lockedBy, null);
  const rows = await listDeploymentRows(f.task.id);
  assert.deepEqual(rows.find((x) => x.platform === "GOOGLE_SEARCH")!.availableActions, ["SYNC"], "no blind retry offered");
  const rt = await retryDeployment(dep.id, ACTOR, { provider: fake, now });
  assert.equal(!rt.ok && rt.error, "NOT_RETRYABLE");

  advance(5_000);
  const early = await syncDeployment(dep.id, { provider: fake, workerId: "s-1", now });
  assert.equal(early.status, "UNKNOWN_OUTCOME");
  assert.match(early.message, /baad dobara Sync/);
  assert.equal(fake.realMutates().length, 1);

  advance(60_000);
  const late = await syncDeployment(dep.id, { provider: fake, workerId: "s-2", now });
  assert.equal(late.status, "FAILED_RETRYABLE");
  dep = await googleDeployment(f.task.id);
  assert.equal(dep.status, "FAILED_RETRYABLE");
  assert.equal(fake.realMutates().length, 1, "sync never resends");

  fake.failRealMutate = null;
  const retried = await retryDeployment(dep.id, ACTOR, { provider: fake, workerId: "w-r", now });
  assert.equal(retried.ok && retried.status, "ACTIVATION_PENDING");
  assert.equal(fake.realMutates().length, 2, "the second create is the first one that could have landed");
  assert.equal(fake.calls.filter((c) => c.method === "findCampaignsByMarker").length >= 3, true, "marker searched before every write and on every sync");
  assert.equal((await googleDeployment(f.task.id)).attemptCount, 2);
});

check("write timeout but the create landed → sync finds the marker, attaches, no second create", async () => {
  const fake = new FakeGoogleAds();
  fake.failRealMutate = new ConnectorError("TIMEOUT", "google-ads: timeout");
  fake.storeDespiteFailure = true;
  const f = await toQueued();
  const r = await runDeployment(f.dep.id, { provider: fake, workerId: "w-t2", now });
  assert.equal(r.status, "UNKNOWN_OUTCOME");
  assert.equal(fake.store.size, 1, "the campaign exists on the provider");
  fake.failRealMutate = null;
  advance(2_000);
  const s = await syncDeployment(f.dep.id, { provider: fake, workerId: "s-3", now });
  assert.equal(s.status, "ACTIVATION_PENDING", s.message);
  assert.equal(fake.realMutates().length, 1, "attached, not recreated");
  const dep = await googleDeployment(f.task.id);
  const refs = dep.externalRefs as { campaign: string };
  assert.equal(refs.campaign, [...fake.store.keys()][0]);
  assert.equal(dep.status, "ACTIVATION_PENDING");
  assert.ok(await pendingApproval(f.task.id, "ACTIVATE_CAMPAIGNS"));
});

check("create landed but the read-back failed → safe retry attaches by marker instead of creating again", async () => {
  const fake = new FakeGoogleAds();
  fake.failReadTreeOnce = new ConnectorError("NETWORK", "google-ads: network error.");
  const f = await toQueued();
  const first = await runDeployment(f.dep.id, { provider: fake, workerId: "w-x", now });
  assert.equal(first.status, "FAILED_RETRYABLE", first.message);
  assert.equal(fake.realMutates().length, 1);
  assert.equal(fake.store.size, 1, "the campaign exists on the provider");
  let dep = await googleDeployment(f.task.id);
  assert.ok((dep.externalRefs as { campaign: string | null }).campaign, "resource names were stored before the read-back");
  assert.equal(dep.createApproval?.status, "APPROVED", "the card is still the authorisation");
  const rows = await listDeploymentRows(f.task.id);
  assert.ok(rows.find((x) => x.platform === "GOOGLE_SEARCH")!.availableActions.includes("RETRY"));
  const again = await retryDeployment(dep.id, ACTOR, { provider: fake, workerId: "w-y", now });
  assert.equal(again.ok && again.status, "ACTIVATION_PENDING", JSON.stringify(again));
  assert.equal(fake.realMutates().length, 1, "attached by marker, no second create");
  assert.equal(fake.store.size, 1);
  dep = await googleDeployment(f.task.id);
  assert.equal(dep.attemptCount, 2);
  assert.ok(dep.createApproval?.status === "EXECUTED");
});

check("ambiguous marker matches stop for human review; nothing is created", async () => {
  const fake = new FakeGoogleAds();
  fake.markerOverride = [
    { resourceName: `customers/${CUSTOMER}/campaigns/1`, id: "1", name: "x [BT:will-be-replaced]", status: "PAUSED" },
    { resourceName: `customers/${CUSTOMER}/campaigns/2`, id: "2", name: "y [BT:will-be-replaced]", status: "PAUSED" },
  ];
  const f = await toQueued();
  fake.markerOverride = fake.markerOverride.map((c) => ({ ...c, name: c.name.replace("BT:will-be-replaced", f.dep.executionMarker) }));
  const r = await runDeployment(f.dep.id, { provider: fake, workerId: "w-amb", now });
  assert.equal(r.status, "FAILED_FINAL");
  assert.equal(r.error?.code, "RECONCILIATION_AMBIGUOUS");
  assert.equal(fake.realMutates().length, 0);
  assert.match(r.error?.fix ?? "", /1, 2/);
});

check("validate-only failure prevents the write and is final with the field named", async () => {
  const fake = new FakeGoogleAds();
  fake.failValidate = googleValidationError("Duplicate campaign name", "campaign.name");
  const f = await toQueued();
  const r = await runDeployment(f.dep.id, { provider: fake, workerId: "w-v", now });
  assert.equal(r.status, "FAILED_FINAL");
  assert.equal(r.error?.code, "PROVIDER_VALIDATION_FAILED");
  assert.match(r.error?.message ?? "", /campaign\.name/);
  assert.equal(fake.realMutates().length, 0);
  assert.equal((await prisma.marketingApproval.findUnique({ where: { id: f.card.id } }))?.status, "FAILED");
  assert.equal((await prisma.marketingTask.findUnique({ where: { id: f.task.id } }))?.status, "BLOCKED");
  const rows = await listDeploymentRows(f.task.id);
  const g = rows.find((x) => x.platform === "GOOGLE_SEARCH")!;
  assert.deepEqual(g.availableActions, []);
  assert.equal(g.steps.find((s) => s.key === "VALIDATE")?.state, "error");
});

check("a preflight block (conversion action missing) never reaches validate; retry after the fix succeeds under the same card", async () => {
  const fake = new FakeGoogleAds();
  fake.conversionActions = [];
  const f = await toQueued();
  const r = await runDeployment(f.dep.id, { provider: fake, workerId: "w-c", now });
  assert.equal(r.status, "BLOCKED_CONFIG");
  assert.equal(r.error?.code, "INVALID_CONVERSION_ACTION");
  assert.equal(fake.validateMutates().length, 0);
  assert.equal(fake.realMutates().length, 0);
  fake.conversionActions = [{ resourceName: `customers/${CUSTOMER}/conversionActions/111`, name: "Verification Completed", status: "ENABLED" }];
  const rt = await retryDeployment(f.dep.id, ACTOR, { provider: fake, workerId: "w-c2", now });
  assert.equal(rt.ok && rt.status, "ACTIVATION_PENDING", JSON.stringify(rt));
  assert.equal(fake.realMutates().length, 1);
});

check("read-back that is not the approved paused campaign blocks PAUSED_READY; a later sync can recover it", async () => {
  const fake = new FakeGoogleAds();
  fake.treeStatusOverride = "ENABLED";
  const f = await toQueued();
  const r = await runDeployment(f.dep.id, { provider: fake, workerId: "w-rb", now });
  assert.equal(r.status, "FAILED_FINAL");
  assert.equal(r.error?.code, "READBACK_MISMATCH");
  assert.match(r.error?.message ?? "", /status ENABLED/);
  assert.equal(await pendingApproval(f.task.id, "ACTIVATE_CAMPAIGNS"), null, "no activation card on a mismatch");
  fake.treeStatusOverride = null;
  const s = await syncDeployment(f.dep.id, { provider: fake, workerId: "s-rb", now });
  assert.equal(s.status, "ACTIVATION_PENDING");
  assert.equal(fake.realMutates().length, 1);
});

// ============================================================
// 4. Activation (§11.6, §20.4)
// ============================================================

check("activation: its own card, just-in-time preflight, one status write, LIVE only on read-back ENABLED", async () => {
  assert.ok(happy);
  const before = happyFake.calls.length;
  const r = await decideApproval({ approvalId: happy.activateCard.id, decision: "APPROVE", reason: "chhota test budget", actorId: ACTOR.id, actorRole: ACTOR.role });
  assert.equal(r.ok && r.status, "QUEUED");
  assert.equal(r.ok && r.deploymentStatus, "ACTIVATION_QUEUED");
  assert.equal(happyFake.calls.length, before, "the decision itself touches no provider");
  const run = await runDeployment(happy.dep.id, { provider: happyFake, workerId: "w-act", now, probeLanding: async () => ({ ok: true, status: 200 }) });
  assert.equal(run.status, "LIVE", run.message);
  assert.equal(happyFake.activations().length, 1);
  assert.deepEqual(happyFake.activations()[0].args, { campaignResourceName: (happy.dep.externalRefs as { campaign: string }).campaign, status: "ENABLED" });
  assert.equal(happyFake.realMutates().length, 1, "activation never re-creates");
  const dep = await googleDeployment(happy.task.id);
  assert.equal(dep.status, "LIVE");
  assert.ok(dep.activatedAt);
  assert.equal(dep.externalStatus, "ENABLED");
  assert.equal((await prisma.marketingApproval.findUnique({ where: { id: happy.activateCard.id } }))?.status, "EXECUTED");
  assert.equal((await prisma.marketingTask.findUnique({ where: { id: happy.task.id } }))?.status, "SCHEDULED_LIVE");
  assert.equal((await prisma.campaignDraft.findUnique({ where: { id: happy.google.id } }))?.externalStatus, "ENABLED");
  const rows = await listDeploymentRows(happy.task.id);
  assert.deepEqual(rows.find((x) => x.platform === "GOOGLE_SEARCH")!.steps.map((s) => s.state), ["done", "done", "done", "done", "done"]);

  // A revision now would draft a second campaign next to a live one — refused.
  const rev = await continueTask({ taskId: happy.task.id, text: "budget badlo", kind: "revise", actorId: ACTOR.id, actorRole: ACTOR.role });
  assert.equal(!rev.ok && rev.error, "HAS_EXTERNAL_CAMPAIGN");
});

check("activation preflight blocks on missing billing and on an unreachable landing page — no status write either time", async () => {
  const fake = new FakeGoogleAds();
  fake.isTestAccount = false;
  const f = await toActivationPending(fake);
  await decideApproval({ approvalId: f.activateCard.id, decision: "APPROVE", reason: null, actorId: ACTOR.id, actorRole: ACTOR.role });
  fake.billing = false;
  const first = await runDeployment(f.dep.id, { provider: fake, workerId: "w-b1", now, probeLanding: async () => ({ ok: true, status: 200 }) });
  assert.equal(first.status, "BLOCKED_CONFIG");
  assert.equal(first.error?.code, "BILLING_NOT_READY");
  assert.equal(fake.activations().length, 0);
  fake.billing = true;
  const second = await retryDeployment(f.dep.id, ACTOR, { provider: fake, workerId: "w-b2", now, probeLanding: async () => ({ ok: false, status: 503 }) });
  assert.equal(second.ok && second.status, "BLOCKED_CONFIG");
  assert.equal((await googleDeployment(f.task.id)).lastErrorCode, "INVALID_LANDING");
  assert.equal(fake.activations().length, 0);
  const third = await retryDeployment(f.dep.id, ACTOR, { provider: fake, workerId: "w-b3", now, probeLanding: async () => ({ ok: true, status: 200 }) });
  assert.equal(third.ok && third.status, "LIVE");
  assert.equal(fake.activations().length, 1);
});

check("activation write timeout → UNKNOWN_OUTCOME; sync reads ENABLED → LIVE, or PAUSED → safe retry", async () => {
  const fake = new FakeGoogleAds();
  const f = await toActivationPending(fake);
  await decideApproval({ approvalId: f.activateCard.id, decision: "APPROVE", reason: null, actorId: ACTOR.id, actorRole: ACTOR.role });
  fake.timeoutActivate = true;
  fake.activateApplies = false;
  let r = await runDeployment(f.dep.id, { provider: fake, workerId: "w-at", now, probeLanding: async () => ({ ok: true, status: 200 }) });
  assert.equal(r.status, "UNKNOWN_OUTCOME");
  assert.equal(fake.activations().length, 1);
  let s = await syncDeployment(f.dep.id, { provider: fake, workerId: "s-at", now });
  assert.equal(s.status, "FAILED_RETRYABLE", "provider still PAUSED — the write did not apply");
  fake.timeoutActivate = false;
  fake.activateApplies = true;
  const rt = await retryDeployment(f.dep.id, ACTOR, { provider: fake, workerId: "w-at2", now, probeLanding: async () => ({ ok: true, status: 200 }) });
  assert.equal(rt.ok && rt.status, "LIVE");
  assert.equal(fake.activations().length, 2);

  // And the other branch: the write applied, only the answer was lost.
  const fake2 = new FakeGoogleAds();
  const f2 = await toActivationPending(fake2);
  await decideApproval({ approvalId: f2.activateCard.id, decision: "APPROVE", reason: null, actorId: ACTOR.id, actorRole: ACTOR.role });
  fake2.timeoutActivate = true;
  r = await runDeployment(f2.dep.id, { provider: fake2, workerId: "w-at3", now, probeLanding: async () => ({ ok: true, status: 200 }) });
  assert.equal(r.status, "UNKNOWN_OUTCOME");
  s = await syncDeployment(f2.dep.id, { provider: fake2, workerId: "s-at3", now });
  assert.equal(s.status, "LIVE");
  assert.equal(fake2.activations().length, 1, "never a second activation write");
});

check("activation card cannot execute before PAUSED_READY, and rejecting it leaves the campaign paused", async () => {
  const fake = new FakeGoogleAds();
  const f = await toActivationPending(fake);
  // Reject → PAUSED_READY, campaign untouched, card REJECTED; request-activation brings a fresh card after a read-back.
  const rj = await decideApproval({ approvalId: f.activateCard.id, decision: "REJECT", reason: "abhi nahi", actorId: ACTOR.id, actorRole: ACTOR.role });
  assert.equal(rj.ok && rj.status, "REJECTED");
  let dep = await googleDeployment(f.task.id);
  assert.equal(dep.status, "PAUSED_READY");
  assert.equal(fake.activations().length, 0);
  assert.equal((await prisma.marketingTask.findUnique({ where: { id: f.task.id } }))?.status, "RESULT_READY");
  const rows = await listDeploymentRows(f.task.id);
  assert.deepEqual(rows.find((x) => x.platform === "GOOGLE_SEARCH")!.availableActions, ["SYNC", "REQUEST_ACTIVATION"]);
  // A stale activate card on a row that is not ACTIVATION_PENDING is refused.
  const stale = await decideApproval({ approvalId: f.activateCard.id, decision: "APPROVE", reason: null, actorId: ACTOR.id, actorRole: ACTOR.role });
  assert.equal(!stale.ok && stale.error, "NOT_PENDING");
  const req = await requestActivation(dep.id, ACTOR, { provider: fake, workerId: "s-req", now });
  assert.equal(req.ok && req.status, "ACTIVATION_PENDING", JSON.stringify(req));
  dep = await googleDeployment(f.task.id);
  const card = await pendingApproval(f.task.id, "ACTIVATE_CAMPAIGNS");
  assert.ok(card);
  assert.equal(dep.activateApprovalId, card.id);
  assert.notEqual(card.id, f.activateCard.id);
  // The worker will not touch a row whose activation is merely pending.
  const idle = await runDeployment(dep.id, { provider: fake, workerId: "w-idle", now });
  assert.equal(idle.ran, false);
  assert.equal(fake.activations().length, 0);
});

check("drift: a campaign changed outside BandhanTak is reported, never overwritten, and blocks a new activation card", async () => {
  const fake = new FakeGoogleAds();
  const f = await toActivationPending(fake);
  await decideApproval({ approvalId: f.activateCard.id, decision: "REJECT", reason: "wait", actorId: ACTOR.id, actorRole: ACTOR.role });
  const refs = (await googleDeployment(f.task.id)).externalRefs as { campaign: string };
  fake.store.get(refs.campaign)!.budgetAmountMicros = "999000000";
  const s = await syncDeployment(f.dep.id, { provider: fake, workerId: "s-drift", now });
  assert.equal(s.status, "PAUSED_READY");
  assert.match(s.message, /bahar badlaav/);
  const dep = await googleDeployment(f.task.id);
  assert.equal(dep.lastErrorCode, "EXTERNAL_DRIFT");
  assert.match(dep.lastErrorMessage ?? "", /budget/);
  const req = await requestActivation(dep.id, ACTOR, { provider: fake, workerId: "s-req2", now });
  assert.equal(!req.ok && req.error, "DRIFT");
  assert.equal(fake.activations().length, 0);
  assert.equal(fake.store.get(refs.campaign)!.budgetAmountMicros, "999000000", "nothing was written back");
});

// ============================================================
// 5. Recovery sweep (§8)
// ============================================================

check("recovery: an expired lease before the write re-queues and runs; during the write it becomes uncertain and reconciles", async () => {
  const fake = new FakeGoogleAds();
  const a = await toQueued();
  const b = await toQueued();
  const stale = new Date(now().getTime() - 11 * 60_000);
  await prisma.campaignDeployment.update({ where: { id: a.dep.id }, data: { status: "PREFLIGHT", lockedAt: stale, lockedBy: "dead-worker" } });
  await prisma.campaignDeployment.update({ where: { id: b.dep.id }, data: { status: "CREATING", lockedAt: stale, lockedBy: "dead-worker", lastWriteAttemptAt: stale } });
  const summary = await recoverDeployments({ provider: fake, workerId: "cron", now, limit: 10 });
  assert.equal(summary.staleLocksReleased, 2);
  const depA = await googleDeployment(a.task.id);
  assert.equal(depA.status, "ACTIVATION_PENDING", "re-queued and run");
  const depB = await googleDeployment(b.task.id);
  assert.equal(depB.status, "FAILED_RETRYABLE", "uncertain, reconciled: nothing found after the grace window");
  assert.equal(depB.lastErrorCode, "NETWORK_UNKNOWN_OUTCOME");
  const creates = fake.realMutates().map((c) => String((c.args as Array<Record<string, { create: { name?: string } }>>)[1].campaignOperation.create.name));
  assert.equal(creates.filter((n) => n.includes(depA.executionMarker)).length, 1, "A created once");
  assert.equal(creates.filter((n) => n.includes(depB.executionMarker)).length, 0, "B's sweep resent nothing");
  assert.ok(summary.reconciled.some((r) => r.id === b.dep.id));
});

// ============================================================
// Runner
// ============================================================

async function cleanup() {
  await prisma.marketingTask.deleteMany({ where: { id: { in: createdTaskIds } } });
  await prisma.marketingGoal.deleteMany({ where: { id: { in: createdGoalIds } } });
  await prisma.adminAuditLog.deleteMany({ where: { actorId: ACTOR.id } });
  await restoreConnection();
}

(async () => {
  console.log(`\nMKT-2 execution check ${TAG}`);
  await installFakeConnection();
  try {
    for (const { label, fn } of queue) {
      checks += 1;
      try {
        await fn();
        console.log(`  ok   ${label}`);
      } catch (err) {
        failures += 1;
        console.log(`  FAIL ${label}`);
        console.log(`       ${err instanceof Error ? err.stack?.split("\n").slice(0, 4).join("\n       ") : String(err)}`);
      }
    }
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
  console.log(`\n${checks - failures}/${checks} passed`);
  process.exit(failures ? 1 : 0);
})();
