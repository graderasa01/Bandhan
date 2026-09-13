/**
 * The Meta Marketing API surface the execution layer is allowed to touch
 * (doc 14 §12) — as an interface, so the worker is driven by a fake in the
 * checks and by `connectors/metaAdsWrite.ts` in production.
 *
 * Every request shape here is the Graph API JSON the configured
 * `META_GRAPH_API_VERSION` accepts, restricted to the fields the pure mapper
 * emits (`mappers/metaCampaignMapper.ts`). Nothing else can reach a request
 * body: the mapper is the only producer of these objects and it is typed
 * against this file.
 *
 * Checked against the v26.0 references (September 2026):
 *   • a campaign whose budgets live on its ad sets must say
 *     `is_adset_budget_sharing_enabled` (required since v24.0);
 *   • a new ad set must say `targeting_automation.advantage_audience`
 *     (required since v23.0);
 *   • the token's role on an ad account is the account's `user_tasks`;
 *   • a creative's Instagram identity is `object_story_spec.instagram_user_id`;
 *   • Advantage+ creative is opted out feature by feature — the single
 *     `standard_enhancements` bundle was deprecated in v22.0;
 *   • none of the read edges we search by marker documents `filtering`, so
 *     marker searches page through the edge and match names client-side.
 *
 * Reads may be retried by the connector; every method under "Writes" is
 * sent once (`retries: 0`) and a lost answer is the caller's
 * UNKNOWN_OUTCOME, resolved by the `find*ByMarker` reads — never a resend.
 */

export type MetaObjectStatus = "PAUSED" | "ACTIVE";

// ---- account / identity facts ----------------------------------------------

export interface MetaTokenCapabilities {
  /** `/me` — proves the token is alive and names the system user. */
  identity: { id: string; name: string | null };
  /** `/me/permissions` granted set — `ads_read`, `ads_management`, … */
  granted: string[];
  /** Permissions Meta reports as declined/expired (shown, never guessed). */
  declined: string[];
}

export interface MetaAdAccountFacts {
  /** `act_<id>` */
  id: string;
  accountId: string;
  name: string | null;
  currency: string | null;
  timeZone: string | null;
  /** Meta `account_status` — 1 = ACTIVE; anything else blocks creation (doc 14 §9). */
  accountStatus: number | null;
  disableReason: number | null;
  /** The ad account's `user_tasks` — what this token's user may do there (MANAGE, ADVERTISE, ANALYZE…). Null when the API did not return the field. */
  tasks: string[] | null;
}

export interface MetaPromotablePage {
  id: string;
  name: string | null;
  /** Page tasks the token holds — ADVERTISE is what a promoted post needs. Null when unreported. */
  tasks: string[] | null;
}

/** A Page read directly by id — proves visibility when the token's Page list does not include it. */
export interface MetaPageFacts {
  id: string;
  name: string | null;
}

export interface MetaInstagramActor {
  id: string;
  username: string | null;
  /** Which Page it is linked through. */
  pageId: string;
}

// ---- targeting resolution -------------------------------------------------

export interface MetaLocationMatch {
  key: string;
  name: string;
  /** `city` | `region` | `country` | `zip` … — the mapper only accepts city/region/country. */
  type: string;
  countryCode: string | null;
  region: string | null;
}

export interface MetaInterestMatch {
  id: string;
  name: string;
  audienceSize: number | null;
  path: string[];
}

// ---- create requests (the mapper's output, verbatim) ------------------------

export interface MetaCampaignCreate {
  name: string;
  objective: string;
  status: "PAUSED";
  special_ad_categories: string[];
  special_ad_category_country?: string[];
  buying_type: "AUCTION";
  /** Required since v24.0 when budgets are set on the ad sets. `false`: every ad set spends exactly its approved budget — Meta may not move 20% between them. */
  is_adset_budget_sharing_enabled: false;
}

export interface MetaGeoLocations {
  countries?: string[];
  regions?: { key: string }[];
  cities?: { key: string; radius?: number; distance_unit?: "kilometer" }[];
}

export interface MetaTargeting {
  geo_locations: MetaGeoLocations;
  age_min: number;
  age_max: number;
  genders?: number[];
  flexible_spec?: Array<{ interests: { id: string; name: string }[] }>;
  publisher_platforms: string[];
  facebook_positions?: string[];
  instagram_positions?: string[];
  /** Explicit since v23.0. `0`: the approved age, gender and interests are hard limits, not suggestions Meta may widen. */
  targeting_automation: { advantage_audience: 0 };
}

export interface MetaPromotedObject {
  page_id?: string;
  pixel_id?: string;
  custom_event_type?: string;
}

export interface MetaAdSetCreate {
  name: string;
  campaign_id: string;
  status: "PAUSED";
  /** Integer minor units (paise for INR), as a string. */
  daily_budget: string;
  billing_event: string;
  optimization_goal: string;
  bid_strategy: "LOWEST_COST_WITHOUT_CAP";
  destination_type: string;
  start_time: string;
  end_time: string;
  targeting: MetaTargeting;
  promoted_object?: MetaPromotedObject;
}

export interface MetaCreativeCreate {
  name: string;
  object_story_spec: {
    page_id: string;
    /** The Instagram professional account the ad posts as. */
    instagram_user_id?: string;
    link_data: {
      image_hash: string;
      link: string;
      message: string;
      name: string;
      description?: string;
      call_to_action: { type: string; value: { link: string } };
    };
  };
  /** Every Advantage+ creative feature that would alter the approved image or copy, OPT_OUT (see `META_CREATIVE_FEATURE_OPT_OUTS`). */
  degrees_of_freedom_spec: { creative_features_spec: Record<string, { enroll_status: "OPT_OUT" }> };
}

export interface MetaAdCreate {
  name: string;
  adset_id: string;
  creative: { creative_id: string };
  status: "PAUSED";
}

// ---- read-back --------------------------------------------------------------

export interface MetaObjectSummary {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string | null;
}

export interface MetaCreativeSummary extends MetaObjectSummary {
  imageHash: string | null;
  link: string | null;
  pageId: string | null;
  instagramUserId: string | null;
}

export interface MetaCampaignTree {
  campaign: {
    id: string;
    name: string;
    objective: string | null;
    status: string;
    effectiveStatus: string | null;
    configuredStatus: string | null;
    specialAdCategories: string[];
    buyingType: string | null;
  };
  adSets: Array<{
    id: string;
    name: string;
    campaignId: string | null;
    status: string;
    effectiveStatus: string | null;
    dailyBudget: string | null;
    optimizationGoal: string | null;
    billingEvent: string | null;
    destinationType: string | null;
    startTime: string | null;
    endTime: string | null;
    /** As Meta returns it — compared through `normaliseTargeting`, never trusted as our own shape. */
    targeting: Record<string, unknown> | null;
  }>;
  ads: Array<{
    id: string;
    name: string;
    adSetId: string;
    status: string;
    effectiveStatus: string | null;
    creativeId: string | null;
    /** From `ad_review_feedback` — policy words, summarised. */
    reviewFeedback: string | null;
    issues: string[];
  }>;
  creatives: Array<{
    id: string;
    name: string;
    pageId: string | null;
    instagramUserId: string | null;
    imageHash: string | null;
    link: string | null;
  }>;
}

export interface MetaImageUploadResult {
  hash: string;
  url: string | null;
  width: number | null;
  height: number | null;
}

/**
 * The reads a readiness check makes — and nothing else. The connection-check
 * script and `evaluateMetaAdReadiness` are typed against this, so neither can
 * reach a write even by mistake.
 */
export interface MetaAdsReadinessReader {
  /** Which account the credentials open — currency/timezone/status decide budgets, dates and whether creation is allowed at all. */
  describeAccount(): Promise<MetaAdAccountFacts>;
  inspectTokenCapabilities(): Promise<MetaTokenCapabilities>;
  listPromotablePages(): Promise<MetaPromotablePage[]>;
  /** Null when the Page is not visible to this token. */
  describePage(pageId: string): Promise<MetaPageFacts | null>;
  listInstagramActors(pageId: string): Promise<MetaInstagramActor[]>;
}

export interface MetaAdsWriteProvider extends MetaAdsReadinessReader {
  /** Targeting search for a human location string — every match, so ambiguity is visible. */
  resolveLocations(query: string): Promise<MetaLocationMatch[]>;
  resolveInterests(query: string): Promise<MetaInterestMatch[]>;

  readCampaignTree(campaignId: string): Promise<MetaCampaignTree | null>;
  /** Marker searches (doc 14 §14) — reads only, scoped to the account / the stored parent. */
  findCampaignsByMarker(marker: string): Promise<MetaObjectSummary[]>;
  findAdSetsByMarker(campaignId: string, marker: string): Promise<MetaObjectSummary[]>;
  findCreativesByMarker(marker: string): Promise<MetaCreativeSummary[]>;
  findAdsByMarker(adSetId: string, marker: string): Promise<Array<MetaObjectSummary & { creativeId: string | null }>>;
  /** Image already on the account by its Meta hash — checked before an upload, and after an upload whose answer was lost. */
  findImageByHash(hash: string): Promise<MetaImageUploadResult | null>;

  // ---- writes — one request each, never retried by the connector ----------
  createCampaignPaused(body: MetaCampaignCreate): Promise<{ id: string; requestId: string | null }>;
  createAdSetPaused(body: MetaAdSetCreate): Promise<{ id: string; requestId: string | null }>;
  uploadOrResolveImage(input: { bytes: Buffer; filename: string; sha256: string }): Promise<MetaImageUploadResult & { requestId: string | null }>;
  createAdCreative(body: MetaCreativeCreate): Promise<{ id: string; requestId: string | null }>;
  createAdPaused(body: MetaAdCreate): Promise<{ id: string; requestId: string | null }>;
  setAdStatus(adId: string, status: MetaObjectStatus): Promise<{ requestId: string | null }>;
  setAdSetStatus(adSetId: string, status: MetaObjectStatus): Promise<{ requestId: string | null }>;
  setCampaignStatus(campaignId: string, status: MetaObjectStatus): Promise<{ requestId: string | null }>;
}
