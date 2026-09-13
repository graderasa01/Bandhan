import "server-only";
import { toNumber } from "./http";
import { graphGet, type MetaAuth } from "./metaGraph";

/**
 * Facebook Page — followers and the last few posts' engagement.
 *
 * Publishing is MKT-3; this release only needs to know the Page exists, the
 * token can read it, and roughly how organic posts perform, so a plan can
 * say "Page par organic reach chhota hai" with a number behind it.
 */

export interface FacebookPageInfo {
  id: string;
  name: string | null;
  followers: number | null;
}

export async function testFacebookPage(auth: MetaAuth, pageId: string): Promise<FacebookPageInfo> {
  const page = await graphGet<{ id?: string; name?: string; followers_count?: number; fan_count?: number }>(
    auth,
    pageId.trim(),
    { fields: "id,name,followers_count,fan_count" },
    "facebook-page",
  );
  return { id: page.id ?? pageId, name: page.name ?? null, followers: page.followers_count ?? page.fan_count ?? null };
}

export interface FacebookPostRow {
  id: string;
  createdAt: string;
  /** First 80 characters — enough to recognise the post, never the whole thing. */
  excerpt: string;
  reactions: number;
  comments: number;
  shares: number;
}

export interface FacebookPageReport {
  page: FacebookPageInfo;
  recentPosts: FacebookPostRow[];
}

export async function readFacebookPage(auth: MetaAuth, pageId: string): Promise<FacebookPageReport> {
  const page = await testFacebookPage(auth, pageId);
  let recentPosts: FacebookPostRow[] = [];
  try {
    const posts = await graphGet<{
      data?: Array<{
        id: string;
        created_time?: string;
        message?: string;
        shares?: { count?: number };
        reactions?: { summary?: { total_count?: number } };
        comments?: { summary?: { total_count?: number } };
      }>;
    }>(
      auth,
      `${page.id}/posts`,
      { fields: "id,created_time,message,shares,reactions.summary(true).limit(0),comments.summary(true).limit(0)", limit: "10" },
      "facebook-page",
    );
    recentPosts = (posts.data ?? []).map((p) => ({
      id: p.id,
      createdAt: p.created_time ?? "",
      excerpt: (p.message ?? "").replace(/\s+/g, " ").slice(0, 80),
      reactions: toNumber(p.reactions?.summary?.total_count),
      comments: toNumber(p.comments?.summary?.total_count),
      shares: toNumber(p.shares?.count),
    }));
  } catch (err) {
    // Posts need pages_read_engagement; a token with only page listing rights
    // still proves the Page connection, which is what the strip reports.
    console.warn("[marketing:facebook-page] posts unavailable:", err instanceof Error ? err.message : String(err));
  }
  return { page, recentPosts };
}
