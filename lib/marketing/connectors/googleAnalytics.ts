import "server-only";
import { CONVERSION_EVENTS } from "@/lib/contracts/marketingAi";
import { connectorFetchJson, toNumber } from "./http";

/**
 * GA4 Data API — where visitors land, where they came from, and how many of
 * them reached each MKT-0 event.
 *
 * Only aggregate dimensions are ever requested (landing page, source,
 * device, city, event name). GA4 has user-scoped dimensions too; none are
 * used here and none may be added — this module's output goes straight into
 * a model prompt (§3.1: "Individual member ka naam … nahi").
 */

const BASE = "https://analyticsdata.googleapis.com/v1beta";

export interface GoogleAnalyticsAuth {
  accessToken: string;
  propertyId: string;
}

interface RunReportResponse {
  rows?: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }>;
  rowCount?: number;
}

async function runReport(auth: GoogleAnalyticsAuth, body: Record<string, unknown>): Promise<RunReportResponse> {
  const propertyId = auth.propertyId.replace(/^properties\//, "").trim();
  return connectorFetchJson<RunReportResponse>(
    `${BASE}/properties/${encodeURIComponent(propertyId)}:runReport`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${auth.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    { provider: "google-analytics" },
  );
}

const LAST_30 = [{ startDate: "30daysAgo", endDate: "yesterday" }];

export async function testGoogleAnalytics(auth: GoogleAnalyticsAuth): Promise<{ propertyId: string; sessions30d: number }> {
  const res = await runReport(auth, { dateRanges: LAST_30, metrics: [{ name: "sessions" }], limit: 1 });
  return { propertyId: auth.propertyId, sessions30d: toNumber(res.rows?.[0]?.metricValues?.[0]?.value) };
}

export interface GaLandingRow {
  landingPage: string;
  sessions: number;
  activeUsers: number;
  keyEvents: number;
}

export interface GaSourceRow {
  source: string;
  medium: string;
  campaign: string;
  sessions: number;
  keyEvents: number;
}

export interface GaEventRow {
  event: string;
  count: number;
  /** True when GA4 marks it as a key event (conversion). */
  isKeyEvent: boolean;
}

export interface GaAnalyticsReport {
  propertyId: string;
  window: { label: string; days: 30 };
  totals: { sessions: number; activeUsers: number; keyEvents: number };
  landingPages: GaLandingRow[];
  sources: GaSourceRow[];
  /** MKT-0's funnel events, in funnel order, with this window's counts. Zero rows are kept — a missing event is a finding. */
  funnelEvents: GaEventRow[];
  byDevice: { device: string; sessions: number; keyEvents: number }[];
  byCity: { city: string; sessions: number; keyEvents: number }[];
}

export async function readGoogleAnalytics(auth: GoogleAnalyticsAuth): Promise<GaAnalyticsReport> {
  const [totals, landing, sources, events, keyEvents, devices, cities] = await Promise.all([
    runReport(auth, { dateRanges: LAST_30, metrics: [{ name: "sessions" }, { name: "activeUsers" }, { name: "keyEvents" }] }),
    runReport(auth, {
      dateRanges: LAST_30,
      dimensions: [{ name: "landingPage" }],
      metrics: [{ name: "sessions" }, { name: "activeUsers" }, { name: "keyEvents" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 20,
    }),
    runReport(auth, {
      dateRanges: LAST_30,
      dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }, { name: "sessionCampaignName" }],
      metrics: [{ name: "sessions" }, { name: "keyEvents" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 20,
    }),
    runReport(auth, {
      dateRanges: LAST_30,
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: { filter: { fieldName: "eventName", inListFilter: { values: [...CONVERSION_EVENTS] } } },
      limit: 20,
    }),
    runReport(auth, {
      dateRanges: LAST_30,
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "keyEvents" }],
      dimensionFilter: { filter: { fieldName: "eventName", inListFilter: { values: [...CONVERSION_EVENTS] } } },
      limit: 20,
    }),
    runReport(auth, {
      dateRanges: LAST_30,
      dimensions: [{ name: "deviceCategory" }],
      metrics: [{ name: "sessions" }, { name: "keyEvents" }],
      limit: 5,
    }),
    runReport(auth, {
      dateRanges: LAST_30,
      dimensions: [{ name: "city" }],
      metrics: [{ name: "sessions" }, { name: "keyEvents" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 15,
    }),
  ]);

  const d = (row: NonNullable<RunReportResponse["rows"]>[number], i: number) => row.dimensionValues?.[i]?.value ?? "";
  const m = (row: NonNullable<RunReportResponse["rows"]>[number], i: number) => toNumber(row.metricValues?.[i]?.value);

  const countByEvent = new Map((events.rows ?? []).map((r) => [d(r, 0), m(r, 0)]));
  const keyByEvent = new Map((keyEvents.rows ?? []).map((r) => [d(r, 0), m(r, 0)]));

  const totalsRow = totals.rows?.[0];

  return {
    propertyId: auth.propertyId,
    window: { label: "last 30 days (GA4, ending yesterday)", days: 30 },
    totals: totalsRow
      ? { sessions: m(totalsRow, 0), activeUsers: m(totalsRow, 1), keyEvents: m(totalsRow, 2) }
      : { sessions: 0, activeUsers: 0, keyEvents: 0 },
    landingPages: (landing.rows ?? []).map((r) => ({ landingPage: d(r, 0), sessions: m(r, 0), activeUsers: m(r, 1), keyEvents: m(r, 2) })),
    sources: (sources.rows ?? []).map((r) => ({ source: d(r, 0), medium: d(r, 1), campaign: d(r, 2), sessions: m(r, 0), keyEvents: m(r, 1) })),
    funnelEvents: CONVERSION_EVENTS.map((event) => ({
      event,
      count: countByEvent.get(event) ?? 0,
      isKeyEvent: (keyByEvent.get(event) ?? 0) > 0,
    })),
    byDevice: (devices.rows ?? []).map((r) => ({ device: d(r, 0), sessions: m(r, 0), keyEvents: m(r, 1) })),
    byCity: (cities.rows ?? []).map((r) => ({ city: d(r, 0), sessions: m(r, 0), keyEvents: m(r, 1) })),
  };
}
