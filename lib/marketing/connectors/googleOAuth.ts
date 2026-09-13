import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { googleConfig } from "@/lib/auth/google";
import { MARKETING_PROVIDER_META, type MarketingProviderKey } from "@/lib/contracts/marketingAi";
import { ConnectorError, connectorFetchJson } from "./http";

/**
 * Google authorisation for BandhanTak's *own* marketing accounts.
 *
 * Same OAuth client as Google Sign-In (`GOOGLE_CLIENT_ID/SECRET`), a
 * different grant: offline access with one provider's scope at a time, so a
 * Search Console read never carries an Ads scope it does not need (§13
 * "minimum required scope"). The refresh token is the only thing kept, sealed
 * on the `MarketingConnection` row; access tokens live in memory for their
 * hour and are re-minted on demand.
 *
 * MKT-0 prerequisites on the Google Cloud project, none of which code can do:
 * the three APIs enabled, the scopes added to the consent screen, and
 * `<origin>/api/admin/marketing-ai/connections/google/callback` registered
 * as a redirect URI.
 */

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export const MARKETING_OAUTH_STATE_COOKIE = "bt_mkt_oauth_state";
export const GOOGLE_CALLBACK_PATH = "/api/admin/marketing-ai/connections/google/callback";

export type GoogleMarketingProvider = Extract<MarketingProviderKey, "GOOGLE_ADS" | "GOOGLE_ANALYTICS" | "SEARCH_CONSOLE">;

export function isGoogleMarketingProvider(p: string): p is GoogleMarketingProvider {
  return p === "GOOGLE_ADS" || p === "GOOGLE_ANALYTICS" || p === "SEARCH_CONSOLE";
}

/**
 * The origin Google will send the admin back to. Configured origin first
 * (Railway's proxy makes `req.url`'s host unreliable — see
 * lib/utils/appOrigin.ts), forwarded headers otherwise, so local development
 * still works without setting an env var.
 */
export function marketingOAuthOrigin(req: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}

/**
 * CSRF state that also names the provider: `<nonce>.<provider>`. The cookie
 * holds a hash of the *whole* state, so neither half can be swapped on the
 * way back — Google echoes `state` verbatim, and the provider it names is
 * where the grant gets stored.
 */
export function buildConnectState(provider: GoogleMarketingProvider): { state: string; cookieValue: string } {
  const nonce = randomBytes(24).toString("base64url");
  const state = `${nonce}.${provider}`;
  return { state, cookieValue: createHash("sha256").update(state).digest("hex") };
}

export function verifyConnectState(state: string, cookieValue: string): { ok: boolean; provider: GoogleMarketingProvider | null } {
  const [nonce, provider = ""] = state.split(".");
  if (!nonce || !cookieValue || !isGoogleMarketingProvider(provider)) return { ok: false, provider: null };
  const expected = Buffer.from(createHash("sha256").update(state).digest("hex"));
  const actual = Buffer.from(cookieValue);
  const ok = expected.length === actual.length && timingSafeEqual(expected, actual);
  return { ok, provider: ok ? provider : null };
}

export function googleConnectUrl(params: { provider: GoogleMarketingProvider; redirectUri: string; state: string }): string | null {
  const config = googleConfig();
  if (!config) return null;
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", MARKETING_PROVIDER_META[params.provider].scopes.join(" "));
  url.searchParams.set("state", params.state);
  // Offline + consent: a refresh token is only issued on a consent screen,
  // and Google skips that screen on re-authorisation unless asked not to.
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "false");
  return url.toString();
}

export interface GoogleTokenGrant {
  refreshToken: string;
  accessToken: string;
  expiresAt: Date;
  scopes: string[];
}

export async function exchangeConnectCode(params: { code: string; redirectUri: string }): Promise<GoogleTokenGrant> {
  const config = googleConfig();
  if (!config) throw new ConnectorError("AUTH", "GOOGLE_CLIENT_ID/SECRET set nahi hain.");

  const body = await connectorFetchJson<{
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  }>(
    GOOGLE_TOKEN_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: params.code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: params.redirectUri,
        grant_type: "authorization_code",
      }),
    },
    { provider: "google-oauth", retries: 0 },
  );

  if (!body.access_token || !body.refresh_token) {
    throw new ConnectorError(
      "AUTH",
      "Google ne refresh token nahi diya — consent screen par 'Allow' nahi hua ya app pehle se authorised thi. Dobara Connect karein.",
    );
  }
  return {
    refreshToken: body.refresh_token,
    accessToken: body.access_token,
    expiresAt: new Date(Date.now() + (body.expires_in ?? 3600) * 1000),
    scopes: (body.scope ?? "").split(" ").filter(Boolean),
  };
}

/** Access tokens are short-lived and cheap to re-mint — cached per refresh token for their lifetime minus a margin. */
const accessCache = new Map<string, { token: string; expiresAt: number }>();

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const cached = accessCache.get(refreshToken);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const config = googleConfig();
  if (!config) throw new ConnectorError("AUTH", "GOOGLE_CLIENT_ID/SECRET set nahi hain.");

  let body: { access_token?: string; expires_in?: number };
  try {
    body = await connectorFetchJson(
      GOOGLE_TOKEN_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          refresh_token: refreshToken,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          grant_type: "refresh_token",
        }),
      },
      { provider: "google-oauth", retries: 0 },
    );
  } catch (err) {
    // A 400 here is `invalid_grant` — the admin revoked access or the
    // consent expired. That is an AUTH condition, not an upstream one.
    if (err instanceof ConnectorError && err.status === 400) {
      throw new ConnectorError("AUTH", "Google grant expire/revoke ho gaya — dobara Connect karein.", 400, err.requestId);
    }
    throw err;
  }
  if (!body.access_token) throw new ConnectorError("AUTH", "Google ne access token nahi diya.");
  accessCache.set(refreshToken, { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 });
  return body.access_token;
}

/** Best effort — a revoke that fails should not block a disconnect. */
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  accessCache.delete(refreshToken);
  try {
    await fetch(GOOGLE_REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken }),
    });
  } catch {
    /* ignore */
  }
}

/** Test seam — clears cached access tokens. */
export function __resetGoogleAccessCache() {
  accessCache.clear();
}
