import "server-only";
import { connectorFetchJson, isoDaysAgo, toNumber } from "./http";

/**
 * Google Search Console — what BandhanTak already ranks for.
 *
 * Two windows are read, not one: the doc's "rising queries" topic source
 * (§7) is a comparison, and a comparison needs a previous period. Both end
 * three days ago because Search Console's most recent days are incomplete —
 * reading them would show a "drop" that is really a lag, which is the exact
 * fake-trend claim the truth rule forbids.
 */

const BASE = "https://www.googleapis.com/webmasters/v3";
/** Search Console finalises data ~2-3 days late. */
const LAG_DAYS = 3;
const WINDOW_DAYS = 28;

export interface SearchConsoleAuth {
  accessToken: string;
  siteUrl: string;
}

interface QueryRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

async function query(auth: SearchConsoleAuth, body: Record<string, unknown>): Promise<QueryRow[]> {
  const res = await connectorFetchJson<{ rows?: QueryRow[] }>(
    `${BASE}/sites/${encodeURIComponent(auth.siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${auth.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    { provider: "search-console" },
  );
  return res.rows ?? [];
}

export interface SearchConsoleSite {
  siteUrl: string;
  permissionLevel: string;
}

export async function testSearchConsole(auth: SearchConsoleAuth): Promise<SearchConsoleSite> {
  const site = await connectorFetchJson<{ siteUrl?: string; permissionLevel?: string }>(
    `${BASE}/sites/${encodeURIComponent(auth.siteUrl)}`,
    { headers: { Authorization: `Bearer ${auth.accessToken}` } },
    { provider: "search-console", retries: 0 },
  );
  return { siteUrl: site.siteUrl ?? auth.siteUrl, permissionLevel: site.permissionLevel ?? "unknown" };
}

export interface SearchQueryRow {
  query: string;
  clicks: number;
  impressions: number;
  ctrPct: number;
  position: number;
}

export interface SearchPageRow {
  page: string;
  clicks: number;
  impressions: number;
  ctrPct: number;
  position: number;
}

export interface RisingQuery extends SearchQueryRow {
  previousImpressions: number;
  changePct: number;
}

export interface SearchConsoleReport {
  siteUrl: string;
  window: { from: string; to: string; days: number };
  previousWindow: { from: string; to: string };
  totals: { clicks: number; impressions: number; ctrPct: number; position: number | null };
  topQueries: SearchQueryRow[];
  topPages: SearchPageRow[];
  /** Impressions but few clicks near the first two pages — copy/title opportunities, not new pages. */
  opportunities: SearchQueryRow[];
  /** Impressions up ≥50% against the previous window, on a base large enough to mean something. */
  risingQueries: RisingQuery[];
  byDevice: { device: string; clicks: number; impressions: number }[];
}

function toQueryRow(r: QueryRow): SearchQueryRow {
  return {
    query: r.keys?.[0] ?? "",
    clicks: toNumber(r.clicks),
    impressions: toNumber(r.impressions),
    ctrPct: Math.round(toNumber(r.ctr) * 10000) / 100,
    position: Math.round(toNumber(r.position) * 10) / 10,
  };
}

export async function readSearchConsole(auth: SearchConsoleAuth, now = new Date()): Promise<SearchConsoleReport> {
  const to = isoDaysAgo(LAG_DAYS, now);
  const from = isoDaysAgo(LAG_DAYS + WINDOW_DAYS - 1, now);
  const prevTo = isoDaysAgo(LAG_DAYS + WINDOW_DAYS, now);
  const prevFrom = isoDaysAgo(LAG_DAYS + 2 * WINDOW_DAYS - 1, now);

  const [queries, prevQueries, pages, devices, totalsRows] = await Promise.all([
    query(auth, { startDate: from, endDate: to, dimensions: ["query"], rowLimit: 100 }),
    query(auth, { startDate: prevFrom, endDate: prevTo, dimensions: ["query"], rowLimit: 250 }),
    query(auth, { startDate: from, endDate: to, dimensions: ["page"], rowLimit: 25 }),
    query(auth, { startDate: from, endDate: to, dimensions: ["device"], rowLimit: 5 }),
    query(auth, { startDate: from, endDate: to, rowLimit: 1 }),
  ]);

  const topQueries = queries.map(toQueryRow).filter((q) => q.query).slice(0, 40);
  const prevByQuery = new Map(prevQueries.map(toQueryRow).map((q) => [q.query, q]));

  const opportunities = queries
    .map(toQueryRow)
    .filter((q) => q.impressions >= 50 && q.ctrPct < 2 && q.position <= 20)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 15);

  const risingQueries: RisingQuery[] = queries
    .map(toQueryRow)
    .map((q) => {
      const prev = prevByQuery.get(q.query);
      const previousImpressions = prev?.impressions ?? 0;
      const changePct = previousImpressions === 0 ? (q.impressions >= 30 ? 100 : 0) : Math.round(((q.impressions - previousImpressions) / previousImpressions) * 100);
      return { ...q, previousImpressions, changePct };
    })
    .filter((q) => q.impressions >= 30 && q.changePct >= 50)
    .sort((a, b) => b.changePct - a.changePct)
    .slice(0, 15);

  const totals = totalsRows[0]
    ? {
        clicks: toNumber(totalsRows[0].clicks),
        impressions: toNumber(totalsRows[0].impressions),
        ctrPct: Math.round(toNumber(totalsRows[0].ctr) * 10000) / 100,
        position: Math.round(toNumber(totalsRows[0].position) * 10) / 10,
      }
    : { clicks: 0, impressions: 0, ctrPct: 0, position: null };

  return {
    siteUrl: auth.siteUrl,
    window: { from, to, days: WINDOW_DAYS },
    previousWindow: { from: prevFrom, to: prevTo },
    totals,
    topQueries,
    topPages: pages
      .map((r) => ({
        page: r.keys?.[0] ?? "",
        clicks: toNumber(r.clicks),
        impressions: toNumber(r.impressions),
        ctrPct: Math.round(toNumber(r.ctr) * 10000) / 100,
        position: Math.round(toNumber(r.position) * 10) / 10,
      }))
      .filter((p) => p.page),
    opportunities,
    risingQueries,
    byDevice: devices.map((r) => ({ device: r.keys?.[0] ?? "", clicks: toNumber(r.clicks), impressions: toNumber(r.impressions) })),
  };
}
