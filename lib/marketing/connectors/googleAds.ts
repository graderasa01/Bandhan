import "server-only";
import { ConnectorError, connectorFetchJson, microsToRupees, toNumber } from "./http";
import { extractGoogleErrors, summariseGoogleErrors } from "@/lib/services/marketing/execution/executionErrors";

/**
 * Google Ads — REST, no SDK (§13: adapters own the platform shape, the AI
 * brain never imports one).
 *
 * Version is explicit and env-overridable. Google moved to monthly minor
 * releases with v23 (Jan 2026) and sunsets a major roughly a year after the
 * next one ships; when `v23` stops answering, `GOOGLE_ADS_API_VERSION=v24`
 * in the deployment env is the fix, not a code change.
 *
 * Every call carries the OAuth access token (minted from the sealed refresh
 * token by `connectionService`) and — only when the account is reached
 * through a manager — `login-customer-id`. None of it is stored here.
 *
 * The developer token is **legacy** (doc 14 Gap B). Google sunset developer
 * tokens on 9 September 2026: API access level (Test / Basic / Standard /
 * Explorer) is now a property of the Google Cloud project that issued the
 * OAuth client, and a `developer-token` header is "optional and ignored by
 * the API servers". One may still be pasted for an older setup; the header
 * is sent only when a value exists and its absence never blocks a call.
 */

export const googleAdsApiVersion = () => process.env.GOOGLE_ADS_API_VERSION ?? "v23";
const API_VERSION = googleAdsApiVersion;
const BASE = () => `https://googleads.googleapis.com/${API_VERSION()}`;
export const googleAdsBase = BASE;

export interface GoogleAdsAuth {
  accessToken: string;
  /** Legacy, optional — see the module comment. Null means "do not send the header". */
  developerToken: string | null;
  customerId: string;
  loginCustomerId?: string | null;
}

export function googleAdsHeaders(auth: GoogleAdsAuth): Record<string, string> {
  return headers(auth);
}

function headers(auth: GoogleAdsAuth): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${auth.accessToken}`,
    "Content-Type": "application/json",
  };
  const devToken = auth.developerToken?.trim();
  if (devToken) h["developer-token"] = devToken;
  const login = normaliseCustomerId(auth.loginCustomerId ?? "");
  if (login) h["login-customer-id"] = login;
  return h;
}

/**
 * Google Ads API access levels as the Cloud project defines them. Test
 * access can mutate only test accounts; Basic/Standard can write to
 * production accounts; Explorer is the limited starter level. The level is
 * not readable through the API — the admin records what the Cloud console
 * shows, and preflight refuses only the one combination the docs make
 * unambiguous (Test access on a non-test account).
 */
export const GOOGLE_ADS_ACCESS_LEVELS = ["UNKNOWN", "TEST", "EXPLORER", "BASIC", "STANDARD"] as const;
export type GoogleAdsAccessLevel = (typeof GOOGLE_ADS_ACCESS_LEVELS)[number];

export function normaliseAccessLevel(raw: string | null | undefined): GoogleAdsAccessLevel {
  const v = (raw ?? "").trim().toUpperCase();
  return (GOOGLE_ADS_ACCESS_LEVELS as readonly string[]).includes(v) ? (v as GoogleAdsAccessLevel) : "UNKNOWN";
}

/** "123-456-7890" and "1234567890" are the same account; the API wants digits only. */
export function normaliseCustomerId(raw: string): string {
  return raw.replace(/[^0-9]/g, "");
}

// ---- GAQL search -----------------------------------------------------------

interface SearchResponse {
  results?: Array<Record<string, unknown>>;
  nextPageToken?: string;
}

/**
 * One GAQL search, read-only; shared with the MKT-2 write connector for its
 * read-backs. The body is the query alone: since v17 a search answers in
 * fixed 10,000-row pages and refuses any `pageSize` with
 * `requestError.PAGE_SIZE_NOT_SUPPORTED` (400) — which is what every Ads read
 * returned in production on 2026-09-13. Row counts belong in the GAQL
 * `LIMIT`; only the first page is read.
 */
export async function searchGoogleAds(auth: GoogleAdsAuth, query: string): Promise<Array<Record<string, unknown>>> {
  return search(auth, query);
}

/** Keeps only `errors[].{errorCode,message,location}` from a Google failure body. */
export function googleErrorDetails(body: unknown): unknown {
  const errors = extractGoogleErrors(body);
  return errors.length ? { errors } : null;
}

async function search(auth: GoogleAdsAuth, query: string): Promise<Array<Record<string, unknown>>> {
  const cid = normaliseCustomerId(auth.customerId);
  if (!cid) throw new ConnectorError("NOT_FOUND", "Google Ads customer ID set nahi hai.");
  try {
    const body = await connectorFetchJson<SearchResponse>(
      `${BASE()}/customers/${cid}/googleAds:search`,
      { method: "POST", headers: headers(auth), body: JSON.stringify({ query }) },
      { provider: "google-ads", timeoutMs: 25_000, errorDetails: googleErrorDetails },
    );
    return body.results ?? [];
  } catch (err) {
    // The generic message is the body cut at 240 characters — for a
    // GoogleAdsFailure that is `{ "error": { "code": …` and never the one
    // sentence naming the fix (a Test-access Cloud project, a missing
    // login-customer-id). Same code, status, request id and details; only
    // the message becomes Google's own error code and text.
    const summary = err instanceof ConnectorError ? summariseGoogleErrors(err.details) : null;
    if (err instanceof ConnectorError && summary) {
      throw new ConnectorError(err.code, `google-ads: ${err.status ?? "?"} ${summary}`, err.status, err.requestId, err.details);
    }
    throw err;
  }
}

export interface GoogleAdsAccount {
  customerId: string;
  name: string | null;
  currency: string | null;
  timeZone: string | null;
  /** A manager (MCC) cannot own campaigns — MKT-2 preflight refuses to create under one. */
  isManager: boolean;
  /** Google test accounts serve nothing and bill nothing — the safe place for a first paused create. */
  isTestAccount: boolean;
}

/** The cheapest real call — proves token, developer token and account access together. */
export async function testGoogleAds(auth: GoogleAdsAuth): Promise<GoogleAdsAccount> {
  const rows = await search(
    auth,
    "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager, customer.test_account FROM customer LIMIT 1",
  );
  const customer = (rows[0]?.customer ?? {}) as Record<string, unknown>;
  return {
    customerId: String(customer.id ?? normaliseCustomerId(auth.customerId)),
    name: typeof customer.descriptiveName === "string" ? customer.descriptiveName : null,
    currency: typeof customer.currencyCode === "string" ? customer.currencyCode : null,
    timeZone: typeof customer.timeZone === "string" ? customer.timeZone : null,
    isManager: customer.manager === true,
    isTestAccount: customer.testAccount === true,
  };
}

export interface GoogleAdsCampaignRow {
  id: string;
  name: string;
  status: string;
  channelType: string;
  spendRupees: number;
  impressions: number;
  clicks: number;
  ctrPct: number;
  avgCpcRupees: number;
  conversions: number;
  costPerConversionRupees: number | null;
}

export interface GoogleAdsSearchTermRow {
  term: string;
  campaign: string;
  impressions: number;
  clicks: number;
  spendRupees: number;
  conversions: number;
}

export interface GoogleAdsPerformance {
  customerId: string;
  windowDays: 30;
  campaigns: GoogleAdsCampaignRow[];
  searchTerms: GoogleAdsSearchTermRow[];
  totals: { spendRupees: number; impressions: number; clicks: number; conversions: number };
}

/** Existing campaigns, last 30 days, most expensive first — what "kya chal raha hai" means in numbers. */
export async function readGoogleAdsPerformance(auth: GoogleAdsAuth): Promise<GoogleAdsPerformance> {
  const campaignRows = await search(
    auth,
    `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
            metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc,
            metrics.conversions, metrics.cost_per_conversion
     FROM campaign
     WHERE segments.date DURING LAST_30_DAYS AND campaign.status != 'REMOVED'
     ORDER BY metrics.cost_micros DESC
     LIMIT 50`,
  );

  const campaigns: GoogleAdsCampaignRow[] = campaignRows.map((r) => {
    const c = (r.campaign ?? {}) as Record<string, unknown>;
    const m = (r.metrics ?? {}) as Record<string, unknown>;
    const conversions = toNumber(m.conversions);
    return {
      id: String(c.id ?? ""),
      name: String(c.name ?? ""),
      status: String(c.status ?? ""),
      channelType: String(c.advertisingChannelType ?? ""),
      spendRupees: microsToRupees(m.costMicros as string),
      impressions: toNumber(m.impressions),
      clicks: toNumber(m.clicks),
      ctrPct: Math.round(toNumber(m.ctr) * 10000) / 100,
      avgCpcRupees: microsToRupees(m.averageCpc as string),
      conversions,
      costPerConversionRupees: conversions > 0 ? microsToRupees(m.costPerConversion as string) : null,
    };
  });

  // Search terms are the one place existing ads tell you what people
  // actually typed — the doc lists them as a topic source (§7).
  let searchTerms: GoogleAdsSearchTermRow[] = [];
  try {
    const termRows = await search(
      auth,
      `SELECT search_term_view.search_term, campaign.name,
              metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
       FROM search_term_view
       WHERE segments.date DURING LAST_30_DAYS
       ORDER BY metrics.impressions DESC
       LIMIT 40`,
    );
    searchTerms = termRows.map((r) => {
      const v = (r.searchTermView ?? {}) as Record<string, unknown>;
      const c = (r.campaign ?? {}) as Record<string, unknown>;
      const m = (r.metrics ?? {}) as Record<string, unknown>;
      return {
        term: String(v.searchTerm ?? ""),
        campaign: String(c.name ?? ""),
        impressions: toNumber(m.impressions),
        clicks: toNumber(m.clicks),
        spendRupees: microsToRupees(m.costMicros as string),
        conversions: toNumber(m.conversions),
      };
    });
  } catch (err) {
    // An account with no search campaigns has no search_term_view rows and
    // some managers deny the view; the campaign table above is still valid.
    console.warn("[marketing:google-ads] search terms unavailable:", err instanceof Error ? err.message : String(err));
  }

  const totals = campaigns.reduce(
    (acc, c) => ({
      spendRupees: Math.round((acc.spendRupees + c.spendRupees) * 100) / 100,
      impressions: acc.impressions + c.impressions,
      clicks: acc.clicks + c.clicks,
      conversions: acc.conversions + c.conversions,
    }),
    { spendRupees: 0, impressions: 0, clicks: 0, conversions: 0 },
  );

  return { customerId: normaliseCustomerId(auth.customerId), windowDays: 30, campaigns, searchTerms, totals };
}

// ---- Keyword Planner -------------------------------------------------------

/** India. Used when no city could be resolved — a plan must never silently go global. */
export const GEO_INDIA = "geoTargetConstants/2356";
/** English. Hinglish queries are typed in Latin script and land here; Hindi (1023) misses them. */
export const LANGUAGE_ENGLISH = "languageConstants/1000";

export interface GeoTarget {
  resourceName: string;
  name: string;
  targetType: string;
}

/** City/state name → geo target constant. Null when Google does not know the place. */
export async function suggestGeoTarget(auth: GoogleAdsAuth, locationName: string): Promise<GeoTarget | null> {
  const body = await connectorFetchJson<{
    geoTargetConstantSuggestions?: Array<{ geoTargetConstant?: { resourceName?: string; name?: string; targetType?: string; countryCode?: string } }>;
  }>(
    `${BASE()}/geoTargetConstants:suggest`,
    {
      method: "POST",
      headers: headers(auth),
      body: JSON.stringify({ locale: "en", countryCode: "IN", locationNames: { names: [locationName] } }),
    },
    { provider: "google-ads" },
  );
  const first = body.geoTargetConstantSuggestions?.find((s) => s.geoTargetConstant?.countryCode === "IN")?.geoTargetConstant;
  if (!first?.resourceName) return null;
  return { resourceName: first.resourceName, name: first.name ?? locationName, targetType: first.targetType ?? "" };
}

export interface KeywordIdea {
  text: string;
  avgMonthlySearches: number;
  competition: string;
  competitionIndex: number | null;
  lowTopOfPageBidRupees: number | null;
  highTopOfPageBidRupees: number | null;
}

export interface KeywordIdeasResult {
  seedKeywords: string[];
  geo: { resourceName: string; name: string };
  language: string;
  ideas: KeywordIdea[];
}

/**
 * Keyword Planner ideas for a seed list inside one geography. Average monthly
 * searches are a 12-month average — the doc is explicit that this must never
 * be presented as "aaj viral" (§3.2), and the evidence window says so.
 */
export async function readKeywordIdeas(
  auth: GoogleAdsAuth,
  params: { seedKeywords: string[]; geo: { resourceName: string; name: string }; pageSize?: number },
): Promise<KeywordIdeasResult> {
  const cid = normaliseCustomerId(auth.customerId);
  if (!cid) throw new ConnectorError("NOT_FOUND", "Google Ads customer ID set nahi hai.");
  const seeds = params.seedKeywords.slice(0, 20);

  const body = await connectorFetchJson<{
    results?: Array<{
      text?: string;
      keywordIdeaMetrics?: {
        avgMonthlySearches?: string | number;
        competition?: string;
        competitionIndex?: string | number;
        lowTopOfPageBidMicros?: string | number;
        highTopOfPageBidMicros?: string | number;
      };
    }>;
  }>(
    `${BASE()}/customers/${cid}:generateKeywordIdeas`,
    {
      method: "POST",
      headers: headers(auth),
      body: JSON.stringify({
        language: LANGUAGE_ENGLISH,
        geoTargetConstants: [params.geo.resourceName],
        keywordPlanNetwork: "GOOGLE_SEARCH",
        includeAdultKeywords: false,
        keywordSeed: { keywords: seeds },
        pageSize: params.pageSize ?? 60,
      }),
    },
    { provider: "google-ads", timeoutMs: 30_000 },
  );

  const ideas: KeywordIdea[] = (body.results ?? [])
    .map((r) => {
      const m = r.keywordIdeaMetrics ?? {};
      return {
        text: r.text ?? "",
        avgMonthlySearches: toNumber(m.avgMonthlySearches),
        competition: m.competition ?? "UNSPECIFIED",
        competitionIndex: m.competitionIndex === undefined ? null : toNumber(m.competitionIndex),
        lowTopOfPageBidRupees: m.lowTopOfPageBidMicros === undefined ? null : microsToRupees(m.lowTopOfPageBidMicros),
        highTopOfPageBidRupees: m.highTopOfPageBidMicros === undefined ? null : microsToRupees(m.highTopOfPageBidMicros),
      };
    })
    .filter((i) => i.text)
    .sort((a, b) => b.avgMonthlySearches - a.avgMonthlySearches);

  return { seedKeywords: seeds, geo: params.geo, language: "en", ideas };
}
