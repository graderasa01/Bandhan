/**
 * Final URLs (§10.11-12, §11.2). Pure.
 *
 * The destination is always BandhanTak's own origin + an approved public
 * path + deterministic UTM. ValueTrack tokens such as `{creative}` stay
 * literal in the query string — Google substitutes them at click time, and
 * a percent-encoded brace is just a broken parameter.
 */

export interface UtmParams {
  source: string;
  medium: string;
  campaign: string;
  content: string;
}

/** Split on ValueTrack tokens, keeping them (odd indices) — everything else is percent-encoded. */
function encodeKeepingTokens(value: string): string {
  return value
    .split(/(\{[a-z_]+\})/i)
    .map((part, i) => (i % 2 === 1 ? part : encodeURIComponent(part)))
    .join("");
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9{}_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

export function buildFinalUrl(input: { origin: string; landingPath: string; utm: UtmParams }): string {
  const origin = input.origin.replace(/\/$/, "");
  const [pathOnly, existingQuery = ""] = input.landingPath.split("?");
  const path = pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
  const params: string[] = [];
  if (existingQuery) params.push(existingQuery);
  params.push(`utm_source=${encodeKeepingTokens(slug(input.utm.source) || "google")}`);
  params.push(`utm_medium=${encodeKeepingTokens(slug(input.utm.medium) || "cpc")}`);
  params.push(`utm_campaign=${encodeKeepingTokens(slug(input.utm.campaign) || "bandhantak")}`);
  const content = slug(input.utm.content);
  if (content) params.push(`utm_content=${encodeKeepingTokens(content)}`);
  return `${origin}${path}?${params.join("&")}`;
}

export interface LandingUrlVerdict {
  ok: boolean;
  reason: string | null;
}

/**
 * Allow-list for what a paid click may land on: HTTPS, the configured
 * BandhanTak origin's host, a path the route matrix calls public.
 */
export function checkLandingUrl(url: string, origin: string, isKnownPublicPath: (path: string) => boolean): LandingUrlVerdict {
  let parsed: URL;
  let base: URL;
  try {
    parsed = new URL(url);
    base = new URL(origin);
  } catch {
    return { ok: false, reason: "landing URL parse nahi hua" };
  }
  if (parsed.protocol !== "https:") return { ok: false, reason: `landing URL HTTPS nahi hai (${parsed.protocol}) — NEXT_PUBLIC_APP_URL https://… hona chahiye` };
  if (parsed.host !== base.host) return { ok: false, reason: `landing host ${parsed.host} configured origin ${base.host} se alag hai` };
  if (!isKnownPublicPath(parsed.pathname)) return { ok: false, reason: `${parsed.pathname} public page nahi hai` };
  return { ok: true, reason: null };
}
