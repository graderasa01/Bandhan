import "server-only";
import { toNumber } from "./http";
import { graphGet, graphPost, type MetaAuth } from "./metaGraph";
import { normaliseAdAccountId } from "./metaAds";
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
} from "@/lib/marketing/providers/metaAdsProvider";

/**
 * Meta Marketing API writes — the production `MetaAdsWriteProvider` (doc 14
 * §12). Every mutation goes through `graphPost` (one attempt, sanitised
 * errors); every read through `graphGet`. Field names are those of the
 * configured `META_GRAPH_API_VERSION` (v26.0 references checked September
 * 2026 — see `providers/metaAdsProvider.ts` for the list).
 *
 * Marker searches are scoped — ad sets inside the stored campaign, ads inside
 * the stored ad set, campaigns and creatives inside the ad account — so a
 * child can only ever be attached under the parent it belongs to (§14). None
 * of those read edges documents a `filtering` parameter, so a search pages
 * through the whole edge by cursor and matches the `[BT:…]` tag itself. A
 * search that cannot finish (more than `MARKER_SCAN_MAX_PAGES` pages) throws:
 * "I could not look everywhere" must never be read as "nothing is there",
 * because that answer is what lets a create go out.
 *
 * Paging never follows `paging.next`: that URL carries the access token in
 * its query string. The `after` cursor is sent instead, with the token in the
 * Authorization header like every other call.
 */

const PROVIDER = "meta-ads";
/** Pages of `PAGE_LIMIT` rows a marker search may read before it refuses to answer. */
export const MARKER_SCAN_MAX_PAGES = 40;
const PAGE_LIMIT = "100";

interface Page<T> {
  data?: T[];
  paging?: { cursors?: { after?: string }; next?: string };
}

function str(v: unknown): string | null {
  if (typeof v === "string") return v || null;
  return v === undefined || v === null ? null : String(v);
}

function arr(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}

/** Graph's "object does not exist / not visible" — a 404, or a 400 with code 100 subcode 33. */
function isNotFound(err: unknown): boolean {
  const e = err as { status?: number | null; details?: { code?: number | null; subcode?: number | null } | null } | null;
  if (!e) return false;
  if (e.status === 404) return true;
  return e.status === 400 && e.details?.code === 100 && (e.details?.subcode === 33 || e.details?.subcode === null || e.details?.subcode === undefined);
}

/** Every row of one edge, by cursor. Throws past `maxPages` rather than return a partial list as if it were whole. */
export async function scanEdge<T>(auth: MetaAuth, path: string, params: Record<string, string>, maxPages = MARKER_SCAN_MAX_PAGES): Promise<T[]> {
  const out: T[] = [];
  let after: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const res = await graphGet<Page<T>>(auth, path, { ...params, limit: PAGE_LIMIT, ...(after ? { after } : {}) }, PROVIDER);
    out.push(...(res.data ?? []));
    const cursor = res.paging?.next ? res.paging?.cursors?.after : undefined;
    if (!cursor) return out;
    after = cursor;
  }
  throw new Error(`meta-ads: ${path} ki marker search ${maxPages} pages me poori nahi hui — adhoore jawab par "kuch nahi mila" nahi maana jaata, isliye koi create nahi bheja.`);
}

function taggedWith(name: string | undefined, marker: string): boolean {
  return typeof name === "string" && name.includes(`[${marker}`);
}

export function createMetaAdsWriteProvider(auth: MetaAuth, adAccountId: string): MetaAdsWriteProvider {
  const act = normaliseAdAccountId(adAccountId);

  return {
    async describeAccount(): Promise<MetaAdAccountFacts> {
      const acc = await graphGet<{ id?: string; account_id?: string; name?: string; currency?: string; timezone_name?: string; account_status?: number; disable_reason?: number; user_tasks?: string[] }>(
        auth,
        act,
        { fields: "id,account_id,name,currency,timezone_name,account_status,disable_reason,user_tasks" },
        PROVIDER,
      );
      return {
        id: acc.id ?? act,
        accountId: String(acc.account_id ?? act.replace(/^act_/, "")),
        name: acc.name ?? null,
        currency: acc.currency ?? null,
        timeZone: acc.timezone_name ?? null,
        accountStatus: typeof acc.account_status === "number" ? acc.account_status : null,
        disableReason: typeof acc.disable_reason === "number" ? acc.disable_reason : null,
        tasks: Array.isArray(acc.user_tasks) ? acc.user_tasks.map(String) : null,
      };
    },

    async inspectTokenCapabilities(): Promise<MetaTokenCapabilities> {
      const me = await graphGet<{ id?: string; name?: string }>(auth, "me", { fields: "id,name" }, PROVIDER);
      const perms = await scanEdge<{ permission?: string; status?: string }>(auth, "me/permissions", {}, 5);
      const granted: string[] = [];
      const declined: string[] = [];
      for (const p of perms) {
        if (!p.permission) continue;
        if (p.status === "granted") granted.push(p.permission);
        else declined.push(`${p.permission}:${p.status ?? "?"}`);
      }
      return { identity: { id: me.id ?? "", name: me.name ?? null }, granted, declined };
    },

    async listPromotablePages(): Promise<MetaPromotablePage[]> {
      const pages = await scanEdge<{ id: string; name?: string; tasks?: string[] }>(auth, "me/accounts", { fields: "id,name,tasks" }, 10);
      return pages.map((p) => ({ id: String(p.id), name: p.name ?? null, tasks: Array.isArray(p.tasks) ? p.tasks.map(String) : null }));
    },

    async describePage(pageId: string): Promise<MetaPageFacts | null> {
      try {
        const page = await graphGet<{ id?: string; name?: string }>(auth, pageId, { fields: "id,name" }, PROVIDER);
        return page.id ? { id: String(page.id), name: page.name ?? null } : null;
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },

    async listInstagramActors(pageId: string): Promise<MetaInstagramActor[]> {
      const page = await graphGet<{ instagram_business_account?: { id?: string; username?: string }; connected_instagram_account?: { id?: string; username?: string } }>(
        auth,
        pageId,
        { fields: "instagram_business_account{id,username},connected_instagram_account{id,username}" },
        PROVIDER,
      );
      const out: MetaInstagramActor[] = [];
      for (const ig of [page.instagram_business_account, page.connected_instagram_account]) {
        if (ig?.id && !out.some((x) => x.id === String(ig.id))) out.push({ id: String(ig.id), username: ig.username ?? null, pageId });
      }
      return out;
    },

    async resolveLocations(query: string): Promise<MetaLocationMatch[]> {
      const res = await graphGet<Page<{ key?: string; name?: string; type?: string; country_code?: string; region?: string }>>(
        auth,
        "search",
        { type: "adgeolocation", q: query, location_types: JSON.stringify(["city", "region", "country"]), country_code: "IN", limit: "10" },
        PROVIDER,
      );
      return (res.data ?? [])
        .filter((r) => r.key && r.name && r.type)
        .map((r) => ({ key: String(r.key), name: String(r.name), type: String(r.type), countryCode: r.country_code ?? null, region: r.region ?? null }));
    },

    async resolveInterests(query: string): Promise<MetaInterestMatch[]> {
      const res = await graphGet<Page<{ id?: string; name?: string; audience_size_lower_bound?: number; audience_size?: number; path?: string[] }>>(
        auth,
        "search",
        { type: "adinterest", q: query, limit: "10" },
        PROVIDER,
      );
      return (res.data ?? [])
        .filter((r) => r.id && r.name)
        .map((r) => ({ id: String(r.id), name: String(r.name), audienceSize: r.audience_size_lower_bound ?? r.audience_size ?? null, path: Array.isArray(r.path) ? r.path.map(String) : [] }));
    },

    async readCampaignTree(campaignId: string): Promise<MetaCampaignTree | null> {
      let c: { id?: string; name?: string; objective?: string; status?: string; effective_status?: string; configured_status?: string; special_ad_categories?: string[]; buying_type?: string };
      try {
        c = await graphGet(auth, campaignId, { fields: "id,name,objective,status,effective_status,configured_status,special_ad_categories,buying_type" }, PROVIDER);
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
      if (!c?.id) return null;
      type RawCreative = { id?: string; name?: string; object_story_spec?: { page_id?: string; instagram_user_id?: string; link_data?: { image_hash?: string; link?: string } } };
      const [adSets, ads] = await Promise.all([
        scanEdge<{ id: string; name?: string; campaign_id?: string; status?: string; effective_status?: string; daily_budget?: string; optimization_goal?: string; billing_event?: string; destination_type?: string; start_time?: string; end_time?: string; targeting?: Record<string, unknown> }>(
          auth,
          `${c.id}/adsets`,
          { fields: "id,name,campaign_id,status,effective_status,daily_budget,optimization_goal,billing_event,destination_type,start_time,end_time,targeting" },
          10,
        ),
        scanEdge<{ id: string; name?: string; adset_id?: string; status?: string; effective_status?: string; creative?: RawCreative; ad_review_feedback?: { global?: Record<string, string> }; issues_info?: Array<{ error_summary?: string; error_message?: string }> }>(
          auth,
          `${c.id}/ads`,
          { fields: "id,name,adset_id,status,effective_status,creative{id,name,object_story_spec},ad_review_feedback,issues_info" },
          10,
        ),
      ]);
      const creatives = new Map<string, MetaCampaignTree["creatives"][number]>();
      const adRows = ads.map((a) => {
        const cr = a.creative;
        if (cr?.id) {
          creatives.set(String(cr.id), {
            id: String(cr.id),
            name: cr.name ?? "",
            pageId: str(cr.object_story_spec?.page_id),
            instagramUserId: str(cr.object_story_spec?.instagram_user_id),
            imageHash: str(cr.object_story_spec?.link_data?.image_hash),
            link: str(cr.object_story_spec?.link_data?.link),
          });
        }
        const feedback = a.ad_review_feedback?.global ? Object.entries(a.ad_review_feedback.global).map(([k, v]) => `${k}: ${String(v).slice(0, 80)}`).join("; ") : null;
        return {
          id: String(a.id),
          name: a.name ?? "",
          adSetId: String(a.adset_id ?? ""),
          status: String(a.status ?? ""),
          effectiveStatus: a.effective_status ?? null,
          creativeId: cr?.id ? String(cr.id) : null,
          reviewFeedback: feedback,
          issues: (a.issues_info ?? []).map((i) => String(i.error_summary ?? i.error_message ?? "").slice(0, 120)).filter(Boolean),
        };
      });
      return {
        campaign: {
          id: String(c.id),
          name: c.name ?? "",
          objective: c.objective ?? null,
          status: String(c.status ?? ""),
          effectiveStatus: c.effective_status ?? null,
          configuredStatus: c.configured_status ?? null,
          specialAdCategories: arr(c.special_ad_categories),
          buyingType: c.buying_type ?? null,
        },
        adSets: adSets.map((s) => ({
          id: String(s.id),
          name: s.name ?? "",
          campaignId: s.campaign_id ? String(s.campaign_id) : null,
          status: String(s.status ?? ""),
          effectiveStatus: s.effective_status ?? null,
          dailyBudget: s.daily_budget === undefined ? null : String(toNumber(s.daily_budget)),
          optimizationGoal: s.optimization_goal ?? null,
          billingEvent: s.billing_event ?? null,
          destinationType: s.destination_type ?? null,
          startTime: s.start_time ?? null,
          endTime: s.end_time ?? null,
          targeting: s.targeting && typeof s.targeting === "object" ? s.targeting : null,
        })),
        ads: adRows,
        creatives: [...creatives.values()],
      };
    },

    async findCampaignsByMarker(marker: string): Promise<MetaObjectSummary[]> {
      const rows = await scanEdge<{ id: string; name?: string; status?: string; effective_status?: string }>(auth, `${act}/campaigns`, { fields: "id,name,status,effective_status" });
      return rows.filter((c) => taggedWith(c.name, marker)).map((c) => ({ id: String(c.id), name: c.name ?? "", status: String(c.status ?? ""), effectiveStatus: c.effective_status ?? null }));
    },

    async findAdSetsByMarker(campaignId: string, marker: string): Promise<MetaObjectSummary[]> {
      const rows = await scanEdge<{ id: string; name?: string; status?: string; effective_status?: string }>(auth, `${campaignId}/adsets`, { fields: "id,name,status,effective_status" });
      return rows.filter((s) => taggedWith(s.name, marker)).map((s) => ({ id: String(s.id), name: s.name ?? "", status: String(s.status ?? ""), effectiveStatus: s.effective_status ?? null }));
    },

    async findCreativesByMarker(marker: string): Promise<MetaCreativeSummary[]> {
      const rows = await scanEdge<{ id: string; name?: string; status?: string; object_story_spec?: { page_id?: string; instagram_user_id?: string; link_data?: { image_hash?: string; link?: string } } }>(
        auth,
        `${act}/adcreatives`,
        { fields: "id,name,status,object_story_spec" },
      );
      return rows
        .filter((c) => taggedWith(c.name, marker))
        .map((c) => ({
          id: String(c.id),
          name: c.name ?? "",
          status: String(c.status ?? ""),
          effectiveStatus: null,
          imageHash: str(c.object_story_spec?.link_data?.image_hash),
          link: str(c.object_story_spec?.link_data?.link),
          pageId: str(c.object_story_spec?.page_id),
          instagramUserId: str(c.object_story_spec?.instagram_user_id),
        }));
    },

    async findAdsByMarker(adSetId: string, marker: string) {
      const rows = await scanEdge<{ id: string; name?: string; status?: string; effective_status?: string; creative?: { id?: string } }>(auth, `${adSetId}/ads`, { fields: "id,name,status,effective_status,creative{id}" });
      return rows
        .filter((a) => taggedWith(a.name, marker))
        .map((a) => ({ id: String(a.id), name: a.name ?? "", status: String(a.status ?? ""), effectiveStatus: a.effective_status ?? null, creativeId: a.creative?.id ? String(a.creative.id) : null }));
    },

    async findImageByHash(hash: string): Promise<MetaImageUploadResult | null> {
      const res = await graphGet<Page<{ hash?: string; url?: string; width?: number; height?: number }>>(auth, `${act}/adimages`, { hashes: JSON.stringify([hash]), fields: "hash,url,width,height" }, PROVIDER);
      const hit = (res.data ?? []).find((i) => i.hash === hash);
      return hit ? { hash, url: hit.url ?? null, width: hit.width ?? null, height: hit.height ?? null } : null;
    },

    async createCampaignPaused(body: MetaCampaignCreate) {
      const res = await graphPost<{ id?: string }>(auth, `${act}/campaigns`, body as unknown as Record<string, unknown>, PROVIDER);
      if (!res.id) throw new Error("meta-ads: campaign create ne id nahi di");
      return { id: String(res.id), requestId: null };
    },

    async createAdSetPaused(body: MetaAdSetCreate) {
      const res = await graphPost<{ id?: string }>(auth, `${act}/adsets`, body as unknown as Record<string, unknown>, PROVIDER);
      if (!res.id) throw new Error("meta-ads: ad set create ne id nahi di");
      return { id: String(res.id), requestId: null };
    },

    async uploadOrResolveImage(input: { bytes: Buffer; filename: string; sha256: string }) {
      const res = await graphPost<{ images?: Record<string, { hash?: string; url?: string; width?: number; height?: number }> }>(auth, `${act}/adimages`, { bytes: input.bytes.toString("base64"), name: input.filename }, PROVIDER);
      const entry = res.images ? Object.values(res.images)[0] : undefined;
      if (!entry?.hash) throw new Error("meta-ads: image upload ne hash nahi diya");
      return { hash: String(entry.hash), url: entry.url ?? null, width: entry.width ?? null, height: entry.height ?? null, requestId: null };
    },

    async createAdCreative(body: MetaCreativeCreate) {
      const res = await graphPost<{ id?: string }>(auth, `${act}/adcreatives`, body as unknown as Record<string, unknown>, PROVIDER);
      if (!res.id) throw new Error("meta-ads: creative create ne id nahi di");
      return { id: String(res.id), requestId: null };
    },

    async createAdPaused(body: MetaAdCreate) {
      const res = await graphPost<{ id?: string }>(auth, `${act}/ads`, body as unknown as Record<string, unknown>, PROVIDER);
      if (!res.id) throw new Error("meta-ads: ad create ne id nahi di");
      return { id: String(res.id), requestId: null };
    },

    async setAdStatus(adId: string, status: MetaObjectStatus) {
      await graphPost<{ success?: boolean }>(auth, adId, { status }, PROVIDER);
      return { requestId: null };
    },

    async setAdSetStatus(adSetId: string, status: MetaObjectStatus) {
      await graphPost<{ success?: boolean }>(auth, adSetId, { status }, PROVIDER);
      return { requestId: null };
    },

    async setCampaignStatus(campaignId: string, status: MetaObjectStatus) {
      await graphPost<{ success?: boolean }>(auth, campaignId, { status }, PROVIDER);
      return { requestId: null };
    },
  };
}
