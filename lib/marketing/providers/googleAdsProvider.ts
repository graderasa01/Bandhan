/**
 * The Google Ads *write* surface the execution layer is allowed to touch —
 * as an interface, so the worker can be driven by a fake in tests and by
 * `connectors/googleAdsWrite.ts` in production (doc 13 §20: "Provider
 * clients injectable/fake hon").
 *
 * Every shape here is the REST JSON the API accepts/returns, restricted to
 * the fields the mapper emits. Nothing else can reach a request body,
 * because the mapper is the only producer of `MutateOperation`s and it is
 * typed against this file.
 */

export type GoogleCampaignStatus = "ENABLED" | "PAUSED" | "REMOVED";
export type GoogleMatchType = "EXACT" | "PHRASE" | "BROAD";

export interface CampaignBudgetCreate {
  resourceName: string;
  name: string;
  amountMicros: string;
  deliveryMethod: "STANDARD";
  explicitlyShared: false;
}

export interface CampaignCreate {
  resourceName: string;
  name: string;
  status: "PAUSED";
  advertisingChannelType: "SEARCH";
  campaignBudget: string;
  networkSettings: {
    targetGoogleSearch: true;
    targetSearchNetwork: boolean;
    targetContentNetwork: false;
    targetPartnerSearchNetwork: false;
  };
  startDate: string;
  endDate: string;
  containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING";
  maximizeConversions?: { targetCpaMicros?: string };
  maximizeClicks?: Record<string, never>;
}

export interface CampaignCriterionCreate {
  campaign: string;
  negative?: true;
  location?: { geoTargetConstant: string };
  language?: { languageConstant: string };
  keyword?: { text: string; matchType: GoogleMatchType };
}

export interface AdGroupCreate {
  resourceName: string;
  campaign: string;
  name: string;
  status: "ENABLED";
  type: "SEARCH_STANDARD";
}

export interface AdGroupCriterionCreate {
  adGroup: string;
  status: "ENABLED";
  keyword: { text: string; matchType: GoogleMatchType };
}

export interface AdGroupAdCreate {
  adGroup: string;
  status: "ENABLED";
  ad: {
    finalUrls: string[];
    responsiveSearchAd: { headlines: { text: string }[]; descriptions: { text: string }[] };
  };
}

export type MutateOperation =
  | { campaignBudgetOperation: { create: CampaignBudgetCreate } }
  | { campaignOperation: { create: CampaignCreate } }
  | { campaignCriterionOperation: { create: CampaignCriterionCreate } }
  | { adGroupOperation: { create: AdGroupCreate } }
  | { adGroupCriterionOperation: { create: AdGroupCriterionCreate } }
  | { adGroupAdOperation: { create: AdGroupAdCreate } };

export interface MutateResponse {
  /** One entry per operation, in request order; each carries exactly one `*Result.resourceName`. */
  mutateOperationResponses: Array<Record<string, { resourceName: string }>>;
  requestId: string | null;
}

export interface GoogleAccountFacts {
  customerId: string;
  name: string | null;
  currency: string | null;
  timeZone: string | null;
  isManager: boolean;
  isTestAccount: boolean;
}

export interface ConversionActionFact {
  resourceName: string;
  name: string;
  status: string;
}

export interface GeoTargetFact {
  resourceName: string;
  name: string;
  targetType: string;
}

export interface CampaignSummary {
  resourceName: string;
  id: string;
  name: string;
  status: string;
}

/** What read-back returns — the fields the verifier compares, nothing more. */
export interface CampaignTree {
  campaign: {
    resourceName: string;
    id: string;
    name: string;
    status: string;
    servingStatus: string | null;
    primaryStatus: string | null;
    startDate: string | null;
    endDate: string | null;
    channelType: string | null;
    biddingStrategyType: string | null;
    budgetResourceName: string | null;
    budgetAmountMicros: string | null;
  };
  adGroups: { resourceName: string; name: string; status: string }[];
  keywords: { resourceName: string; adGroup: string; text: string; matchType: string; status: string }[];
  ads: { resourceName: string; adGroup: string; status: string; finalUrls: string[]; approvalStatus: string | null }[];
  campaignCriteria: { resourceName: string; type: string; negative: boolean; geoTargetConstant: string | null; languageConstant: string | null; keywordText: string | null }[];
}

export interface GoogleAdsWriteProvider {
  /** Which account the credentials open — currency and timezone decide budgets and dates. */
  describeAccount(): Promise<GoogleAccountFacts>;
  listEnabledConversionActions(): Promise<ConversionActionFact[]>;
  /** Whether at least one approved billing setup exists; null when the account refused to say. */
  hasApprovedBilling(): Promise<boolean | null>;
  resolveGeoTarget(locationName: string): Promise<GeoTargetFact | null>;
  /**
   * `validateOnly: true` runs the request through Google's validation and
   * writes nothing; `false` creates every object atomically (`partialFailure`
   * is always false). Throws `ConnectorError`; a timeout on a real write is
   * the caller's UNKNOWN_OUTCOME.
   */
  mutate(operations: MutateOperation[], opts: { validateOnly: boolean }): Promise<MutateResponse>;
  findCampaignsByMarker(marker: string): Promise<CampaignSummary[]>;
  readCampaignTree(campaignResourceName: string): Promise<CampaignTree | null>;
  /** The one activation write: status only, one campaign only. */
  setCampaignStatus(campaignResourceName: string, status: "ENABLED" | "PAUSED"): Promise<{ requestId: string | null }>;
}
