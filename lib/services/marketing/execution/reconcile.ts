import type { CampaignSummary, CampaignTree, GoogleAdsWriteProvider, MutateResponse } from "@/lib/marketing/providers/googleAdsProvider";
import { nameCarriesMarker } from "./idempotency";
import { normaliseProviderError } from "./executionErrors";
import type { GoogleExternalRefs } from "./deploymentService";

/**
 * Read-back and reconciliation (doc 13 §9, §11.5-11.6, §17). Pure where it
 * can be — `verifyTree` and the two `refsFrom*` helpers take data and return
 * data, so the check script pins them — and provider-driven only in
 * `reconcileByMarker`, which is the *only* way an unknown write outcome is
 * ever resolved: search, never resend.
 */

export type OwnedRefs = Pick<GoogleExternalRefs, "campaign" | "campaignId" | "budget" | "adGroups" | "keywords" | "campaignCriteria" | "ads">;

function idOf(resourceName: string): string {
  return resourceName.split("/").pop() ?? "";
}

/** Every resource name the atomic create returned, bucketed by type — stored before anything else happens (§11.5). */
export function refsFromMutateResponse(resp: MutateResponse): OwnedRefs {
  const refs: OwnedRefs = { campaign: null, campaignId: null, budget: null, adGroups: [], keywords: [], campaignCriteria: [], ads: [] };
  for (const entry of resp.mutateOperationResponses) {
    for (const [key, value] of Object.entries(entry)) {
      const name = value?.resourceName;
      if (!name) continue;
      switch (key) {
        case "campaignBudgetResult":
          refs.budget = name;
          break;
        case "campaignResult":
          refs.campaign = name;
          refs.campaignId = idOf(name);
          break;
        case "campaignCriterionResult":
          refs.campaignCriteria.push(name);
          break;
        case "adGroupResult":
          refs.adGroups.push(name);
          break;
        case "adGroupCriterionResult":
          refs.keywords.push(name);
          break;
        case "adGroupAdResult":
          refs.ads.push(name);
          break;
        default:
          break;
      }
    }
  }
  return refs;
}

/** The same buckets from a read-back — what reconciliation attaches when the create's response was lost. */
export function refsFromTree(tree: CampaignTree): OwnedRefs {
  return {
    campaign: tree.campaign.resourceName,
    campaignId: tree.campaign.id,
    budget: tree.campaign.budgetResourceName,
    adGroups: tree.adGroups.map((g) => g.resourceName),
    keywords: tree.keywords.map((k) => k.resourceName),
    campaignCriteria: tree.campaignCriteria.map((c) => c.resourceName),
    ads: tree.ads.map((a) => a.resourceName),
  };
}

export interface TreeExpectation {
  marker: string;
  customerId: string;
  /** Exact micros the approved budget converts to. */
  budgetMicros: string;
  expectedStatus: "PAUSED" | "ENABLED";
  finalUrl: string;
  startDate?: string | null;
  endDate?: string | null;
  /** The resource name we believe we own, when known — a different campaign with our marker is a mismatch, not a match. */
  campaignResourceName?: string | null;
}

export interface TreeVerdict {
  ok: boolean;
  problems: string[];
  summary: {
    status: string;
    budgetMicros: string | null;
    adGroups: number;
    keywords: number;
    ads: number;
    startDate: string | null;
    endDate: string | null;
    servingStatus: string | null;
    primaryStatus: string | null;
    /** Distinct `policy_summary.approval_status` values across live ads — the policy half of "activated vs delivering" (doc 14 Gap C). */
    adApprovalStatuses: string[];
  };
}

/**
 * "Correct marker, customer ID, paused state, budget and destination" (§11.5)
 * — every mismatch is named so the admin sees exactly what differs (§17).
 */
export function verifyTree(tree: CampaignTree, exp: TreeExpectation): TreeVerdict {
  const problems: string[] = [];
  const c = tree.campaign;
  if (!nameCarriesMarker(c.name, exp.marker)) problems.push(`campaign name me marker [${exp.marker}] nahi hai ("${c.name.slice(0, 60)}")`);
  const cid = c.resourceName.split("/")[1] ?? "";
  if (cid !== exp.customerId) problems.push(`campaign customer ${cid} ≠ ${exp.customerId}`);
  if (exp.campaignResourceName && c.resourceName !== exp.campaignResourceName) problems.push(`campaign ${c.resourceName} ≠ stored ${exp.campaignResourceName}`);
  if (c.status !== exp.expectedStatus) problems.push(`campaign status ${c.status || "?"} ≠ ${exp.expectedStatus}`);
  if (c.budgetAmountMicros === null || c.budgetAmountMicros !== exp.budgetMicros) problems.push(`budget ${c.budgetAmountMicros ?? "?"} micros ≠ approved ${exp.budgetMicros}`);
  if (c.channelType && c.channelType !== "SEARCH") problems.push(`channel ${c.channelType} ≠ SEARCH`);
  if (exp.startDate && c.startDate && c.startDate !== exp.startDate) problems.push(`start ${c.startDate} ≠ ${exp.startDate}`);
  if (exp.endDate && c.endDate && c.endDate !== exp.endDate) problems.push(`end ${c.endDate} ≠ ${exp.endDate}`);
  const liveAdGroups = tree.adGroups.filter((g) => g.status !== "REMOVED");
  const liveKeywords = tree.keywords.filter((k) => k.status !== "REMOVED");
  const liveAds = tree.ads.filter((a) => a.status !== "REMOVED");
  if (!liveAdGroups.length) problems.push("koi ad group nahi");
  if (!liveKeywords.length) problems.push("koi keyword nahi");
  if (!liveAds.length) problems.push("koi ad nahi");
  const badUrl = liveAds.find((a) => !a.finalUrls.includes(exp.finalUrl));
  if (badUrl) problems.push(`ad ${idOf(badUrl.resourceName)} ka final URL approved destination nahi hai`);
  return {
    ok: problems.length === 0,
    problems,
    summary: {
      status: c.status,
      budgetMicros: c.budgetAmountMicros,
      adGroups: liveAdGroups.length,
      keywords: liveKeywords.length,
      ads: liveAds.length,
      startDate: c.startDate,
      endDate: c.endDate,
      servingStatus: c.servingStatus,
      primaryStatus: c.primaryStatus,
      adApprovalStatuses: [...new Set(liveAds.map((a) => a.approvalStatus).filter((x): x is string => !!x))].sort(),
    },
  };
}

export type MarkerSearch = { kind: "none" } | { kind: "one"; campaign: CampaignSummary } | { kind: "many"; campaigns: CampaignSummary[] };

/** The only answer to "did my write land?" (§9.2). Reads only. */
export async function reconcileByMarker(provider: GoogleAdsWriteProvider, marker: string): Promise<MarkerSearch> {
  let found: CampaignSummary[];
  try {
    found = await provider.findCampaignsByMarker(marker);
  } catch (err) {
    throw normaliseProviderError(err, "read");
  }
  const owned = found.filter((c) => nameCarriesMarker(c.name, marker) && c.status !== "REMOVED");
  if (owned.length === 0) return { kind: "none" };
  if (owned.length === 1) return { kind: "one", campaign: owned[0] };
  return { kind: "many", campaigns: owned };
}
