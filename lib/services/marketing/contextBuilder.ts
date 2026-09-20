import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getGrowthSnapshot } from "@/lib/services/growth/growthService";
import { runLifecycleNudges } from "@/lib/services/lifecycle/lifecycleJob";
import { TIER_LABELS } from "@/lib/contracts/lifecycle";
import { getPlanCatalog } from "@/lib/services/plans/planCatalog";
import { resolveOffers } from "@/lib/services/plans/planOfferService";
import { getItemCatalog } from "@/lib/services/items/itemCatalog";
import { ROUTE_ACCESS_MATRIX } from "@/lib/contracts/auth";
import type { CommandGoalInput, ConnectionHealth, EvidenceSourceSummary, MarketingProviderKey, ThreadEntry } from "@/lib/contracts/marketingAi";
import type { EvidenceSource } from "@/lib/contracts/marketingPlanSchema";
import { describeConnectorError, isConnectorError, windowLabel } from "@/lib/marketing/connectors/http";
import { GEO_INDIA, readGoogleAdsPerformance, readKeywordIdeas, suggestGeoTarget, type GoogleAdsPerformance, type KeywordIdeasResult } from "@/lib/marketing/connectors/googleAds";
import { readSearchConsole, type SearchConsoleReport } from "@/lib/marketing/connectors/searchConsole";
import { readGoogleAnalytics, type GaAnalyticsReport } from "@/lib/marketing/connectors/googleAnalytics";
import { readMetaAdsPerformance, type MetaAdsPerformance } from "@/lib/marketing/connectors/metaAds";
import { readFacebookPage, type FacebookPageReport } from "@/lib/marketing/connectors/facebookPage";
import { readInstagram, type InstagramReport } from "@/lib/marketing/connectors/instagram";
import { MARKETING_TOOLS, newToolRun, runReadTool, type ToolRun } from "@/lib/marketing/tools/registry";
import { listConnectionStatus, recordConnectionOutcome, resolveGoogleAdsAuth, resolveGoogleAuth, resolveMetaAuth } from "./connectionService";
import type { Prisma } from "@prisma/client";

/**
 * The Marketing Context Builder (§3) — every fact Growth Saathi is allowed
 * to reason from, assembled before each planning run.
 *
 * ## Aggregates only
 *
 * The model reads counts, medians, rates and top-N lists. It never reads a
 * member: no name, phone, photo, biodata, caste/religion, chat or private
 * match fact (§3.1, §11). That is enforced twice — by construction (every
 * block below is built from aggregate services or platform reports) and by
 * `assertNoPii()`, which scans the finished context for phone/email shapes
 * and refuses to hand it over if one slipped through.
 *
 * ## Every source carries its own status
 *
 * A source that could not be read is present as `status: "not_connected"`,
 * `"needs_attention"` or `"error"` with `data: null`, so the model is told
 * *what is missing* rather than being handed a smaller world and left to
 * assume it is the whole one (§14: "Missing data ko missing bolo"). A read
 * that failed but has a dated snapshot from an earlier run comes back
 * `"stale"` with that snapshot and its fetch date (§17).
 */

export type SourceStatus = EvidenceSourceSummary["status"];

export interface SourceBlock<T> {
  source: EvidenceSource;
  status: SourceStatus;
  window: string;
  fetchedAt: string | null;
  note: string | null;
  data: T | null;
}

export interface GrowthFacts {
  windowDays: number;
  funnel: { step: string; count: number; pctOfPrevious: number | null; detail: string }[];
  rishta: { step: string; count: number; unit: string }[];
  retention: { cohort: string; signups: number; week1Active: number | null; week4Active: number | null }[];
  revenue: {
    mrrRupees: number;
    payingUsers: number;
    capturedRupees30d: number;
    capturedCount30d: number;
    paidConversionPct: number;
    planMix: { plan: string; subscribers: number; priceRupees: number }[];
  };
  marketplace: {
    liveProfiles: number;
    byGender: { label: string; count: number }[];
    boysPerGirl: number | null;
    newLiveInWindow: number;
    topCities: { city: string; count: number }[];
    liveButNeverReceivedInterest: number;
  };
  gates: { lockedOn: string; peopleWaiting: number; unlockPlan: string }[];
  partners: { activePartners: number; referredSignups: number; referredPaid: number; organicSignups: number; organicPaid: number };
  journey: { medianDaysToLive: number | null; liveInWindow: number; verification: { requested: number; matched: number; mismatch: number } };
  aiUsage30d: { feature: string; calls: number }[];
}

export interface PlanFacts {
  plans: { code: string; name: string; priceRupees: number; duration: string; activeOffer: string | null; priceAfterOfferRupees: number | null; unlocks: string[] }[];
  items: { code: string; name: string; priceRupees: number; description: string }[];
  /** The only rupee amounts copy may quote. */
  quotablePricesRupees: number[];
}

export interface LifecycleFacts {
  candidates: number;
  wouldSelect: number;
  campaigns: { id: string; label: string; tier: string; matched: number }[];
}

export interface PageFacts {
  paths: { path: string; purpose: string }[];
}

export interface MarketingContext {
  generatedAt: string;
  today: string;
  windowDays: 30;
  request: {
    text: string;
    goalInput: CommandGoalInput | null;
    /** Settled by an earlier run of the same goal — fallbacks, not overrides. */
    carried: CommandGoalInput | null;
    thread: ThreadEntry[];
  };
  bandhantak: {
    growth: SourceBlock<GrowthFacts>;
    plans: SourceBlock<PlanFacts>;
    lifecycle: SourceBlock<LifecycleFacts>;
    pages: SourceBlock<PageFacts>;
  };
  google: {
    keywordIdeas: SourceBlock<KeywordIdeasResult>;
    searchConsole: SourceBlock<SearchConsoleReport>;
    analytics: SourceBlock<GaAnalyticsReport>;
    ads: SourceBlock<GoogleAdsPerformance>;
  };
  meta: {
    ads: SourceBlock<MetaAdsPerformance>;
    facebookPage: SourceBlock<FacebookPageReport>;
    instagram: SourceBlock<InstagramReport>;
  };
  connections: { provider: string; health: ConnectionHealth }[];
  tools: { name: string; tier: string; availableFrom: string }[];
}

const rupees = (paise: number) => Math.round(paise) / 100;

/**
 * The seed list Keyword Planner is asked to expand (§3.2 "approved matrimony
 * terms"). Geography-specific seeds are added per goal. Deliberately no
 * community or religion words — the demand they surface would be demand
 * this product refuses to target.
 */
export const APPROVED_SEED_KEYWORDS = [
  "matrimony",
  "matrimonial site",
  "verified matrimony",
  "shaadi",
  "rishta",
  "marriage bureau",
  "biodata for marriage",
  "matrimony app",
  "online rishta",
  "matchmaking",
];

function seedsFor(geography: string | null | undefined): string[] {
  const geo = geography?.trim();
  if (!geo || /india/i.test(geo)) return APPROVED_SEED_KEYWORDS;
  const city = geo.split(",")[0].trim();
  return [...APPROVED_SEED_KEYWORDS, `${city} matrimony`, `matrimony in ${city}`, `${city} rishta`, `${city} shaadi`];
}

function block<T>(source: EvidenceSource, status: SourceStatus, window: string, data: T | null, note: string | null = null): SourceBlock<T> {
  return { source, status, window, fetchedAt: data ? new Date().toISOString() : null, note, data };
}

/** Maps a connector failure to the status vocabulary the model reads. */
function statusOfError(err: unknown): SourceStatus {
  if (isConnectorError(err)) {
    if (err.code === "NOT_FOUND") return "not_connected";
    if (err.code === "AUTH" || err.code === "FORBIDDEN") return "needs_attention";
  }
  return "error";
}

// ============================================================
// BandhanTak internal truth (§3.1)
// ============================================================

async function growthFacts(): Promise<GrowthFacts> {
  const s = await getGrowthSnapshot(30);
  return {
    windowDays: s.windowDays,
    funnel: s.funnel.map((f) => ({ step: f.label, count: f.count, pctOfPrevious: f.stepPct, detail: f.detail })),
    rishta: s.rishta.map((r) => ({ step: r.label, count: r.count, unit: r.unit })),
    retention: s.retention.map((r) => ({ cohort: r.label, signups: r.signups, week1Active: r.week1, week4Active: r.week4 })),
    revenue: {
      mrrRupees: rupees(s.revenue.mrrPaise),
      payingUsers: s.revenue.payingUsers,
      capturedRupees30d: rupees(s.revenue.capturedPaise),
      capturedCount30d: s.revenue.capturedCount,
      paidConversionPct: s.revenue.paidConversionPct,
      planMix: s.revenue.planMix.map((p) => ({ plan: p.name, subscribers: p.subscribers, priceRupees: rupees(p.pricePaise) })),
    },
    marketplace: {
      liveProfiles: s.marketplace.liveProfiles,
      byGender: s.marketplace.byGender,
      boysPerGirl: s.marketplace.ratio,
      newLiveInWindow: s.marketplace.newLiveInWindow,
      topCities: s.marketplace.topCities,
      liveButNeverReceivedInterest: s.marketplace.neverReceivedInterest,
    },
    gates: s.gates.map((g) => ({ lockedOn: g.label, peopleWaiting: g.people, unlockPlan: g.unlockName ?? "koi kharcha nahi kholta" })),
    partners: {
      activePartners: s.partners.activePartners,
      referredSignups: s.partners.referredSignups,
      referredPaid: s.partners.referredPaid,
      organicSignups: s.partners.organicSignups,
      organicPaid: s.partners.organicPaid,
    },
    journey: {
      medianDaysToLive: s.journey.medianDaysToLive,
      liveInWindow: s.journey.liveInWindow,
      verification: {
        requested: s.journey.verification.requested,
        matched: s.journey.verification.matched,
        mismatch: s.journey.verification.mismatch,
      },
    },
    aiUsage30d: s.ai.map((a) => ({ feature: a.feature, calls: a.calls })),
  };
}

const FEATURE_UNLOCK_LABEL: Array<[key: string, label: (v: unknown) => string | null]> = [
  // Deliberately absent: `reelPerDay` (D-91). It is a batch size now, not a
  // limit, and a marketing brief that read "15 Reel profiles/day" as a plan
  // benefit would put that number straight into an ad.
  ["interestsPerMonth", (v) => (v === null ? "unlimited interests" : typeof v === "number" ? `${v} interests/month` : null)],
  ["chat", (v) => (v ? "chat after match" : null)],
  ["familySeats", (v) => (typeof v === "number" && v > 0 ? `${v} family seats` : null)],
  ["deepDimensions", (v) => (typeof v === "number" && v > 0 ? `deep profile ${v}/13 dimensions` : null)],
  ["boost", (v) => (v ? "profile boost" : null)],
  ["priorityVerification", (v) => (v ? "priority verification" : null)],
  ["assistedMatchmaker", (v) => (v ? "assisted matchmaker" : null)],
  ["admirerIdentity", (v) => (v ? "see who shortlisted you" : null)],
  ["viewerIdentity", (v) => (v ? "see who viewed you" : null)],
  ["voiceUnlock", (v) => (v ? "open received voice notes" : null)],
  ["kundliPdfExport", (v) => (v ? "kundli PDF export" : null)],
];

async function planFacts(): Promise<PlanFacts> {
  const [catalog, items] = await Promise.all([getPlanCatalog(), getItemCatalog()]);
  const livePlans = catalog.all.filter((p) => p.isActive && p.isPublic);
  const offers = await resolveOffers(new Map(livePlans.map((p) => [p.code, p.priceInPaise])));

  const plans = livePlans.map((p) => {
    const offer = offers.get(p.code);
    const features = p.features as unknown as Record<string, unknown>;
    const unlocks = FEATURE_UNLOCK_LABEL.map(([key, label]) => label(features[key])).filter((x): x is string => !!x);
    return {
      code: p.code,
      name: p.name,
      priceRupees: rupees(p.priceInPaise),
      duration: p.durationLabel,
      activeOffer: offer ? `${offer.label} (till ${offer.endsAt.toISOString().slice(0, 10)})` : null,
      priceAfterOfferRupees: offer ? rupees(offer.priceAfterPaise) : null,
      unlocks,
    };
  });
  const liveItems = items.all
    .filter((i) => i.isActive && i.isPublic && i.configValid)
    .map((i) => ({ code: i.code, name: i.name, priceRupees: rupees(i.priceInPaise), description: i.description }));

  const quotable = new Set<number>();
  for (const p of plans) {
    quotable.add(p.priceRupees);
    if (p.priceAfterOfferRupees !== null) quotable.add(p.priceAfterOfferRupees);
  }
  for (const i of liveItems) quotable.add(i.priceRupees);

  return { plans, items: liveItems, quotablePricesRupees: [...quotable].sort((a, b) => a - b) };
}

async function lifecycleFacts(): Promise<LifecycleFacts> {
  const summary = await runLifecycleNudges({ dryRun: true });
  // Campaign-level counts only. `summary.preview` carries user names and is
  // exactly the field this builder must never forward.
  return {
    candidates: summary.candidates,
    wouldSelect: summary.selected,
    campaigns: summary.campaigns.map((c) => ({ id: c.id, label: c.label, tier: TIER_LABELS[c.tier], matched: c.matched })),
  };
}

const PAGE_PURPOSE: Record<string, string> = {
  "/": "Homepage — positioning, trust, register CTA",
  "/how-it-works": "How the product works — Rishta Reel, verification, family",
  "/pricing": "Plans and prices",
  "/partner-program": "Partner (referral income) program",
  "/safety": "Safety and privacy promises",
  "/register": "Registration form",
  "/bolo": "Voice front door — build a profile by talking to Grio, no login first",
  "/partners": "Partner marketplace — verified local services",
  "/login": "Login",
};

export function publicPageFacts(): PageFacts {
  const publicPaths = ROUTE_ACCESS_MATRIX.filter((r) => r.category === "public").map((r) => r.route);
  return {
    paths: publicPaths
      .filter((p) => PAGE_PURPOSE[p])
      .map((p) => ({ path: p, purpose: PAGE_PURPOSE[p] })),
  };
}

export function isKnownPublicPath(path: string): boolean {
  const clean = path.split("?")[0].split("#")[0];
  return ROUTE_ACCESS_MATRIX.some((r) => r.category === "public" && r.route === clean && r.route !== "/admin/login");
}

// ============================================================
// Snapshots — the stale fallback
// ============================================================

async function saveSnapshot(provider: MarketingProviderKey, accountRef: string, data: unknown, windowDays: number): Promise<void> {
  try {
    await prisma.marketingMetricSnapshot.create({
      data: {
        provider,
        accountRef,
        windowFrom: new Date(Date.now() - windowDays * 86_400_000),
        windowTo: new Date(),
        metrics: data as Prisma.InputJsonValue,
        freshness: "fresh",
      },
    });
  } catch (err) {
    console.error("[marketing:context] snapshot write failed:", err instanceof Error ? err.message : String(err));
  }
}

async function latestSnapshot<T>(provider: MarketingProviderKey): Promise<{ data: T; fetchedAt: string } | null> {
  const row = await prisma.marketingMetricSnapshot.findFirst({
    where: { provider, campaignRef: null, creativeRef: null },
    orderBy: { fetchedAt: "desc" },
  });
  if (!row) return null;
  return { data: row.metrics as T, fetchedAt: row.fetchedAt.toISOString() };
}

/**
 * One connected source: run the tool, record it, write a snapshot on
 * success, fall back to the last snapshot on failure. Connection status is
 * updated so the strip and the model agree about what just happened.
 */
async function connectedSource<T>(
  run: ToolRun,
  params: { tool: string; source: EvidenceSource; provider: MarketingProviderKey; window: string; rowsOf: (v: T) => number; snapshot: boolean },
  fetcher: () => Promise<{ accountRef: string; data: T }>,
): Promise<SourceBlock<T>> {
  const outcome = await runReadTool(run, params.tool, fetcher, (v) => params.rowsOf(v.data));
  if (outcome.ok) {
    await recordConnectionOutcome(params.provider, null);
    if (params.snapshot) await saveSnapshot(params.provider, outcome.value.accountRef, outcome.value.data, 30);
    return block(params.source, "ok", params.window, outcome.value.data);
  }

  const status = statusOfError(outcome.error);
  if (status !== "not_connected") await recordConnectionOutcome(params.provider, outcome.error);
  const { message } = describeConnectorError(outcome.error);

  if (params.snapshot && status !== "not_connected") {
    const snap = await latestSnapshot<T>(params.provider);
    if (snap) {
      return {
        source: params.source,
        status: "stale",
        window: `${params.window} — STALE: last successful read ${snap.fetchedAt.slice(0, 10)}`,
        fetchedAt: snap.fetchedAt,
        note: `Live read failed (${message}); showing the last stored snapshot.`,
        data: snap.data,
      };
    }
  }
  return block<T>(params.source, status, params.window, null, message);
}

// ============================================================
// The builder
// ============================================================

export interface BuildContextParams {
  request: string;
  goalInput: CommandGoalInput | null;
  carried?: CommandGoalInput | null;
  thread: ThreadEntry[];
  now?: Date;
}

export async function buildMarketingContext(params: BuildContextParams): Promise<{ context: MarketingContext; toolRun: ToolRun }> {
  const now = params.now ?? new Date();
  const run = newToolRun();
  const window30 = windowLabel(30, now);
  const geography = params.goalInput?.geography ?? params.carried?.geography ?? null;

  const connections = await listConnectionStatus();
  run.records.push({ tool: "connections.status.read", tier: "READ_AUTO", ok: true, ms: 0, error: null, rows: connections.length });

  const internal = async <T>(tool: string, source: EvidenceSource, fn: () => Promise<T>, rowsOf: (v: T) => number): Promise<SourceBlock<T>> => {
    const outcome = await runReadTool(run, tool, fn, rowsOf);
    if (outcome.ok) return block(source, "ok", window30, outcome.value);
    return block<T>(source, "error", window30, null, describeConnectorError(outcome.error).message);
  };

  // Internal reads are independent of every platform read — all in parallel.
  // The public page list is code, not a read — no tool call, always present.
  const pages = block<PageFacts>("bandhantak.pages", "ok", "current routes", publicPageFacts());

  const [growth, plans, lifecycle, searchConsole, analytics, adsPerf, metaAds, facebookPage, instagram] = await Promise.all([
    internal("bandhantak.growth.read", "bandhantak.growth", growthFacts, (g) => g.funnel.length),
    internal("bandhantak.plans.read", "bandhantak.plans", planFacts, (p) => p.plans.length + p.items.length),
    internal("bandhantak.lifecycle.preview", "bandhantak.lifecycle", lifecycleFacts, (l) => l.campaigns.length),
    connectedSource<SearchConsoleReport>(
      run,
      { tool: "google.search_console.read", source: "google.search_console", provider: "SEARCH_CONSOLE", window: "last 28 days ending 3 days ago (Search Console lag)", rowsOf: (r) => r.topQueries.length, snapshot: true },
      async () => {
        const auth = await resolveGoogleAuth("SEARCH_CONSOLE");
        return { accountRef: auth.accountRef, data: await readSearchConsole({ accessToken: auth.accessToken, siteUrl: auth.accountRef }, now) };
      },
    ),
    connectedSource<GaAnalyticsReport>(
      run,
      { tool: "google.analytics.read", source: "google.analytics", provider: "GOOGLE_ANALYTICS", window: window30, rowsOf: (r) => r.landingPages.length, snapshot: true },
      async () => {
        const auth = await resolveGoogleAuth("GOOGLE_ANALYTICS");
        return { accountRef: auth.accountRef, data: await readGoogleAnalytics({ accessToken: auth.accessToken, propertyId: auth.accountRef }) };
      },
    ),
    connectedSource<GoogleAdsPerformance>(
      run,
      { tool: "google.ads.performance.read", source: "google.ads", provider: "GOOGLE_ADS", window: window30, rowsOf: (r) => r.campaigns.length, snapshot: true },
      async () => {
        const auth = await resolveGoogleAdsAuth();
        return { accountRef: auth.customerId, data: await readGoogleAdsPerformance(auth) };
      },
    ),
    connectedSource<MetaAdsPerformance>(
      run,
      { tool: "meta.ads.performance.read", source: "meta.ads", provider: "META_ADS", window: window30, rowsOf: (r) => r.campaigns.length, snapshot: true },
      async () => {
        const auth = await resolveMetaAuth("META_ADS");
        return { accountRef: auth.accountRef, data: await readMetaAdsPerformance({ accessToken: auth.accessToken }, auth.accountRef) };
      },
    ),
    connectedSource<FacebookPageReport>(
      run,
      { tool: "facebook.page.read", source: "facebook.page", provider: "FACEBOOK_PAGE", window: "current followers; last 10 posts", rowsOf: (r) => r.recentPosts.length, snapshot: false },
      async () => {
        const auth = await resolveMetaAuth("FACEBOOK_PAGE");
        return { accountRef: auth.accountRef, data: await readFacebookPage({ accessToken: auth.accessToken }, auth.accountRef) };
      },
    ),
    connectedSource<InstagramReport>(
      run,
      { tool: "instagram.media.performance.read", source: "instagram.media", provider: "INSTAGRAM", window: "last 12 media items (lifetime insights per item)", rowsOf: (r) => r.recentMedia.length, snapshot: true },
      async () => {
        const auth = await resolveMetaAuth("INSTAGRAM");
        return { accountRef: auth.accountRef, data: await readInstagram({ accessToken: auth.accessToken }, auth.accountRef) };
      },
    ),
  ]);

  // Keyword ideas need the geography resolved first, so they run after the
  // Ads auth is known to work (no point paying a geo lookup on a dead grant).
  const keywordIdeas = await connectedSource<KeywordIdeasResult>(
    run,
    { tool: "google.keyword_ideas.read", source: "google.keyword_ideas", provider: "GOOGLE_ADS", window: "12-month average monthly searches (Keyword Planner) — NOT a live trend", rowsOf: (r) => r.ideas.length, snapshot: true },
    async () => {
      const auth = await resolveGoogleAdsAuth();
      let geo = { resourceName: GEO_INDIA, name: "India" };
      if (geography && !/india/i.test(geography)) {
        const hit = await suggestGeoTarget(auth, geography).catch(() => null);
        if (hit) geo = { resourceName: hit.resourceName, name: hit.name };
      }
      return { accountRef: auth.customerId, data: await readKeywordIdeas(auth, { seedKeywords: seedsFor(geography), geo }) };
    },
  );

  const context: MarketingContext = {
    generatedAt: now.toISOString(),
    today: now.toISOString().slice(0, 10),
    windowDays: 30,
    request: { text: params.request, goalInput: params.goalInput, carried: params.carried ?? null, thread: params.thread },
    bandhantak: { growth, plans, lifecycle, pages },
    google: { keywordIdeas, searchConsole, analytics, ads: adsPerf },
    meta: { ads: metaAds, facebookPage, instagram },
    connections: connections.map((c) => ({ provider: c.provider, health: c.health })),
    tools: MARKETING_TOOLS.map((t) => ({ name: t.name, tier: t.tier, availableFrom: t.availableFrom })),
  };

  assertNoPii(context);
  return { context, toolRun: run };
}

// ============================================================
// PII guard
// ============================================================

const PHONE_RE = /(?<![\d.])(?:\+91[\s-]?)?[6-9]\d{9}(?![\d.])/;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
/** Keys that only ever hold a person's data. Their presence anywhere in the context is a bug. */
const FORBIDDEN_KEYS = /^(userName|fullName|mobile|phone|email|dateOfBirth|photoUrl|caste|religion|gotra|chat|messageText)$/;
const ID_KEYS = /(^id$|Id$|Ref$|resourceName)/;

/**
 * Throws if the context carries anything that looks like an individual.
 * Called on every build; the check script pins that it fires.
 */
export function assertNoPii(context: unknown): void {
  const problems: string[] = [];
  walk(context, "", (path, key, value) => {
    if (FORBIDDEN_KEYS.test(key)) problems.push(`forbidden key ${path}`);
    if (typeof value === "string") {
      // Platform account ids (a 10-digit Google Ads customer id, a Page id)
      // are numeric and not people; only free-text fields get the phone test.
      if (!ID_KEYS.test(key) && PHONE_RE.test(value)) problems.push(`phone-like value at ${path}`);
      if (EMAIL_RE.test(value)) problems.push(`email-like value at ${path}`);
    }
  });
  if (problems.length) {
    throw new Error(`[marketing:context] PII guard tripped — ${problems.slice(0, 5).join("; ")}`);
  }
}

function walk(node: unknown, path: string, visit: (path: string, key: string, value: unknown) => void): void {
  if (Array.isArray(node)) {
    node.forEach((v, i) => walk(v, `${path}[${i}]`, visit));
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const p = path ? `${path}.${k}` : k;
      visit(p, k, v);
      walk(v, p, visit);
    }
  }
}

/** The per-source summary stored on the run and shown in the task detail. */
export function summariseSources(context: MarketingContext): EvidenceSourceSummary[] {
  const blocks: SourceBlock<unknown>[] = [
    context.bandhantak.growth,
    context.bandhantak.plans,
    context.bandhantak.lifecycle,
    context.bandhantak.pages,
    context.google.keywordIdeas,
    context.google.searchConsole,
    context.google.analytics,
    context.google.ads,
    context.meta.ads,
    context.meta.facebookPage,
    context.meta.instagram,
  ];
  return blocks.map((b) => ({ source: b.source, status: b.status, window: b.window, fetchedAt: b.fetchedAt, note: b.note }));
}

/** Sources the model may cite — everything that had data, fresh or stale. */
export function availableSources(context: MarketingContext): Set<EvidenceSource> {
  const out = new Set<EvidenceSource>(["admin.command"]);
  for (const s of summariseSources(context)) if (s.status === "ok" || s.status === "stale") out.add(s.source as EvidenceSource);
  return out;
}
