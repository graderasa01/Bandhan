import "server-only";
import { ConnectorError, connectorFetchJson, toNumber } from "./http";
import { GEO_INDIA, googleAdsBase, googleAdsHeaders, googleErrorDetails, normaliseCustomerId, searchGoogleAds, suggestGeoTarget, testGoogleAds, type GoogleAdsAuth } from "./googleAds";
import type {
  CampaignSummary,
  CampaignTree,
  ConversionActionFact,
  GeoTargetFact,
  GoogleAccountFacts,
  GoogleAdsWriteProvider,
  MutateOperation,
  MutateResponse,
} from "@/lib/marketing/providers/googleAdsProvider";

/**
 * Google Ads writes — the production `GoogleAdsWriteProvider` (doc 13 §11).
 *
 * Two rules the reads never needed:
 *
 *   • **A write is sent once.** `retries: 0` on every mutate. The generic
 *     retry-on-5xx/network in `connectorFetchJson` exists for reads; on a
 *     create it is the duplicate-campaign machine. A timeout here surfaces
 *     as `ConnectorError(TIMEOUT)` and the worker turns that into
 *     UNKNOWN_OUTCOME + reconciliation by marker (§9.2).
 *   • **The same request validates and creates.** `mutate()` takes the
 *     mapper's operations and only toggles `validateOnly`; nothing is
 *     rebuilt between the dry run and the real one (§11.4).
 *
 * Errors keep Google's field-level `GoogleAdsFailure.errors[]` (code,
 * message, field path) via `errorDetails` and drop the trigger value, which
 * can echo request content.
 */

const WRITE_TIMEOUT_MS = 60_000;

function customerPath(auth: GoogleAdsAuth): string {
  const cid = normaliseCustomerId(auth.customerId);
  if (!cid) throw new ConnectorError("NOT_FOUND", "Google Ads customer ID set nahi hai.");
  return `${googleAdsBase()}/customers/${cid}`;
}

function gaqlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function idOf(resourceName: string): string {
  return resourceName.split("/").pop() ?? "";
}

export function createGoogleAdsWriteProvider(auth: GoogleAdsAuth): GoogleAdsWriteProvider {
  return {
    async describeAccount(): Promise<GoogleAccountFacts> {
      const acc = await testGoogleAds(auth);
      return { customerId: acc.customerId, name: acc.name, currency: acc.currency, timeZone: acc.timeZone, isManager: acc.isManager, isTestAccount: acc.isTestAccount };
    },

    async listEnabledConversionActions(): Promise<ConversionActionFact[]> {
      const rows = await searchGoogleAds(
        auth,
        "SELECT conversion_action.resource_name, conversion_action.name, conversion_action.status FROM conversion_action WHERE conversion_action.status = 'ENABLED' LIMIT 200",
      );
      return rows
        .map((r) => (r.conversionAction ?? {}) as Record<string, unknown>)
        .filter((c) => typeof c.resourceName === "string")
        .map((c) => ({ resourceName: String(c.resourceName), name: String(c.name ?? ""), status: String(c.status ?? "") }));
    },

    async hasApprovedBilling(): Promise<boolean | null> {
      try {
        const rows = await searchGoogleAds(auth, "SELECT billing_setup.id, billing_setup.status FROM billing_setup LIMIT 20");
        return rows.some((r) => String(((r.billingSetup ?? {}) as Record<string, unknown>).status ?? "") === "APPROVED");
      } catch (err) {
        // Some accounts (and every test account) refuse this view; "unknown" is honest, "no billing" is not.
        console.warn("[marketing:google-ads] billing_setup unavailable:", err instanceof Error ? err.message : String(err));
        return null;
      }
    },

    async resolveGeoTarget(locationName: string): Promise<GeoTargetFact | null> {
      if (/^(india|bharat|all india|pan india)$/i.test(locationName.trim())) return { resourceName: GEO_INDIA, name: "India", targetType: "Country" };
      const hit = await suggestGeoTarget(auth, locationName);
      return hit ? { resourceName: hit.resourceName, name: hit.name, targetType: hit.targetType } : null;
    },

    async mutate(operations: MutateOperation[], opts: { validateOnly: boolean }): Promise<MutateResponse> {
      const body = await connectorFetchJson<{ mutateOperationResponses?: Array<Record<string, { resourceName: string }>>; requestId?: string }>(
        `${customerPath(auth)}/googleAds:mutate`,
        {
          method: "POST",
          headers: googleAdsHeaders(auth),
          body: JSON.stringify({ mutateOperations: operations, partialFailure: false, validateOnly: opts.validateOnly, responseContentType: "RESOURCE_NAME_ONLY" }),
        },
        { provider: "google-ads", timeoutMs: WRITE_TIMEOUT_MS, retries: 0, errorDetails: googleErrorDetails },
      );
      return { mutateOperationResponses: body.mutateOperationResponses ?? [], requestId: body.requestId ?? null };
    },

    async findCampaignsByMarker(marker: string): Promise<CampaignSummary[]> {
      const rows = await searchGoogleAds(
        auth,
        `SELECT campaign.resource_name, campaign.id, campaign.name, campaign.status FROM campaign WHERE campaign.name LIKE '%[${gaqlString(marker)}]%' AND campaign.status != 'REMOVED' LIMIT 20`,
      );
      return rows
        .map((r) => (r.campaign ?? {}) as Record<string, unknown>)
        .filter((c) => typeof c.resourceName === "string")
        .map((c) => ({ resourceName: String(c.resourceName), id: String(c.id ?? idOf(String(c.resourceName))), name: String(c.name ?? ""), status: String(c.status ?? "") }));
    },

    async readCampaignTree(campaignResourceName: string): Promise<CampaignTree | null> {
      const id = idOf(campaignResourceName).replace(/[^0-9]/g, "");
      if (!id) return null;
      const campaignRows = await searchGoogleAds(
        auth,
        `SELECT campaign.resource_name, campaign.id, campaign.name, campaign.status, campaign.serving_status, campaign.primary_status,
                campaign.start_date, campaign.end_date, campaign.advertising_channel_type, campaign.bidding_strategy_type,
                campaign_budget.resource_name, campaign_budget.amount_micros
         FROM campaign WHERE campaign.id = ${id} LIMIT 1`,
      );
      const c = campaignRows[0]?.campaign as Record<string, unknown> | undefined;
      if (!c || typeof c.resourceName !== "string") return null;
      const b = (campaignRows[0]?.campaignBudget ?? {}) as Record<string, unknown>;

      const [adGroupRows, keywordRows, adRows, criterionRows] = await Promise.all([
        searchGoogleAds(auth, `SELECT ad_group.resource_name, ad_group.name, ad_group.status FROM ad_group WHERE campaign.id = ${id} AND ad_group.status != 'REMOVED' LIMIT 100`),
        searchGoogleAds(
          auth,
          `SELECT ad_group_criterion.resource_name, ad_group_criterion.ad_group, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status
           FROM ad_group_criterion WHERE campaign.id = ${id} AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.negative = FALSE AND ad_group_criterion.status != 'REMOVED' LIMIT 500`,
        ),
        searchGoogleAds(
          auth,
          `SELECT ad_group_ad.resource_name, ad_group_ad.ad_group, ad_group_ad.status, ad_group_ad.ad.final_urls, ad_group_ad.policy_summary.approval_status
           FROM ad_group_ad WHERE campaign.id = ${id} AND ad_group_ad.status != 'REMOVED' LIMIT 100`,
        ),
        searchGoogleAds(
          auth,
          `SELECT campaign_criterion.resource_name, campaign_criterion.type, campaign_criterion.negative, campaign_criterion.location.geo_target_constant,
                  campaign_criterion.language.language_constant, campaign_criterion.keyword.text
           FROM campaign_criterion WHERE campaign.id = ${id} LIMIT 200`,
        ),
      ]);

      const str = (v: unknown): string | null => (typeof v === "string" ? v : v === undefined || v === null ? null : String(v));
      return {
        campaign: {
          resourceName: c.resourceName,
          id: String(c.id ?? id),
          name: String(c.name ?? ""),
          status: String(c.status ?? ""),
          servingStatus: str(c.servingStatus),
          primaryStatus: str(c.primaryStatus),
          startDate: str(c.startDate),
          endDate: str(c.endDate),
          channelType: str(c.advertisingChannelType),
          biddingStrategyType: str(c.biddingStrategyType),
          budgetResourceName: str(b.resourceName),
          budgetAmountMicros: b.amountMicros === undefined ? null : String(toNumber(b.amountMicros)),
        },
        adGroups: adGroupRows.map((r) => {
          const g = (r.adGroup ?? {}) as Record<string, unknown>;
          return { resourceName: String(g.resourceName ?? ""), name: String(g.name ?? ""), status: String(g.status ?? "") };
        }),
        keywords: keywordRows.map((r) => {
          const k = (r.adGroupCriterion ?? {}) as Record<string, unknown>;
          const kw = (k.keyword ?? {}) as Record<string, unknown>;
          return { resourceName: String(k.resourceName ?? ""), adGroup: String(k.adGroup ?? ""), text: String(kw.text ?? ""), matchType: String(kw.matchType ?? ""), status: String(k.status ?? "") };
        }),
        ads: adRows.map((r) => {
          const a = (r.adGroupAd ?? {}) as Record<string, unknown>;
          const ad = (a.ad ?? {}) as Record<string, unknown>;
          const policy = (a.policySummary ?? {}) as Record<string, unknown>;
          return {
            resourceName: String(a.resourceName ?? ""),
            adGroup: String(a.adGroup ?? ""),
            status: String(a.status ?? ""),
            finalUrls: Array.isArray(ad.finalUrls) ? (ad.finalUrls as unknown[]).map(String) : [],
            approvalStatus: str(policy.approvalStatus),
          };
        }),
        campaignCriteria: criterionRows.map((r) => {
          const cc = (r.campaignCriterion ?? {}) as Record<string, unknown>;
          const loc = (cc.location ?? {}) as Record<string, unknown>;
          const lang = (cc.language ?? {}) as Record<string, unknown>;
          const kw = (cc.keyword ?? {}) as Record<string, unknown>;
          return {
            resourceName: String(cc.resourceName ?? ""),
            type: String(cc.type ?? ""),
            negative: cc.negative === true,
            geoTargetConstant: str(loc.geoTargetConstant),
            languageConstant: str(lang.languageConstant),
            keywordText: str(kw.text),
          };
        }),
      };
    },

    async setCampaignStatus(campaignResourceName: string, status: "ENABLED" | "PAUSED"): Promise<{ requestId: string | null }> {
      const body = await connectorFetchJson<{ results?: Array<{ resourceName: string }>; requestId?: string }>(
        `${customerPath(auth)}/campaigns:mutate`,
        {
          method: "POST",
          headers: googleAdsHeaders(auth),
          body: JSON.stringify({ operations: [{ updateMask: "status", update: { resourceName: campaignResourceName, status } }], partialFailure: false }),
        },
        { provider: "google-ads", timeoutMs: WRITE_TIMEOUT_MS, retries: 0, errorDetails: googleErrorDetails },
      );
      return { requestId: body.requestId ?? null };
    },
  };
}
