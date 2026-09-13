import "server-only";
import { GoogleSearchPackageSchema, type GoogleSearchPackage } from "@/lib/contracts/marketingPlanSchema";
import { EXECUTABLE_PLATFORMS } from "@/lib/contracts/marketingExecution";
import { appOrigin } from "@/lib/utils/appOrigin";
import { executableWriteTool } from "@/lib/marketing/tools/registry";
import { buildFinalUrl, checkLandingUrl } from "@/lib/marketing/mappers/landingUrl";
import { addDays, calendarDateIn, mapGoogleSearchPackage, resolveLanguages, type GoogleSearchMapResult } from "@/lib/marketing/mappers/googleSearchMapper";
import type { GoogleAdsWriteProvider } from "@/lib/marketing/providers/googleAdsProvider";
import { normaliseCustomerId } from "@/lib/marketing/connectors/googleAds";
import { isKnownPublicPath } from "../contextBuilder";
import { isProtectedTargeting, objectionTo } from "../packageGuardrails";
import { listConnectionStatus } from "../connectionService";
import { ExecutionError, normaliseProviderError } from "./executionErrors";
import { providerCampaignName } from "./idempotency";
import { specHashOf } from "./hashing";
import type { CampaignDraft, MarketingGoal } from "@prisma/client";

/**
 * Preflight (doc 13 §10, §11.1-11.3) in two layers:
 *
 *   `googleReadiness()`     — no network. Runs when a package is approved
 *                             (to decide whether a create card may exist at
 *                             all) and again inside the worker. Connection,
 *                             account facts from the last successful test,
 *                             budget caps, landing allow-list, guardrails
 *                             re-verified, mapper dry run for spec errors.
 *
 *   `googleWritePreflight()` — with the provider, immediately before a
 *                             write. Account currency/timezone read back,
 *                             conversion action resolved (never guessed —
 *                             §23), geo constants resolved, billing checked,
 *                             dates settled, the exact operations built.
 *
 * Everything throws `ExecutionError`; the caller decides the row's fate.
 */

export const PACKAGE_CURRENCY = "INR";

export interface GoogleReadiness {
  accountRef: string;
  accountLabel: string;
  currency: string;
  timeZone: string;
  spec: GoogleSearchPackage;
  specHash: string;
  finalUrl: string;
  windowDays: number;
  dailyBudgetPaise: number;
  maxSpendPaise: number;
  goalDailyCapPaise: number | null;
  goalTotalCapPaise: number | null;
  providerCampaignName: string;
  /** From the mapper dry run — surfaced on the create card. */
  warnings: string[];
  deferred: string[];
  /** Connection settings, for the conversion-action overrides (`conversion_<event>`). */
  settings: Record<string, string>;
}

export interface ReadinessInput {
  draft: CampaignDraft;
  goal: MarketingGoal | null;
  /** Every approved draft of the same package — the combined daily cap is checked across them (§10.8). */
  siblingDrafts: CampaignDraft[];
  marker: string;
  now?: Date;
}

/** Google accepts what guardrails accepted; anything the rules reject *today* blocks the write (§10.6). */
export function reverifyGoogleCopy(spec: GoogleSearchPackage): string[] {
  const problems: string[] = [];
  spec.adGroups.forEach((ag, i) => {
    ag.headlines.forEach((h, j) => {
      const why = objectionTo(h);
      if (why) problems.push(`adGroups[${i}].headlines[${j}]: ${why}`);
      if (h.length > 30) problems.push(`adGroups[${i}].headlines[${j}]: ${h.length} chars > 30`);
    });
    ag.descriptions.forEach((d, j) => {
      const why = objectionTo(d);
      if (why) problems.push(`adGroups[${i}].descriptions[${j}]: ${why}`);
      if (d.length > 90) problems.push(`adGroups[${i}].descriptions[${j}]: ${d.length} chars > 90`);
    });
    ag.keywords.forEach((k, j) => {
      if (isProtectedTargeting(k.text)) problems.push(`adGroups[${i}].keywords[${j}]: protected characteristic "${k.text}"`);
    });
  });
  spec.negativeKeywords.forEach((n, j) => {
    if (isProtectedTargeting(n)) problems.push(`negativeKeywords[${j}]: protected characteristic "${n}"`);
  });
  spec.callouts.forEach((c, j) => {
    const why = objectionTo(c);
    if (why) problems.push(`callouts[${j}]: ${why}`);
  });
  return problems;
}

export async function googleReadiness(input: ReadinessInput): Promise<GoogleReadiness> {
  const { draft, goal } = input;
  const now = input.now ?? new Date();

  if (!EXECUTABLE_PLATFORMS.has("GOOGLE_SEARCH") || !executableWriteTool("CREATE_PAUSED_CAMPAIGNS", "GOOGLE_SEARCH")) {
    throw new ExecutionError("NOT_EXECUTABLE_YET", "Google paused-create is release me executable nahi hai.");
  }

  // ---- connection: CONNECTED and tested (§10.1-2) --------------------------
  const rows = await listConnectionStatus();
  const conn = rows.find((r) => r.provider === "GOOGLE_ADS");
  if (!conn || conn.health !== "CONNECTED") {
    throw new ExecutionError("ACCOUNT_NOT_READY", `Google Ads connection ${conn ? conn.health : "missing"}.`, { fix: conn?.todo ?? "Connections me Google Ads connect karein.", retrySafe: false });
  }
  if (!conn.accountRef) throw new ExecutionError("ACCOUNT_NOT_READY", "Google Ads customer ID set nahi hai.", { fix: "Connections → Google Ads → Customer ID." });
  if (!conn.lastSyncAt || !conn.settings.currency || !conn.settings.timeZone) {
    throw new ExecutionError("ACCOUNT_NOT_READY", "Google Ads account ka currency/timezone abhi verify nahi hua.", { fix: "Connections → Google Ads → 'Test connection' chalayein (account facts save hote hain)." });
  }
  if (conn.settings.isManager === "true") {
    throw new ExecutionError("ACCOUNT_NOT_READY", "Ye ek manager (MCC) account hai — campaigns child account me bante hain.", { fix: "Customer ID me client account daalein; manager ID ko 'Login customer ID' me rakhein." });
  }
  const currency = conn.settings.currency.toUpperCase();
  if (currency !== PACKAGE_CURRENCY) {
    throw new ExecutionError("INVALID_BUDGET", `Account currency ${currency} hai, package ${PACKAGE_CURRENCY} me hai — silent conversion nahi hoti.`, { fix: `${PACKAGE_CURRENCY} wala Google Ads account connect karein.` });
  }

  // ---- spec ----------------------------------------------------------------
  const parsed = GoogleSearchPackageSchema.safeParse(draft.spec);
  if (!parsed.success) {
    throw new ExecutionError("SPEC_INVALID", `Draft spec schema se match nahi karta: ${parsed.error.issues[0]?.path.join(".") ?? ""} ${parsed.error.issues[0]?.message ?? ""}`.trim(), { fix: "'Revise Package' se naya package banwayein." });
  }
  const spec = parsed.data;
  const specHash = specHashOf({ platform: draft.platform, spec: draft.spec, dailyBudgetPaise: draft.dailyBudgetPaise, totalBudgetPaise: draft.totalBudgetPaise });

  // ---- budgets (§10.7-8) ---------------------------------------------------
  const dailyBudgetPaise = draft.dailyBudgetPaise ?? 0;
  if (!Number.isInteger(dailyBudgetPaise) || dailyBudgetPaise <= 0) throw new ExecutionError("INVALID_BUDGET", "Draft ka daily budget 0/khaali hai.", { fix: "'Revise Package' me daily budget dein." });
  const goalDailyCapPaise = goal?.dailyBudgetPaise ?? null;
  const goalTotalCapPaise = goal?.totalBudgetPaise ?? null;
  if (goalDailyCapPaise === null && goalTotalCapPaise === null) throw new ExecutionError("INVALID_BUDGET", "Goal par koi admin budget cap nahi hai.", { fix: "Task me jawab likhein: daily/total cap." });
  if (goalDailyCapPaise !== null && dailyBudgetPaise > goalDailyCapPaise) {
    throw new ExecutionError("INVALID_BUDGET", `Draft daily ₹${dailyBudgetPaise / 100} goal cap ₹${goalDailyCapPaise / 100} se zyada hai.`, { fix: "'Revise Package'." });
  }
  const combinedDaily = input.siblingDrafts.reduce((s, d) => s + (d.dailyBudgetPaise ?? 0), 0);
  if (goalDailyCapPaise !== null && combinedDaily > goalDailyCapPaise) {
    throw new ExecutionError("INVALID_BUDGET", `Sab platforms ka combined daily ₹${combinedDaily / 100} goal cap ₹${goalDailyCapPaise / 100} se zyada hai.`, { fix: "'Revise Package' me budgets kam karwayein." });
  }
  const windowDays = Math.max(1, goal?.windowDays ?? 30);
  const maxSpendPaise = dailyBudgetPaise * windowDays;
  if (goalTotalCapPaise !== null && maxSpendPaise > goalTotalCapPaise) {
    throw new ExecutionError("INVALID_BUDGET", `₹${dailyBudgetPaise / 100}/day × ${windowDays} din = ₹${maxSpendPaise / 100}, goal total cap ₹${goalTotalCapPaise / 100} se zyada.`, {
      fix: "Window chhoti karein ya total cap badhayein (task me jawab likhein), phir 'Revise Package'.",
    });
  }

  // ---- landing (§10.11-12) -------------------------------------------------
  const origin = appOrigin();
  const finalUrl = buildFinalUrl({ origin, landingPath: spec.landingPath, utm: spec.utm });
  const landing = checkLandingUrl(finalUrl, origin, isKnownPublicPath);
  if (!landing.ok) throw new ExecutionError("INVALID_LANDING", `Landing URL reject: ${landing.reason}`, { fix: "NEXT_PUBLIC_APP_URL ko https://bandhantak.com rakhein aur package ka landingPath public page ho." });

  // ---- guardrails again (§10.6, §10.14) ------------------------------------
  const problems = reverifyGoogleCopy(spec);
  if (problems.length) throw new ExecutionError("GUARDRAIL_FAILED", `Guardrails ne ${problems.length} cheez roki: ${problems.slice(0, 3).join(" · ")}`, { fix: "'Revise Package' — ye copy/targeting ab allowed nahi hai." });

  // ---- mapper dry run: spec/bidding errors before any card exists ----------
  const name = providerCampaignName(spec.campaignName, input.marker);
  const today = calendarDateIn(conn.settings.timeZone, now);
  const dry = mapGoogleSearchPackage({
    customerId: conn.accountRef,
    spec,
    providerCampaignName: name,
    dailyBudgetPaise,
    startDate: today,
    endDate: addDays(today, windowDays - 1),
    geoTargets: [{ resourceName: "geoTargetConstants/2356", name: "India (dry run)" }],
    languages: resolveLanguages(spec.language),
    finalUrl,
  });

  return {
    accountRef: normaliseCustomerId(conn.accountRef),
    accountLabel: conn.accountLabel ?? "",
    currency,
    timeZone: conn.settings.timeZone,
    spec,
    specHash,
    finalUrl,
    windowDays,
    dailyBudgetPaise,
    maxSpendPaise,
    goalDailyCapPaise,
    goalTotalCapPaise,
    providerCampaignName: name,
    warnings: dry.warnings,
    deferred: dry.deferred,
    settings: conn.settings,
  };
}

// ============================================================
// With the provider — immediately before a write
// ============================================================

export interface ResolvedGoogleFacts {
  customerId: string;
  accountName: string | null;
  isTestAccount: boolean;
  currency: string;
  timeZone: string;
  geo: { resourceName: string; name: string }[];
  languages: { resourceName: string; name: string }[];
  conversionAction: { resourceName: string; name: string } | null;
  billingApproved: boolean | null;
  startDate: string;
  endDate: string;
  finalUrl: string;
  providerCampaignName: string;
}

export interface WritePreflightResult {
  readiness: GoogleReadiness;
  resolved: ResolvedGoogleFacts;
  mapped: GoogleSearchMapResult;
  warnings: string[];
}

export async function googleWritePreflight(input: ReadinessInput & { provider: GoogleAdsWriteProvider; expectedSpecHash: string }): Promise<WritePreflightResult> {
  const readiness = await googleReadiness(input);
  if (readiness.specHash !== input.expectedSpecHash) {
    throw new ExecutionError("SPEC_CHANGED", "Draft ka spec approval ke baad badal gaya — write refuse.", { fix: "Naya approval chahiye: 'Re-check readiness'." });
  }
  const warnings: string[] = [];
  const now = input.now ?? new Date();

  let account;
  try {
    account = await input.provider.describeAccount();
  } catch (err) {
    throw normaliseProviderError(err, "read");
  }
  if (normaliseCustomerId(account.customerId) !== readiness.accountRef) {
    throw new ExecutionError("ACCOUNT_NOT_READY", `Credentials account ${account.customerId} kholte hain, connection me ${readiness.accountRef} hai.`, { fix: "Customer ID / login-customer-id check karein." });
  }
  if (account.isManager) throw new ExecutionError("ACCOUNT_NOT_READY", "Manager account me campaign nahi ban sakta.", { fix: "Client customer ID daalein." });
  const currency = (account.currency ?? "").toUpperCase();
  if (currency !== PACKAGE_CURRENCY) throw new ExecutionError("INVALID_BUDGET", `Account currency ${currency || "?"} ≠ ${PACKAGE_CURRENCY}.`, { fix: `${PACKAGE_CURRENCY} account connect karein.` });
  const timeZone = account.timeZone ?? readiness.timeZone;

  // ---- conversion action (§10.13, §11.3, §23: never guessed) ---------------
  const spec = readiness.spec;
  const needsConversions = spec.biddingStrategy === "MAXIMIZE_CONVERSIONS" || spec.biddingStrategy === "TARGET_CPA";
  let conversionAction: ResolvedGoogleFacts["conversionAction"] = null;
  let actions: Awaited<ReturnType<GoogleAdsWriteProvider["listEnabledConversionActions"]>>;
  try {
    actions = await input.provider.listEnabledConversionActions();
  } catch (err) {
    throw normaliseProviderError(err, "read");
  }
  const override = readiness.settings[`conversion_${spec.conversionAction}`]?.trim();
  if (override) {
    const hit = actions.find((a) => a.resourceName === override);
    if (!hit) throw new ExecutionError("INVALID_CONVERSION_ACTION", `Mapped conversion action ${override} account me ENABLED nahi mila.`, { fix: `Connections → Google Ads → conversion mapping me sahi resource name daalein (event ${spec.conversionAction}).` });
    conversionAction = { resourceName: hit.resourceName, name: hit.name };
  } else {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const hit = actions.find((a) => norm(a.name) === norm(spec.conversionAction));
    if (hit) conversionAction = { resourceName: hit.resourceName, name: hit.name };
  }
  if (!conversionAction && needsConversions) {
    const names = actions.map((a) => a.name).slice(0, 6).join(", ") || "koi nahi";
    throw new ExecutionError("INVALID_CONVERSION_ACTION", `${spec.biddingStrategy} ke liye conversion action "${spec.conversionAction}" account me nahi mila (ENABLED: ${names}).`, {
      fix: `Google Ads me "${spec.conversionAction}" naam ka conversion action banayein, ya Connections → Google Ads → conversion mapping me event=resourceName likhein.`,
    });
  }
  if (!conversionAction) warnings.push(`conversion action "${spec.conversionAction}" account me nahi mila — ${spec.biddingStrategy} par campaign chalega, BandhanTak conversions Google me nahi ginenge`);

  // ---- geo & language (§10.14, §11.2) --------------------------------------
  const geo: ResolvedGoogleFacts["geo"] = [];
  for (const location of spec.locations) {
    let hit;
    try {
      hit = await input.provider.resolveGeoTarget(location);
    } catch (err) {
      throw normaliseProviderError(err, "read");
    }
    if (!hit) throw new ExecutionError("INVALID_GEO_OR_LANGUAGE", `Location "${location}" Google geo targets me nahi mili.`, { fix: "'Revise Package' me location ka naam city/state/India ki tarah likhwayein." });
    if (!geo.some((g) => g.resourceName === hit.resourceName)) geo.push({ resourceName: hit.resourceName, name: hit.name });
  }
  const languages = resolveLanguages(spec.language);

  // ---- billing (§10, §16 BILLING_NOT_READY) --------------------------------
  const billingApproved = await input.provider.hasApprovedBilling();
  if (billingApproved === false) warnings.push("account par approved billing setup nahi dikha — paused create theek hai, activation block hogi");
  if (billingApproved === null) warnings.push("billing setup padh nahi paaye (permission) — activation se pehle Google Ads me billing confirm karein");

  // ---- dates settle at creation (§11.2) ------------------------------------
  const startDate = calendarDateIn(timeZone, now);
  const endDate = addDays(startDate, readiness.windowDays - 1);

  const mapped = mapGoogleSearchPackage({
    customerId: readiness.accountRef,
    spec,
    providerCampaignName: readiness.providerCampaignName,
    dailyBudgetPaise: readiness.dailyBudgetPaise,
    startDate,
    endDate,
    geoTargets: geo,
    languages,
    finalUrl: readiness.finalUrl,
  });

  return {
    readiness,
    resolved: {
      customerId: normaliseCustomerId(account.customerId),
      accountName: account.name,
      isTestAccount: account.isTestAccount,
      currency,
      timeZone,
      geo,
      languages,
      conversionAction,
      billingApproved,
      startDate,
      endDate,
      finalUrl: readiness.finalUrl,
      providerCampaignName: readiness.providerCampaignName,
    },
    mapped,
    warnings: [...warnings, ...mapped.warnings],
  };
}
