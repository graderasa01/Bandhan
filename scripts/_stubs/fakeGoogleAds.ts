import { ConnectorError } from "../../lib/marketing/connectors/http";
import type {
  CampaignSummary,
  CampaignTree,
  ConversionActionFact,
  GeoTargetFact,
  GoogleAccountFacts,
  GoogleAdsWriteProvider,
  MutateOperation,
  MutateResponse,
} from "../../lib/marketing/providers/googleAdsProvider";

/**
 * An in-memory Google Ads for the MKT-2 checks. It keeps a tiny "account"
 * (campaigns, budgets, ad groups, keywords, ads) that `mutate()` fills and
 * `readCampaignTree()` reads back, so the worker's read-back verification
 * runs against what the fake actually stored — not against a canned tree.
 *
 * Every call is logged; behaviours are switches the checks flip:
 *   • `failValidate`      — validate-only throws a 400 with Google-shaped details
 *   • `timeoutRealMutate` — the real create throws TIMEOUT *after* (optionally)
 *                           storing the campaign, i.e. the write landed but the
 *                           answer was lost
 *   • `markerOverride`    — what marker search returns instead of the store
 *   • `treeStatusOverride`— force the read-back status (drift / mismatch cases)
 *   • `timeoutActivate`   — the status write throws TIMEOUT after applying
 *   • `billing`           — what hasApprovedBilling answers
 */

interface StoredCampaign {
  resourceName: string;
  id: string;
  name: string;
  status: string;
  budgetResourceName: string;
  budgetAmountMicros: string;
  startDate: string;
  endDate: string;
  adGroups: { resourceName: string; name: string; status: string }[];
  keywords: { resourceName: string; adGroup: string; text: string; matchType: string; status: string }[];
  ads: { resourceName: string; adGroup: string; status: string; finalUrls: string[] }[];
  criteria: { resourceName: string; type: string; negative: boolean; geoTargetConstant: string | null; languageConstant: string | null; keywordText: string | null }[];
}

export interface FakeCall {
  method: string;
  validateOnly?: boolean;
  args?: unknown;
}

export class FakeGoogleAds implements GoogleAdsWriteProvider {
  readonly calls: FakeCall[] = [];
  readonly store = new Map<string, StoredCampaign>();
  customerId = "1234567890";
  currency = "INR";
  timeZone = "Asia/Kolkata";
  isManager = false;
  isTestAccount = true;
  conversionActions: ConversionActionFact[] = [{ resourceName: "customers/1234567890/conversionActions/111", name: "verification_completed", status: "ENABLED" }];
  billing: boolean | null = true;
  failValidate: ConnectorError | null = null;
  failRealMutate: ConnectorError | null = null;
  /** When the real mutate throws, whether the campaign is nevertheless stored (the write landed). */
  storeDespiteFailure = false;
  markerOverride: CampaignSummary[] | null = null;
  treeStatusOverride: string | null = null;
  timeoutActivate = false;
  activateApplies = true;
  mutateDelayMs = 0;
  /** Thrown by the next readCampaignTree only — the "create landed, read-back lost" case. */
  failReadTreeOnce: ConnectorError | null = null;
  private nextId = 1000;

  private newId(): string {
    this.nextId += 1;
    return String(this.nextId);
  }

  async describeAccount(): Promise<GoogleAccountFacts> {
    this.calls.push({ method: "describeAccount" });
    return { customerId: this.customerId, name: "Fake BandhanTak", currency: this.currency, timeZone: this.timeZone, isManager: this.isManager, isTestAccount: this.isTestAccount };
  }

  async listEnabledConversionActions(): Promise<ConversionActionFact[]> {
    this.calls.push({ method: "listEnabledConversionActions" });
    return this.conversionActions;
  }

  async hasApprovedBilling(): Promise<boolean | null> {
    this.calls.push({ method: "hasApprovedBilling" });
    return this.billing;
  }

  async resolveGeoTarget(locationName: string): Promise<GeoTargetFact | null> {
    this.calls.push({ method: "resolveGeoTarget", args: locationName });
    if (/nowhere/i.test(locationName)) return null;
    if (/jaipur/i.test(locationName)) return { resourceName: "geoTargetConstants/1007751", name: "Jaipur", targetType: "City" };
    return { resourceName: "geoTargetConstants/2356", name: "India", targetType: "Country" };
  }

  async mutate(operations: MutateOperation[], opts: { validateOnly: boolean }): Promise<MutateResponse> {
    this.calls.push({ method: "mutate", validateOnly: opts.validateOnly, args: operations });
    if (this.mutateDelayMs) await new Promise((r) => setTimeout(r, this.mutateDelayMs));
    if (opts.validateOnly) {
      if (this.failValidate) throw this.failValidate;
      return { mutateOperationResponses: [], requestId: "req-validate" };
    }
    if (this.failRealMutate && !this.storeDespiteFailure) throw this.failRealMutate;
    const resp = this.apply(operations);
    if (this.failRealMutate) throw this.failRealMutate;
    return resp;
  }

  /** Stores the hierarchy exactly as the operations describe it and returns the resource names in order. */
  private apply(operations: MutateOperation[]): MutateResponse {
    const cid = this.customerId;
    const temp = new Map<string, string>();
    const responses: MutateResponse["mutateOperationResponses"] = [];
    let campaign: StoredCampaign | null = null;
    let budget: { resourceName: string; amountMicros: string } | null = null;
    for (const op of operations) {
      if ("campaignBudgetOperation" in op) {
        const c = op.campaignBudgetOperation.create;
        const real = `customers/${cid}/campaignBudgets/${this.newId()}`;
        temp.set(c.resourceName, real);
        budget = { resourceName: real, amountMicros: c.amountMicros };
        responses.push({ campaignBudgetResult: { resourceName: real } });
      } else if ("campaignOperation" in op) {
        const c = op.campaignOperation.create;
        const id = this.newId();
        const real = `customers/${cid}/campaigns/${id}`;
        temp.set(c.resourceName, real);
        campaign = {
          resourceName: real,
          id,
          name: c.name,
          status: c.status,
          budgetResourceName: temp.get(c.campaignBudget) ?? c.campaignBudget,
          budgetAmountMicros: budget?.amountMicros ?? "0",
          startDate: c.startDate,
          endDate: c.endDate,
          adGroups: [],
          keywords: [],
          ads: [],
          criteria: [],
        };
        this.store.set(real, campaign);
        responses.push({ campaignResult: { resourceName: real } });
      } else if ("campaignCriterionOperation" in op) {
        const c = op.campaignCriterionOperation.create;
        const real = `customers/${cid}/campaignCriteria/${campaign?.id ?? "0"}~${this.newId()}`;
        campaign?.criteria.push({
          resourceName: real,
          type: c.keyword ? "KEYWORD" : c.location ? "LOCATION" : "LANGUAGE",
          negative: c.negative === true,
          geoTargetConstant: c.location?.geoTargetConstant ?? null,
          languageConstant: c.language?.languageConstant ?? null,
          keywordText: c.keyword?.text ?? null,
        });
        responses.push({ campaignCriterionResult: { resourceName: real } });
      } else if ("adGroupOperation" in op) {
        const c = op.adGroupOperation.create;
        const real = `customers/${cid}/adGroups/${this.newId()}`;
        temp.set(c.resourceName, real);
        campaign?.adGroups.push({ resourceName: real, name: c.name, status: c.status });
        responses.push({ adGroupResult: { resourceName: real } });
      } else if ("adGroupCriterionOperation" in op) {
        const c = op.adGroupCriterionOperation.create;
        const ag = temp.get(c.adGroup) ?? c.adGroup;
        const real = `${ag.replace("/adGroups/", "/adGroupCriteria/")}~${this.newId()}`;
        campaign?.keywords.push({ resourceName: real, adGroup: ag, text: c.keyword.text, matchType: c.keyword.matchType, status: c.status });
        responses.push({ adGroupCriterionResult: { resourceName: real } });
      } else if ("adGroupAdOperation" in op) {
        const c = op.adGroupAdOperation.create;
        const ag = temp.get(c.adGroup) ?? c.adGroup;
        const real = `${ag.replace("/adGroups/", "/adGroupAds/")}~${this.newId()}`;
        campaign?.ads.push({ resourceName: real, adGroup: ag, status: c.status, finalUrls: c.ad.finalUrls });
        responses.push({ adGroupAdResult: { resourceName: real } });
      }
    }
    return { mutateOperationResponses: responses, requestId: `req-${this.newId()}` };
  }

  async findCampaignsByMarker(marker: string): Promise<CampaignSummary[]> {
    this.calls.push({ method: "findCampaignsByMarker", args: marker });
    if (this.markerOverride) return this.markerOverride;
    return [...this.store.values()].filter((c) => c.name.includes(`[${marker}]`) && c.status !== "REMOVED").map((c) => ({ resourceName: c.resourceName, id: c.id, name: c.name, status: c.status }));
  }

  async readCampaignTree(campaignResourceName: string): Promise<CampaignTree | null> {
    this.calls.push({ method: "readCampaignTree", args: campaignResourceName });
    if (this.failReadTreeOnce) {
      const err = this.failReadTreeOnce;
      this.failReadTreeOnce = null;
      throw err;
    }
    const c = this.store.get(campaignResourceName);
    if (!c) return null;
    return {
      campaign: {
        resourceName: c.resourceName,
        id: c.id,
        name: c.name,
        status: this.treeStatusOverride ?? c.status,
        servingStatus: c.status === "ENABLED" ? "SERVING" : "PAUSED",
        primaryStatus: c.status === "ENABLED" ? "ELIGIBLE" : "PAUSED",
        startDate: c.startDate,
        endDate: c.endDate,
        channelType: "SEARCH",
        biddingStrategyType: "MAXIMIZE_CONVERSIONS",
        budgetResourceName: c.budgetResourceName,
        budgetAmountMicros: c.budgetAmountMicros,
      },
      adGroups: c.adGroups.map((g) => ({ ...g })),
      keywords: c.keywords.map((k) => ({ ...k })),
      ads: c.ads.map((a) => ({ ...a, approvalStatus: "UNDER_REVIEW" })),
      campaignCriteria: c.criteria.map((x) => ({ ...x })),
    };
  }

  async setCampaignStatus(campaignResourceName: string, status: "ENABLED" | "PAUSED"): Promise<{ requestId: string | null }> {
    this.calls.push({ method: "setCampaignStatus", args: { campaignResourceName, status } });
    const c = this.store.get(campaignResourceName);
    if (!c) throw new ConnectorError("NOT_FOUND", "fake: campaign nahi mila", 404);
    if (this.activateApplies) c.status = status;
    if (this.timeoutActivate) throw new ConnectorError("TIMEOUT", "fake: activation timeout");
    return { requestId: `req-activate-${this.newId()}` };
  }

  // ---- helpers for the checks ------------------------------------------
  realMutates(): FakeCall[] {
    return this.calls.filter((c) => c.method === "mutate" && c.validateOnly === false);
  }
  validateMutates(): FakeCall[] {
    return this.calls.filter((c) => c.method === "mutate" && c.validateOnly === true);
  }
  activations(): FakeCall[] {
    return this.calls.filter((c) => c.method === "setCampaignStatus");
  }
}

/** A Google-shaped 400 with field-level errors, as `connectorFetchJson` would carry it. */
export function googleValidationError(message: string, field = "campaign.name"): ConnectorError {
  return new ConnectorError("UPSTREAM", `google-ads: 400. ${message}`, 400, "req-400", {
    errors: [{ code: "campaignError.INVALID_CAMPAIGN_NAME", message, field }],
  });
}
