/**
 * Growth Console — the shape of what `/api/admin/growth` returns.
 *
 * Split out of `growthService.ts` for one concrete reason: that file is
 * `server-only`, and the console UI is a client component that needs the
 * window list at runtime (not just the types). Importing a value from a
 * server-only module into the browser bundle throws at build time, so the
 * shared vocabulary lives here and the queries live there.
 *
 * ## The rule every field below obeys
 *
 * Every number is a count of rows that exist. No projections, no modelled
 * churn, no estimated LTV — the same bar `demandService` holds (D-32). The one
 * derived figure, `GateLever.ceilingPaise`, is plain arithmetic on a real count
 * and is named a *ceiling* precisely so it can never be read as a forecast.
 */

export const GROWTH_WINDOWS = [7, 30, 90] as const;
export type GrowthWindow = (typeof GROWTH_WINDOWS)[number];

export function parseWindow(raw: string | null): GrowthWindow {
  const n = Number(raw);
  return (GROWTH_WINDOWS as readonly number[]).includes(n) ? (n as GrowthWindow) : 30;
}

export interface FunnelStep {
  id: string;
  label: string;
  /** Users from this window's signup cohort who reached this step. */
  count: number;
  /** % of the previous step that made it here. Null on the first step. */
  stepPct: number | null;
  /** % of everyone who registered in the window. */
  ofTotalPct: number;
  detail: string;
}

/**
 * One step of the rishta funnel — the *other* funnel.
 *
 * `FunnelStep` counts people moving through signup. This counts rishtey moving
 * toward a wedding, which is a different unit and cannot share the type: a row
 * here may be counting interests, matches, meetings or journeys depending on
 * which question it answers, so `unit` is mandatory and `stepPct` is null
 * wherever two adjacent rows are not counting the same thing.
 *
 * Saying "42" without saying "42 what" is how a funnel becomes decoration.
 */
export interface RishtaProgressStep {
  id: string;
  label: string;
  count: number;
  /** What is being counted: "interest", "rishta", "mulaqat", "logon ne kaha". */
  unit: string;
  /** % of the previous row — only when that row counts the same unit and contains this one. */
  stepPct: number | null;
  detail: string;
}

export interface RetentionRow {
  /** "28 Jul – 3 Aug" */
  label: string;
  signups: number;
  /** Active during the calendar week *after* signup. Null = that week hasn't finished. */
  week1: number | null;
  /** Active during the fourth calendar week after signup. Null = hasn't happened yet. */
  week4: number | null;
}

export interface PlanMixRow {
  code: string;
  name: string;
  subscribers: number;
  pricePaise: number;
  mrrPaise: number;
}

export interface RevenueSnapshot {
  /** Live subscriptions × today's plan price. Recomputed from `Plan`, never stored. */
  mrrPaise: number;
  payingUsers: number;
  planMix: PlanMixRow[];
  /** Captured in the window, real gateway only. */
  capturedPaise: number;
  capturedCount: number;
  /** Dummy-gateway money, kept strictly apart so it can never inflate a real figure. */
  testPaise: number;
  testCount: number;
  refundedPaise: number;
  failedCount: number;
  /** capturedPaise ÷ payingUsers. Zero when nobody pays yet. */
  arpuPaise: number;
  /** Of the window's signups, how many have a captured payment. */
  paidConversionPct: number;
}

export interface MarketplaceSnapshot {
  liveProfiles: number;
  byGender: { label: string; count: number }[];
  /** Ladka per Ladki, to 2dp. Null when either side is zero. */
  ratio: number | null;
  newLiveInWindow: number;
  topCities: { city: string; count: number }[];
  /** Live profiles nobody has reached yet: visible, but zero incoming interest ever. */
  neverReceivedInterest: number;
}

export interface GateLever {
  id: string;
  /** What the user is stuck on, in the words the user would use. */
  label: string;
  /** Exactly how the count was measured — so nobody has to trust the label. */
  detail: string;
  /** People standing at this door *right now*. Always a row count. */
  people: number;
  /** The cheapest plan that opens it. */
  unlockPlan: string;
  unlockPlanName: string;
  /** people × that plan's live monthly price. A ceiling, never a forecast. */
  ceilingPaise: number;
}

export interface PartnerSnapshot {
  activePartners: number;
  referredSignups: number;
  referredPaid: number;
  organicSignups: number;
  organicPaid: number;
  /** Percentage points: referred conversion minus organic conversion. */
  liftPoints: number | null;
  commissionOwedPaise: number;
  commissionPaidPaise: number;
}

export interface AiUsageRow {
  feature: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  blocked: number;
}

export interface GrowthSnapshot {
  generatedAt: string;
  windowDays: number;
  windowFrom: string;
  funnel: FunnelStep[];
  rishta: RishtaProgressStep[];
  retention: RetentionRow[];
  revenue: RevenueSnapshot;
  marketplace: MarketplaceSnapshot;
  gates: GateLever[];
  partners: PartnerSnapshot;
  ai: AiUsageRow[];
}
