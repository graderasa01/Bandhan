import { createHash } from "node:crypto";
import { ConnectorError } from "../../lib/marketing/connectors/http";
import type {
  MetaAdAccountFacts,
  MetaAdCreate,
  MetaAdSetCreate,
  MetaAdsWriteProvider,
  MetaCampaignCreate,
  MetaCampaignTree,
  MetaCreativeCreate,
  MetaCreativeSummary,
  MetaImageUploadResult,
  MetaInstagramActor,
  MetaInterestMatch,
  MetaLocationMatch,
  MetaObjectStatus,
  MetaObjectSummary,
  MetaPageFacts,
  MetaPromotablePage,
  MetaTokenCapabilities,
} from "../../lib/marketing/providers/metaAdsProvider";

/**
 * An in-memory Meta ad account for the MKT-2B checks. Writes fill a small
 * store (campaigns, ad sets, images, creatives, ads) and every read — marker
 * searches and the campaign tree — is computed from that store, so the
 * executor's reconciliation and read-back verification run against what the
 * fake actually holds, never against a canned answer.
 *
 * It behaves like Meta where the executor depends on it:
 *   • an image hash is the MD5 of its bytes, so the same image is one hash;
 *   • `effective_status` is derived — an ACTIVE ad under a PAUSED campaign is
 *     CAMPAIGN_PAUSED, and under an ACTIVE campaign it reports `reviewState`
 *     (PENDING_REVIEW by default: activated is not delivering);
 *   • times read back in Meta's `+0530` form, not the `+05:30` that was sent,
 *     and targeting reads back with Meta-added extras;
 *   • a child write under a missing parent is a 400.
 *
 * Every call is logged. Failure switches the checks flip:
 *   • `failures`            — a write throws; with `apply: true` the object is
 *                             stored first ("it landed, the answer was lost");
 *   • `failReadTreeOnce`    — the next tree read throws;
 *   • `missingTreeReads`    — the next N tree reads return null (not yet visible);
 *   • `afterCampaignStatus` — runs after a campaign status write is applied,
 *                             to change the hierarchy between write and read-back;
 *   • `tokenError`          — the token read throws (a dead token).
 */

export type FakeMetaWrite = "createCampaignPaused" | "createAdSetPaused" | "uploadOrResolveImage" | "createAdCreative" | "createAdPaused" | "setAdStatus" | "setAdSetStatus" | "setCampaignStatus";

export const FAKE_META_WRITES: ReadonlySet<string> = new Set<FakeMetaWrite>(["createCampaignPaused", "createAdSetPaused", "uploadOrResolveImage", "createAdCreative", "createAdPaused", "setAdStatus", "setAdSetStatus", "setCampaignStatus"]);

export interface FakeMetaFailure {
  method: FakeMetaWrite;
  /** Fail only the Nth call of this method (1-based, counted over the fake's life); unset = the next call. */
  nth?: number;
  /** The write is applied before the error is thrown. */
  apply: boolean;
  error: ConnectorError | Error;
}

export interface StoredCampaign {
  id: string;
  name: string;
  objective: string;
  status: string;
  specialAdCategories: string[];
  budgetSharing: boolean | undefined;
}

export interface StoredAdSet {
  id: string;
  name: string;
  campaignId: string;
  status: string;
  body: Omit<MetaAdSetCreate, "campaign_id">;
}

export interface StoredCreative {
  id: string;
  name: string;
  body: MetaCreativeCreate;
}

export interface StoredAd {
  id: string;
  name: string;
  adSetId: string;
  creativeId: string;
  status: string;
}

export interface FakeMetaCall {
  method: string;
  args?: unknown;
}

function metaTime(iso: string): string {
  return iso.replace(/([+-]\d{2}):(\d{2})$/, "$1$2");
}

export class FakeMetaAds implements MetaAdsWriteProvider {
  readonly calls: FakeMetaCall[] = [];

  granted: string[] = ["ads_read", "ads_management", "pages_show_list", "pages_read_engagement", "instagram_basic", "instagram_manage_insights"];
  declined: string[] = [];
  tokenError: ConnectorError | null = null;
  account: MetaAdAccountFacts = { id: "act_1234567890", accountId: "1234567890", name: "Fake BandhanTak Meta", currency: "INR", timeZone: "Asia/Kolkata", accountStatus: 1, disableReason: 0, tasks: ["MANAGE", "ADVERTISE", "ANALYZE"] };
  pages: MetaPromotablePage[] = [{ id: "1111", name: "BandhanTak", tasks: ["ADVERTISE", "ANALYZE", "CREATE_CONTENT", "MANAGE"] }];
  /** Pages readable by id although not in the token's Page list (a system user's Business-assigned Page). */
  directPages: MetaPageFacts[] = [];
  instagramByPage: Record<string, MetaInstagramActor[]> = { "1111": [{ id: "2222", username: "bandhantak", pageId: "1111" }] };
  locations: Record<string, MetaLocationMatch[]> = { Jaipur: [{ key: "1035921", name: "Jaipur", type: "city", countryCode: "IN", region: "Rajasthan" }] };
  interests: Record<string, MetaInterestMatch[]> = { "Wedding planning": [{ id: "6003147285301", name: "Wedding planning", audienceSize: 1_000_000, path: ["Interests", "Family and relationships"] }] };
  /** What an ACTIVE ad under an ACTIVE ad set and campaign reports. */
  reviewState: "ACTIVE" | "PENDING_REVIEW" | "DISAPPROVED" = "PENDING_REVIEW";

  readonly campaigns = new Map<string, StoredCampaign>();
  readonly adSets = new Map<string, StoredAdSet>();
  readonly creatives = new Map<string, StoredCreative>();
  readonly ads = new Map<string, StoredAd>();
  readonly images = new Map<string, MetaImageUploadResult>();

  failures: FakeMetaFailure[] = [];
  failReadTreeOnce: ConnectorError | Error | null = null;
  missingTreeReads = 0;
  afterCampaignStatus: ((campaignId: string, status: MetaObjectStatus) => void) | null = null;

  private seq = 7_000_000;
  private readonly methodCalls = new Map<string, number>();

  private nextId(): string {
    this.seq += 1;
    return String(this.seq);
  }

  private write<T>(method: FakeMetaWrite, args: unknown, apply: () => T): T {
    this.calls.push({ method, args });
    const n = (this.methodCalls.get(method) ?? 0) + 1;
    this.methodCalls.set(method, n);
    const index = this.failures.findIndex((f) => f.method === method && (f.nth === undefined || f.nth === n));
    if (index < 0) return apply();
    const failure = this.failures[index];
    this.failures.splice(index, 1);
    if (failure.apply) apply();
    throw failure.error;
  }

  // ---- reads: identity ------------------------------------------------------

  async inspectTokenCapabilities(): Promise<MetaTokenCapabilities> {
    this.calls.push({ method: "inspectTokenCapabilities" });
    if (this.tokenError) throw this.tokenError;
    return { identity: { id: "9000001", name: "BT Growth System User" }, granted: [...this.granted], declined: [...this.declined] };
  }

  async describeAccount(): Promise<MetaAdAccountFacts> {
    this.calls.push({ method: "describeAccount" });
    return { ...this.account, tasks: this.account.tasks ? [...this.account.tasks] : null };
  }

  async listPromotablePages(): Promise<MetaPromotablePage[]> {
    this.calls.push({ method: "listPromotablePages" });
    return this.pages.map((p) => ({ ...p }));
  }

  async describePage(pageId: string): Promise<MetaPageFacts | null> {
    this.calls.push({ method: "describePage", args: pageId });
    const listed = this.pages.find((p) => p.id === pageId);
    if (listed) return { id: listed.id, name: listed.name };
    return this.directPages.find((p) => p.id === pageId) ?? null;
  }

  async listInstagramActors(pageId: string): Promise<MetaInstagramActor[]> {
    this.calls.push({ method: "listInstagramActors", args: pageId });
    return (this.instagramByPage[pageId] ?? []).map((a) => ({ ...a }));
  }

  async resolveLocations(query: string): Promise<MetaLocationMatch[]> {
    this.calls.push({ method: "resolveLocations", args: query });
    return (this.locations[query] ?? []).map((l) => ({ ...l }));
  }

  async resolveInterests(query: string): Promise<MetaInterestMatch[]> {
    this.calls.push({ method: "resolveInterests", args: query });
    return (this.interests[query] ?? []).map((i) => ({ ...i }));
  }

  // ---- reads: objects --------------------------------------------------------

  async readCampaignTree(campaignId: string): Promise<MetaCampaignTree | null> {
    this.calls.push({ method: "readCampaignTree", args: campaignId });
    if (this.failReadTreeOnce) {
      const err = this.failReadTreeOnce;
      this.failReadTreeOnce = null;
      throw err;
    }
    if (this.missingTreeReads > 0) {
      this.missingTreeReads -= 1;
      return null;
    }
    const c = this.campaigns.get(campaignId);
    if (!c) return null;
    const sets = [...this.adSets.values()].filter((s) => s.campaignId === c.id);
    const setIds = new Set(sets.map((s) => s.id));
    const ads = [...this.ads.values()].filter((a) => setIds.has(a.adSetId));
    const creativeIds = [...new Set(ads.map((a) => a.creativeId))];
    return {
      campaign: { id: c.id, name: c.name, objective: c.objective, status: c.status, effectiveStatus: c.status, configuredStatus: c.status, specialAdCategories: [...c.specialAdCategories], buyingType: "AUCTION" },
      adSets: sets.map((s) => ({
        id: s.id,
        name: s.name,
        campaignId: s.campaignId,
        status: s.status,
        effectiveStatus: c.status === "PAUSED" && s.status === "ACTIVE" ? "CAMPAIGN_PAUSED" : s.status,
        dailyBudget: s.body.daily_budget,
        optimizationGoal: s.body.optimization_goal,
        billingEvent: s.body.billing_event,
        destinationType: s.body.destination_type,
        startTime: metaTime(s.body.start_time),
        endTime: metaTime(s.body.end_time),
        targeting: JSON.parse(JSON.stringify({ ...s.body.targeting, geo_locations: { ...s.body.targeting.geo_locations, location_types: ["home", "recent"] }, device_platforms: ["mobile", "desktop"] })) as Record<string, unknown>,
      })),
      ads: ads.map((a) => {
        const set = this.adSets.get(a.adSetId)!;
        const effective = a.status !== "ACTIVE" ? a.status : c.status !== "ACTIVE" ? "CAMPAIGN_PAUSED" : set.status !== "ACTIVE" ? "ADSET_PAUSED" : this.reviewState;
        return {
          id: a.id,
          name: a.name,
          adSetId: a.adSetId,
          status: a.status,
          effectiveStatus: effective,
          creativeId: a.creativeId,
          reviewFeedback: effective === "DISAPPROVED" ? "body: Ad copy policy review me reject" : null,
          issues: [],
        };
      }),
      creatives: creativeIds
        .map((id) => this.creatives.get(id))
        .filter((cr): cr is StoredCreative => !!cr)
        .map((cr) => ({
          id: cr.id,
          name: cr.name,
          pageId: cr.body.object_story_spec.page_id,
          instagramUserId: cr.body.object_story_spec.instagram_user_id ?? null,
          imageHash: cr.body.object_story_spec.link_data.image_hash,
          link: cr.body.object_story_spec.link_data.link,
        })),
    };
  }

  async findCampaignsByMarker(marker: string): Promise<MetaObjectSummary[]> {
    this.calls.push({ method: "findCampaignsByMarker", args: marker });
    return [...this.campaigns.values()].filter((c) => c.name.includes(`[${marker}`)).map((c) => ({ id: c.id, name: c.name, status: c.status, effectiveStatus: c.status }));
  }

  async findAdSetsByMarker(campaignId: string, marker: string): Promise<MetaObjectSummary[]> {
    this.calls.push({ method: "findAdSetsByMarker", args: { campaignId, marker } });
    return [...this.adSets.values()].filter((s) => s.campaignId === campaignId && s.name.includes(`[${marker}`)).map((s) => ({ id: s.id, name: s.name, status: s.status, effectiveStatus: s.status }));
  }

  async findCreativesByMarker(marker: string): Promise<MetaCreativeSummary[]> {
    this.calls.push({ method: "findCreativesByMarker", args: marker });
    return [...this.creatives.values()]
      .filter((c) => c.name.includes(`[${marker}`))
      .map((c) => ({
        id: c.id,
        name: c.name,
        status: "ACTIVE",
        effectiveStatus: null,
        imageHash: c.body.object_story_spec.link_data.image_hash,
        link: c.body.object_story_spec.link_data.link,
        pageId: c.body.object_story_spec.page_id,
        instagramUserId: c.body.object_story_spec.instagram_user_id ?? null,
      }));
  }

  async findAdsByMarker(adSetId: string, marker: string): Promise<Array<MetaObjectSummary & { creativeId: string | null }>> {
    this.calls.push({ method: "findAdsByMarker", args: { adSetId, marker } });
    return [...this.ads.values()].filter((a) => a.adSetId === adSetId && a.name.includes(`[${marker}`)).map((a) => ({ id: a.id, name: a.name, status: a.status, effectiveStatus: a.status, creativeId: a.creativeId }));
  }

  async findImageByHash(hash: string): Promise<MetaImageUploadResult | null> {
    this.calls.push({ method: "findImageByHash", args: hash });
    const hit = this.images.get(hash);
    return hit ? { ...hit } : null;
  }

  // ---- writes ----------------------------------------------------------------

  async createCampaignPaused(body: MetaCampaignCreate): Promise<{ id: string; requestId: string | null }> {
    const id = this.nextId();
    return this.write("createCampaignPaused", body, () => {
      if (body.status !== "PAUSED") throw new ConnectorError("UPSTREAM", "fake: campaign must be created PAUSED", 400);
      this.campaigns.set(id, { id, name: body.name, objective: body.objective, status: "PAUSED", specialAdCategories: [...body.special_ad_categories], budgetSharing: body.is_adset_budget_sharing_enabled });
      return { id, requestId: `fake-${id}` };
    });
  }

  async createAdSetPaused(body: MetaAdSetCreate): Promise<{ id: string; requestId: string | null }> {
    const id = this.nextId();
    return this.write("createAdSetPaused", body, () => {
      if (!this.campaigns.has(body.campaign_id)) throw new ConnectorError("UPSTREAM", "fake: campaign does not exist", 400);
      if (body.status !== "PAUSED") throw new ConnectorError("UPSTREAM", "fake: ad set must be created PAUSED", 400);
      const { campaign_id: campaignId, ...rest } = body;
      this.adSets.set(id, { id, name: body.name, campaignId, status: "PAUSED", body: JSON.parse(JSON.stringify(rest)) });
      return { id, requestId: `fake-${id}` };
    });
  }

  async uploadOrResolveImage(input: { bytes: Buffer; filename: string; sha256: string }): Promise<MetaImageUploadResult & { requestId: string | null }> {
    const hash = createHash("md5").update(input.bytes).digest("hex");
    return this.write("uploadOrResolveImage", { filename: input.filename, sha256: input.sha256, size: input.bytes.length }, () => {
      const image = { hash, url: `https://scontent.fake-meta.test/${hash}.jpg`, width: 1080, height: 1080 };
      this.images.set(hash, image);
      return { ...image, requestId: `fake-img-${hash.slice(0, 6)}` };
    });
  }

  async createAdCreative(body: MetaCreativeCreate): Promise<{ id: string; requestId: string | null }> {
    const id = this.nextId();
    return this.write("createAdCreative", body, () => {
      if (!this.images.has(body.object_story_spec.link_data.image_hash)) throw new ConnectorError("UPSTREAM", "fake: image hash not on the account", 400);
      this.creatives.set(id, { id, name: body.name, body: JSON.parse(JSON.stringify(body)) });
      return { id, requestId: `fake-${id}` };
    });
  }

  async createAdPaused(body: MetaAdCreate): Promise<{ id: string; requestId: string | null }> {
    const id = this.nextId();
    return this.write("createAdPaused", body, () => {
      if (!this.adSets.has(body.adset_id) || !this.creatives.has(body.creative.creative_id)) throw new ConnectorError("UPSTREAM", "fake: ad set or creative does not exist", 400);
      if (body.status !== "PAUSED") throw new ConnectorError("UPSTREAM", "fake: ad must be created PAUSED", 400);
      this.ads.set(id, { id, name: body.name, adSetId: body.adset_id, creativeId: body.creative.creative_id, status: "PAUSED" });
      return { id, requestId: `fake-${id}` };
    });
  }

  async setAdStatus(adId: string, status: MetaObjectStatus): Promise<{ requestId: string | null }> {
    return this.write("setAdStatus", { id: adId, status }, () => {
      const ad = this.ads.get(adId);
      if (!ad) throw new ConnectorError("UPSTREAM", "fake: ad does not exist", 400);
      ad.status = status;
      return { requestId: `fake-st-${adId}` };
    });
  }

  async setAdSetStatus(adSetId: string, status: MetaObjectStatus): Promise<{ requestId: string | null }> {
    return this.write("setAdSetStatus", { id: adSetId, status }, () => {
      const set = this.adSets.get(adSetId);
      if (!set) throw new ConnectorError("UPSTREAM", "fake: ad set does not exist", 400);
      set.status = status;
      return { requestId: `fake-st-${adSetId}` };
    });
  }

  async setCampaignStatus(campaignId: string, status: MetaObjectStatus): Promise<{ requestId: string | null }> {
    return this.write("setCampaignStatus", { id: campaignId, status }, () => {
      const c = this.campaigns.get(campaignId);
      if (!c) throw new ConnectorError("UPSTREAM", "fake: campaign does not exist", 400);
      c.status = status;
      this.afterCampaignStatus?.(campaignId, status);
      return { requestId: `fake-st-${campaignId}` };
    });
  }

  // ---- helpers for the checks ----------------------------------------------

  /** Every write the executor sent, in order. */
  writes(): FakeMetaCall[] {
    return this.calls.filter((c) => FAKE_META_WRITES.has(c.method));
  }

  count(method: FakeMetaWrite): number {
    return this.calls.filter((c) => c.method === method).length;
  }

  /** A marker-tagged campaign the executor did not make — for the ambiguity cases. */
  seedCampaign(name: string, status = "PAUSED"): string {
    const id = this.nextId();
    this.campaigns.set(id, { id, name, objective: "OUTCOME_TRAFFIC", status, specialAdCategories: ["NONE"], budgetSharing: false });
    return id;
  }

  /** A tagged ad set under a campaign — only its name, parent and status matter to a marker search. */
  seedAdSet(campaignId: string, name: string): string {
    const id = this.nextId();
    this.adSets.set(id, {
      id,
      name,
      campaignId,
      status: "PAUSED",
      body: { name, status: "PAUSED", daily_budget: "1000", billing_event: "IMPRESSIONS", optimization_goal: "LINK_CLICKS", bid_strategy: "LOWEST_COST_WITHOUT_CAP", destination_type: "WEBSITE", start_time: "2026-01-01T00:00:00+05:30", end_time: "2026-01-02T23:59:59+05:30", targeting: { geo_locations: { countries: ["IN"] }, age_min: 18, age_max: 65, publisher_platforms: ["facebook"], targeting_automation: { advantage_audience: 0 } } },
    });
    return id;
  }

  /** A tagged creative with its own image/link/Page — the "right tag, wrong spec" case. */
  seedCreative(name: string, spec: { imageHash: string; link: string; pageId: string }): string {
    const id = this.nextId();
    this.creatives.set(id, {
      id,
      name,
      body: { name, object_story_spec: { page_id: spec.pageId, link_data: { image_hash: spec.imageHash, link: spec.link, message: "seed", name: "seed", call_to_action: { type: "LEARN_MORE", value: { link: spec.link } } } }, degrees_of_freedom_spec: { creative_features_spec: {} } },
    });
    return id;
  }
}

/** A Graph-shaped definite refusal (400), as `connectorFetchJson` would carry it. */
export function metaValidationError(message: string, code = 100, subcode: number | null = 1487390): ConnectorError {
  return new ConnectorError("UPSTREAM", `meta-ads: 400. ${message}`, 400, "fake-400", { code, subcode, type: "OAuthException", message, userTitle: "Invalid parameter", userMessage: message, fbtraceId: "fake-trace-400" });
}
