import "./_env";
import assert from "node:assert/strict";
import { MarketingPlanSchema, toModelJsonSchema, type MarketingPlan } from "../lib/contracts/marketingPlanSchema";
import { EXECUTABLE_APPROVAL_ACTIONS, MARKETING_PROVIDER_META, MARKETING_PROVIDERS } from "../lib/contracts/marketingAi";
import { MARKETING_TOOLS, NEVER_TOOL_PATTERNS, executableWriteTool, newToolRun, recordDraftTool, runReadTool, toolByName } from "../lib/marketing/tools/registry";
import { ACTIVE_DEPLOYMENT_STATUSES, DEPLOYMENT_STATUSES, DEPLOYMENT_STATUS_META, EXECUTABLE_PLATFORMS, approvalButtonLabel } from "../lib/contracts/marketingExecution";
import { ActivatePayloadSchema, CreatePausedPayloadSchema, parseWriteApprovalPayload } from "../lib/contracts/marketingExecutionPayloads";
import { canonicalJson, specHashOf } from "../lib/services/marketing/execution/hashing";
import { executionMarkerOf, idempotencyKeyOf, nameCarriesMarker, providerCampaignName } from "../lib/services/marketing/execution/idempotency";
import { ExecutionError, extractGoogleErrors, normaliseProviderError } from "../lib/services/marketing/execution/executionErrors";
import { refsFromMutateResponse, refsFromTree, verifyTree } from "../lib/services/marketing/execution/reconcile";
import { LANGUAGE_CONSTANTS, addDays, calendarDateIn, mapGoogleSearchPackage, microsToPaise, paiseToMicros, resolveLanguages } from "../lib/marketing/mappers/googleSearchMapper";
import { buildFinalUrl, checkLandingUrl } from "../lib/marketing/mappers/landingUrl";
import { ConnectorError } from "../lib/marketing/connectors/http";
import type { CampaignTree, MutateResponse } from "../lib/marketing/providers/googleAdsProvider";
import { applyGuardrails, isProtectedTargeting, objectionTo } from "../lib/services/marketing/packageGuardrails";
import { assertNoPii, isKnownPublicPath, publicPageFacts } from "../lib/services/marketing/contextBuilder";
import { buildApprovalPreview, hashPayload } from "../lib/services/marketing/taskService";
import { normaliseCustomerId } from "../lib/marketing/connectors/googleAds";
import { normaliseAdAccountId } from "../lib/marketing/connectors/metaAds";
import { buildConnectState, verifyConnectState } from "../lib/marketing/connectors/googleOAuth";
import { microsToRupees, windowLabel } from "../lib/marketing/connectors/http";
import type { MarketingContext } from "../lib/services/marketing/contextBuilder";
import { fixturePlan } from "./_stubs/marketingFixtures";

/**
 * Growth Saathi (Phase MKT-1), pinned.
 *
 * Run: `npx tsx scripts/marketing-ai-check.ts`
 *
 * No database query, no network, no model. Everything here is the part of
 * the feature that must hold *regardless* of what the model says — the tool
 * boundary, the guardrails that turn a proposal into something the product
 * can put its name on, the PII guard in front of the prompt, and the
 * approval's integrity hash. The model is the one component this file
 * cannot pin, which is exactly why every one of these exists.
 */

let failures = 0;
let checks = 0;
const queue: Array<() => Promise<void>> = [];

function check(label: string, fn: () => void | Promise<void>) {
  queue.push(async () => {
    checks += 1;
    try {
      await fn();
      console.log(`  ok   ${label}`);
    } catch (err) {
      failures += 1;
      console.log(`  FAIL ${label}`);
      console.log(`       ${err instanceof Error ? err.message : String(err)}`);
    }
  });
}

// ============================================================
// 1. Tool registry — the boundary (§4)
// ============================================================

console.log("\nTool registry");

check("no registered tool matches a never-direct pattern", () => {
  for (const tool of MARKETING_TOOLS) {
    for (const re of NEVER_TOOL_PATTERNS) assert.ok(!re.test(tool.name), `${tool.name} matches ${re}`);
  }
});

check("every external write tool ships in MKT-2 or later", () => {
  for (const tool of MARKETING_TOOLS.filter((t) => t.tier === "EXTERNAL_WRITE_APPROVAL")) {
    assert.notEqual(tool.availableFrom, "MKT-1", tool.name);
  }
});

check("the doc's read/create/write tool names are all registered", () => {
  for (const name of [
    "bandhantak.growth.read",
    "google.keyword_ideas.read",
    "google.search_console.read",
    "google.analytics.read",
    "google.ads.performance.read",
    "meta.ads.performance.read",
    "instagram.media.performance.read",
    "connections.status.read",
    "campaign.package.create",
    "reel.brief.create",
    "video.template_render",
    "google.campaign.create_paused",
    "meta.campaign.activate",
    "instagram.reel.publish",
    "campaign.budget.change",
  ]) {
    assert.ok(toolByName(name), name);
  }
});

check("runReadTool refuses an unknown name and a write-tier name before calling anything", async () => {
  const run = newToolRun();
  let called = false;
  await assert.rejects(runReadTool(run, "sql.raw", async () => (called = true)), /registry me nahi/);
  await assert.rejects(runReadTool(run, "google.campaign.activate", async () => (called = true)), /read tool nahi/);
  assert.equal(called, false);
  assert.equal(run.records.length, 0);
});

check("runReadTool records success and failure with the tool name and tier", async () => {
  const run = newToolRun();
  const ok = await runReadTool(run, "bandhantak.growth.read", async () => ({ n: 3 }), (v) => v.n);
  const bad = await runReadTool(run, "google.analytics.read", async () => {
    throw new Error("boom");
  });
  assert.equal(ok.ok, true);
  assert.equal(bad.ok, false);
  assert.deepEqual(
    run.records.map((r) => [r.tool, r.tier, r.ok, r.rows, r.error]),
    [
      ["bandhantak.growth.read", "READ_AUTO", true, 3, null],
      ["google.analytics.read", "READ_AUTO", false, null, "boom"],
    ],
  );
  recordDraftTool(run, "reel.brief.create", 2);
  assert.equal(run.records[2].tier, "CREATE_DRAFT");
  assert.throws(() => recordDraftTool(run, "google.campaign.activate", 1));
});

check("executable set = package approval + the two spend boundaries on Google Search and Meta, and nothing else", () => {
  assert.deepEqual([...EXECUTABLE_APPROVAL_ACTIONS].sort(), ["ACTIVATE_CAMPAIGNS", "APPROVE_PACKAGE", "CREATE_PAUSED_CAMPAIGNS"]);
  assert.deepEqual([...EXECUTABLE_PLATFORMS].sort(), ["GOOGLE_SEARCH", "META"]);
});

check("write gate: each platform's create/activate maps to its own tool; every other write refused (doc 13 §18, doc 14 §17)", () => {
  assert.equal(executableWriteTool("CREATE_PAUSED_CAMPAIGNS", "GOOGLE_SEARCH")?.name, "google.campaign.create_paused");
  assert.equal(executableWriteTool("ACTIVATE_CAMPAIGNS", "GOOGLE_SEARCH")?.name, "google.campaign.activate");
  assert.equal(executableWriteTool("CREATE_PAUSED_CAMPAIGNS", "META")?.name, "meta.campaign.create_paused");
  assert.equal(executableWriteTool("ACTIVATE_CAMPAIGNS", "META")?.name, "meta.campaign.activate");
  assert.equal(executableWriteTool("CREATE_PAUSED_CAMPAIGNS", null), null);
  for (const action of ["PUBLISH_REEL", "PUBLISH_FACEBOOK_POST", "CHANGE_BUDGET", "PAUSE_CAMPAIGN", "PUBLISH_WEBSITE_CONTENT"] as const) {
    assert.equal(executableWriteTool(action, null), null, action);
    assert.equal(executableWriteTool(action, "GOOGLE_SEARCH"), null, action);
    assert.equal(executableWriteTool(action, "META"), null, action);
  }
  const executable = MARKETING_TOOLS.filter((t) => t.write?.executable).map((t) => t.name).sort();
  assert.deepEqual(executable, ["google.campaign.activate", "google.campaign.create_paused", "meta.campaign.activate", "meta.campaign.create_paused"]);
  assert.equal(toolByName("website.content.publish")?.availableFrom, "MKT-3");
  for (const t of MARKETING_TOOLS.filter((t) => t.tier === "EXTERNAL_WRITE_APPROVAL")) assert.ok(t.write, `${t.name} needs write metadata`);
});

check("every marketing provider has minimum scopes and an auth kind", () => {
  for (const p of MARKETING_PROVIDERS) {
    const meta = MARKETING_PROVIDER_META[p];
    assert.ok(meta.label);
    if (meta.auth === "google-oauth") assert.equal(meta.scopes.length, 1, `${p} should ask for exactly its own scope`);
  }
  assert.equal(MARKETING_PROVIDER_META.VIDEO_PROVIDER.auth, "not-available");
});

// ============================================================
// 2. The decision contract (§14)
// ============================================================

console.log("\nDecision contract");

check("model JSON schema is a clean object schema", () => {
  const schema = toModelJsonSchema();
  assert.equal(schema.type, "object");
  const json = JSON.stringify(schema);
  assert.ok(!json.includes('"$schema"'));
  assert.ok(!json.includes('"minimum"'));
  assert.ok(!json.includes('"maximum"'));
  const required = schema.required as string[];
  for (const k of ["clarifyingQuestion", "diagnosis", "evidence", "goal", "recommendedPlan", "googleSearch", "meta", "creative", "landing", "approvalsNeeded", "successMetric", "nextReviewAt"]) {
    assert.ok(required.includes(k), k);
  }
  assert.equal(schema.additionalProperties, false);
});

check("a full fixture plan parses; a plan missing the contract fields does not", () => {
  assert.equal(MarketingPlanSchema.safeParse(fixturePlan()).success, true);
  assert.equal(MarketingPlanSchema.safeParse({ diagnosis: "x" }).success, false);
});

// ============================================================
// 3. Guardrails — code decides (D-32)
// ============================================================

console.log("\nGuardrails");

const LIVE_PRICES = [999, 1999, 149];
const AVAILABLE = new Set<MarketingPlan["evidence"][number]["source"]>(["bandhantak.growth", "bandhantak.plans", "google.keyword_ideas", "google.search_console", "admin.command"]);

function guard(plan: MarketingPlan, overrides: Partial<Parameters<typeof applyGuardrails>[0]> = {}) {
  return applyGuardrails({
    plan,
    goalInput: null,
    requestText: "Jaipur me ₹500/day me campaign banao",
    availableSources: AVAILABLE,
    quotablePricesRupees: LIVE_PRICES,
    isKnownPublicPath,
    ...overrides,
  });
}

check("admin cap clamps every budget the model wrote above it", () => {
  const r = guard(fixturePlan({ dailyRupees: 800 }), { goalInput: { dailyBudgetRupees: 500, totalBudgetRupees: 15000 } });
  assert.equal(r.dailyCapRupees, 500);
  assert.equal(r.plan.recommendedPlan.budget.dailyRupees, 500);
  assert.ok(r.plan.googleSearch!.dailyBudgetRupees + r.plan.meta!.dailyBudgetRupees <= 500.01);
  assert.ok(r.flags.some((f) => f.kind === "BUDGET_CLAMPED"));
  assert.equal(r.budgetMissing, false);
});

check("a cap the admin never stated is cleared, one stated in the sentence is kept", () => {
  const invented = fixturePlan();
  invented.goal.dailyBudgetRupees = 700;
  const r1 = guard(invented, { requestText: "Jaipur campaign banao" });
  assert.equal(r1.plan.goal.dailyBudgetRupees, null);
  assert.ok(r1.flags.some((f) => f.path === "goal.dailyBudgetRupees"));

  const stated = fixturePlan();
  stated.goal.dailyBudgetRupees = 500;
  const r2 = guard(stated, { requestText: "₹500/day me campaign banao" });
  assert.equal(r2.plan.goal.dailyBudgetRupees, 500);
  assert.equal(r2.dailyCapRupees, 500);
});

check("a carried cap fills a silent revision; a cap stated in the revision beats it", () => {
  const silent = fixturePlan({ dailyRupees: 800 });
  silent.goal.dailyBudgetRupees = null;
  const r1 = guard(silent, { requestText: "Reels ka concept badlo", carried: { dailyBudgetRupees: 500, totalBudgetRupees: 15000, channels: ["GOOGLE_SEARCH"] } });
  assert.equal(r1.dailyCapRupees, 500);
  assert.equal(r1.plan.recommendedPlan.budget.dailyRupees, 500);
  assert.equal(r1.budgetMissing, false);
  // The model already had channels; carried channels must not overwrite them.
  assert.deepEqual(r1.plan.goal.channels, ["GOOGLE_SEARCH", "INSTAGRAM_REELS"]);

  const restated = fixturePlan({ dailyRupees: 300 });
  restated.goal.dailyBudgetRupees = 300;
  const r2 = guard(restated, { requestText: "ab ₹300/day rakho", carried: { dailyBudgetRupees: 500 } });
  assert.equal(r2.dailyCapRupees, 300);
});

check("a target the model invented is cleared; the admin's form target wins", () => {
  const p = fixturePlan();
  p.goal.targetFromAdmin = 40;
  const r1 = guard(p, { requestText: "campaign banao" });
  assert.equal(r1.plan.goal.targetFromAdmin, null);
  const r2 = guard(p, { goalInput: { target: 25 } });
  assert.equal(r2.plan.goal.targetFromAdmin, 25);
});

check("packages without any cap are readable but flagged as not approvable", () => {
  const r = guard(fixturePlan(), { requestText: "campaign banao" });
  assert.equal(r.budgetMissing, true);
  assert.ok(r.flags.some((f) => f.kind === "PACKAGE_INCOMPLETE" && f.path === "goal.dailyBudgetRupees"));
});

check("guarantees, fake urgency, pressure, invented statistics and unknown prices leave the copy", () => {
  const p = fixturePlan();
  p.googleSearch!.adGroups[0].headlines.push("Shaadi 100% guaranteed", "Sirf aaj register karo", "5 lakh members", "₹499 me Premium", "₹999 me Premium");
  p.meta!.ads[0].primaryText = "Rishta pakka hoga. Verified profiles, family ke saath. Umar nikal rahi hai.";
  p.creative!.videos[0].script = "Dahej free rishta chahiye? BandhanTak par verified profiles milti hain.";
  const r = guard(p, { goalInput: { dailyBudgetRupees: 500 } });
  const headlines = r.plan.googleSearch!.adGroups[0].headlines;
  assert.ok(!headlines.some((h) => /guaranteed|sirf aaj|lakh|499/i.test(h)), headlines.join(" | "));
  assert.ok(headlines.includes("₹999 me Premium"));
  assert.equal(r.plan.meta!.ads[0].primaryText, "Verified profiles, family ke saath.");
  assert.equal(r.plan.creative!.videos[0].script, "BandhanTak par verified profiles milti hain.");
  assert.ok(r.flags.some((f) => f.kind === "PRICE_UNVERIFIED"));
  assert.ok(r.flags.filter((f) => f.kind === "CLAIM_REMOVED").length >= 5);
});

check("Google character limits are enforced as drops, not truncation", () => {
  const p = fixturePlan();
  p.googleSearch!.adGroups[0].headlines.push("Ye headline tees characters se lambi hai bilkul");
  p.googleSearch!.adGroups[0].descriptions.push("x".repeat(91));
  const r = guard(p, { goalInput: { dailyBudgetRupees: 500 } });
  assert.ok(r.plan.googleSearch!.adGroups[0].headlines.every((h) => h.length <= 30));
  assert.ok(r.plan.googleSearch!.adGroups[0].descriptions.every((d) => d.length <= 90));
  assert.equal(r.flags.filter((f) => f.kind === "LENGTH_DROPPED").length, 2);
});

check("religion/caste/community never survive as targeting", () => {
  const p = fixturePlan();
  p.meta!.audience.interests = ["Hindu wedding", "Shaadi planning", "Brahmin matrimony"];
  p.meta!.audience.description = "Jaipur ke Rajput parivaar. Shaadi ki tayyari karne wale 24-32 saal ke log.";
  p.googleSearch!.adGroups[0].keywords.push({ text: "jain matrimony jaipur", matchType: "PHRASE" });
  const r = guard(p, { goalInput: { dailyBudgetRupees: 500 } });
  assert.deepEqual(r.plan.meta!.audience.interests, ["Shaadi planning"]);
  assert.equal(r.plan.meta!.audience.description, "Shaadi ki tayyari karne wale 24-32 saal ke log.");
  assert.ok(!r.plan.googleSearch!.adGroups[0].keywords.some((k) => /jain/i.test(k.text)));
  assert.equal(r.flags.filter((f) => f.kind === "TARGETING_REMOVED").length, 3);
  assert.equal(isProtectedTargeting("Scheduled Caste youth"), true);
  assert.equal(isProtectedTargeting("Wedding planning"), false);
});

check("evidence and topics citing a source that was not read are dropped/rejected", () => {
  const p = fixturePlan();
  p.evidence.push({ claim: "Meta CPC ₹4", source: "meta.ads", window: "last 30 days", geography: "India", value: "₹4" });
  p.topics.push({ ...p.topics[0], topic: "Reels trend", source: "instagram.media", rejected: false, rejectionReason: null });
  const r = guard(p, { goalInput: { dailyBudgetRupees: 500 } });
  assert.ok(!r.plan.evidence.some((e) => e.source === "meta.ads"));
  assert.equal(r.plan.topics.find((t) => t.topic === "Reels trend")!.rejected, true);
  assert.ok(r.flags.some((f) => f.kind === "EVIDENCE_DROPPED"));
  assert.ok(r.flags.some((f) => f.kind === "TOPIC_REJECTED"));
});

check("'trending' in copy needs a Search Console comparison behind it", () => {
  assert.equal(objectionTo("Ye topic abhi trending hai", [], false), "trend claim without comparison evidence");
  assert.equal(objectionTo("Ye topic abhi trending hai", [], true), null);
});

check("an unknown landing path falls back to /register with a flag; admin channel list drops a package", () => {
  const p = fixturePlan();
  p.googleSearch!.landingPath = "/jaipur-special";
  const r = guard(p, { goalInput: { dailyBudgetRupees: 500, channels: ["INSTAGRAM_REELS"] } });
  assert.equal(r.plan.googleSearch, null);
  assert.ok(r.flags.some((f) => f.kind === "CHANNEL_DROPPED" && f.path === "googleSearch"));
  const p2 = fixturePlan();
  p2.meta!.landingPath = "/nowhere";
  const r2 = guard(p2, { goalInput: { dailyBudgetRupees: 500 } });
  assert.equal(r2.plan.meta!.landingPath, "/register");
  assert.ok(r2.flags.some((f) => f.kind === "LANDING_UNKNOWN"));
});

check("the model's raw plan is not mutated by the pass", () => {
  const p = fixturePlan({ dailyRupees: 800 });
  const before = JSON.stringify(p);
  guard(p, { goalInput: { dailyBudgetRupees: 500 } });
  assert.equal(JSON.stringify(p), before);
});

check("sentence verdicts", () => {
  assert.equal(objectionTo("Verified profiles, family ke saath."), null);
  assert.equal(objectionTo("Perfect match guaranteed"), "guarantee claim");
  assert.equal(objectionTo("3 log abhi dekh rahe hain"), "fake urgency");
  assert.equal(objectionTo("Log kya kahenge?"), "fear/shame/pressure");
  assert.equal(objectionTo("2 lakh+ profiles"), "unverified statistic");
  assert.equal(objectionTo("Premium ₹999/month", [999]), null);
  assert.equal(objectionTo("Premium Rs. 799", [999]), "price ₹799 is not a live price");
  // Absolutes the first live run actually produced, against a window with zero verifications.
  assert.equal(objectionTo("100% Photo Verified Matrimony"), "guarantee claim");
  assert.equal(objectionTo("Zero Fake Profiles. 100% Privacy Control."), "guarantee claim");
  assert.equal(objectionTo("No Fake Profiles in Jaipur Matrimony"), "guarantee claim");
  assert.equal(objectionTo("BandhanTak par har profile photo verified hoti hai."), "guarantee claim");
  assert.equal(objectionTo("Photo verified profiles aur private chat controls."), null);
  assert.equal(objectionTo("Private chat hamesha locked rahegi — family kabhi nahi dekh sakti."), null);
});

// ============================================================
// 4. PII guard in front of the prompt (§3.1, §11)
// ============================================================

console.log("\nPII guard");

check("a clean aggregate context passes; a phone, an email or a person-shaped key trips it", () => {
  assert.doesNotThrow(() => assertNoPii({ bandhantak: { growth: { data: { funnel: [{ step: "Register kiya", count: 120 }] } } }, google: { ads: { data: { customerId: "9876543210" } } } }));
  assert.throws(() => assertNoPii({ note: "call 9876543210" }), /phone-like/);
  assert.throws(() => assertNoPii({ note: "mail devesh@example.com" }), /email-like/);
  assert.throws(() => assertNoPii({ preview: [{ userName: "Neha" }] }), /forbidden key/);
  assert.throws(() => assertNoPii({ rows: [{ caste: "x" }] }), /forbidden key/);
});

check("public landing pages come from the route matrix and never include the admin login", () => {
  const paths = publicPageFacts().paths.map((p) => p.path);
  assert.ok(paths.includes("/register"));
  assert.ok(paths.includes("/bolo"));
  assert.ok(!paths.includes("/admin/login"));
  assert.equal(isKnownPublicPath("/pricing"), true);
  assert.equal(isKnownPublicPath("/pricing?utm_source=google"), true);
  assert.equal(isKnownPublicPath("/admin/login"), false);
  assert.equal(isKnownPublicPath("/user/dashboard"), false);
});

// ============================================================
// 5. Approval integrity (§10)
// ============================================================

console.log("\nApprovals");

check("payload hash is deterministic and changes with the payload", () => {
  const a = hashPayload({ draftIds: ["1", "2"], goalId: "g" });
  assert.equal(a, hashPayload({ draftIds: ["1", "2"], goalId: "g" }));
  assert.notEqual(a, hashPayload({ draftIds: ["1", "3"], goalId: "g" }));
  assert.equal(a.length, 64);
});

check("the approval card carries the cap, the destination and what happens now", () => {
  const plan = guard(fixturePlan(), { goalInput: { dailyBudgetRupees: 500, totalBudgetRupees: 15000 } }).plan;
  const preview = buildApprovalPreview(plan, fakeContext(), 500, 15000, []);
  assert.match(preview.dailyBudget, /cap ₹500/);
  assert.match(preview.totalBudget, /cap ₹15,000/);
  assert.match(preview.destination, /\/register/);
  assert.match(preview.whatHappensNow, /KUCH NAHI/);
  assert.match(preview.account, /not connected yet/);
  assert.equal(preview.conversionEvent, "verification_completed");
});

// ============================================================
// 6. Connector plumbing
// ============================================================

console.log("\nConnectors");

check("account id normalisation", () => {
  assert.equal(normaliseCustomerId("123-456-7890"), "1234567890");
  assert.equal(normaliseAdAccountId("act_123"), "act_123");
  assert.equal(normaliseAdAccountId(" 123 "), "act_123");
  assert.equal(normaliseAdAccountId(""), "");
});

check("OAuth state round-trips and rejects tampering with either half", () => {
  const { state, cookieValue } = buildConnectState("SEARCH_CONSOLE");
  assert.deepEqual(verifyConnectState(state, cookieValue), { ok: true, provider: "SEARCH_CONSOLE" });
  assert.equal(verifyConnectState(state.replace("SEARCH_CONSOLE", "GOOGLE_ADS"), cookieValue).ok, false);
  assert.equal(verifyConnectState(state, "deadbeef").ok, false);
  assert.equal(verifyConnectState("nonce.NOT_A_PROVIDER", cookieValue).ok, false);
});

check("money and windows", () => {
  assert.equal(microsToRupees("12500000"), 12.5);
  assert.equal(microsToRupees(null), 0);
  assert.equal(windowLabel(30, new Date("2026-09-12T10:00:00Z")), "last 30 days (2026-08-13 → 2026-09-12)");
});

// ============================================================
// 7. MKT-2 — execution layer, pure pins (doc 13 §20)
// ============================================================

console.log("\nMKT-2 mapper");

const GEO = [{ resourceName: "geoTargetConstants/1007751", name: "Jaipur" }];
const LANG = resolveLanguages("Hindi, English");
const FINAL_URL = buildFinalUrl({ origin: "https://bandhantak.com", landingPath: "/register", utm: fixturePlan().googleSearch!.utm });

function mapFixture(overrides: Partial<Parameters<typeof mapGoogleSearchPackage>[0]> = {}) {
  return mapGoogleSearchPackage({
    customerId: "123-456-7890",
    spec: fixturePlan().googleSearch!,
    providerCampaignName: providerCampaignName("BT · Jaipur · Verified Women · Search", "BT:abcdef1234"),
    dailyBudgetPaise: 30_000,
    startDate: "2026-09-12",
    endDate: "2026-10-11",
    geoTargets: GEO,
    languages: LANG,
    finalUrl: FINAL_URL,
    ...overrides,
  });
}

check("rupees → paise → micros is integer arithmetic both ways", () => {
  assert.equal(paiseToMicros(30_000), "300000000");
  assert.equal(paiseToMicros(1), "10000");
  assert.equal(microsToPaise("300000000"), 30_000);
  assert.equal(microsToPaise(12_345_678), 1234);
  assert.throws(() => paiseToMicros(12.5), /integer/);
});

check("one atomic request: budget → PAUSED campaign → criteria → ad groups → keywords → RSAs, temp ids wired", () => {
  const r = mapFixture();
  const ops = r.operations;
  assert.ok("campaignBudgetOperation" in ops[0]);
  assert.ok("campaignOperation" in ops[1]);
  const budget = (ops[0] as { campaignBudgetOperation: { create: { resourceName: string; amountMicros: string; explicitlyShared: boolean } } }).campaignBudgetOperation.create;
  const campaign = (ops[1] as unknown as { campaignOperation: { create: Record<string, unknown> } }).campaignOperation.create;
  assert.equal(budget.resourceName, "customers/1234567890/campaignBudgets/-1");
  assert.equal(budget.amountMicros, "300000000");
  assert.equal(budget.explicitlyShared, false);
  assert.equal(campaign.status, "PAUSED");
  assert.equal(campaign.advertisingChannelType, "SEARCH");
  assert.equal(campaign.campaignBudget, budget.resourceName);
  assert.equal(campaign.containsEuPoliticalAdvertising, "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING");
  assert.deepEqual(campaign.maximizeConversions, {});
  assert.equal((campaign.networkSettings as Record<string, unknown>).targetSearchNetwork, false);
  assert.equal(campaign.startDate, "2026-09-12");
  assert.equal(campaign.endDate, "2026-10-11");
  assert.ok(String(campaign.name).endsWith("[BT:abcdef1234]"));
  const kinds = ops.map((o) => Object.keys(o)[0]);
  assert.deepEqual(kinds.slice(0, 2), ["campaignBudgetOperation", "campaignOperation"]);
  assert.ok(kinds.indexOf("adGroupOperation") < kinds.indexOf("adGroupCriterionOperation"));
  assert.ok(kinds.indexOf("adGroupOperation") < kinds.indexOf("adGroupAdOperation"));
  const adGroup = ops.find((o) => "adGroupOperation" in o) as { adGroupOperation: { create: { resourceName: string; campaign: string; status: string } } };
  assert.equal(adGroup.adGroupOperation.create.campaign, "customers/1234567890/campaigns/-2");
  assert.equal(adGroup.adGroupOperation.create.status, "ENABLED");
  const keyword = ops.find((o) => "adGroupCriterionOperation" in o) as { adGroupCriterionOperation: { create: { adGroup: string; keyword: { text: string; matchType: string } } } };
  assert.equal(keyword.adGroupCriterionOperation.create.adGroup, adGroup.adGroupOperation.create.resourceName);
  const ad = ops.find((o) => "adGroupAdOperation" in o) as { adGroupAdOperation: { create: { ad: { finalUrls: string[]; responsiveSearchAd: { headlines: unknown[]; descriptions: unknown[] } } } } };
  assert.deepEqual(ad.adGroupAdOperation.create.ad.finalUrls, [FINAL_URL]);
  assert.equal(ad.adGroupAdOperation.create.ad.responsiveSearchAd.headlines.length, 3);
  assert.equal(ad.adGroupAdOperation.create.ad.responsiveSearchAd.descriptions.length, 2);
  assert.equal(r.summary.negatives, 3);
  const negative = ops.find((o) => "campaignCriterionOperation" in o && (o as { campaignCriterionOperation: { create: { negative?: boolean } } }).campaignCriterionOperation.create.negative) as { campaignCriterionOperation: { create: { keyword: { matchType: string } } } };
  assert.equal(negative.campaignCriterionOperation.create.keyword.matchType, "BROAD");
  assert.equal(r.summary.geoTargets, 1);
  assert.equal(r.summary.languages, 2);
  assert.equal(r.deferred.length, 2, "sitelinks and callouts are deferred by name, not dropped");
});

check("mapping is deterministic — validate-only and the real write are byte-identical", () => {
  assert.equal(JSON.stringify(mapFixture().operations), JSON.stringify(mapFixture().operations));
});

check("bidding allow-list: TARGET_CPA needs a CPA, MANUAL_CPC is refused, nothing is downgraded", () => {
  const cpa = fixturePlan().googleSearch!;
  cpa.biddingStrategy = "TARGET_CPA";
  cpa.targetCpaRupees = 250;
  const r = mapFixture({ spec: cpa });
  const campaign = (r.operations[1] as { campaignOperation: { create: { maximizeConversions?: { targetCpaMicros?: string } } } }).campaignOperation.create;
  assert.equal(campaign.maximizeConversions?.targetCpaMicros, "250000000");
  cpa.targetCpaRupees = null;
  assert.throws(() => mapFixture({ spec: cpa }), (e: unknown) => e instanceof ExecutionError && e.code === "INVALID_BIDDING");
  const manual = fixturePlan().googleSearch!;
  manual.biddingStrategy = "MANUAL_CPC";
  assert.throws(() => mapFixture({ spec: manual }), (e: unknown) => e instanceof ExecutionError && e.code === "INVALID_BIDDING" && e.status === "BLOCKED_CONFIG");
});

check("RSA limits and keyword hygiene: >30-char headline is an error, duplicates collapse, notation is stripped, 16th headline deferred", () => {
  const long = fixturePlan().googleSearch!;
  long.adGroups[0].headlines.push("Ye headline tees characters se lambi hai bilkul");
  assert.throws(() => mapFixture({ spec: long }), (e: unknown) => e instanceof ExecutionError && e.code === "SPEC_INVALID");
  const dup = fixturePlan().googleSearch!;
  dup.adGroups[0].keywords.push({ text: "[jaipur matrimony]", matchType: "PHRASE" }, { text: "Jaipur Matrimony", matchType: "PHRASE" });
  dup.negativeKeywords.push("FREE");
  const r = mapFixture({ spec: dup });
  assert.equal(r.summary.keywords, 2, "the bracketed and re-cased duplicates collapse into the original");
  assert.equal(r.summary.negatives, 3);
  assert.ok(r.warnings.some((w) => /notation/.test(w)));
  const many = fixturePlan().googleSearch!;
  many.adGroups[0].headlines = Array.from({ length: 16 }, (_, i) => `Headline number ${i + 1}`);
  const r2 = mapFixture({ spec: many });
  assert.equal(r2.summary.headlines, 15);
  assert.ok(r2.warnings.some((w) => /deferred/.test(w)));
  const bad = fixturePlan().googleSearch!;
  bad.adGroups[0].keywords[0].text = "jaipur matrimony!";
  assert.throws(() => mapFixture({ spec: bad }), /disallowed character/);
});

check("geo/language: unresolved geo blocks, unknown language blocks, Hinglish lands on English", () => {
  assert.throws(() => mapFixture({ geoTargets: [] }), (e: unknown) => e instanceof ExecutionError && e.code === "INVALID_GEO_OR_LANGUAGE");
  assert.throws(() => resolveLanguages("Klingon"), (e: unknown) => e instanceof ExecutionError && e.code === "INVALID_GEO_OR_LANGUAGE");
  assert.deepEqual(resolveLanguages("Hinglish").map((l) => l.resourceName), ["languageConstants/1000"]);
  assert.deepEqual(resolveLanguages("Hindi, English").map((l) => l.resourceName), ["languageConstants/1023", "languageConstants/1000"]);
  assert.equal(Object.keys(LANGUAGE_CONSTANTS).length, 3, "only verified constants are listed");
});

check("dates: IST calendar day and window arithmetic", () => {
  assert.equal(calendarDateIn("Asia/Kolkata", new Date("2026-09-12T20:30:00Z")), "2026-09-13");
  assert.equal(calendarDateIn("Asia/Kolkata", new Date("2026-09-12T10:00:00Z")), "2026-09-12");
  assert.equal(addDays("2026-09-12", 29), "2026-10-11");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

console.log("\nMKT-2 landing URL");

check("final URL = origin + public path + deterministic UTM; ValueTrack braces stay literal", () => {
  assert.equal(FINAL_URL, "https://bandhantak.com/register?utm_source=google&utm_medium=cpc&utm_campaign=jaipur-verified-women-2026-09&utm_content={creative}");
  const withQuery = buildFinalUrl({ origin: "https://bandhantak.com/", landingPath: "/pricing?ref=x", utm: { source: "Google Ads", medium: "CPC", campaign: "Jaipur Sept", content: "" } });
  assert.equal(withQuery, "https://bandhantak.com/pricing?ref=x&utm_source=google-ads&utm_medium=cpc&utm_campaign=jaipur-sept");
});

check("landing allow-list: https, own host, public path — each failure named", () => {
  assert.equal(checkLandingUrl(FINAL_URL, "https://bandhantak.com", isKnownPublicPath).ok, true);
  assert.match(checkLandingUrl("http://bandhantak.com/register", "http://bandhantak.com", isKnownPublicPath).reason ?? "", /HTTPS/);
  assert.match(checkLandingUrl("https://evil.example/register", "https://bandhantak.com", isKnownPublicPath).reason ?? "", /host/);
  assert.match(checkLandingUrl("https://bandhantak.com/admin/login", "https://bandhantak.com", isKnownPublicPath).reason ?? "", /public page/);
  assert.equal(checkLandingUrl("https://localhost:3000/register", "https://localhost:3000", isKnownPublicPath).ok, true, "own https host is fine, whatever it is");
});

console.log("\nMKT-2 identity & hashes");

check("idempotency key follows the doc formula; the marker is per deployment and survives a new card", () => {
  const key = idempotencyKeyOf({ platform: "GOOGLE_SEARCH", accountRef: "1234567890", draftId: "d1", specHash: "s".repeat(64), createApprovalId: "a1" });
  assert.equal(key.length, 64);
  assert.equal(key, idempotencyKeyOf({ platform: "GOOGLE_SEARCH", accountRef: "1234567890", draftId: "d1", specHash: "s".repeat(64), createApprovalId: "a1" }));
  assert.notEqual(key, idempotencyKeyOf({ platform: "GOOGLE_SEARCH", accountRef: "1234567890", draftId: "d1", specHash: "s".repeat(64), createApprovalId: "a2" }));
  assert.notEqual(key, idempotencyKeyOf({ platform: "META", accountRef: "1234567890", draftId: "d1", specHash: "s".repeat(64), createApprovalId: "a1" }));
  const marker = executionMarkerOf("dep-1");
  assert.match(marker, /^BT:[0-9a-f]{10}$/);
  assert.equal(marker, executionMarkerOf("dep-1"));
  assert.notEqual(marker, executionMarkerOf("dep-2"));
  const name = providerCampaignName("x".repeat(400), marker);
  assert.ok(name.length <= 255);
  assert.ok(nameCarriesMarker(name, marker));
  assert.equal(nameCarriesMarker("BandhanTak Leads [BT:0000000000]", marker), false);
  assert.equal(providerCampaignName("  BT [test] name  ", marker), `BT test name [${marker}]`);
});

check("spec hash is canonical (key order does not matter) and moves with the budget", () => {
  const a = specHashOf({ platform: "GOOGLE_SEARCH", spec: { b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] } }, dailyBudgetPaise: 100, totalBudgetPaise: null });
  const b = specHashOf({ platform: "GOOGLE_SEARCH", spec: { a: { c: [3, { y: 2, z: 1 }], d: 2 }, b: 1 }, dailyBudgetPaise: 100, totalBudgetPaise: null });
  assert.equal(a, b);
  assert.notEqual(a, specHashOf({ platform: "GOOGLE_SEARCH", spec: { b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] } }, dailyBudgetPaise: 101, totalBudgetPaise: null }));
  assert.equal(canonicalJson({ b: undefined, a: 1 }), '{"a":1}');
});

check("typed write payloads: create and activate parse strictly; a create card is not an activate card", () => {
  const create = {
    action: "CREATE_PAUSED_CAMPAIGNS", platform: "GOOGLE_SEARCH", taskId: "t", draftId: "d", deploymentId: "x", goalId: "g", accountRef: "1234567890", accountDisplayName: "BT (…7890)",
    campaignName: "n", providerCampaignName: "n [BT:0123456789]", executionMarker: "BT:0123456789", specHash: "s".repeat(64), currency: "INR", dailyBudgetPaise: 30000, maxSpendPaise: 900000,
    goalDailyCapPaise: 50000, goalTotalCapPaise: 1500000, startAt: null, endAt: null, windowDays: 30, audienceSummary: "Jaipur", landingUrls: [FINAL_URL], conversionAction: "verification_completed",
    biddingStrategy: "MAXIMIZE_CONVERSIONS", creativeAssetIds: [], deferred: [], executionEffect: "Creates provider objects in PAUSED state; no spend starts",
  };
  assert.equal(CreatePausedPayloadSchema.safeParse(create).success, true);
  assert.equal(ActivatePayloadSchema.safeParse(create).success, false);
  assert.equal(parseWriteApprovalPayload(create)?.action, "CREATE_PAUSED_CAMPAIGNS");
  assert.equal(parseWriteApprovalPayload({ runId: "r", goalId: "g", draftIds: [], creativeIds: [] }), null, "an MKT-1 package payload is not a write payload");
  assert.equal(CreatePausedPayloadSchema.safeParse({ ...create, executionEffect: "Campaign becomes eligible to serve and spend" }).success, false);
  assert.equal(CreatePausedPayloadSchema.safeParse({ ...create, extra: 1 }).success, false, "strict");
  assert.equal(approvalButtonLabel("CREATE_PAUSED_CAMPAIGNS", "GOOGLE_SEARCH"), "Create paused on Google");
  assert.equal(approvalButtonLabel("ACTIVATE_CAMPAIGNS", "META"), "Activate Meta campaign");
  assert.equal(approvalButtonLabel("APPROVE_PACKAGE", null), "Approve Package");
});

check("every deployment status has copy, and the active set is exactly the worker-owned states", () => {
  for (const s of DEPLOYMENT_STATUSES) assert.ok(DEPLOYMENT_STATUS_META[s].label, s);
  assert.deepEqual([...ACTIVE_DEPLOYMENT_STATUSES].sort(), ["ACTIVATING", "ACTIVATION_QUEUED", "CREATING", "PREFLIGHT", "QUEUED", "RECONCILING", "VALIDATING"]);
  assert.match(DEPLOYMENT_STATUS_META.PAUSED_READY.label, /no spend/);
  assert.match(DEPLOYMENT_STATUS_META.LIVE.label, /spend/);
});

console.log("\nMKT-2 errors");

check("write timeout/5xx → UNKNOWN_OUTCOME and never retry-safe; read timeout → safe; 400 → final; 429 → retry", () => {
  const t = normaliseProviderError(new ConnectorError("TIMEOUT", "x"), "write");
  assert.equal(t.code, "NETWORK_UNKNOWN_OUTCOME");
  assert.equal(t.status, "UNKNOWN_OUTCOME");
  assert.equal(t.retrySafe, false);
  assert.equal(normaliseProviderError(new ConnectorError("UPSTREAM", "x", 503), "write").status, "UNKNOWN_OUTCOME");
  assert.equal(normaliseProviderError(new Error("socket hang up"), "write").status, "UNKNOWN_OUTCOME");
  const r = normaliseProviderError(new ConnectorError("TIMEOUT", "x"), "validate");
  assert.equal(r.retrySafe, true);
  assert.equal(r.status, "FAILED_RETRYABLE");
  const v = normaliseProviderError(new ConnectorError("UPSTREAM", "google-ads: 400.", 400, "rid", { errors: [{ code: "campaignError.DUPLICATE_CAMPAIGN_NAME", message: "Duplicate name", field: "campaign.name" }] }), "validate");
  assert.equal(v.code, "PROVIDER_VALIDATION_FAILED");
  assert.equal(v.status, "FAILED_FINAL");
  assert.match(v.message, /campaign\.name: \[campaignError\.DUPLICATE_CAMPAIGN_NAME\] Duplicate name/);
  assert.equal(v.requestId, "rid");
  const rl = normaliseProviderError(new ConnectorError("RATE_LIMIT", "x", 429), "write");
  assert.equal(rl.code, "RATE_LIMITED");
  assert.equal(rl.retrySafe, true);
  assert.equal(normaliseProviderError(new ConnectorError("AUTH", "x", 401), "write").status, "BLOCKED_CONFIG");
  const policy = normaliseProviderError(new ConnectorError("UPSTREAM", "x", 400, null, { errors: [{ code: "policyFindingError.POLICY_FINDING", message: "Policy violation: prohibited content", field: "ad" }] }), "write");
  assert.equal(policy.code, "POLICY_REJECTED");
});

check("Google failure bodies reduce to code + message + field path, trigger dropped", () => {
  const body = {
    error: {
      code: 400,
      details: [
        {
          "@type": "type.googleapis.com/google.ads.googleads.v23.errors.GoogleAdsFailure",
          errors: [{ errorCode: { campaignBudgetError: "NON_MULTIPLE_OF_MINIMUM_CURRENCY_UNIT" }, message: "Budget must be a multiple", trigger: { stringValue: "SECRET-ECHO" }, location: { fieldPathElements: [{ fieldName: "mutate_operations", index: 0 }, { fieldName: "campaign_budget_operation" }] } }],
          requestId: "abc",
        },
      ],
    },
  };
  const errors = extractGoogleErrors(body);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, "campaignBudgetError.NON_MULTIPLE_OF_MINIMUM_CURRENCY_UNIT");
  assert.equal(errors[0].field, "mutate_operations[0].campaign_budget_operation");
  assert.ok(!JSON.stringify(errors).includes("SECRET-ECHO"));
});

check("GAQL search sends the query alone (v17+ refuses pageSize) and a failure reads as Google's code + text", async () => {
  const { searchGoogleAds } = await import("../lib/marketing/connectors/googleAds");
  const realFetch = globalThis.fetch;
  const bodies: Array<Record<string, unknown>> = [];
  const denial = {
    error: {
      code: 403,
      message: "The caller does not have permission",
      status: "PERMISSION_DENIED",
      details: [
        {
          "@type": "type.googleapis.com/google.ads.googleads.v23.errors.GoogleAdsFailure",
          errors: [{ errorCode: { authorizationError: "ACTION_NOT_PERMITTED" }, message: "The Google Cloud project is only approved for use with test accounts." }],
        },
      ],
    },
  };
  let status = 200;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    const payload = status === 200 ? { results: [{ customer: { id: "9659950894" } }] } : denial;
    return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    const auth = { accessToken: "test-access", developerToken: null, customerId: "965-995-0894" };
    const rows = await searchGoogleAds(auth, "SELECT customer.id FROM customer LIMIT 1");
    assert.equal(rows.length, 1);
    assert.deepEqual(Object.keys(bodies[0]), ["query"]);
    status = 403;
    await assert.rejects(searchGoogleAds(auth, "SELECT customer.id FROM customer LIMIT 1"), (err: unknown) => {
      assert.ok(err instanceof ConnectorError);
      assert.equal(err.code, "FORBIDDEN");
      assert.equal(err.status, 403);
      assert.match(err.message, /\[authorizationError\.ACTION_NOT_PERMITTED\] The Google Cloud project is only approved/);
      assert.ok(!err.message.includes('"error"'), err.message);
      return true;
    });
    assert.deepEqual(Object.keys(bodies[1]), ["query"]);
  } finally {
    globalThis.fetch = realFetch;
  }
});

console.log("\nMKT-2 read-back");

function fixtureTree(overrides: Partial<CampaignTree["campaign"]> = {}): CampaignTree {
  return {
    campaign: { resourceName: "customers/1234567890/campaigns/55", id: "55", name: "BT · Jaipur [BT:abcdef1234]", status: "PAUSED", servingStatus: "PAUSED", primaryStatus: "PAUSED", startDate: "2026-09-12", endDate: "2026-10-11", channelType: "SEARCH", biddingStrategyType: "MAXIMIZE_CONVERSIONS", budgetResourceName: "customers/1234567890/campaignBudgets/9", budgetAmountMicros: "300000000", ...overrides },
    adGroups: [{ resourceName: "customers/1234567890/adGroups/1", name: "g", status: "ENABLED" }],
    keywords: [{ resourceName: "customers/1234567890/adGroupCriteria/1~1", adGroup: "customers/1234567890/adGroups/1", text: "jaipur matrimony", matchType: "PHRASE", status: "ENABLED" }],
    ads: [{ resourceName: "customers/1234567890/adGroupAds/1~2", adGroup: "customers/1234567890/adGroups/1", status: "ENABLED", finalUrls: [FINAL_URL], approvalStatus: null }],
    campaignCriteria: [],
  };
}

check("read-back verification: exact paused campaign passes; status, budget, marker, customer and URL mismatches are named", () => {
  const exp = { marker: "BT:abcdef1234", customerId: "1234567890", budgetMicros: "300000000", expectedStatus: "PAUSED" as const, finalUrl: FINAL_URL, startDate: "2026-09-12", endDate: "2026-10-11" };
  assert.equal(verifyTree(fixtureTree(), exp).ok, true);
  assert.match(verifyTree(fixtureTree({ status: "ENABLED" }), exp).problems.join(), /status ENABLED/);
  assert.match(verifyTree(fixtureTree({ budgetAmountMicros: "500000000" }), exp).problems.join(), /budget/);
  assert.match(verifyTree(fixtureTree({ name: "no marker" }), exp).problems.join(), /marker/);
  assert.match(verifyTree(fixtureTree({ resourceName: "customers/999/campaigns/55" }), exp).problems.join(), /customer/);
  const wrongUrl = fixtureTree();
  wrongUrl.ads[0].finalUrls = ["https://bandhantak.com/somewhere-else"];
  assert.match(verifyTree(wrongUrl, exp).problems.join(), /final URL/);
  const noAds = fixtureTree();
  noAds.ads = [];
  assert.match(verifyTree(noAds, exp).problems.join(), /koi ad nahi/);
  assert.match(verifyTree(fixtureTree(), { ...exp, campaignResourceName: "customers/1234567890/campaigns/56" }).problems.join(), /stored/);
});

check("mutate response and tree both bucket every resource name", () => {
  const resp: MutateResponse = {
    requestId: "r",
    mutateOperationResponses: [
      { campaignBudgetResult: { resourceName: "customers/1/campaignBudgets/9" } },
      { campaignResult: { resourceName: "customers/1/campaigns/55" } },
      { campaignCriterionResult: { resourceName: "customers/1/campaignCriteria/55~1" } },
      { adGroupResult: { resourceName: "customers/1/adGroups/7" } },
      { adGroupCriterionResult: { resourceName: "customers/1/adGroupCriteria/7~1" } },
      { adGroupAdResult: { resourceName: "customers/1/adGroupAds/7~2" } },
    ],
  };
  const refs = refsFromMutateResponse(resp);
  assert.equal(refs.campaign, "customers/1/campaigns/55");
  assert.equal(refs.campaignId, "55");
  assert.equal(refs.budget, "customers/1/campaignBudgets/9");
  assert.deepEqual([refs.adGroups.length, refs.keywords.length, refs.ads.length, refs.campaignCriteria.length], [1, 1, 1, 1]);
  const fromTree = refsFromTree(fixtureTree());
  assert.equal(fromTree.campaignId, "55");
  assert.equal(fromTree.ads.length, 1);
});

// ============================================================
// 8. Client boundary — `next build` cannot always run here
// ============================================================

console.log("\nClient boundary");

check("no marketing-ai client component value-imports a server-only module", async () => {
  const { clientModulesReachingServerOnly } = await import("./_stubs/clientBoundary");
  const problems = clientModulesReachingServerOnly([
    "components/admin/marketing-ai/MarketingAiConsole.tsx",
    "components/admin/marketing-ai/CommandBox.tsx",
    "components/admin/marketing-ai/ConnectionStrip.tsx",
    "components/admin/marketing-ai/ConnectionSheet.tsx",
    "components/admin/marketing-ai/WorkQueue.tsx",
    "components/admin/marketing-ai/TaskDetailSheet.tsx",
    "components/admin/marketing-ai/MetaExecutionPanels.tsx",
  ]);
  assert.deepEqual(problems, []);
});

// ============================================================
// Fixtures
// ============================================================

function fakeContext(): MarketingContext {
  const empty = (source: MarketingContext["bandhantak"]["growth"]["source"]) => ({ source, status: "not_connected" as const, window: "—", fetchedAt: null, note: null, data: null });
  return {
    generatedAt: "2026-09-12T00:00:00Z",
    today: "2026-09-12",
    windowDays: 30,
    request: { text: "x", goalInput: null, carried: null, thread: [] },
    bandhantak: { growth: empty("bandhantak.growth"), plans: empty("bandhantak.plans"), lifecycle: empty("bandhantak.lifecycle"), pages: empty("bandhantak.pages") },
    google: { keywordIdeas: empty("google.keyword_ideas"), searchConsole: empty("google.search_console"), analytics: empty("google.analytics"), ads: empty("google.ads") },
    meta: { ads: empty("meta.ads"), facebookPage: empty("facebook.page"), instagram: empty("instagram.media") },
    connections: [{ provider: "GOOGLE_ADS", health: "NOT_CONNECTED" }],
    tools: [],
  } as MarketingContext;
}

// ============================================================

(async () => {
  for (const run of queue) await run();
  console.log(`
${checks - failures}/${checks} passed`);
  process.exit(failures ? 1 : 0);
})();
