/**
 * A read-only network for `scripts/google-connection-check.ts`. Import it right
 * after `../_env` and before anything from `lib/`.
 *
 * Google's reads are not all GETs — a GAQL search, a GA4 `runReport` and a
 * Search Analytics query are POSTs that only read, and turning a refresh token
 * into an access token is a POST to the token endpoint. So unlike the Meta
 * guard (`metaReadOnlyNetwork`) this one cannot refuse every non-GET. It allows
 * GET/HEAD, and a POST only when its URL is one of the read-only endpoints
 * below. Everything else — `googleAds:mutate`, any other Ads service, an
 * authorization-code exchange, a token revocation (GET or POST), any
 * PUT/PATCH/DELETE — is refused before it leaves the process, so an edit that
 * reached a write by mistake throws here instead of changing a real account.
 */

/** Every refused request, "METHOD host/path". */
export const refusedWrites: string[] = [];
/** Every read-only POST that was let through, by label. */
export const allowedPosts: string[] = [];

const READ_ONLY_POSTS: Array<{ label: string; matches: (url: URL, body: string) => boolean }> = [
  {
    label: "oauth token refresh",
    matches: (u, body) => u.hostname === "oauth2.googleapis.com" && u.pathname === "/token" && new URLSearchParams(body).get("grant_type") === "refresh_token",
  },
  {
    label: "google ads GAQL search",
    matches: (u) => u.hostname === "googleads.googleapis.com" && /^\/v\d+\/customers\/\d+\/googleAds:search$/.test(u.pathname),
  },
  {
    label: "ga4 runReport",
    matches: (u) => u.hostname === "analyticsdata.googleapis.com" && /^\/v1beta\/properties\/\d+:runReport$/.test(u.pathname),
  },
  {
    label: "search console searchAnalytics query",
    matches: (u) => u.hostname === "www.googleapis.com" && /^\/webmasters\/v3\/sites\/[^/]+\/searchAnalytics\/query$/.test(u.pathname),
  },
];

const realFetch = globalThis.fetch;

function urlOf(input: RequestInfo | URL): URL | null {
  try {
    return new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  } catch {
    return null;
  }
}

function bodyText(body: BodyInit | null | undefined): string {
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  return "";
}

function isRevoke(u: URL): boolean {
  return (u.hostname === "oauth2.googleapis.com" && u.pathname.startsWith("/revoke")) || (u.hostname === "accounts.google.com" && u.pathname.includes("/revoke"));
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const fromRequest = typeof input === "object" && !(input instanceof URL) ? input.method : undefined;
  const method = (init?.method ?? fromRequest ?? "GET").toUpperCase();
  const url = urlOf(input);
  const where = url ? `${url.hostname}${url.pathname}` : "?";

  const refuse = () => {
    refusedWrites.push(`${method} ${where}`);
    throw new Error(`[read-only guard] ${method} ${where} refused — this script never writes to Google`);
  };

  if (!url || isRevoke(url)) return refuse();
  if (method === "GET" || method === "HEAD") return realFetch(input, init);
  if (method === "POST") {
    const hit = READ_ONLY_POSTS.find((p) => p.matches(url, bodyText(init?.body)));
    if (hit) {
      allowedPosts.push(hit.label);
      return realFetch(input, init);
    }
  }
  return refuse();
}) as typeof fetch;
