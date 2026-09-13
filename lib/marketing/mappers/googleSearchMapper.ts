import type { GoogleSearchPackage } from "@/lib/contracts/marketingPlanSchema";
import type { AdGroupAdCreate, CampaignCreate, GoogleMatchType, MutateOperation } from "@/lib/marketing/providers/googleAdsProvider";
import { ExecutionError } from "@/lib/services/marketing/execution/executionErrors";

/**
 * Approved `GoogleSearchPackage` → one atomic `googleAds:mutate` request
 * (doc 13 §11.2, §11.5). Pure and deterministic: same input, same operations,
 * byte for byte — which is what lets validate-only and the real write be
 * *the same request*, and what lets the check script pin every rule.
 *
 * What it refuses to do:
 *   • invent anything the package did not approve — geo/language constants
 *     and the final URL arrive resolved from preflight;
 *   • downgrade a bidding strategy (§11.3) — an unsupported one is an error;
 *   • silently drop package parts — sitelinks/callouts are *deferred* by
 *     name (§11.2) and appear on the approval card as such;
 *   • touch money as a float — paise in, micros out, integer arithmetic.
 *
 * Temporary resource names (negative ids) let one request create the budget,
 * the campaign, its criteria, ad groups, keywords and ads together, so the
 * provider either makes all of it or none of it (§9.3).
 */

export interface GoogleSearchMapInput {
  customerId: string;
  spec: GoogleSearchPackage;
  /** Base name + marker, already composed by `providerCampaignName()`. */
  providerCampaignName: string;
  dailyBudgetPaise: number;
  /** YYYY-MM-DD in the account's timezone. */
  startDate: string;
  endDate: string;
  geoTargets: { resourceName: string; name: string }[];
  languages: { resourceName: string; name: string }[];
  finalUrl: string;
}

export interface GoogleSearchMapSummary {
  adGroups: number;
  keywords: number;
  negatives: number;
  ads: number;
  headlines: number;
  descriptions: number;
  geoTargets: number;
  languages: number;
  biddingStrategy: string;
  budgetMicros: string;
}

export interface GoogleSearchMapResult {
  operations: MutateOperation[];
  summary: GoogleSearchMapSummary;
  /** Normalisations that changed nothing approved but are worth a line on the card. */
  warnings: string[];
  /** Approved parts this release does not create (§11.2 "explicitly defer"). */
  deferred: string[];
}

export const RSA_MAX_HEADLINES = 15;
export const RSA_MAX_DESCRIPTIONS = 4;
export const RSA_MIN_HEADLINES = 3;
export const RSA_MIN_DESCRIPTIONS = 2;
export const HEADLINE_MAX = 30;
export const DESCRIPTION_MAX = 90;
export const KEYWORD_MAX_CHARS = 80;
export const KEYWORD_MAX_WORDS = 10;

/** 1 rupee = 100 paise = 1,000,000 micros. Integer only (§10). */
const MICROS_PER_PAISA = BigInt(10_000);

export function paiseToMicros(paise: number): string {
  if (!Number.isInteger(paise) || paise < 0) throw new ExecutionError("INVALID_BUDGET", `budget paise integer nahi hai: ${paise}`);
  return (BigInt(paise) * MICROS_PER_PAISA).toString();
}

export function microsToPaise(micros: string | number): number {
  const big = typeof micros === "number" ? BigInt(Math.round(micros)) : BigInt(micros);
  return Number(big / MICROS_PER_PAISA);
}

const MATCH_TYPES: ReadonlySet<string> = new Set(["EXACT", "PHRASE", "BROAD"]);
/** Google rejects these inside keyword text; brackets/quotes are match-type notation the model sometimes echoes. */
const KEYWORD_FORBIDDEN = /[!@%^*()={};~`<>?\\|]/;

function cleanKeywordText(raw: string, warnings: string[], where: string): string {
  let text = raw.trim();
  const stripped = text.replace(/^\[|\]$/g, "").replace(/^"|"$/g, "").replace(/^\+/, "").trim();
  if (stripped !== text) {
    warnings.push(`${where}: keyword notation "${text}" → "${stripped}" (match type field se aata hai)`);
    text = stripped;
  }
  text = text.replace(/\s+/g, " ");
  if (!text) throw new ExecutionError("SPEC_INVALID", `${where}: khaali keyword`, { fix: "Package me keyword sudhaarein ('Revise Package')." });
  if (KEYWORD_FORBIDDEN.test(text)) throw new ExecutionError("SPEC_INVALID", `${where}: keyword "${text}" me Google-disallowed character hai`, { fix: "Package me keyword sudhaarein ('Revise Package')." });
  if (text.length > KEYWORD_MAX_CHARS) throw new ExecutionError("SPEC_INVALID", `${where}: keyword ${text.length} chars > ${KEYWORD_MAX_CHARS}`, { fix: "Package me keyword chhota karein." });
  if (text.split(" ").length > KEYWORD_MAX_WORDS) throw new ExecutionError("SPEC_INVALID", `${where}: keyword ${text.split(" ").length} words > ${KEYWORD_MAX_WORDS}`, { fix: "Package me keyword chhota karein." });
  return text;
}

function cleanCopy(list: string[], max: number, min: number, cap: number, where: string, warnings: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const text = raw.replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (text.length > max) throw new ExecutionError("SPEC_INVALID", `${where}: "${text.slice(0, 40)}…" ${text.length} chars > ${max}`, { fix: "Package me copy chhoti karein ('Revise Package')." });
    const key = text.toLowerCase();
    if (seen.has(key)) {
      warnings.push(`${where}: duplicate "${text}" ek baar bheja`);
      continue;
    }
    seen.add(key);
    out.push(text);
  }
  if (out.length < min) throw new ExecutionError("SPEC_INVALID", `${where}: sirf ${out.length} entries (Google ko ≥${min} chahiye)`, { fix: "Package me aur copy likhwayein ('Revise Package')." });
  if (out.length > cap) {
    warnings.push(`${where}: pehli ${cap} bheji, ${out.length - cap} deferred: ${out.slice(cap).map((s) => `"${s}"`).join(", ")}`);
    return out.slice(0, cap);
  }
  return out;
}

function bidding(spec: GoogleSearchPackage): Pick<CampaignCreate, "maximizeConversions" | "maximizeClicks"> {
  switch (spec.biddingStrategy) {
    case "MAXIMIZE_CONVERSIONS":
      return { maximizeConversions: {} };
    case "MAXIMIZE_CLICKS":
      return { maximizeClicks: {} };
    case "TARGET_CPA": {
      const cpa = spec.targetCpaRupees;
      if (cpa === null || !Number.isFinite(cpa) || cpa <= 0) {
        throw new ExecutionError("INVALID_BIDDING", "TARGET_CPA chuna hai par target CPA nahi diya", { fix: "Package me targetCpaRupees set karein ya MAXIMIZE_CONVERSIONS chunein ('Revise Package')." });
      }
      return { maximizeConversions: { targetCpaMicros: paiseToMicros(Math.round(cpa * 100)) } };
    }
    case "MANUAL_CPC":
      // The package carries no per-keyword bids; inventing one would be a silent strategy change (§11.3).
      throw new ExecutionError("INVALID_BIDDING", "MANUAL_CPC ke liye package me bids nahi hain", { fix: "Package me MAXIMIZE_CONVERSIONS / MAXIMIZE_CLICKS / TARGET_CPA chunein ('Revise Package')." });
    default:
      throw new ExecutionError("INVALID_BIDDING", `bidding strategy "${String(spec.biddingStrategy)}" allow-list me nahi hai`);
  }
}

export function mapGoogleSearchPackage(input: GoogleSearchMapInput): GoogleSearchMapResult {
  const { spec } = input;
  const cid = input.customerId.replace(/[^0-9]/g, "");
  if (!cid) throw new ExecutionError("ACCOUNT_NOT_READY", "Google Ads customer ID khaali hai", { fix: "Connections me Customer ID daalein." });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate)) throw new ExecutionError("INTERNAL_ERROR", "campaign dates YYYY-MM-DD nahi hain");
  if (input.endDate < input.startDate) throw new ExecutionError("INVALID_BUDGET", `end date ${input.endDate} start ${input.startDate} se pehle hai`);
  if (!input.geoTargets.length) throw new ExecutionError("INVALID_GEO_OR_LANGUAGE", "koi geo target resolve nahi hua");
  if (!input.languages.length) throw new ExecutionError("INVALID_GEO_OR_LANGUAGE", "koi language constant resolve nahi hua");
  if (!spec.adGroups.length) throw new ExecutionError("SPEC_INVALID", "package me koi ad group nahi hai", { fix: "'Revise Package' se ad groups banwayein." });
  if (input.dailyBudgetPaise <= 0) throw new ExecutionError("INVALID_BUDGET", "daily budget 0 hai");

  const warnings: string[] = [];
  const deferred: string[] = [];
  const ops: MutateOperation[] = [];
  const budgetMicros = paiseToMicros(input.dailyBudgetPaise);

  const budgetRef = `customers/${cid}/campaignBudgets/-1`;
  const campaignRef = `customers/${cid}/campaigns/-2`;

  ops.push({
    campaignBudgetOperation: {
      create: { resourceName: budgetRef, name: `${input.providerCampaignName} · budget`, amountMicros: budgetMicros, deliveryMethod: "STANDARD", explicitlyShared: false },
    },
  });

  ops.push({
    campaignOperation: {
      create: {
        resourceName: campaignRef,
        name: input.providerCampaignName,
        status: "PAUSED",
        advertisingChannelType: "SEARCH",
        campaignBudget: budgetRef,
        networkSettings: {
          targetGoogleSearch: true,
          targetSearchNetwork: spec.network === "SEARCH_AND_PARTNERS",
          targetContentNetwork: false,
          targetPartnerSearchNetwork: false,
        },
        startDate: input.startDate,
        endDate: input.endDate,
        containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
        ...bidding(spec),
      },
    },
  });

  for (const geo of input.geoTargets) ops.push({ campaignCriterionOperation: { create: { campaign: campaignRef, location: { geoTargetConstant: geo.resourceName } } } });
  for (const lang of input.languages) ops.push({ campaignCriterionOperation: { create: { campaign: campaignRef, language: { languageConstant: lang.resourceName } } } });

  // Campaign-level negatives, BROAD: the most protective reading of "never show for this".
  const negativeSeen = new Set<string>();
  const positiveTexts = new Set<string>();
  let negatives = 0;
  for (const [i, raw] of spec.negativeKeywords.entries()) {
    const text = cleanKeywordText(raw, warnings, `negativeKeywords[${i}]`);
    const key = text.toLowerCase();
    if (negativeSeen.has(key)) continue;
    negativeSeen.add(key);
    ops.push({ campaignCriterionOperation: { create: { campaign: campaignRef, negative: true, keyword: { text, matchType: "BROAD" } } } });
    negatives += 1;
  }

  let keywords = 0;
  let headlines = 0;
  let descriptions = 0;
  spec.adGroups.forEach((ag, i) => {
    const where = `adGroups[${i}]`;
    const adGroupRef = `customers/${cid}/adGroups/-${10 + i}`;
    const name = ag.name.replace(/\s+/g, " ").trim().slice(0, 255) || `Ad group ${i + 1}`;
    ops.push({ adGroupOperation: { create: { resourceName: adGroupRef, campaign: campaignRef, name, status: "ENABLED", type: "SEARCH_STANDARD" } } });

    const seen = new Set<string>();
    let count = 0;
    ag.keywords.forEach((k, j) => {
      const text = cleanKeywordText(k.text, warnings, `${where}.keywords[${j}]`);
      const matchType = String(k.matchType).toUpperCase();
      if (!MATCH_TYPES.has(matchType)) throw new ExecutionError("SPEC_INVALID", `${where}.keywords[${j}]: match type "${k.matchType}" allow-list me nahi`, { fix: "'Revise Package'." });
      const key = `${text.toLowerCase()}|${matchType}`;
      if (seen.has(key)) {
        warnings.push(`${where}: duplicate keyword "${text}" (${matchType}) ek baar bheja`);
        return;
      }
      seen.add(key);
      positiveTexts.add(text.toLowerCase());
      ops.push({ adGroupCriterionOperation: { create: { adGroup: adGroupRef, status: "ENABLED", keyword: { text, matchType: matchType as GoogleMatchType } } } });
      count += 1;
    });
    if (count === 0) throw new ExecutionError("SPEC_INVALID", `${where}: koi keyword nahi bacha`, { fix: "'Revise Package' se keywords banwayein." });
    keywords += count;

    const h = cleanCopy(ag.headlines, HEADLINE_MAX, RSA_MIN_HEADLINES, RSA_MAX_HEADLINES, `${where}.headlines`, warnings);
    const d = cleanCopy(ag.descriptions, DESCRIPTION_MAX, RSA_MIN_DESCRIPTIONS, RSA_MAX_DESCRIPTIONS, `${where}.descriptions`, warnings);
    headlines += h.length;
    descriptions += d.length;
    const ad: AdGroupAdCreate = {
      adGroup: adGroupRef,
      status: "ENABLED",
      ad: { finalUrls: [input.finalUrl], responsiveSearchAd: { headlines: h.map((text) => ({ text })), descriptions: d.map((text) => ({ text })) } },
    };
    ops.push({ adGroupAdOperation: { create: ad } });
  });

  for (const neg of negativeSeen) {
    if (positiveTexts.has(neg)) warnings.push(`negative "${neg}" ek ad group keyword bhi hai — wo keyword kabhi serve nahi hoga`);
  }

  if (spec.sitelinks.length) deferred.push(`${spec.sitelinks.length} sitelink(s) — is release me nahi bante; campaign ke baad Google Ads UI me add karein`);
  if (spec.callouts.length) deferred.push(`${spec.callouts.length} callout(s) — is release me nahi bante; campaign ke baad Google Ads UI me add karein`);

  return {
    operations: ops,
    summary: {
      adGroups: spec.adGroups.length,
      keywords,
      negatives,
      ads: spec.adGroups.length,
      headlines,
      descriptions,
      geoTargets: input.geoTargets.length,
      languages: input.languages.length,
      biddingStrategy: spec.biddingStrategy,
      budgetMicros,
    },
    warnings,
    deferred,
  };
}

/**
 * Language strings the package may use → Google language constants. Fixed
 * table (§11.2 "configured language criterion constants"); anything else is
 * a preflight error, never a guess. Only the two the plan schema names are
 * listed — a wrong constant would target the wrong language silently, so a
 * regional language is added here only after its id is verified against
 * Google's language-codes table.
 */
export const LANGUAGE_CONSTANTS: Record<string, { resourceName: string; name: string }> = {
  english: { resourceName: "languageConstants/1000", name: "English" },
  hindi: { resourceName: "languageConstants/1023", name: "Hindi" },
  /** Hinglish is typed in Latin script and lands under English (same rule as the keyword reads). */
  hinglish: { resourceName: "languageConstants/1000", name: "English" },
};

/** "Hindi, English" → both constants, de-duplicated; an unknown name throws. */
export function resolveLanguages(language: string): { resourceName: string; name: string }[] {
  const out = new Map<string, { resourceName: string; name: string }>();
  for (const part of language.split(/[,/&+]| aur | and /i)) {
    const key = part.trim().toLowerCase();
    if (!key) continue;
    const found = LANGUAGE_CONSTANTS[key];
    if (!found) throw new ExecutionError("INVALID_GEO_OR_LANGUAGE", `language "${part.trim()}" mapping me nahi hai`, { fix: "Package me language Hindi/English (ya listed) rakhein ('Revise Package')." });
    out.set(found.resourceName, found);
  }
  if (!out.size) throw new ExecutionError("INVALID_GEO_OR_LANGUAGE", "package me language khaali hai");
  return [...out.values()];
}

/** IST calendar date for an instant, as YYYY-MM-DD — Google reads campaign dates in the account's timezone. */
export function calendarDateIn(timeZone: string, at: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}
