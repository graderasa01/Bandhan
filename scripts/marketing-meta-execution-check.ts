import "./_env";
import { blockedNetworkCalls } from "./_stubs/marketingNetworkIsolation";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { Prisma, type MarketingConnection } from "@prisma/client";
import { prisma } from "../lib/db/prisma";
import type { MetaReadinessCheck } from "../lib/contracts/marketingAi";
import { EXECUTABLE_PLATFORMS, MEDIA_MAX_BYTES, deliveryLabel, type DeploymentPlatform } from "../lib/contracts/marketingExecution";
import { MetaActivatePayloadSchema, MetaCreatePausedPayloadSchema } from "../lib/contracts/marketingExecutionPayloads";
import type { MetaPackage } from "../lib/contracts/marketingPlanSchema";
import { ConnectorError } from "../lib/marketing/connectors/http";
import { addDays, calendarDateIn } from "../lib/marketing/mappers/googleSearchMapper";
import { mapMetaPackage, type MetaMapInput } from "../lib/marketing/mappers/metaCampaignMapper";
import type { MetaAdSetCreate, MetaCreativeCreate } from "../lib/marketing/providers/metaAdsProvider";
import { probePublicImageUrl } from "../lib/marketing/storage/marketingCreativeStorage";
import { MARKETING_TOOLS } from "../lib/marketing/tools/registry";
import { decideApproval } from "../lib/services/marketing/approvalService";
import { checkMetaAdReadiness } from "../lib/services/marketing/connectionService";
import { MediaValidationError, attachCreativeMedia, normaliseCreativeImage, reviewCreativeMedia } from "../lib/services/marketing/creativeMediaService";
import { evaluateMetaAdReadiness } from "../lib/services/marketing/metaReadinessEvaluator";
import { isProtectedTargeting } from "../lib/services/marketing/packageGuardrails";
import { deliveryOf, listDeploymentRows, prepareDeploymentsForTask } from "../lib/services/marketing/execution/deploymentService";
import { recheckDeployment, recoverDeployments, requestActivation, retryDeployment, runDeployment, syncDeployment } from "../lib/services/marketing/execution/deploymentWorker";
import { ExecutionError, normaliseMetaError } from "../lib/services/marketing/execution/executionErrors";
import { metaReadiness } from "../lib/services/marketing/execution/metaPreflight";
import { metaRefsOf } from "../lib/services/marketing/execution/metaRefs";
import type { WorkerOptions } from "../lib/services/marketing/execution/workerShared";
import { FakeGoogleAds } from "./_stubs/fakeGoogleAds";
import { FakeMetaAds, metaValidationError, type FakeMetaWrite } from "./_stubs/fakeMetaAds";
import { fixturePlan } from "./_stubs/marketingFixtures";

/**
 * MKT-2B — Meta execution, end to end, against the local database with a fake
 * Meta ad account (doc 14 §20). No network (`_stubs/marketingNetworkIsolation`
 * blocks every non-local request and replaces the developer's real Meta token
 * and ids with inert values), no model, no real account. Every provider call
 * lands in `_stubs/fakeMetaAds.ts`, whose store is the evidence:
 *
 *   • creation is campaign → ad sets → images → creatives → ads, every object
 *     PAUSED and tagged `[BT:<marker>:<key>]`, and only a verified read-back
 *     issues the activation card;
 *   • a write whose answer is lost — at every step — is UNKNOWN_OUTCOME; Sync
 *     attaches it by tag, and the store still holds exactly one campaign, two
 *     ad sets, two images, two creatives and two ads;
 *   • activation writes ads, then ad sets, and the campaign last — with the
 *     campaign still PAUSED during every child write; an unsafe read-back is
 *     rolled back to PAUSED inside the same execution;
 *   • token scope, ad-account asset assignment, Page and Instagram are
 *     separate readiness answers;
 *   • Google and Meta deployments never touch each other's provider or row.
 *
 * Gates: this script flips the two Meta registry switches (and the platform
 * set) *in this process only*, so it tests the executor whatever the
 * committed flags say — the first checks prove the executor refuses with the
 * switches off. Production never runs this file; the committed flags are
 * pinned by `marketing-ai-check.ts`.
 *
 * Run: `npx tsx scripts/marketing-meta-execution-check.ts` (Docker Postgres up).
 * Never pipe it into `head` — an early SIGPIPE skips the cleanup below.
 * Every check's tasks, media files and audit rows are deleted after it runs;
 * the Meta/Google connection rows are snapshotted and restored.
 */

process.env.NEXT_PUBLIC_APP_URL = "https://bandhantak.com";
process.env.APP_URL = "https://bandhantak.com";
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "mkt2b-check-client";
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "mkt2b-check-secret";
if (!process.env.SECRETS_ENCRYPTION_KEY) process.env.SECRETS_ENCRYPTION_KEY = "0".repeat(64);

const TAG = `[mkt2b-check ${randomUUID().slice(0, 8)}]`;
const ACTOR = { id: "mkt2b-check-admin", role: "ADMIN" as const };
const ACT = "act_1234567890";
const PAGE = "1111";
const IG = "2222";
const GOOGLE_CUSTOMER = "1234567890";

let failures = 0;
let checks = 0;
const queue: Array<{ label: string; fn: () => Promise<void> }> = [];
function check(label: string, fn: () => Promise<void>) {
  queue.push({ label, fn });
}

const evidence: string[] = [];
function note(line: string) {
  evidence.push(line);
}

// ---- clock the worker reads ------------------------------------------------
let clock = Date.now();
const now = () => new Date(clock);
const advance = (ms: number) => {
  clock += ms;
};

// ---- the two Meta gates, in this process only ------------------------------
const createTool = MARKETING_TOOLS.find((t) => t.name === "meta.campaign.create_paused")!;
const activateTool = MARKETING_TOOLS.find((t) => t.name === "meta.campaign.activate")!;
const platforms = EXECUTABLE_PLATFORMS as Set<DeploymentPlatform>;
const COMMITTED = { platform: platforms.has("META"), create: createTool.write!.executable, activate: activateTool.write!.executable };

function setMetaGates(state: { create: boolean; activate: boolean }) {
  if (state.create || state.activate) platforms.add("META");
  else platforms.delete("META");
  createTool.write!.executable = state.create;
  activateTool.write!.executable = state.activate;
}

function restoreCommittedGates() {
  if (COMMITTED.platform) platforms.add("META");
  else platforms.delete("META");
  createTool.write!.executable = COMMITTED.create;
  activateTool.write!.executable = COMMITTED.activate;
}

// ============================================================
// Fixtures
// ============================================================

const created = { tasks: [] as string[], goals: [] as string[] };

function metaPackage(): MetaPackage {
  const today = calendarDateIn("Asia/Kolkata", now());
  return {
    campaignName: "BT · Jaipur · Feed",
    objective: "OUTCOME_TRAFFIC",
    audience: { description: "Jaipur ki 22-30 saal ki women aur unke parents.", ageMin: 22, ageMax: 45, genders: ["women"], locations: ["Jaipur"], interests: ["Wedding planning"], exclusions: [] },
    adSets: [
      { name: "Facebook feed · women", audienceNote: "core", placements: ["facebook_feed"], dailyBudgetRupees: 100, creativeIds: ["static-1", "reel-1"] },
      { name: "Instagram feed · women", audienceNote: "instagram", placements: ["instagram_feed"], dailyBudgetRupees: 100, creativeIds: ["static-2"] },
    ],
    ads: [
      { id: "ad-1", name: "Static verified", format: "STATIC", primaryText: "Verified profiles, family ke saath.", headline: "Jaipur Verified Rishte", description: "Bol kar profile banaiye", cta: "SIGN_UP", creativeId: "static-1" },
      { id: "ad-2", name: "Static family", format: "STATIC", primaryText: "Bol kar profile banaiye, family ke saath.", headline: "Family Ke Saath Rishta", description: "Free Kundli Milan", cta: "LEARN_MORE", creativeId: "static-2" },
      { id: "ad-3", name: "Reel bol kar", format: "REEL", primaryText: "Verified profiles, family ke saath.", headline: "Bol kar profile", description: "Grio", cta: "SIGN_UP", creativeId: "reel-1" },
    ],
    landingPath: "/register",
    utm: { source: "facebook", medium: "paid_social", campaign: "jaipur-verified-women-2026-09", content: "{creative}" },
    schedule: { startDate: addDays(today, 2), endDate: addDays(today, 16) },
    frequencyCap: "2 impressions / 7 days",
    stopLoss: "₹1,500 spend, zero registrations → pause proposal",
    dailyBudgetRupees: 200,
    rationale: "Feed par trust proof.",
  };
}

const COLORS: Record<string, [number, number, number]> = { "static-1": [200, 30, 60], "static-2": [30, 60, 200] };

async function squareImage(rgb: [number, number, number], width = 1080, height = width): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } })
    .png()
    .toBuffer();
}

async function makeMetaTask(opts: { withGoogle?: boolean; approveMedia?: boolean } = {}) {
  const spec = metaPackage();
  const plan = fixturePlan({ dailyRupees: 500 });
  const goal = await prisma.marketingGoal.create({
    data: { name: `${TAG} goal`, objective: "VERIFIED_PROFILE", geography: "Jaipur", audienceSide: "women", windowDays: 30, primaryConversion: "verification_completed", dailyBudgetPaise: 50_000, totalBudgetPaise: 1_500_000, allowedChannels: ["GOOGLE_SEARCH", "META_FEED"], status: "ACTIVE", createdBy: ACTOR.id },
  });
  created.goals.push(goal.id);
  const task = await prisma.marketingTask.create({
    data: { goalId: goal.id, requestedBy: ACTOR.id, request: `${TAG} Jaipur feed ads`, status: "RESULT_READY", channels: opts.withGoogle ? ["GOOGLE_SEARCH", "META_FEED"] : ["META_FEED"], budgetDailyPaise: 50_000, budgetTotalPaise: 1_500_000 },
  });
  created.tasks.push(task.id);
  const run = await prisma.marketingRun.create({ data: { taskId: task.id, status: "SUCCEEDED", decisions: { ...plan, meta: spec } as unknown as Prisma.InputJsonValue, finishedAt: new Date() } });
  const google = opts.withGoogle
    ? await prisma.campaignDraft.create({
        data: { taskId: task.id, goalId: goal.id, runId: run.id, platform: "GOOGLE_SEARCH", name: plan.googleSearch!.campaignName, spec: plan.googleSearch as unknown as Prisma.InputJsonValue, dailyBudgetPaise: 30_000, totalBudgetPaise: 1_500_000, approvalStatus: "APPROVED" },
      })
    : null;
  const meta = await prisma.campaignDraft.create({
    data: { taskId: task.id, goalId: goal.id, runId: run.id, platform: "META", name: spec.campaignName, spec: spec as unknown as Prisma.InputJsonValue, dailyBudgetPaise: 20_000, totalBudgetPaise: 1_500_000, approvalStatus: "APPROVED" },
  });
  const assets: Record<string, { id: string }> = {};
  for (const [id, kind, title] of [
    ["static-1", "IMAGE", "Static verified"],
    ["static-2", "IMAGE", "Static family"],
    ["reel-1", "REEL", "Reel bol kar"],
  ] as const) {
    assets[id] = await prisma.creativeAsset.create({ data: { taskId: task.id, runId: run.id, kind, title, brief: { id, headline: title }, reviewStatus: "APPROVED" } });
  }
  // The brief approval above is the package's. The images below are separate files with their own review.
  const media: Record<string, string> = {};
  for (const conceptId of ["static-1", "static-2"]) {
    const r = await attachCreativeMedia({ taskId: task.id, creativeAssetId: assets[conceptId].id, buffer: await squareImage(COLORS[conceptId]), actorId: ACTOR.id, actorRole: ACTOR.role });
    assert.ok(r.ok, r.ok ? "" : r.message);
    media[conceptId] = r.media.id;
    if (opts.approveMedia !== false) {
      const a = await reviewCreativeMedia({ mediaId: r.media.id, taskId: task.id, decision: "APPROVE", note: null, actorId: ACTOR.id, actorRole: ACTOR.role });
      assert.ok(a.ok);
    }
  }
  return { goal, task, run, meta, google, assets, media, spec };
}

async function metaDep(taskId: string) {
  const d = await prisma.campaignDeployment.findFirst({ where: { taskId, platform: "META" }, include: { createApproval: true, activateApproval: true } });
  assert.ok(d, "meta deployment exists");
  return d;
}

async function pending(taskId: string, action: "CREATE_PAUSED_CAMPAIGNS" | "ACTIVATE_CAMPAIGNS") {
  return prisma.marketingApproval.findFirst({ where: { taskId, action, status: "PENDING" }, orderBy: { createdAt: "desc" } });
}

function approve(approvalId: string) {
  return decideApproval({ approvalId, decision: "APPROVE", reason: null, actorId: ACTOR.id, actorRole: ACTOR.role });
}

function opts(fake: FakeMetaAds, workerId: string): WorkerOptions {
  return { metaProvider: fake, workerId, now, probeLanding: async () => ({ ok: true, status: 200 }) };
}

function refsOk(dep: Parameters<typeof metaRefsOf>[0]) {
  const parsed = metaRefsOf(dep);
  assert.ok(parsed.ok, parsed.ok ? "" : parsed.reason);
  return parsed.refs;
}

const lost = () => new ConnectorError("TIMEOUT", "meta-ads: 60s me jawab nahi aaya.");

function assetDenial(): ConnectorError {
  const message = "(#200) Ad account owner has NOT grant ads_management or ads_read permission";
  return new ConnectorError("UPSTREAM", `meta-ads: 400. ${message}`, 400, "fake-rid-200", { code: 200, subcode: null, type: "OAuthException", message, userTitle: null, userMessage: null, fbtraceId: "fake-trace-200" });
}

function writeTally(fake: FakeMetaAds): string {
  const tally = new Map<string, number>();
  for (const w of fake.writes()) tally.set(w.method, (tally.get(w.method) ?? 0) + 1);
  return [...tally.entries()].map(([m, n]) => `${m}×${n}`).join(" ");
}

/** The fake account holds exactly one logical hierarchy for the fixture package — the no-duplicate evidence. */
function assertOneHierarchy(fake: FakeMetaAds, label: string) {
  const counts = { campaigns: fake.campaigns.size, adSets: fake.adSets.size, images: fake.images.size, creatives: fake.creatives.size, ads: fake.ads.size };
  assert.deepEqual(counts, { campaigns: 1, adSets: 2, images: 2, creatives: 2, ads: 2 }, `${label}: exactly one campaign / 2 ad sets / 2 images / 2 creatives / 2 ads`);
  note(`${label} — stored: campaign ${counts.campaigns} · ad sets ${counts.adSets} · images ${counts.images} · creatives ${counts.creatives} · ads ${counts.ads} | writes sent: ${writeTally(fake)}`);
}

// ============================================================
// Connection rows — snapshot, fake install, restore
// ============================================================

const CONNECTION_PROVIDERS = ["META_ADS", "FACEBOOK_PAGE", "INSTAGRAM", "GOOGLE_ADS"] as const;
const snapshots = new Map<string, MarketingConnection | null>();

async function snapshotConnections() {
  for (const p of CONNECTION_PROVIDERS) snapshots.set(p, await prisma.marketingConnection.findUnique({ where: { provider: p } }));
}

async function restoreConnections() {
  for (const p of CONNECTION_PROVIDERS) {
    const snap = snapshots.get(p) ?? null;
    if (!snap) {
      await prisma.marketingConnection.deleteMany({ where: { provider: p } });
      continue;
    }
    const { id, provider, createdAt, updatedAt, settings, ...rest } = snap;
    void id;
    void createdAt;
    void updatedAt;
    await prisma.marketingConnection.update({ where: { provider }, data: { ...rest, settings: settings === null ? Prisma.JsonNull : (settings as Prisma.InputJsonValue) } });
  }
}

/** The three Meta rows the readiness and the executor read — settings reset, so every check runs its own readiness. */
async function installMetaConnections() {
  const base = { status: "CONNECTED" as const, scopes: [] as string[], lastErrorCode: null, lastErrorMessage: null, lastErrorAt: null, lastSyncAt: new Date() };
  const adsSettings = { specialAdCategories: "NONE" } as Prisma.InputJsonValue;
  await prisma.marketingConnection.upsert({ where: { provider: "META_ADS" }, create: { provider: "META_ADS", accountRef: ACT, accountLabel: "Fake BandhanTak Meta", settings: adsSettings, ...base }, update: { accountRef: ACT, accountLabel: "Fake BandhanTak Meta", settings: adsSettings, ...base } });
  await prisma.marketingConnection.upsert({ where: { provider: "FACEBOOK_PAGE" }, create: { provider: "FACEBOOK_PAGE", accountRef: PAGE, settings: {}, ...base }, update: { accountRef: PAGE, settings: {}, ...base } });
  await prisma.marketingConnection.upsert({ where: { provider: "INSTAGRAM" }, create: { provider: "INSTAGRAM", accountRef: IG, settings: {}, ...base }, update: { accountRef: IG, settings: {}, ...base } });
}

async function installGoogleConnection() {
  const data = {
    accountRef: GOOGLE_CUSTOMER,
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

async function cleanupCreated() {
  const tasks = created.tasks.splice(0);
  const goals = created.goals.splice(0);
  if (tasks.length) await prisma.marketingTask.deleteMany({ where: { id: { in: tasks } } });
  if (goals.length) await prisma.marketingGoal.deleteMany({ where: { id: { in: goals } } });
  for (const t of tasks) await rm(path.join(process.cwd(), "public", "uploads", "marketing-creatives", t), { recursive: true, force: true });
}

/** Package approved → readiness (fake account) → create card → approved → QUEUED. */
async function toMetaQueued(fake: FakeMetaAds, o: Parameters<typeof makeMetaTask>[0] = {}) {
  const f = await makeMetaTask(o);
  const report = await checkMetaAdReadiness({ provider: fake, now: now() });
  assert.equal(report.ok, true, report.message);
  await prepareDeploymentsForTask({ taskId: f.task.id, actor: ACTOR, now: now() });
  const card = await pending(f.task.id, "CREATE_PAUSED_CAMPAIGNS");
  if (!card) {
    const d = await metaDep(f.task.id);
    assert.fail(`no create card: ${d.status} ${d.lastErrorCode}: ${d.lastErrorMessage}`);
  }
  const r = await approve(card.id);
  assert.equal(r.ok, true, JSON.stringify(r));
  const dep = await metaDep(f.task.id);
  assert.equal(dep.status, "QUEUED");
  return { ...f, card, dep };
}

async function toMetaActivationPending(fake: FakeMetaAds) {
  const f = await toMetaQueued(fake);
  const r = await runDeployment(f.dep.id, opts(fake, "w-create"));
  assert.equal(r.status, "ACTIVATION_PENDING", r.message);
  const dep = await metaDep(f.task.id);
  const activateCard = await pending(f.task.id, "ACTIVATE_CAMPAIGNS");
  assert.ok(activateCard, "activation card exists");
  return { ...f, dep, activateCard };
}

async function evaluate(reader: FakeMetaAds, ids: { pageId?: string | null; instagramId?: string | null } = {}) {
  return evaluateMetaAdReadiness({ reader, accountRef: ACT, pageId: ids.pageId === undefined ? PAGE : ids.pageId, instagramId: ids.instagramId === undefined ? IG : ids.instagramId, apiVersion: "v26.0", now: now() });
}

function lineOf(ev: Awaited<ReturnType<typeof evaluate>>, key: MetaReadinessCheck["key"]): MetaReadinessCheck {
  const found = ev.report.checks.find((c) => c.key === key);
  assert.ok(found, `readiness line ${key}`);
  return found;
}

const isCode = (code: string) => (err: unknown) => err instanceof ExecutionError && err.code === code;

// ============================================================
// 1. Classification and readiness — pure, no database
// ============================================================

check("classifier: the live #200 'owner has NOT grant' is ad-account asset assignment, a scope message is token scope, #190 is the token", async () => {
  const asset = normaliseMetaError(assetDenial(), "read");
  assert.equal(asset.code, "META_AD_ACCOUNT_FORBIDDEN");
  assert.equal(asset.reconnect, false, "an asset fix, not a new token");
  assert.equal(asset.status, "BLOCKED_CONFIG");
  assert.doesNotMatch(asset.message, /token par ads_management permission nahi/);
  assert.match(asset.fix ?? "", /Assign assets/);
  const admin272 = normaliseMetaError(new ConnectorError("UPSTREAM", "meta-ads: 400.", 400, null, { code: 272, subcode: null, type: "OAuthException", message: "(#272) This Ads API call requires the user to be admin of the ad account", userTitle: null, userMessage: null, fbtraceId: null }), "write");
  assert.equal(admin272.code, "META_AD_ACCOUNT_FORBIDDEN");
  const scope = normaliseMetaError(new ConnectorError("UPSTREAM", "meta-ads: 400.", 400, null, { code: 200, subcode: null, type: "OAuthException", message: "(#200) Requires ads_management permission to manage the object", userTitle: null, userMessage: null, fbtraceId: "t" }), "write");
  assert.equal(scope.code, "META_ADS_MANAGEMENT_MISSING");
  assert.equal(scope.reconnect, true);
  assert.equal(normaliseMetaError(new ConnectorError("AUTH", "meta-ads: 401", 401), "read").code, "META_TOKEN_INVALID");
  assert.equal(normaliseMetaError(lost(), "write").code, "NETWORK_UNKNOWN_OUTCOME");
});

check("readiness report keeps token scope and ad-account assignment apart: WRITE_PERMISSION READY beside AD_ACCOUNT MISSING (asset), facts UNVERIFIED", async () => {
  const fake = new FakeMetaAds();
  fake.describeAccount = async () => {
    throw assetDenial();
  };
  const ev = await evaluate(fake);
  assert.equal(lineOf(ev, "TOKEN").state, "READY");
  assert.equal(lineOf(ev, "READ_PERMISSION").state, "READY");
  assert.equal(lineOf(ev, "WRITE_PERMISSION").state, "READY");
  const account = lineOf(ev, "AD_ACCOUNT");
  assert.equal(account.state, "MISSING");
  assert.match(account.detail ?? "", /asset assignment/);
  assert.match(account.detail ?? "", /#200/);
  assert.match(account.fix ?? "", /System users .* Assign assets .* Ad accounts/);
  assert.equal(account.reconnect, false);
  for (const key of ["ACCOUNT_STATUS", "CURRENCY", "TIMEZONE"] as const) assert.equal(lineOf(ev, key).state, "UNVERIFIED", key);
  assert.equal(ev.report.ok, false);
  assert.equal(ev.report.errorCode, "META_AD_ACCOUNT_FORBIDDEN");
  assert.doesNotMatch(ev.report.message, /token par ads_management/);
  assert.equal(lineOf(ev, "PAGE").state, "READY", "the Page line is still its own answer");
});

check("readiness: only ads_read, missing role, disabled account, USD, Page without ADVERTISE, unlinked Instagram and a dead token each block with their own code", async () => {
  const cases: Array<{ name: string; tweak: (f: FakeMetaAds) => void; code: string; key: MetaReadinessCheck["key"] }> = [
    { name: "ads_read only", tweak: (f) => (f.granted = ["ads_read"]), code: "META_ADS_MANAGEMENT_MISSING", key: "WRITE_PERMISSION" },
    { name: "no account role", tweak: (f) => (f.account = { ...f.account, tasks: ["ANALYZE"] }), code: "META_AD_ACCOUNT_FORBIDDEN", key: "AD_ACCOUNT" },
    { name: "disabled", tweak: (f) => (f.account = { ...f.account, accountStatus: 2, disableReason: 1 }), code: "META_AD_ACCOUNT_DISABLED", key: "ACCOUNT_STATUS" },
    { name: "USD", tweak: (f) => (f.account = { ...f.account, currency: "USD" }), code: "META_ACCOUNT_CURRENCY_MISMATCH", key: "CURRENCY" },
    { name: "Page without ADVERTISE", tweak: (f) => (f.pages = [{ id: PAGE, name: "BandhanTak", tasks: ["ANALYZE"] }]), code: "META_PAGE_NOT_ASSIGNED", key: "PAGE" },
    { name: "IG not linked", tweak: (f) => (f.instagramByPage = { [PAGE]: [{ id: "3333", username: "other", pageId: PAGE }] }), code: "META_INSTAGRAM_NOT_ASSIGNED", key: "INSTAGRAM" },
  ];
  for (const c of cases) {
    const fake = new FakeMetaAds();
    c.tweak(fake);
    const ev = await evaluate(fake);
    assert.equal(ev.report.ok, false, c.name);
    assert.equal(ev.report.errorCode, c.code, c.name);
    assert.equal(lineOf(ev, c.key).state, "MISSING", c.name);
    if (c.name === "IG not linked") assert.deepEqual(ev.linkedInstagram.map((a) => a.id), ["3333"], "the Page's real link is shown as a hint");
  }
  const dead = new FakeMetaAds();
  dead.tokenError = new ConnectorError("AUTH", "meta-ads: 401", 401);
  const deadEv = await evaluate(dead);
  assert.equal(deadEv.report.errorCode, "META_TOKEN_INVALID");
  assert.ok(deadEv.tokenError);
  const good = await evaluate(new FakeMetaAds());
  assert.equal(good.report.ok, true, good.report.message);
  assert.equal(lineOf(good, "ACCESS_TIER").state, "UNVERIFIED", "access tier is never claimed");
  assert.equal((await evaluate(new FakeMetaAds(), { instagramId: null })).report.ok, true, "no Instagram id is NOT_NEEDED, not a block");
});

check("mapper: PAUSED everywhere, tagged names, integer paise, hard audience, IG identity only on the IG creative, Reel/frequency/stop-loss deferred, no silent downgrade", async () => {
  const spec = metaPackage();
  const input = (s: MetaPackage, over: Partial<MetaMapInput> = {}): MetaMapInput => ({
    adAccountId: ACT,
    marker: "BT:abcdef1234",
    spec: s,
    providerCampaignName: "BT · Jaipur · Feed [BT:abcdef1234]",
    dailyBudgetPaise: 20_000,
    timeZone: "Asia/Kolkata",
    startDate: "2026-09-20",
    endDate: "2026-10-04",
    resolvedLocations: { Jaipur: { key: "1035921", name: "Jaipur", type: "city", countryCode: "IN", region: "Rajasthan" } },
    resolvedInterests: { "Wedding planning": { id: "6003147285301", name: "Wedding planning", audienceSize: null, path: [] } },
    pageId: PAGE,
    instagramActorId: IG,
    finalUrl: "https://bandhantak.com/register?utm_source=facebook",
    media: { "static-1": { mediaId: "m1", imageHash: null }, "static-2": { mediaId: "m2", imageHash: null } },
    specialAdCategories: ["NONE"],
    specialAdCategoryCountry: null,
    conversion: null,
    isProtectedTargeting,
    ...over,
  });
  const m = mapMetaPackage(input(spec));
  assert.equal(m.campaign.status, "PAUSED");
  assert.equal(m.campaign.is_adset_budget_sharing_enabled, false);
  assert.deepEqual(m.campaign.special_ad_categories, ["NONE"]);
  assert.deepEqual(
    m.adSets.map((s) => [s.key, s.body.status, s.body.daily_budget, s.body.targeting.publisher_platforms.join("+")]),
    [
      ["AS01", "PAUSED", "10000", "facebook"],
      ["AS02", "PAUSED", "10000", "instagram"],
    ],
  );
  assert.ok(m.adSets[0].name.endsWith("[BT:abcdef1234:AS01]"));
  assert.equal(m.adSets[0].body.targeting.targeting_automation.advantage_audience, 0);
  assert.deepEqual(m.adSets[0].body.targeting.genders, [2]);
  assert.equal(m.adSets[0].body.start_time, "2026-09-20T00:00:00+05:30");
  assert.equal(m.adSets[0].body.end_time, "2026-10-04T23:59:59+05:30");
  const cr1 = m.creatives[0].build("hash1");
  const cr2 = m.creatives[1].build("hash2");
  assert.equal(cr1.object_story_spec.instagram_user_id, undefined, "Facebook-only ad set: no Instagram identity");
  assert.equal(cr2.object_story_spec.instagram_user_id, IG);
  assert.ok(Object.values(cr1.degrees_of_freedom_spec.creative_features_spec).every((v) => v.enroll_status === "OPT_OUT"));
  assert.equal(m.ads[0].build("as", "cr").status, "PAUSED");
  assert.ok(m.ads[1].name.endsWith("[BT:abcdef1234:AD02]"));
  assert.ok(m.deferred.some((d) => /REEL/.test(d)), "the Reel ad is named as deferred");
  assert.ok(m.deferredRules.some((d) => /Frequency cap/.test(d)) && m.deferredRules.some((d) => /Stop-loss/.test(d)));
  assert.deepEqual(m.activationOrder, ["ads", "adsets", "campaign"]);
  assert.equal(JSON.stringify(mapMetaPackage(input(spec)).adSets.map((s) => s.body)), JSON.stringify(m.adSets.map((s) => s.body)), "deterministic");
  assert.throws(() => mapMetaPackage(input({ ...spec, objective: "OUTCOME_LEADS" })), isCode("INVALID_CONVERSION_ACTION"), "LEADS without a pixel is refused, never turned into TRAFFIC");
  assert.throws(() => mapMetaPackage(input({ ...spec, objective: "OUTCOME_AWARENESS" })), isCode("SPEC_INVALID"));
  assert.throws(() => mapMetaPackage(input(spec, { resolvedLocations: {} })), isCode("INVALID_GEO_OR_LANGUAGE"));
  assert.throws(() => mapMetaPackage(input({ ...spec, audience: { ...spec.audience, interests: ["Brahmin matrimony"] } })), isCode("GUARDRAIL_FAILED"));
  assert.throws(() => mapMetaPackage(input(spec, { instagramActorId: null })), isCode("META_INSTAGRAM_NOT_ASSIGNED"));
  assert.throws(() => mapMetaPackage(input(spec, { dailyBudgetPaise: 15_000 })), isCode("INVALID_BUDGET"));
  assert.throws(() => mapMetaPackage(input(spec, { specialAdCategories: [] })), isCode("ACCOUNT_NOT_READY"), "special ad categories are never guessed");
});

check("media: decoded pixels decide — SVG/HTML/truncated/oversize/tiny/wrong aspect refused; EXIF and appended bytes never survive re-encoding", async () => {
  const rejects = async (buf: Buffer, codes: string[]) => {
    await assert.rejects(normaliseCreativeImage(buf), (e: unknown) => e instanceof MediaValidationError && codes.includes(e.code));
  };
  await rejects(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200"><rect width="1200" height="1200" fill="red"/></svg>'), ["UNSUPPORTED_FORMAT", "NOT_AN_IMAGE"]);
  await rejects(Buffer.from("<!doctype html><html><body>not an image</body></html>"), ["NOT_AN_IMAGE"]);
  const png = await squareImage([90, 90, 90]);
  await rejects(png.subarray(0, 120), ["NOT_AN_IMAGE", "DECODE_FAILED"]);
  await rejects(Buffer.alloc(MEDIA_MAX_BYTES + 1), ["TOO_LARGE"]);
  await rejects(await squareImage([1, 2, 3], 300), ["TOO_SMALL"]);
  await rejects(await squareImage([1, 2, 3], 1500, 600), ["BAD_ASPECT"]);

  const withExif = await sharp({ create: { width: 1080, height: 1080, channels: 3, background: { r: 10, g: 120, b: 10 } } })
    .jpeg()
    .withExif({ IFD0: { Copyright: "SECRET-EXIF-OWNER" } })
    .toBuffer();
  assert.ok(withExif.includes(Buffer.from("SECRET-EXIF-OWNER")), "precondition: the upload carries EXIF");
  const clean = await normaliseCreativeImage(withExif);
  assert.equal(clean.mimeType, "image/jpeg");
  assert.equal(clean.width, 1080);
  assert.ok(!clean.buffer.includes(Buffer.from("SECRET-EXIF-OWNER")), "EXIF stripped");
  assert.equal((await sharp(clean.buffer).metadata()).exif, undefined);

  const polyglot = Buffer.concat([png, Buffer.from("<script>alert(1)</script>")]);
  try {
    const out = await normaliseCreativeImage(polyglot);
    assert.ok(!out.buffer.includes(Buffer.from("<script")), "the stored file is re-encoded pixels only");
  } catch (err) {
    assert.ok(err instanceof MediaValidationError, "or it is refused outright");
  }
});

check("public creative URL probe: https only, no private/loopback/resolved-private hosts, no redirects, image content type — without touching the network", async () => {
  const publicIp = async () => ["93.184.216.34"];
  const respond = (status: number, type: string | null) => (async () => new Response(null, { status, headers: type ? { "content-type": type } : {} })) as unknown as typeof fetch;
  assert.match((await probePublicImageUrl("http://cdn.bandhantak.com/a.jpg", { resolve: publicIp })).reason ?? "", /HTTPS/);
  assert.match((await probePublicImageUrl("https://127.0.0.1/a.jpg")).reason ?? "", /private/);
  assert.match((await probePublicImageUrl("https://cdn.example.com/a.jpg", { resolve: async () => ["10.0.0.7"] })).reason ?? "", /private address/);
  const redirect = await probePublicImageUrl("https://cdn.example.com/a.jpg", { resolve: publicIp, fetchImpl: respond(302, null) });
  assert.equal(redirect.ok, false);
  assert.match(redirect.reason ?? "", /redirect/);
  assert.equal((await probePublicImageUrl("https://cdn.example.com/a.jpg", { resolve: publicIp, fetchImpl: respond(200, "text/html") })).ok, false);
  assert.equal((await probePublicImageUrl("https://cdn.example.com/a.jpg", { resolve: publicIp, fetchImpl: respond(200, "image/jpeg") })).ok, true);
});

// ============================================================
// 2. Gates, readiness and media against the database
// ============================================================

check("gates closed: no Meta card (NOT_EXECUTABLE_YET); a card cannot be approved; an already-approved card writes nothing — not even a read", async () => {
  setMetaGates({ create: false, activate: false });
  const fake = new FakeMetaAds();
  const f = await makeMetaTask();
  assert.equal((await checkMetaAdReadiness({ provider: fake, now: now() })).ok, true);
  await prepareDeploymentsForTask({ taskId: f.task.id, actor: ACTOR, now: now() });
  const dep = await metaDep(f.task.id);
  assert.equal(dep.status, "BLOCKED_CONFIG");
  assert.equal(dep.lastErrorCode, "NOT_EXECUTABLE_YET");
  assert.equal(await pending(f.task.id, "CREATE_PAUSED_CAMPAIGNS"), null);

  // Open the gates just long enough to issue a real card, then close them at each later step.
  setMetaGates({ create: true, activate: false });
  const rc = await recheckDeployment(dep.id, ACTOR, { now });
  assert.equal(rc.ok && rc.status, "CREATE_PENDING", JSON.stringify(rc));
  const card = (await pending(f.task.id, "CREATE_PAUSED_CAMPAIGNS"))!;
  setMetaGates({ create: false, activate: false });
  const refused = await approve(card.id);
  assert.equal(!refused.ok && refused.error, "NOT_EXECUTABLE");
  setMetaGates({ create: true, activate: false });
  assert.equal((await approve(card.id)).ok, true);
  setMetaGates({ create: false, activate: false });
  const callsBefore = fake.calls.length;
  const run = await runDeployment(dep.id, opts(fake, "w-closed"));
  assert.equal(run.status, "BLOCKED_CONFIG");
  assert.equal(run.error?.code, "NOT_EXECUTABLE_YET");
  assert.equal(fake.calls.length, callsBefore, "the gate is read before the provider is even built");
  assert.equal(fake.writes().length, 0);
});

check("readiness blocks before any card — never checked, token scope, the live #200 asset assignment, unlinked Instagram — then one exact card", async () => {
  const f = await makeMetaTask();
  await prepareDeploymentsForTask({ taskId: f.task.id, actor: ACTOR, now: now() });
  let dep = await metaDep(f.task.id);
  assert.equal(dep.status, "BLOCKED_CONFIG");
  assert.equal(dep.lastErrorCode, "ACCOUNT_NOT_READY");
  assert.match(dep.lastErrorFix ?? "", /Check ad creation readiness/);

  const scopeFake = new FakeMetaAds();
  scopeFake.granted = ["ads_read"];
  await checkMetaAdReadiness({ provider: scopeFake, now: now() });
  await recheckDeployment(dep.id, ACTOR, { now });
  dep = await metaDep(f.task.id);
  assert.equal(dep.lastErrorCode, "META_ADS_MANAGEMENT_MISSING");

  const assetFake = new FakeMetaAds();
  assetFake.describeAccount = async () => {
    throw assetDenial();
  };
  const report = await checkMetaAdReadiness({ provider: assetFake, now: now() });
  assert.equal(report.errorCode, "META_AD_ACCOUNT_FORBIDDEN");
  const settings = (await prisma.marketingConnection.findUnique({ where: { provider: "META_ADS" } }))!.settings as Record<string, string>;
  assert.equal(settings.writeReady, "true", "token scope recorded as granted");
  assert.equal(settings.accountAccess, "MISSING", "asset assignment recorded as missing");
  assert.equal(settings.currency, undefined, "no account facts from a failed read");
  assert.equal(settings.readinessCode, "META_AD_ACCOUNT_FORBIDDEN");
  await recheckDeployment(dep.id, ACTOR, { now });
  dep = await metaDep(f.task.id);
  assert.equal(dep.lastErrorCode, "META_AD_ACCOUNT_FORBIDDEN");
  assert.match(dep.lastErrorFix ?? "", /Manage campaigns/);
  assert.equal(await pending(f.task.id, "CREATE_PAUSED_CAMPAIGNS"), null);

  const igFake = new FakeMetaAds();
  igFake.instagramByPage = { [PAGE]: [{ id: "3333", username: "other", pageId: PAGE }] };
  await checkMetaAdReadiness({ provider: igFake, now: now() });
  await recheckDeployment(dep.id, ACTOR, { now });
  dep = await metaDep(f.task.id);
  assert.equal(dep.lastErrorCode, "META_INSTAGRAM_NOT_ASSIGNED");

  await checkMetaAdReadiness({ provider: new FakeMetaAds(), now: now() });
  const rc = await recheckDeployment(dep.id, ACTOR, { now });
  assert.equal(rc.ok && rc.status, "CREATE_PENDING", JSON.stringify(rc));
  const card = (await pending(f.task.id, "CREATE_PAUSED_CAMPAIGNS"))!;
  const p = MetaCreatePausedPayloadSchema.parse(card.payload);
  assert.equal(p.accountRef, ACT);
  assert.equal(p.pageId, PAGE);
  assert.equal(p.instagramActorId, IG);
  assert.equal(p.objective, "OUTCOME_TRAFFIC");
  assert.equal(p.dailyBudgetPaise, 20_000);
  assert.equal(p.maxSpendPaise, 20_000 * 15);
  assert.deepEqual(p.adSetKeys, ["AS01", "AS02"]);
  assert.deepEqual(p.adKeys, ["AD01", "AD02"]);
  assert.deepEqual([...p.creativeMediaIds].sort(), [f.media["static-1"], f.media["static-2"]].sort());
  assert.ok(p.deferredRules.some((d) => /REEL/.test(d)));
  const preview = card.preview as { whatHappensNow: string; contentPreview: string[] };
  assert.match(preview.whatHappensNow, /PAUSED banenge/);
  assert.match(preview.whatHappensNow, /spend start nahi/);
  assert.ok(preview.contentPreview.some((l) => /write READY/.test(l)), "the card says which permission it relies on");
});

check("media gate: approved brief without an approved image is BLOCKED_CREATIVE; replacing the approved image voids the pending card; dedupe; production refuses local disk", async () => {
  const fake = new FakeMetaAds();
  const f = await makeMetaTask({ approveMedia: false });
  await checkMetaAdReadiness({ provider: fake, now: now() });
  await prepareDeploymentsForTask({ taskId: f.task.id, actor: ACTOR, now: now() });
  let dep = await metaDep(f.task.id);
  assert.equal(dep.status, "BLOCKED_CREATIVE");
  assert.equal(dep.lastErrorCode, "CREATIVE_MISSING");
  assert.match(dep.lastErrorMessage ?? "", /brief approval kaafi nahi/);

  for (const mediaId of Object.values(f.media)) await reviewCreativeMedia({ mediaId, taskId: f.task.id, decision: "APPROVE", note: null, actorId: ACTOR.id, actorRole: ACTOR.role });
  let rc = await recheckDeployment(dep.id, ACTOR, { now });
  assert.equal(rc.ok && rc.status, "CREATE_PENDING", JSON.stringify(rc));
  const card1 = (await pending(f.task.id, "CREATE_PAUSED_CAMPAIGNS"))!;

  const replacement = await attachCreativeMedia({ taskId: f.task.id, creativeAssetId: f.assets["static-1"].id, buffer: await squareImage([10, 200, 90]), actorId: ACTOR.id, actorRole: ACTOR.role });
  assert.ok(replacement.ok && !replacement.duplicate);
  assert.equal(replacement.media.status, "PENDING_REVIEW");
  assert.equal((await prisma.marketingApproval.findUnique({ where: { id: card1.id } }))?.status, "PENDING", "an unreviewed upload changes nothing");
  await reviewCreativeMedia({ mediaId: replacement.media.id, taskId: f.task.id, decision: "APPROVE", note: null, actorId: ACTOR.id, actorRole: ACTOR.role });
  assert.equal((await prisma.marketingApproval.findUnique({ where: { id: card1.id } }))?.status, "EXPIRED", "the card described a creative that no longer exists");
  assert.equal((await prisma.marketingCreativeMedia.findUnique({ where: { id: f.media["static-1"] } }))?.status, "REJECTED", "the replaced image is demoted");
  dep = await metaDep(f.task.id);
  assert.equal(dep.status, "BLOCKED_CREATIVE");
  assert.equal(dep.lastErrorCode, "CREATIVE_INVALID");
  rc = await recheckDeployment(dep.id, ACTOR, { now });
  assert.equal(rc.ok && rc.status, "CREATE_PENDING");
  const card2 = (await pending(f.task.id, "CREATE_PAUSED_CAMPAIGNS"))!;
  assert.notEqual(card2.id, card1.id);
  assert.ok(MetaCreatePausedPayloadSchema.parse(card2.payload).creativeMediaIds.includes(replacement.media.id));

  const dup = await attachCreativeMedia({ taskId: f.task.id, creativeAssetId: f.assets["static-1"].id, buffer: await squareImage([10, 200, 90]), actorId: ACTOR.id, actorRole: ACTOR.role });
  assert.ok(dup.ok && dup.duplicate && dup.media.id === replacement.media.id, "same pixels, one row");
  const wrongTask = await attachCreativeMedia({ taskId: randomUUID(), creativeAssetId: f.assets["static-2"].id, buffer: await squareImage([5, 5, 5]), actorId: ACTOR.id, actorRole: ACTOR.role });
  assert.equal(!wrongTask.ok && wrongTask.error, "NOT_FOUND");
  const reel = await attachCreativeMedia({ taskId: f.task.id, creativeAssetId: f.assets["reel-1"].id, buffer: await squareImage([5, 5, 5]), actorId: ACTOR.id, actorRole: ACTOR.role });
  assert.equal(!reel.ok && reel.error, "NOT_IMAGE_CREATIVE");

  const env = process.env as Record<string, string | undefined>;
  const previous = env.NODE_ENV;
  env.NODE_ENV = "production";
  try {
    const draft = (await prisma.campaignDraft.findUnique({ where: { id: f.meta.id } }))!;
    await assert.rejects(metaReadiness({ draft, goal: f.goal, siblingDrafts: [draft], marker: dep.executionMarker, now: now() }), (e: unknown) => isCode("CREATIVE_INVALID")(e) && /local disk/.test((e as Error).message));
  } finally {
    if (previous === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previous;
  }
});

// ============================================================
// 3. Paused create — checkpoints, reconciliation, no duplicates
// ============================================================

check("paused create: campaign → ad sets → images → creatives → ads, all PAUSED and tagged; two parallel workers claim once; verified read-back → activation card", async () => {
  const fake = new FakeMetaAds();
  const f = await toMetaQueued(fake);
  const [a, b] = await Promise.all([runDeployment(f.dep.id, opts(fake, "w-a")), runDeployment(f.dep.id, opts(fake, "w-b"))]);
  assert.equal([a, b].filter((r) => r.ran).length, 1, "exactly one lease");
  const r = a.ran ? a : b;
  assert.equal(r.status, "ACTIVATION_PENDING", r.message);

  const writes = fake.writes();
  assert.deepEqual(writes.map((w) => w.method), ["createCampaignPaused", "createAdSetPaused", "createAdSetPaused", "uploadOrResolveImage", "uploadOrResolveImage", "createAdCreative", "createAdCreative", "createAdPaused", "createAdPaused"]);
  const marker = f.dep.executionMarker;
  const named = (i: number) => String((writes[i].args as { name: string }).name);
  assert.ok(named(0).includes(`[${marker}]`));
  assert.deepEqual([1, 2, 5, 6, 7, 8].map((i) => named(i).slice(named(i).lastIndexOf("["))), [`[${marker}:AS01]`, `[${marker}:AS02]`, `[${marker}:CR01]`, `[${marker}:CR02]`, `[${marker}:AD01]`, `[${marker}:AD02]`]);
  for (const i of [0, 1, 2, 7, 8]) assert.equal((writes[i].args as { status: string }).status, "PAUSED", writes[i].method);
  const sets = [writes[1], writes[2]].map((w) => w.args as MetaAdSetCreate);
  assert.deepEqual(sets.map((s) => s.daily_budget), ["10000", "10000"]);
  assert.ok(sets.every((s) => s.targeting.targeting_automation.advantage_audience === 0 && s.bid_strategy === "LOWEST_COST_WITHOUT_CAP"));
  const creatives = [writes[5], writes[6]].map((w) => w.args as MetaCreativeCreate);
  assert.equal(creatives[0].object_story_spec.instagram_user_id, undefined);
  assert.equal(creatives[1].object_story_spec.instagram_user_id, IG);
  assert.ok(creatives.every((c) => c.object_story_spec.page_id === PAGE && c.object_story_spec.link_data.link.startsWith("https://bandhantak.com/register?utm_source=facebook")));
  assertOneHierarchy(fake, "happy create");
  assert.ok([...fake.campaigns.values(), ...fake.adSets.values(), ...fake.ads.values()].every((o) => o.status === "PAUSED"), "nothing on the account can serve");

  const dep = await metaDep(f.task.id);
  assert.equal(dep.status, "ACTIVATION_PENDING");
  assert.equal(dep.phase, "ACTIVATE");
  assert.equal(dep.externalStatus, "PAUSED");
  assert.equal(dep.checkpoint, "TREE_VERIFIED_PAUSED");
  assert.equal(dep.lockedBy, null);
  assert.ok(dep.pausedVerifiedAt);
  assert.equal(dep.createApproval?.status, "EXECUTED");
  const refs = refsOk(dep);
  assert.deepEqual([Object.keys(refs.adSets).sort(), Object.keys(refs.creatives).sort(), Object.keys(refs.ads).sort(), Object.keys(refs.media).length], [["AS01", "AS02"], ["CR01", "CR02"], ["AD01", "AD02"], 2]);
  assert.equal(refs.resolved?.apiVersion, process.env.META_GRAPH_API_VERSION ?? "v26.0", "the deployment records the Graph version its writes used");
  note(`Graph API version recorded on the deployment: ${refs.resolved?.apiVersion}`);

  const activateCard = (await pending(f.task.id, "ACTIVATE_CAMPAIGNS"))!;
  const act = MetaActivatePayloadSchema.parse(activateCard.payload);
  assert.equal(act.campaignId, refs.campaignId);
  assert.deepEqual([...act.adIds].sort(), Object.values(refs.ads).map((x) => x.id).sort());
  assert.equal(act.verifiedDailyBudgetPaise, 20_000);
  assert.equal(act.activationOrder, "ads -> adsets -> campaign");
  const preview = activateCard.preview as { contentPreview: string[]; rollback: string };
  assert.ok(preview.contentPreview.some((l) => /campaign sabse last/.test(l)));
  assert.ok(preview.contentPreview.some((l) => /spend ho sakta hai/.test(l)), "spend warning on the card");
  assert.match(preview.rollback, /PAUSED/);

  const rows = await listDeploymentRows(f.task.id);
  const row = rows.find((x) => x.platform === "META")!;
  assert.deepEqual(row.steps.map((s) => `${s.key}:${s.state}`), ["PREFLIGHT:done", "CAMPAIGN:done", "ADSETS:done", "MEDIA:done", "CREATIVES:done", "ADS:done", "VERIFY:done", "ACTIVATE:todo"]);
  assert.equal(row.meta?.checkpoint, "TREE_VERIFIED_PAUSED");
  assert.deepEqual([row.meta?.externalIds.adSetIds.length, row.meta?.externalIds.creativeIds.length, row.meta?.externalIds.adIds.length], [2, 2, 2]);
  assert.equal(row.meta?.writePermission, "READY");
  assert.equal(row.meta?.pageId, PAGE);
  assert.equal(row.meta?.instagramActorId, IG);
  assert.equal(row.meta?.creativePreviews.length, 2);
  assert.deepEqual(row.availableActions, ["SYNC"]);
  assert.equal(row.pendingApprovalId, activateCard.id);
  assert.ok(!/check-script-inert-value|Bearer/.test(JSON.stringify(rows)), "no token material in rows");

  const idle = await runDeployment(dep.id, opts(fake, "w-idle"));
  assert.equal(idle.ran, false);
  const replay = await approve(f.card.id);
  assert.equal(replay.ok && replay.deploymentStatus, "ACTIVATION_PENDING", "the create card cannot be replayed into anything");
  assert.equal(fake.writes().length, 9);
});

const LANDED: Array<{ label: string; method: FakeMetaWrite; nth: number; afterSync: "PARTIAL" | "ACTIVATION_PENDING"; sent: number }> = [
  { label: "campaign landed, answer lost", method: "createCampaignPaused", nth: 1, afterSync: "PARTIAL", sent: 1 },
  { label: "second ad set landed, answer lost", method: "createAdSetPaused", nth: 2, afterSync: "PARTIAL", sent: 2 },
  { label: "image upload landed, answer lost", method: "uploadOrResolveImage", nth: 1, afterSync: "PARTIAL", sent: 2 },
  { label: "creative landed, answer lost", method: "createAdCreative", nth: 1, afterSync: "PARTIAL", sent: 2 },
  { label: "last ad landed, answer lost", method: "createAdPaused", nth: 2, afterSync: "ACTIVATION_PENDING", sent: 2 },
];

for (const c of LANDED) {
  check(`timeout after the write landed — ${c.label}: UNKNOWN_OUTCOME, Sync attaches by tag (never writes), retry resumes, one hierarchy`, async () => {
    const fake = new FakeMetaAds();
    fake.failures.push({ method: c.method, nth: c.nth, apply: true, error: lost() });
    const f = await toMetaQueued(fake);
    const first = await runDeployment(f.dep.id, opts(fake, "w-lost"));
    assert.equal(first.status, "UNKNOWN_OUTCOME", first.message);
    assert.equal(first.error?.code, "NETWORK_UNKNOWN_OUTCOME");
    assert.equal(first.error?.retrySafe, false);
    let dep = await metaDep(f.task.id);
    assert.ok(dep.lastWriteAttemptAt);
    assert.equal(dep.lockedBy, null);
    assert.deepEqual((await listDeploymentRows(f.task.id)).find((x) => x.platform === "META")!.availableActions, ["SYNC"], "no blind retry offered");
    const blind = await retryDeployment(dep.id, ACTOR, opts(fake, "w-blind"));
    assert.equal(!blind.ok && blind.error, "NOT_RETRYABLE");

    const before = fake.writes().length;
    advance(2_000);
    const s = await syncDeployment(dep.id, opts(fake, "s-lost"));
    assert.equal(s.status, c.afterSync, s.message);
    assert.equal(fake.writes().length, before, "sync never writes");
    if (c.afterSync === "PARTIAL") {
      const rt = await retryDeployment(dep.id, ACTOR, opts(fake, "w-resume"));
      assert.equal(rt.ok && rt.status, "ACTIVATION_PENDING", JSON.stringify(rt));
    }
    assertOneHierarchy(fake, c.label);
    assert.equal(fake.count(c.method), c.sent, `${c.method}: one request per logical object`);
    dep = await metaDep(f.task.id);
    assert.equal(dep.status, "ACTIVATION_PENDING");
    assert.ok(await pending(f.task.id, "ACTIVATE_CAMPAIGNS"));
  });
}

check("timeout before the write landed: Sync waits out the grace window, then PARTIAL; retry creates the missing ad set once", async () => {
  const fake = new FakeMetaAds();
  fake.failures.push({ method: "createAdSetPaused", nth: 1, apply: false, error: lost() });
  const f = await toMetaQueued(fake);
  assert.equal((await runDeployment(f.dep.id, opts(fake, "w-nl"))).status, "UNKNOWN_OUTCOME");
  advance(5_000);
  const early = await syncDeployment(f.dep.id, opts(fake, "s-early"));
  assert.equal(early.status, "UNKNOWN_OUTCOME");
  assert.match(early.message, /Sync karein/);
  advance(61_000);
  const late = await syncDeployment(f.dep.id, opts(fake, "s-late"));
  assert.equal(late.status, "PARTIAL", late.message);
  const rt = await retryDeployment(f.dep.id, ACTOR, opts(fake, "w-nl2"));
  assert.equal(rt.ok && rt.status, "ACTIVATION_PENDING", JSON.stringify(rt));
  assertOneHierarchy(fake, "ad set write lost (did not land)");
  assert.equal(fake.count("createAdSetPaused"), 3, "the lost attempt, then AS01 and AS02 once each");
  assert.equal(fake.count("createCampaignPaused"), 1);
});

check("read-back temporarily missing → PARTIAL with no activation card; the recovery sweep resumes it with zero writes", async () => {
  const fake = new FakeMetaAds();
  fake.missingTreeReads = 2;
  const f = await toMetaQueued(fake);
  const first = await runDeployment(f.dep.id, opts(fake, "w-rb"));
  assert.equal(first.status, "PARTIAL", first.message);
  assert.equal(first.error?.code, "INTERNAL_ERROR");
  assert.equal(await pending(f.task.id, "ACTIVATE_CAMPAIGNS"), null, "no activation card before a verified tree");
  const sent = fake.writes().length;
  assert.equal(sent, 9);
  const summary = await recoverDeployments({ metaProvider: fake, workerId: "cron", now, limit: 10 });
  assert.ok(summary.resumed.some((x) => x.id === f.dep.id && x.status === "ACTIVATION_PENDING"), JSON.stringify(summary));
  assert.equal(fake.writes().length, sent, "every object was already stored — nothing resent");
  assertOneHierarchy(fake, "read-back missing, sweep resume");
});

check("ambiguity stops for a human: two tagged campaigns, or a tagged creative with another image/URL — nothing new is created", async () => {
  {
    const fake = new FakeMetaAds();
    const f = await toMetaQueued(fake);
    fake.seedCampaign(`old copy [${f.dep.executionMarker}]`);
    fake.seedCampaign(`manual copy [${f.dep.executionMarker}]`);
    const r = await runDeployment(f.dep.id, opts(fake, "w-amb"));
    assert.equal(r.status, "FAILED_FINAL");
    assert.equal(r.error?.code, "RECONCILIATION_AMBIGUOUS");
    assert.equal(fake.writes().length, 0);
  }
  {
    const fake = new FakeMetaAds();
    const f = await toMetaQueued(fake);
    const stranger = fake.seedCreative(`someone else [${f.dep.executionMarker}:CR01]`, { imageHash: "0".repeat(32), link: "https://bandhantak.com/elsewhere", pageId: PAGE });
    const r = await runDeployment(f.dep.id, opts(fake, "w-amb2"));
    assert.equal(r.status, "FAILED_FINAL");
    assert.equal(r.error?.code, "RECONCILIATION_AMBIGUOUS");
    assert.ok((r.error?.fix ?? "").includes(stranger));
    assert.equal(fake.count("createAdCreative"), 0);
    assert.equal(fake.count("createAdPaused"), 0);
    assert.equal(await pending(f.task.id, "ACTIVATE_CAMPAIGNS"), null);
    assert.ok([...fake.campaigns.values()].every((c) => c.status === "PAUSED"));
  }
});

// ============================================================
// 4. Activation — children first, campaign last, rollback
// ============================================================

check("activation: ads → ad sets → campaign LAST, campaign PAUSED during every child write; LIVE = activated, 'delivering' only on Meta's word", async () => {
  const fake = new FakeMetaAds();
  const f = await toMetaActivationPending(fake);
  const campaignId = refsOk(f.dep).campaignId!;
  const campaignDuringChildWrites: string[] = [];
  const setAd = fake.setAdStatus.bind(fake);
  const setAdSet = fake.setAdSetStatus.bind(fake);
  fake.setAdStatus = async (id, status) => {
    campaignDuringChildWrites.push(fake.campaigns.get(campaignId)!.status);
    return setAd(id, status);
  };
  fake.setAdSetStatus = async (id, status) => {
    campaignDuringChildWrites.push(fake.campaigns.get(campaignId)!.status);
    return setAdSet(id, status);
  };
  const createWrites = fake.writes().length;
  const decided = await approve(f.activateCard.id);
  assert.equal(decided.ok && decided.deploymentStatus, "ACTIVATION_QUEUED");
  assert.equal(fake.writes().length, createWrites, "the decision itself touches no provider");
  const run = await runDeployment(f.dep.id, opts(fake, "w-act"));
  assert.equal(run.status, "LIVE", run.message);

  const acts = fake.writes().slice(createWrites);
  assert.deepEqual(acts.map((w) => w.method), ["setAdStatus", "setAdStatus", "setAdSetStatus", "setAdSetStatus", "setCampaignStatus"]);
  assert.ok(acts.every((w) => (w.args as { status: string }).status === "ACTIVE"));
  assert.deepEqual(campaignDuringChildWrites, ["PAUSED", "PAUSED", "PAUSED", "PAUSED"]);
  note(`activation order — ${acts.map((w) => w.method).join(" → ")} · campaign status during each child write: ${campaignDuringChildWrites.join(", ")}`);

  const dep = await metaDep(f.task.id);
  assert.equal(dep.status, "LIVE");
  assert.ok(dep.activatedAt);
  assert.equal(dep.externalStatus, "ACTIVE");
  assert.equal(dep.activateApproval?.status, "EXECUTED");
  const delivery = deliveryOf(dep)!;
  assert.equal(delivery.configuredStatus, "ACTIVE");
  assert.match(delivery.deliveryStatus ?? "", /PENDING_REVIEW/);
  assert.equal(deliveryLabel("META", delivery).delivering, false, "in review is not delivering");
  const row = (await listDeploymentRows(f.task.id)).find((x) => x.platform === "META")!;
  assert.equal(row.statusLabel, "Activated — spend may occur");
  assert.ok(row.steps.every((s) => s.state === "done"));
  assert.equal((await prisma.marketingTask.findUnique({ where: { id: f.task.id } }))?.status, "SCHEDULED_LIVE");

  const again = await approve(f.activateCard.id);
  assert.equal(again.ok && again.deploymentStatus, "LIVE", "double click echoes, never re-activates");
  fake.reviewState = "ACTIVE";
  const s = await syncDeployment(dep.id, opts(fake, "s-live"));
  assert.equal(s.status, "LIVE");
  assert.equal(deliveryLabel("META", deliveryOf(await metaDep(f.task.id))).delivering, true);
  assert.equal(fake.count("setCampaignStatus"), 1);
  assert.equal(fake.writes().length, createWrites + 5, "sync never writes");
});

check("a child activation failure leaves the campaign PAUSED (PARTIAL); retry continues from the checkpoint, campaign still last and written once", async () => {
  const fake = new FakeMetaAds();
  const f = await toMetaActivationPending(fake);
  await approve(f.activateCard.id);
  fake.failures.push({ method: "setAdSetStatus", nth: 1, apply: false, error: metaValidationError("Ad set abhi activate nahi ho sakta") });
  const createWrites = fake.writes().length;
  const first = await runDeployment(f.dep.id, opts(fake, "w-part"));
  assert.equal(first.status, "PARTIAL", first.message);
  assert.equal(fake.count("setCampaignStatus"), 0);
  assert.ok([...fake.campaigns.values()].every((c) => c.status === "PAUSED"), "spend cannot start");
  assert.ok((await listDeploymentRows(f.task.id)).find((x) => x.platform === "META")!.availableActions.includes("RETRY"));
  const rt = await retryDeployment(f.dep.id, ACTOR, opts(fake, "w-part2"));
  assert.equal(rt.ok && rt.status, "LIVE", JSON.stringify(rt));
  assert.deepEqual(fake.writes().slice(createWrites).map((w) => w.method), ["setAdStatus", "setAdStatus", "setAdSetStatus", "setAdSetStatus", "setAdSetStatus", "setCampaignStatus"]);
  assert.equal(fake.count("setCampaignStatus"), 1);
});

check("campaign activation timeout: not applied → Sync reads PAUSED → safe retry; applied → Sync reads ACTIVE → LIVE with no second write", async () => {
  {
    const fake = new FakeMetaAds();
    const f = await toMetaActivationPending(fake);
    await approve(f.activateCard.id);
    fake.failures.push({ method: "setCampaignStatus", apply: false, error: lost() });
    const r = await runDeployment(f.dep.id, opts(fake, "w-ct"));
    assert.equal(r.status, "UNKNOWN_OUTCOME", r.message);
    const blind = await retryDeployment(f.dep.id, ACTOR, opts(fake, "w-ct-blind"));
    assert.equal(!blind.ok && blind.error, "NOT_RETRYABLE");
    const s = await syncDeployment(f.dep.id, opts(fake, "s-ct"));
    assert.equal(s.status, "FAILED_RETRYABLE", s.message);
    const rt = await retryDeployment(f.dep.id, ACTOR, opts(fake, "w-ct2"));
    assert.equal(rt.ok && rt.status, "LIVE", JSON.stringify(rt));
    assert.equal(fake.count("setCampaignStatus"), 2, "the first never applied");
  }
  {
    const fake = new FakeMetaAds();
    const f = await toMetaActivationPending(fake);
    await approve(f.activateCard.id);
    fake.failures.push({ method: "setCampaignStatus", apply: true, error: lost() });
    const r = await runDeployment(f.dep.id, opts(fake, "w-ca"));
    assert.equal(r.status, "UNKNOWN_OUTCOME");
    const s = await syncDeployment(f.dep.id, opts(fake, "s-ca"));
    assert.equal(s.status, "LIVE", s.message);
    assert.equal(fake.count("setCampaignStatus"), 1, "never a second activation write");
  }
});

check("unsafe read-back after the campaign went ACTIVE → the approved rollback pauses it, verified; after the fix a fresh activation card", async () => {
  const fake = new FakeMetaAds();
  const f = await toMetaActivationPending(fake);
  await approve(f.activateCard.id);
  const refs = refsOk(f.dep);
  const as02 = refs.adSets.AS02.id;
  fake.afterCampaignStatus = (_id, status) => {
    if (status === "ACTIVE") fake.adSets.get(as02)!.body.daily_budget = "90000";
  };
  const run = await runDeployment(f.dep.id, opts(fake, "w-rollback"));
  assert.equal(run.status, "FAILED_FINAL", run.message);
  assert.equal(run.error?.code, "READBACK_MISMATCH");
  assert.match(run.message, /rollback verified/);
  const campaignWrites = fake.writes().filter((w) => w.method === "setCampaignStatus").map((w) => (w.args as { status: string }).status);
  assert.deepEqual(campaignWrites, ["ACTIVE", "PAUSED"]);
  assert.equal(fake.campaigns.get(refs.campaignId!)!.status, "PAUSED");
  const dep = await metaDep(f.task.id);
  const after = refsOk(dep);
  assert.ok(after.activation?.rolledBackAt);
  assert.match(after.activation?.rollbackReason ?? "", /daily_budget/);
  assert.equal(dep.activateApproval?.status, "FAILED");
  note(`rollback — campaign writes ${campaignWrites.join(" → ")} · campaign now ${fake.campaigns.get(refs.campaignId!)!.status}`);

  fake.afterCampaignStatus = null;
  fake.adSets.get(as02)!.body.daily_budget = "10000";
  const s = await syncDeployment(dep.id, opts(fake, "s-rb"));
  assert.equal(s.status, "PAUSED_READY", s.message);
  const req = await requestActivation(dep.id, ACTOR, opts(fake, "s-req"));
  assert.equal(req.ok && req.status, "ACTIVATION_PENDING", JSON.stringify(req));
  assert.notEqual((await pending(f.task.id, "ACTIVATE_CAMPAIGNS"))?.id, f.activateCard.id);
});

check("activation re-checks media: an image rejected after PAUSED_READY blocks activation with zero status writes", async () => {
  const fake = new FakeMetaAds();
  const f = await toMetaActivationPending(fake);
  await reviewCreativeMedia({ mediaId: f.media["static-2"], taskId: f.task.id, decision: "REJECT", note: "logo galat", actorId: ACTOR.id, actorRole: ACTOR.role });
  await approve(f.activateCard.id);
  const sent = fake.writes().length;
  const r = await runDeployment(f.dep.id, opts(fake, "w-media"));
  assert.equal(r.status, "BLOCKED_CREATIVE", r.message);
  assert.equal(r.error?.code, "CREATIVE_MISSING");
  assert.equal(fake.writes().length, sent);
  assert.ok([...fake.campaigns.values()].every((c) => c.status === "PAUSED"));
});

// ============================================================
// 5. Isolation, recovery, routes
// ============================================================

check("Google and Meta stay independent: a Meta failure leaves the Google row untouched, and each worker talks only to its own provider", async () => {
  await installGoogleConnection();
  const googleFake = new FakeGoogleAds();
  const metaFake = new FakeMetaAds();
  const f = await makeMetaTask({ withGoogle: true });
  await checkMetaAdReadiness({ provider: metaFake, now: now() });
  await prepareDeploymentsForTask({ taskId: f.task.id, actor: ACTOR, now: now() });
  const cards = await prisma.marketingApproval.findMany({ where: { taskId: f.task.id, action: "CREATE_PAUSED_CAMPAIGNS", status: "PENDING" } });
  const platformOf = (c: (typeof cards)[number]) => (c.payload as { platform?: string }).platform;
  assert.deepEqual(cards.map(platformOf).sort(), ["GOOGLE_SEARCH", "META"], "one card per platform");
  for (const c of cards) assert.equal((await approve(c.id)).ok, true);
  const google0 = (await prisma.campaignDeployment.findFirst({ where: { taskId: f.task.id, platform: "GOOGLE_SEARCH" } }))!;
  const meta0 = await metaDep(f.task.id);

  metaFake.failures.push({ method: "createCampaignPaused", apply: false, error: metaValidationError("Invalid parameter: name too long") });
  const m = await runDeployment(meta0.id, { metaProvider: metaFake, provider: googleFake, workerId: "w-iso-m", now });
  assert.equal(m.status, "FAILED_FINAL", m.message);
  assert.equal(m.error?.code, "PROVIDER_VALIDATION_FAILED");
  const google1 = (await prisma.campaignDeployment.findUnique({ where: { id: google0.id } }))!;
  assert.equal(google1.status, "QUEUED");
  assert.equal(google1.updatedAt.getTime(), google0.updatedAt.getTime(), "the Google row was not written");
  assert.equal(googleFake.calls.length, 0, "the Meta run never called Google");

  const metaCalls = metaFake.calls.length;
  const g = await runDeployment(google0.id, { provider: googleFake, metaProvider: metaFake, workerId: "w-iso-g", now });
  assert.equal(g.status, "ACTIVATION_PENDING", g.message);
  assert.equal(metaFake.calls.length, metaCalls, "the Google run never called Meta");
  assert.equal((await metaDep(f.task.id)).status, "FAILED_FINAL");
  const rows = await listDeploymentRows(f.task.id);
  assert.deepEqual(rows.map((r) => `${r.platform}:${r.status}`).sort(), ["GOOGLE_SEARCH:ACTIVATION_PENDING", "META:FAILED_FINAL"]);
  const task = await prisma.marketingTask.findUnique({ where: { id: f.task.id } });
  assert.match(task?.currentStep ?? "", /Meta: Failed/, "the queue line names both platforms");
});

check("recovery sweep: a Meta create worker that died mid-write is reconciled, never resent; a part-way activation is never resumed by the sweep", async () => {
  {
    const fake = new FakeMetaAds();
    const f = await toMetaQueued(fake);
    const stale = new Date(now().getTime() - 11 * 60_000);
    await prisma.campaignDeployment.update({ where: { id: f.dep.id }, data: { status: "CREATING", lockedAt: stale, lockedBy: "dead-worker", lastWriteAttemptAt: stale, checkpoint: "campaign:writing" } });
    const summary = await recoverDeployments({ metaProvider: fake, workerId: "cron", now, limit: 10 });
    assert.ok(summary.staleLocksReleased >= 1);
    assert.ok(summary.reconciled.some((x) => x.id === f.dep.id), JSON.stringify(summary));
    const dep = await metaDep(f.task.id);
    assert.equal(dep.status, "FAILED_RETRYABLE", `${dep.lastErrorCode}: ${dep.lastErrorMessage}`);
    assert.equal(fake.writes().length, 0, "the sweep resent nothing");
  }
  {
    const fake = new FakeMetaAds();
    const f = await toMetaActivationPending(fake);
    await approve(f.activateCard.id);
    fake.failures.push({ method: "setAdSetStatus", apply: false, error: new ConnectorError("RATE_LIMIT", "meta-ads: 429", 429) });
    const r = await runDeployment(f.dep.id, opts(fake, "w-sweep-act"));
    assert.equal(r.status, "PARTIAL", r.message);
    const sent = fake.writes().length;
    await recoverDeployments({ metaProvider: fake, workerId: "cron", now, limit: 10 });
    assert.equal((await metaDep(f.task.id)).status, "PARTIAL", "activation resumes only by an admin's click");
    assert.equal(fake.writes().length, sent);
    assert.equal(fake.count("setCampaignStatus"), 0);
  }
});

check("routes: cron refuses without CRON_SECRET and with a wrong bearer; every Meta/media admin route checks the admin before reading the body", async () => {
  const { POST } = await import("../app/api/cron/marketing-executions/route");
  const env = process.env as Record<string, string | undefined>;
  const saved = env.CRON_SECRET;
  try {
    delete env.CRON_SECRET;
    assert.equal((await POST(new Request("http://localhost/api/cron/marketing-executions", { method: "POST" }))).status, 503);
    env.CRON_SECRET = "mkt2b-check-cron";
    assert.equal((await POST(new Request("http://localhost/api/cron/marketing-executions", { method: "POST", headers: { authorization: "Bearer wrong" } }))).status, 401);
  } finally {
    if (saved === undefined) delete env.CRON_SECRET;
    else env.CRON_SECRET = saved;
  }
  for (const file of [
    "app/api/admin/marketing-ai/tasks/[id]/creatives/[creativeId]/media/route.ts",
    "app/api/admin/marketing-ai/tasks/[id]/media/[mediaId]/[decision]/route.ts",
    "app/api/admin/marketing-ai/connections/[provider]/readiness/route.ts",
    "app/api/admin/marketing-ai/deployments/[id]/[action]/route.ts",
    "app/api/admin/marketing-ai/approvals/[id]/route.ts",
  ]) {
    const src = await readFile(path.join(process.cwd(), file), "utf8");
    const auth = src.indexOf("await requireAdmin()");
    assert.ok(auth > 0, `${file} calls requireAdmin()`);
    for (const read of ["req.formData(", "req.text(", "req.json(", "parseJsonBody("]) {
      const at = src.indexOf(read);
      if (at >= 0) assert.ok(at > auth, `${file}: ${read} only after requireAdmin()`);
    }
  }
});

check("isolation held: no check reached the network", async () => {
  assert.deepEqual(blockedNetworkCalls, []);
});

// ============================================================
// Runner
// ============================================================

(async () => {
  console.log(`\nMKT-2B Meta execution check ${TAG}`);
  console.log(`  committed gates: EXECUTABLE_PLATFORMS has META=${COMMITTED.platform} · meta.campaign.create_paused executable=${COMMITTED.create} · meta.campaign.activate executable=${COMMITTED.activate}`);
  await snapshotConnections();
  try {
    for (const { label, fn } of queue) {
      checks += 1;
      await installMetaConnections();
      setMetaGates({ create: true, activate: true });
      try {
        await fn();
        console.log(`  ok   ${label}`);
      } catch (err) {
        failures += 1;
        console.log(`  FAIL ${label}`);
        console.log(`       ${err instanceof Error ? (err.stack ?? err.message).split("\n").slice(0, 5).join("\n       ") : String(err)}`);
      } finally {
        restoreCommittedGates();
        await cleanupCreated();
      }
    }
  } finally {
    restoreCommittedGates();
    await cleanupCreated();
    await restoreConnections();
    await prisma.adminAuditLog.deleteMany({ where: { actorId: ACTOR.id } });
    await prisma.$disconnect();
  }
  if (evidence.length) {
    console.log("\nEvidence — the fake Meta account after each case");
    for (const line of evidence) console.log(`  · ${line}`);
  }
  console.log(`\n${checks - failures}/${checks} passed`);
  process.exit(failures ? 1 : 0);
})();
