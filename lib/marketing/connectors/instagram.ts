import "server-only";
import { toNumber } from "./http";
import { graphGet, type MetaAuth } from "./metaGraph";

/**
 * Instagram Professional account — recent media and their insights.
 *
 * Metric names follow the 2025 rename: `views` replaced `plays`/`impressions`
 * for Reels, and each media product type has its own supported set (a
 * metric asked of the wrong type fails the whole request, so insights are
 * fetched per item, with the set chosen by `media_product_type`). Twelve
 * items is enough to say which hook worked; it is not a content archive.
 */

export interface InstagramAccountInfo {
  id: string;
  username: string | null;
  followers: number | null;
  mediaCount: number | null;
}

export async function testInstagram(auth: MetaAuth, igUserId: string): Promise<InstagramAccountInfo> {
  const acc = await graphGet<{ id?: string; username?: string; followers_count?: number; media_count?: number }>(
    auth,
    igUserId.trim(),
    { fields: "id,username,followers_count,media_count" },
    "instagram",
  );
  return { id: acc.id ?? igUserId, username: acc.username ?? null, followers: acc.followers_count ?? null, mediaCount: acc.media_count ?? null };
}

export interface InstagramMediaRow {
  id: string;
  productType: "REELS" | "FEED" | "STORY" | "AD" | string;
  mediaType: string;
  postedAt: string;
  captionExcerpt: string;
  likes: number;
  comments: number;
  views: number | null;
  reach: number | null;
  saved: number | null;
  shares: number | null;
  totalInteractions: number | null;
  avgWatchTimeSec: number | null;
}

export interface InstagramReport {
  account: InstagramAccountInfo;
  recentMedia: InstagramMediaRow[];
  /** Reels only, by views — the "jo Reel achhi chali" answer. */
  topReels: InstagramMediaRow[];
}

const REEL_METRICS = "views,reach,saved,shares,total_interactions,ig_reels_avg_watch_time";
const FEED_METRICS = "views,reach,saved,shares,total_interactions";

export async function readInstagram(auth: MetaAuth, igUserId: string): Promise<InstagramReport> {
  const account = await testInstagram(auth, igUserId);

  const media = await graphGet<{
    data?: Array<{
      id: string;
      media_type?: string;
      media_product_type?: string;
      timestamp?: string;
      caption?: string;
      like_count?: number;
      comments_count?: number;
    }>;
  }>(
    auth,
    `${account.id}/media`,
    { fields: "id,media_type,media_product_type,timestamp,caption,like_count,comments_count", limit: "12" },
    "instagram",
  );

  const rows = await Promise.all(
    (media.data ?? []).map(async (m): Promise<InstagramMediaRow> => {
      const productType = m.media_product_type ?? "FEED";
      const base: InstagramMediaRow = {
        id: m.id,
        productType,
        mediaType: m.media_type ?? "",
        postedAt: m.timestamp ?? "",
        captionExcerpt: (m.caption ?? "").replace(/\s+/g, " ").slice(0, 80),
        likes: toNumber(m.like_count),
        comments: toNumber(m.comments_count),
        views: null,
        reach: null,
        saved: null,
        shares: null,
        totalInteractions: null,
        avgWatchTimeSec: null,
      };
      if (productType === "STORY") return base;
      try {
        const ins = await graphGet<{ data?: Array<{ name?: string; values?: Array<{ value?: number }> }> }>(
          auth,
          `${m.id}/insights`,
          { metric: productType === "REELS" ? REEL_METRICS : FEED_METRICS },
          "instagram",
        );
        const byName = new Map((ins.data ?? []).map((d) => [d.name ?? "", toNumber(d.values?.[0]?.value)]));
        return {
          ...base,
          views: byName.get("views") ?? null,
          reach: byName.get("reach") ?? null,
          saved: byName.get("saved") ?? null,
          shares: byName.get("shares") ?? null,
          totalInteractions: byName.get("total_interactions") ?? null,
          // Reported in milliseconds.
          avgWatchTimeSec: byName.has("ig_reels_avg_watch_time") ? Math.round((byName.get("ig_reels_avg_watch_time") ?? 0) / 100) / 10 : null,
        };
      } catch {
        // Older media, or a metric the account tier does not expose — the
        // post still counts, its insights are just unknown.
        return base;
      }
    }),
  );

  const topReels = rows
    .filter((r) => r.productType === "REELS" && r.views !== null)
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
    .slice(0, 5);

  return { account, recentMedia: rows, topReels };
}
