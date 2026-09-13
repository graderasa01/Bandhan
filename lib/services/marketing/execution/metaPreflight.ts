import "server-only";
import { prisma } from "@/lib/db/prisma";
import { MetaPackageSchema, type MetaPackage } from "@/lib/contracts/marketingPlanSchema";
import { appOrigin } from "@/lib/utils/appOrigin";
import { executableWriteTool } from "@/lib/marketing/tools/registry";
import { buildFinalUrl, checkLandingUrl } from "@/lib/marketing/mappers/landingUrl";
import { calendarDateIn } from "@/lib/marketing/mappers/googleSearchMapper";
import { META_PLACEMENT_MAP, mapMetaPackage, normalisePlacement, type MetaMapResult } from "@/lib/marketing/mappers/metaCampaignMapper";
import type { MetaAdsWriteProvider, MetaInterestMatch, MetaLocationMatch } from "@/lib/marketing/providers/metaAdsProvider";
import { normaliseAdAccountId } from "@/lib/marketing/connectors/metaAds";
import { probePublicImageUrl, type UrlProbeVerdict } from "@/lib/marketing/storage/marketingCreativeStorage";
import { isKnownPublicPath } from "../contextBuilder";
import { isProtectedTargeting, objectionTo } from "../packageGuardrails";
import { listConnectionStatus } from "../connectionService";
import { META_ACCOUNT_WRITE_TASKS, META_PAGE_ADVERTISE_TASK, META_WRITE_PERMISSION } from "../metaReadinessEvaluator";
import { ExecutionError, normaliseMetaError } from "./executionErrors";
import { providerCampaignName } from "./idempotency";
import { specHashOf } from "./hashing";
import type { MetaResolved } from "./metaRefs";
import type { CampaignDraft, MarketingGoal } from "@prisma/client";

/**
 * Meta preflight (doc 14 §10) in the same two layers as Google's:
 *
 *   `metaReadiness()`       — no network. Runs when a package is approved (to
 *                             decide whether a create card may exist at all)
 *                             and again inside the worker. Connection facts
 *                             from the last "Check ad creation readiness"
 *                             (token scopes, account status/currency/timezone,
 *                             Page/Instagram assignment), budget caps, the
 *                             landing allow-list, guardrails re-verified, the
 *                             package's creatives resolved to APPROVED media,
 *                             and a mapper dry run for spec errors.
 *
 *   `metaWritePreflight()`  — with the provider, immediately before a write.
 *                             Token capabilities and account read back,
 *                             Page/Instagram read back, every location and
 *                             interest resolved to exactly one provider id
 *                             *by its exact name*, the public media URL
 *                             probed, and the exact request templates built.
 *                             On a retry after objects exist, the resolution
 *                             those objects were created with is reused —
 *                             never re-resolved underneath them.
 *
 * Everything throws `ExecutionError`; the caller decides the row's fate.
 */

export const META_PACKAGE_CURRENCY = "INR";
const READINESS_MAX_AGE_MS = 7 * 86_400_000;

export interface MetaMediaFact {
  mediaId: string;
  creativeAssetId: string;
  url: string;
  productionReady: boolean;
  width: number;
  height: number;
  sha256: string;
  storageKey: string;
}

export interface MetaReadiness {
  accountRef: string;
  accountLabel: string;
  currency: string;
  timeZone: string;
  spec: MetaPackage;
  specHash: string;
  finalUrl: string;
  startDate: string;
  endDate: string;
  windowDays: number;
  dailyBudgetPaise: number;
  maxSpendPaise: number;
  goalDailyCapPaise: number | null;
  goalTotalCapPaise: number | null;
  providerCampaignName: string;
  pageId: string;
  pageName: string | null;
  instagramActorId: string | null;
  instagramUsername: string | null;
  readPermission: "READY" | "MISSING" | "UNVERIFIED";
  writePermission: "READY" | "MISSING" | "UNVERIFIED";
  accessTier: string;
  specialAdCategories: string[];
  specialAdCategoryCountry: string | null;
  conversion: { pixelId: string; customEventType: string } | null;
  /** Package concept id → the one APPROVED media behind it. */
  media: Record<string, MetaMediaFact>;
  usesInstagram: boolean;
  /** The mapper dry run — request shapes with placeholder ids, for the card's counts/deferred lines. */
  dry: MetaMapResult;
  warnings: string[];
  settings: Record<string, string>;
}

export interface MetaReadinessInput {
  draft: CampaignDraft;
  goal: MarketingGoal | null;
  siblingDrafts: CampaignDraft[];
  marker: string;
  now?: Date;
}

/** Meta accepts what guardrails accepted; anything the rules reject *today* blocks the write (§10). */
export function reverifyMetaCopy(spec: MetaPackage): string[] {
  const problems: string[] = [];
  spec.ads.forEach((ad, i) => {
    if (ad.format !== "STATIC") return;
    for (const [field, text] of [
      ["primaryText", ad.primaryText],
      ["headline", ad.headline],
      ["description", ad.description],
    ] as const) {
      const why = objectionTo(text);
      if (why) problems.push(`ads[${i}].${field}: ${why}`);
    }
  });
  for (const [field, list] of [
    ["audience.interests", spec.audience.interests],
    ["audience.locations", spec.audience.locations],
    ["audience.exclusions", spec.audience.exclusions],
  ] as const) {
    list.forEach((entry, j) => {
      if (isProtectedTargeting(entry)) problems.push(`${field}[${j}]: protected characteristic "${entry}"`);
    });
  }
  if (isProtectedTargeting(spec.audience.description)) problems.push("audience.description: protected characteristic");
  return problems;
}

export function packageUsesInstagram(spec: MetaPackage): boolean {
  return spec.adSets.some((s) => s.placements.some((p) => META_PLACEMENT_MAP[normalisePlacement(p)]?.platform === "instagram"));
}

function parseSpecialCategories(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[,\s]+/)
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
}

function conversionOf(settings: Record<string, string>): { pixelId: string; customEventType: string } | null {
  const pixelId = settings.metaPixelId?.trim();
  const event = settings.metaConversionEvent?.trim();
  return pixelId && event ? { pixelId, customEventType: event.toUpperCase() } : null;
}

/**
 * Package creative concept ids → the task's IMAGE briefs → their one
 * APPROVED media (doc 14 §8 "Creative readiness"). Only the STATIC ads the
 * mapper would execute need one; Reel/Story briefs are deferred there.
 */
async function resolveMediaForPackage(taskId: string, runId: string | null, spec: MetaPackage): Promise<Record<string, MetaMediaFact>> {
  const needed = [...new Set(spec.ads.filter((ad) => ad.format === "STATIC").map((ad) => ad.creativeId))];
  if (!needed.length) return {};
  const assets = await prisma.creativeAsset.findMany({ where: { taskId, kind: "IMAGE", ...(runId ? { runId } : {}) }, include: { media: { where: { status: "APPROVED" }, orderBy: { reviewedAt: "desc" } } } });
  const out: Record<string, MetaMediaFact> = {};
  const inProduction = process.env.NODE_ENV === "production";
  for (const conceptId of needed) {
    const matches = assets.filter((a) => {
      const brief = a.brief as { id?: unknown } | null;
      return brief && typeof brief === "object" && String(brief.id ?? "") === conceptId;
    });
    if (matches.length === 0) throw new ExecutionError("CREATIVE_MISSING", `Package creative "${conceptId}" ka koi IMAGE brief is task me nahi hai.`, { fix: "'Revise Package' — static creative ids briefs se match hone chahiye." });
    if (matches.length > 1) throw new ExecutionError("CREATIVE_INVALID", `Package creative "${conceptId}" ke ${matches.length} IMAGE briefs hain — ambiguous.`, { fix: "'Revise Package' se ek hi static brief per id rakhwayein." });
    const asset = matches[0];
    if (asset.media.length === 0) throw new ExecutionError("CREATIVE_MISSING", `Creative "${conceptId}" ("${asset.title}") par koi APPROVED image nahi hai — brief approval kaafi nahi.`, { fix: "Task detail → Creatives → is brief par 'Attach image', phir 'Approve image for Meta Ads'." });
    if (asset.media.length > 1) throw new ExecutionError("CREATIVE_INVALID", `Creative "${conceptId}" par ${asset.media.length} APPROVED images hain — ambiguous.`, { fix: "Ek rakhein, baaki reject karein." });
    const m = asset.media[0];
    if (inProduction && !m.productionReady) throw new ExecutionError("CREATIVE_INVALID", `Creative "${conceptId}" ki image durable object storage par nahi hai (local disk) — production me Meta ke liye use nahi ho sakti.`, { fix: "S3_* + S3_PUBLIC_URL configure karke image dobara attach + approve karein." });
    out[conceptId] = { mediaId: m.id, creativeAssetId: asset.id, url: m.publicUrl, productionReady: m.productionReady, width: m.width, height: m.height, sha256: m.sha256, storageKey: m.storageKey };
  }
  return out;
}

export async function metaReadiness(input: MetaReadinessInput): Promise<MetaReadiness> {
  const { draft, goal } = input;
  const now = input.now ?? new Date();

  if (!executableWriteTool("CREATE_PAUSED_CAMPAIGNS", "META")) {
    throw new ExecutionError("NOT_EXECUTABLE_YET", "Meta paused-create abhi executable nahi hai — permission/media/mapping/idempotency tests ke baad registry me enable hota hai.", { fix: "Google flow independently chalta hai." });
  }

  // ---- connection + last readiness check (§9, §10) --------------------------
  const rows = await listConnectionStatus();
  const conn = rows.find((r) => r.provider === "META_ADS");
  if (!conn || conn.health !== "CONNECTED") {
    throw new ExecutionError("ACCOUNT_NOT_READY", `Meta Ads connection ${conn ? conn.health : "missing"} — NOT_CONNECTED.`, { fix: conn?.todo ?? "Connections me Meta Ads token + ad account ID set karein.", retrySafe: false });
  }
  if (!conn.accountRef) throw new ExecutionError("ACCOUNT_NOT_READY", "Meta ad account ID set nahi hai.", { fix: "Connections → Meta Ads → Ad account ID." });
  const s = conn.settings;
  if (!s.readinessAt) throw new ExecutionError("ACCOUNT_NOT_READY", "Meta ad creation readiness abhi check nahi hui (token scopes, account role, Page/IG).", { fix: "Connections → Meta Ads → 'Check ad creation readiness' chalayein." });
  const warnings: string[] = [];
  const readinessAge = now.getTime() - new Date(s.readinessAt).getTime();
  if (!Number.isFinite(readinessAge) || readinessAge > READINESS_MAX_AGE_MS) warnings.push(`readiness check ${Math.round(readinessAge / 86_400_000)} din purana hai — write se pehle provider par dobara verify hoga`);
  if (s.writeReady !== "true") throw new ExecutionError("META_ADS_MANAGEMENT_MISSING", `Token par ${META_WRITE_PERMISSION} nahi mila (last readiness check).`, { fix: "System user token ads_management ke saath dobara generate karein, paste karein, phir 'Check ad creation readiness'.", reconnect: true });
  if (s.accountAccess === "MISSING") throw new ExecutionError("META_AD_ACCOUNT_FORBIDDEN", "Token ke paas ad account par advertise/manage access nahi hai.", { fix: "Business Manager → Ad accounts → system user ko 'Manage campaigns' dein; phir readiness check." });
  if (s.accountStatus !== "1") throw new ExecutionError(s.accountStatus ? "META_AD_ACCOUNT_DISABLED" : "ACCOUNT_NOT_READY", s.accountStatus ? `Ad account status ${s.accountStatus} (ACTIVE=1 nahi).` : "Ad account status pata nahi.", { fix: "Ads Manager me account ACTIVE karein, phir 'Check ad creation readiness'." });
  const currency = (s.currency ?? "").toUpperCase();
  if (currency !== META_PACKAGE_CURRENCY) throw new ExecutionError("META_ACCOUNT_CURRENCY_MISMATCH", `Ad account currency ${currency || "?"} hai, package ${META_PACKAGE_CURRENCY} me hai — silent conversion nahi hoti.`, { fix: `${META_PACKAGE_CURRENCY} wala ad account connect karein.` });
  if (!s.timeZone) throw new ExecutionError("ACCOUNT_NOT_READY", "Ad account timezone nahi mila.", { fix: "'Check ad creation readiness' chalayein." });
  if (s.pageAssigned !== "true" || !s.pageId) throw new ExecutionError("META_PAGE_NOT_ASSIGNED", "Facebook Page assigned/verified nahi hai.", { fix: "Connections → Facebook Page → Page ID; Business Manager me system user ko Page par 'Create ads'; phir 'Check ad creation readiness'." });
  if (s.pageRole === "UNVERIFIED") warnings.push("Page token ko dikhta hai par uska ADVERTISE task verify nahi hua — pehli creative write bataayegi; usse koi spend nahi hota");

  // ---- spec ----------------------------------------------------------------
  const parsed = MetaPackageSchema.safeParse(draft.spec);
  if (!parsed.success) {
    throw new ExecutionError("SPEC_INVALID", `Draft spec schema se match nahi karta: ${parsed.error.issues[0]?.path.join(".") ?? ""} ${parsed.error.issues[0]?.message ?? ""}`.trim(), { fix: "'Revise Package' se naya package banwayein." });
  }
  const spec = parsed.data;
  const specHash = specHashOf({ platform: draft.platform, spec: draft.spec, dailyBudgetPaise: draft.dailyBudgetPaise, totalBudgetPaise: draft.totalBudgetPaise });
  const usesInstagram = packageUsesInstagram(spec);
  if (usesInstagram && (s.igAssigned !== "true" || !s.igId)) {
    throw new ExecutionError("META_INSTAGRAM_NOT_ASSIGNED", "Package me Instagram Feed placement hai par Instagram professional account assigned/verified nahi hai.", { fix: "Connections → Instagram Professional → Page se linked IG user ID; 'Check ad creation readiness'; ya package se Instagram placement hatayein." });
  }

  // ---- schedule (§10 "Expired schedule blocks; dates are not silently shifted") ---
  const timeZone = s.timeZone;
  const today = calendarDateIn(timeZone, now);
  const { startDate: specStart, endDate } = spec.schedule;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(specStart) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) throw new ExecutionError("SPEC_INVALID", `schedule dates YYYY-MM-DD nahi hain (${specStart} → ${endDate})`, { fix: "'Revise Package'." });
  if (endDate < today) throw new ExecutionError("SPEC_INVALID", `Package schedule ${endDate} ko khatam ho chuka — dates shift nahi hoti.`, { fix: "'Revise Package' me naya schedule likhwayein." });
  let startDate = specStart;
  if (startDate < today) {
    startDate = today;
    warnings.push(`package start ${specStart} beet chuka — ad sets creation ke din (${today}) se start honge; card par yahi dikhega`);
  }
  if (endDate <= startDate) throw new ExecutionError("SPEC_INVALID", `schedule end ${endDate} start ${startDate} ke baad hona chahiye.`, { fix: "'Revise Package'." });
  const windowDays = windowDaysOf(startDate, endDate);

  // ---- budgets (§10.7-8 equivalent) ------------------------------------------
  const dailyBudgetPaise = draft.dailyBudgetPaise ?? 0;
  if (!Number.isInteger(dailyBudgetPaise) || dailyBudgetPaise <= 0) throw new ExecutionError("INVALID_BUDGET", "Draft ka daily budget 0/khaali hai.", { fix: "'Revise Package' me daily budget dein." });
  const goalDailyCapPaise = goal?.dailyBudgetPaise ?? null;
  const goalTotalCapPaise = goal?.totalBudgetPaise ?? null;
  if (goalDailyCapPaise === null && goalTotalCapPaise === null) throw new ExecutionError("INVALID_BUDGET", "Goal par koi admin budget cap nahi hai.", { fix: "Task me jawab likhein: daily/total cap." });
  if (goalDailyCapPaise !== null && dailyBudgetPaise > goalDailyCapPaise) throw new ExecutionError("INVALID_BUDGET", `Draft daily ₹${dailyBudgetPaise / 100} goal cap ₹${goalDailyCapPaise / 100} se zyada hai.`, { fix: "'Revise Package'." });
  const combinedDaily = input.siblingDrafts.reduce((sum, d) => sum + (d.dailyBudgetPaise ?? 0), 0);
  if (goalDailyCapPaise !== null && combinedDaily > goalDailyCapPaise) throw new ExecutionError("INVALID_BUDGET", `Sab platforms ka combined daily ₹${combinedDaily / 100} goal cap ₹${goalDailyCapPaise / 100} se zyada hai.`, { fix: "'Revise Package' me budgets kam karwayein." });
  const maxSpendPaise = dailyBudgetPaise * windowDays;
  if (goalTotalCapPaise !== null && maxSpendPaise > goalTotalCapPaise) {
    throw new ExecutionError("INVALID_BUDGET", `₹${dailyBudgetPaise / 100}/day × ${windowDays} din = ₹${maxSpendPaise / 100}, goal total cap ₹${goalTotalCapPaise / 100} se zyada.`, { fix: "Schedule chhota karein ya total cap badhayein (task me jawab likhein), phir 'Revise Package'." });
  }

  // ---- landing --------------------------------------------------------------
  const origin = appOrigin();
  const finalUrl = buildFinalUrl({ origin, landingPath: spec.landingPath, utm: spec.utm });
  const landing = checkLandingUrl(finalUrl, origin, isKnownPublicPath);
  if (!landing.ok) throw new ExecutionError("INVALID_LANDING", `Landing URL reject: ${landing.reason}`, { fix: "NEXT_PUBLIC_APP_URL ko https://bandhantak.com rakhein aur package ka landingPath public page ho." });

  // ---- guardrails again ------------------------------------------------------
  const problems = reverifyMetaCopy(spec);
  if (problems.length) throw new ExecutionError("GUARDRAIL_FAILED", `Guardrails ne ${problems.length} cheez roki: ${problems.slice(0, 3).join(" · ")}`, { fix: "'Revise Package' — ye copy/targeting ab allowed nahi hai." });

  // ---- creatives → approved media (§8) ----------------------------------------
  const media = await resolveMediaForPackage(draft.taskId, draft.runId, spec);

  // ---- mapper dry run (placeholder ids) -----------------------------------------
  const name = providerCampaignName(spec.campaignName, input.marker);
  const specialAdCategories = parseSpecialCategories(s.specialAdCategories);
  const specialAdCategoryCountry = s.specialAdCategoryCountry?.trim() || null;
  const conversion = conversionOf(s);
  const accountRef = normaliseAdAccountId(conn.accountRef);
  const dryLocations: Record<string, MetaLocationMatch> = Object.fromEntries(spec.audience.locations.map((l) => [l, { key: "dry", name: l, type: "city", countryCode: "IN", region: null }]));
  const dryInterests: Record<string, MetaInterestMatch> = Object.fromEntries(spec.audience.interests.map((i) => [i, { id: "dry", name: i, audienceSize: null, path: [] }]));
  const dry = mapMetaPackage({
    adAccountId: accountRef,
    marker: input.marker,
    spec,
    providerCampaignName: name,
    dailyBudgetPaise,
    timeZone,
    startDate,
    endDate,
    resolvedLocations: dryLocations,
    resolvedInterests: dryInterests,
    pageId: s.pageId,
    instagramActorId: s.igAssigned === "true" && s.igId ? s.igId : null,
    finalUrl,
    media: Object.fromEntries(Object.entries(media).map(([k, v]) => [k, { mediaId: v.mediaId, imageHash: null }])),
    specialAdCategories,
    specialAdCategoryCountry,
    conversion,
    isProtectedTargeting,
  });

  return {
    accountRef,
    accountLabel: conn.accountLabel ?? "",
    currency,
    timeZone,
    spec,
    specHash,
    finalUrl,
    startDate,
    endDate,
    windowDays,
    dailyBudgetPaise,
    maxSpendPaise,
    goalDailyCapPaise,
    goalTotalCapPaise,
    providerCampaignName: name,
    pageId: s.pageId,
    pageName: s.pageName || null,
    instagramActorId: usesInstagram ? s.igId : null,
    instagramUsername: usesInstagram ? s.igUsername || null : null,
    readPermission: s.readReady === "true" ? "READY" : s.readReady === "false" ? "MISSING" : "UNVERIFIED",
    writePermission: "READY",
    accessTier: s.accessTier || "UNVERIFIED",
    specialAdCategories,
    specialAdCategoryCountry,
    conversion,
    media,
    usesInstagram,
    dry,
    warnings: [...warnings, ...dry.warnings],
    settings: s,
  };
}

function isoParts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m - 1, d];
}

/** Calendar days from start to end, both inclusive. */
export function windowDaysOf(startDate: string, endDate: string): number {
  return Math.max(1, Math.round((Date.UTC(...isoParts(endDate)) - Date.UTC(...isoParts(startDate))) / 86_400_000) + 1);
}

// ============================================================
// With the provider — immediately before a write (§10 "Meta checks")
// ============================================================

export interface MetaResolvedFacts {
  accountId: string;
  accountName: string | null;
  currency: string;
  timeZone: string;
  pageId: string;
  pageName: string | null;
  /** The Page is readable but its ADVERTISE task could not be seen. */
  pageRoleUnverified: boolean;
  instagramActorId: string | null;
  locations: Record<string, MetaLocationMatch>;
  interests: Record<string, MetaInterestMatch>;
  granted: string[];
  startDate: string;
  endDate: string;
}

export interface MetaWritePreflightResult {
  readiness: MetaReadiness;
  resolved: MetaResolvedFacts;
  mapped: MetaMapResult;
  warnings: string[];
}

export interface MetaWritePreflightInput extends MetaReadinessInput {
  provider: MetaAdsWriteProvider;
  expectedSpecHash: string;
  /**
   * The resolution an earlier attempt already created objects with. When
   * set, locations, interests, dates and timezone are taken from it — the
   * rest of the hierarchy must match what exists, so nothing is re-resolved
   * underneath it. Identity and account are still read back.
   */
  stored?: MetaResolved | null;
  /** Injectable public-URL probe (§10 "Public media URL is still reachable and immutable"). */
  probeUrl?: (url: string) => Promise<UrlProbeVerdict>;
}

const ALLOWED_LOCATION_TYPES = new Set(["city", "region", "country"]);

const norm = (x: string) => x.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Exactly one provider match for a human string (§10 "Every location/interest
 * target resolves uniquely"), and only an exact one: the provider's name must
 * be the package's name — a location may add its region, "Jaipur, Rajasthan".
 * A single *similar* candidate is refused with its name shown, never
 * attached: an audience the create card did not name is not the audience the
 * admin approved.
 */
export function pickUnique<T extends { name: string; region?: string | null; type?: string }>(query: string, candidates: T[], what: "location" | "interest"): T {
  const parts = query.split(",").map(norm).filter(Boolean);
  const head = parts[0] ?? norm(query);
  const qualifiers = parts.slice(1);
  let pool = candidates.filter((c) => norm(c.name) === norm(query) || norm(c.name) === head);
  if (what === "location" && qualifiers.length) {
    pool = pool.filter((c) => c.type === "country" || !c.region || qualifiers.includes(norm(c.region)));
  }
  if (pool.length === 1) return pool[0];
  const describe = (c: T) => `"${c.name}"${c.region ? `, ${c.region}` : ""}${c.type ? ` (${c.type})` : ""}`;
  if (pool.length === 0) {
    const near = candidates.slice(0, 3).map(describe).join(", ");
    throw new ExecutionError("INVALID_GEO_OR_LANGUAGE", `${what} "${query}" Meta par exact naam se nahi mila${near ? ` — milte-julte: ${near}` : ""}. Guess karke target nahi karte.`, {
      fix: `'Revise Package' me ${what} ko Meta ke exact naam se likhwayein${what === "location" ? ' (jaise "Jaipur, Rajasthan")' : ""}.`,
    });
  }
  throw new ExecutionError("INVALID_GEO_OR_LANGUAGE", `${what} "${query}" ambiguous hai — ${pool.length} exact matches: ${pool.slice(0, 5).map(describe).join(", ")}.`, {
    fix: `'Revise Package' me ${what} ko region ke saath likhwayein (jaise "Jaipur, Rajasthan").`,
  });
}

/** The Page the ads post as: in the token's Page list with ADVERTISE, or at least readable (role unverified) — never guessed. */
async function verifyMetaPage(p: MetaAdsWriteProvider, pageId: string): Promise<{ id: string; name: string | null; roleUnverified: boolean }> {
  let pages: Awaited<ReturnType<MetaAdsWriteProvider["listPromotablePages"]>> | null = null;
  try {
    pages = await p.listPromotablePages();
  } catch (err) {
    const e = normaliseMetaError(err, "read");
    if (e.code === "META_TOKEN_INVALID" || e.code === "RATE_LIMITED") throw e;
    pages = null;
  }
  const hit = pages?.find((x) => x.id === pageId) ?? null;
  if (hit) {
    if (hit.tasks && !hit.tasks.includes(META_PAGE_ADVERTISE_TASK)) throw new ExecutionError("META_PAGE_NOT_ASSIGNED", `Page "${hit.name ?? hit.id}" par ADVERTISE task nahi hai.`, { fix: "Business Manager → Pages → 'Create ads' task." });
    return { id: hit.id, name: hit.name, roleUnverified: !hit.tasks };
  }
  let direct;
  try {
    direct = await p.describePage(pageId);
  } catch (err) {
    throw normaliseMetaError(err, "read");
  }
  if (!direct) throw new ExecutionError("META_PAGE_NOT_ASSIGNED", `Page ${pageId} token ko assigned/visible nahi hai.`, { fix: "Business Manager → Pages → system user ko 'Create ads' dein." });
  return { id: direct.id, name: direct.name, roleUnverified: true };
}

export async function metaWritePreflight(input: MetaWritePreflightInput): Promise<MetaWritePreflightResult> {
  const readiness = await metaReadiness(input);
  if (readiness.specHash !== input.expectedSpecHash) throw new ExecutionError("SPEC_CHANGED", "Draft ka spec approval ke baad badal gaya — write refuse.", { fix: "Naya approval chahiye: 'Re-check Meta readiness'." });
  const warnings: string[] = [];
  const now = input.now ?? new Date();
  const p = input.provider;
  const stored = input.stored ?? null;

  // ---- token + permissions read back ---------------------------------------
  let caps;
  try {
    caps = await p.inspectTokenCapabilities();
  } catch (err) {
    throw normaliseMetaError(err, "read");
  }
  if (!caps.granted.includes(META_WRITE_PERMISSION)) throw new ExecutionError("META_ADS_MANAGEMENT_MISSING", `Token par ${META_WRITE_PERMISSION} ab nahi hai (granted: ${caps.granted.join(", ") || "none"}).`, { fix: "Token ads_management ke saath dobara generate karein; 'Check ad creation readiness'.", reconnect: true });

  // ---- account read back ---------------------------------------------------
  let account;
  try {
    account = await p.describeAccount();
  } catch (err) {
    throw normaliseMetaError(err, "read");
  }
  if (normaliseAdAccountId(account.id) !== readiness.accountRef) throw new ExecutionError("ACCOUNT_NOT_READY", `Credentials account ${account.id} kholte hain, connection me ${readiness.accountRef} hai.`, { fix: "Ad account ID check karein." });
  if (account.accountStatus !== 1) throw new ExecutionError("META_AD_ACCOUNT_DISABLED", `Ad account status ${account.accountStatus ?? "?"} — ACTIVE (1) nahi.`, { fix: "Ads Manager me account ACTIVE karein." });
  if (account.tasks !== null && !account.tasks.some((t) => META_ACCOUNT_WRITE_TASKS.includes(t))) throw new ExecutionError("META_AD_ACCOUNT_FORBIDDEN", `Token ke tasks ${account.tasks.join(", ") || "none"} — ADVERTISE/MANAGE nahi.`, { fix: "Business Manager → Ad accounts → 'Manage campaigns' access." });
  if (account.tasks === null) warnings.push("ad account role API se verify nahi hua — pehli write hi bataayegi");
  const currency = (account.currency ?? "").toUpperCase();
  if (currency !== META_PACKAGE_CURRENCY) throw new ExecutionError("META_ACCOUNT_CURRENCY_MISMATCH", `Account currency ${currency || "?"} ≠ ${META_PACKAGE_CURRENCY}.`, { fix: `${META_PACKAGE_CURRENCY} account connect karein.` });
  const timeZone = stored?.timeZone ?? account.timeZone ?? readiness.timeZone;

  // ---- Page / Instagram read back ---------------------------------------------
  const page = await verifyMetaPage(p, readiness.pageId);
  if (page.roleUnverified) warnings.push(`Page "${page.name ?? page.id}" par ADVERTISE task verify nahi hua — pehli creative write bataayegi`);
  let instagramActorId: string | null = null;
  if (readiness.usesInstagram) {
    let actors;
    try {
      actors = await p.listInstagramActors(page.id);
    } catch (err) {
      throw normaliseMetaError(err, "read");
    }
    const ig = actors.find((a) => a.id === readiness.instagramActorId);
    if (!ig) throw new ExecutionError("META_INSTAGRAM_NOT_ASSIGNED", `Instagram account ${readiness.instagramActorId ?? "?"} Page ${page.id} se linked nahi hai.`, { fix: "Page settings → Linked accounts → Instagram; ya package se Instagram placement hatayein." });
    instagramActorId = ig.id;
  }
  if (stored && (stored.pageId !== page.id || stored.instagramActorId !== instagramActorId)) {
    throw new ExecutionError("SPEC_CHANGED", `Objects Page ${stored.pageId}${stored.instagramActorId ? ` / IG ${stored.instagramActorId}` : ""} ke saath bane the; connection ab Page ${page.id}${instagramActorId ? ` / IG ${instagramActorId}` : ""} kehta hai — adhoori hierarchy doosri identity se poori nahi karenge.`, {
      fix: "Connections me wahi Page/Instagram wapas rakhein, ya Ads Manager me paused objects dekh kar naya package banayein.",
    });
  }

  // ---- targeting: stored, or resolved uniquely by exact name --------------------
  const locations: Record<string, MetaLocationMatch> = {};
  const interests: Record<string, MetaInterestMatch> = {};
  if (stored) {
    for (const loc of readiness.spec.audience.locations) {
      const hit = stored.locations[loc];
      if (!hit) throw new ExecutionError("SPEC_CHANGED", `Location "${loc}" ka stored resolution nahi mila.`, { fix: "Human review — Ads Manager me paused objects dekhein." });
      locations[loc] = { key: hit.key, name: hit.name, type: hit.type, countryCode: hit.type === "country" ? hit.key : null, region: null };
    }
    for (const name of readiness.spec.audience.interests) {
      const hit = stored.interests[name];
      if (!hit) throw new ExecutionError("SPEC_CHANGED", `Interest "${name}" ka stored resolution nahi mila.`, { fix: "Human review — Ads Manager me paused objects dekhein." });
      interests[name] = { id: hit.id, name: hit.name, audienceSize: null, path: [] };
    }
  } else {
    for (const loc of readiness.spec.audience.locations) {
      let found: MetaLocationMatch[];
      try {
        found = await p.resolveLocations(loc);
      } catch (err) {
        throw normaliseMetaError(err, "read");
      }
      locations[loc] = pickUnique(loc, found.filter((f) => ALLOWED_LOCATION_TYPES.has(f.type)), "location");
    }
    for (const name of readiness.spec.audience.interests) {
      let found: MetaInterestMatch[];
      try {
        found = await p.resolveInterests(name);
      } catch (err) {
        throw normaliseMetaError(err, "read");
      }
      interests[name] = pickUnique(name, found, "interest");
    }
  }

  // ---- media URLs reachable + immutable (§10) ----------------------------------
  const probe = input.probeUrl ?? ((url: string) => probePublicImageUrl(url));
  for (const [conceptId, m] of Object.entries(readiness.media)) {
    if (!m.productionReady && !/^https:\/\//.test(m.url)) {
      warnings.push(`creative "${conceptId}" local-disk par hai — sirf dev/fake provider ke liye; production me BLOCKED_CREATIVE`);
      continue;
    }
    const verdict = await probe(m.url);
    if (!verdict.ok) throw new ExecutionError("CREATIVE_INVALID", `Creative "${conceptId}" ka public URL reachable/immutable nahi: ${verdict.reason ?? verdict.status ?? "?"}.`, { fix: "S3_PUBLIC_URL / bucket public access check karein, phir Retry." });
  }

  // ---- dates: settled once, then kept ------------------------------------------
  const today = calendarDateIn(timeZone, now);
  let startDate: string;
  let endDate: string;
  if (stored) {
    startDate = stored.startDate;
    endDate = stored.endDate;
    if (endDate < today) throw new ExecutionError("SPEC_INVALID", `Objects ka schedule ${endDate} ko khatam ho chuka — baaki hierarchy nahi banegi.`, { fix: "Ads Manager me paused objects dekhein; 'Revise Package' se naya schedule." });
  } else {
    startDate = readiness.startDate < today ? today : readiness.startDate;
    endDate = readiness.endDate;
    if (endDate <= startDate) throw new ExecutionError("SPEC_INVALID", `Schedule end ${endDate} aaj (${today}) ke baad nahi hai.`, { fix: "'Revise Package' me naya schedule." });
  }

  const mapped = mapMetaPackage({
    adAccountId: readiness.accountRef,
    marker: input.marker,
    spec: readiness.spec,
    providerCampaignName: readiness.providerCampaignName,
    dailyBudgetPaise: readiness.dailyBudgetPaise,
    timeZone,
    startDate,
    endDate,
    resolvedLocations: locations,
    resolvedInterests: interests,
    pageId: page.id,
    instagramActorId,
    finalUrl: readiness.finalUrl,
    media: Object.fromEntries(Object.entries(readiness.media).map(([k, v]) => [k, { mediaId: v.mediaId, imageHash: null }])),
    specialAdCategories: readiness.specialAdCategories,
    specialAdCategoryCountry: readiness.specialAdCategoryCountry,
    conversion: readiness.conversion,
    isProtectedTargeting,
  });

  return {
    readiness,
    resolved: {
      accountId: normaliseAdAccountId(account.id),
      accountName: account.name,
      currency,
      timeZone,
      pageId: page.id,
      pageName: page.name,
      pageRoleUnverified: page.roleUnverified,
      instagramActorId,
      locations,
      interests,
      granted: caps.granted,
      startDate,
      endDate,
    },
    mapped,
    warnings: [...warnings, ...mapped.warnings],
  };
}
