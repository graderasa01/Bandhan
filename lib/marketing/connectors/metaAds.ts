import "server-only";
import { toNumber } from "./http";
import { actionsToMap, graphGet, type MetaAuth } from "./metaGraph";

/**
 * Meta Marketing API — the ad account's existing campaigns, last 30 days.
 *
 * Read-only in MKT-1. `ads_read` is the only permission this needs; the
 * write scopes (`ads_management`) are deliberately not requested until MKT-2
 * has an approval-bound executor to use them.
 */

export function normaliseAdAccountId(raw: string): string {
  const digits = raw.trim().replace(/^act_/, "");
  return digits ? `act_${digits}` : "";
}

export interface MetaAdAccount {
  id: string;
  name: string | null;
  currency: string | null;
  accountStatus: number | null;
}

export async function testMetaAds(auth: MetaAuth, adAccountId: string): Promise<MetaAdAccount> {
  const id = normaliseAdAccountId(adAccountId);
  const acc = await graphGet<{ id?: string; name?: string; currency?: string; account_status?: number }>(
    auth,
    id,
    { fields: "id,name,currency,account_status" },
    "meta-ads",
  );
  return { id: acc.id ?? id, name: acc.name ?? null, currency: acc.currency ?? null, accountStatus: acc.account_status ?? null };
}

export interface MetaCampaignRow {
  id: string;
  name: string;
  objective: string | null;
  status: string | null;
  effectiveStatus: string | null;
  dailyBudgetRupees: number | null;
  spendRupees: number;
  impressions: number;
  reach: number;
  frequency: number;
  clicks: number;
  linkClicks: number;
  ctrPct: number;
  cpcRupees: number;
  cpmRupees: number;
  /** Platform-reported results by action type — leads, link clicks, video views. Not BandhanTak conversions. */
  results: Record<string, number>;
}

export interface MetaAdsPerformance {
  adAccountId: string;
  windowDays: 30;
  campaigns: MetaCampaignRow[];
  totals: { spendRupees: number; impressions: number; reach: number; clicks: number; linkClicks: number };
}

export async function readMetaAdsPerformance(auth: MetaAuth, adAccountId: string): Promise<MetaAdsPerformance> {
  const id = normaliseAdAccountId(adAccountId);

  const [campaignsRes, insightsRes] = await Promise.all([
    graphGet<{ data?: Array<{ id: string; name: string; objective?: string; status?: string; effective_status?: string; daily_budget?: string }> }>(
      auth,
      `${id}/campaigns`,
      { fields: "id,name,objective,status,effective_status,daily_budget", limit: "50" },
      "meta-ads",
    ),
    graphGet<{
      data?: Array<{
        campaign_id?: string;
        campaign_name?: string;
        spend?: string;
        impressions?: string;
        reach?: string;
        frequency?: string;
        clicks?: string;
        ctr?: string;
        cpc?: string;
        cpm?: string;
        actions?: unknown;
      }>;
    }>(
      auth,
      `${id}/insights`,
      {
        level: "campaign",
        date_preset: "last_30d",
        fields: "campaign_id,campaign_name,spend,impressions,reach,frequency,clicks,ctr,cpc,cpm,actions",
        limit: "50",
      },
      "meta-ads",
    ),
  ]);

  const insightsById = new Map((insightsRes.data ?? []).map((r) => [r.campaign_id ?? "", r]));
  const campaigns: MetaCampaignRow[] = (campaignsRes.data ?? []).map((c) => {
    const i = insightsById.get(c.id);
    const results = actionsToMap(i?.actions);
    return {
      id: c.id,
      name: c.name,
      objective: c.objective ?? null,
      status: c.status ?? null,
      effectiveStatus: c.effective_status ?? null,
      // Meta reports budgets in the account currency's minor unit (paise for INR).
      dailyBudgetRupees: c.daily_budget ? Math.round(toNumber(c.daily_budget)) / 100 : null,
      spendRupees: Math.round(toNumber(i?.spend) * 100) / 100,
      impressions: toNumber(i?.impressions),
      reach: toNumber(i?.reach),
      frequency: Math.round(toNumber(i?.frequency) * 100) / 100,
      clicks: toNumber(i?.clicks),
      linkClicks: results.link_click ?? 0,
      ctrPct: Math.round(toNumber(i?.ctr) * 100) / 100,
      cpcRupees: Math.round(toNumber(i?.cpc) * 100) / 100,
      cpmRupees: Math.round(toNumber(i?.cpm) * 100) / 100,
      results,
    };
  });

  // Campaigns that have spend but were deleted/archived still show in
  // insights; keep them so 30-day totals match Ads Manager.
  for (const [cid, i] of insightsById) {
    if (campaigns.some((c) => c.id === cid)) continue;
    const results = actionsToMap(i.actions);
    campaigns.push({
      id: cid,
      name: i.campaign_name ?? cid,
      objective: null,
      status: "ARCHIVED_OR_DELETED",
      effectiveStatus: null,
      dailyBudgetRupees: null,
      spendRupees: Math.round(toNumber(i.spend) * 100) / 100,
      impressions: toNumber(i.impressions),
      reach: toNumber(i.reach),
      frequency: Math.round(toNumber(i.frequency) * 100) / 100,
      clicks: toNumber(i.clicks),
      linkClicks: results.link_click ?? 0,
      ctrPct: Math.round(toNumber(i.ctr) * 100) / 100,
      cpcRupees: Math.round(toNumber(i.cpc) * 100) / 100,
      cpmRupees: Math.round(toNumber(i.cpm) * 100) / 100,
      results,
    });
  }

  campaigns.sort((a, b) => b.spendRupees - a.spendRupees);

  const totals = campaigns.reduce(
    (acc, c) => ({
      spendRupees: Math.round((acc.spendRupees + c.spendRupees) * 100) / 100,
      impressions: acc.impressions + c.impressions,
      reach: acc.reach + c.reach,
      clicks: acc.clicks + c.clicks,
      linkClicks: acc.linkClicks + c.linkClicks,
    }),
    { spendRupees: 0, impressions: 0, reach: 0, clicks: 0, linkClicks: 0 },
  );

  return { adAccountId: id, windowDays: 30, campaigns, totals };
}
