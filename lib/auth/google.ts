import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Google Sign-In — the OAuth 2.0 authorization-code flow, hand-rolled against
 * `jose` rather than adopting NextAuth.
 *
 * ## Why not NextAuth
 *
 * This app already owns its session model, and owns it in a way a generic
 * library cannot reproduce: `auth_sessions` rows with hashed tokens, JWT claims
 * that carry `role` + `status` for the edge middleware to gate on without a DB
 * round-trip, and `refreshSession()` re-signing the cookie the moment
 * `submitProfile()` flips INCOMPLETE → ACTIVE (see lib/auth/session.ts). Adding
 * NextAuth would mean either running two session systems side by side or
 * rewriting all of that. The actual OAuth surface is one redirect and one token
 * exchange — the code below — so the library would only be buying us the part
 * we already have.
 *
 * ## What is verified, and why each check is here
 *
 *  1. **The ID token's signature**, against Google's published JWKS. Without
 *     this the token exchange proves only that *someone* handed us a JSON blob.
 *  2. **`aud` = our client id, `iss` = accounts.google.com.** A valid Google
 *     token issued to a *different* application is still a valid Google token;
 *     accepting one would let any other site's token log in here.
 *  3. **`email_verified`.** Google will happily issue an ID token for an
 *     unverified email on some workspace configurations, and this app matches
 *     existing accounts by email (step 2 of `resolveGoogleUser`). Skipping this
 *     check turns "sign up with an email you don't own" into account takeover.
 *  4. **The `state` cookie**, compared in constant time. This is the CSRF
 *     defence for the callback — without it an attacker can complete the flow
 *     in a victim's browser and silently bind their own Google account.
 */

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export const GOOGLE_STATE_COOKIE = "bt_oauth_state";

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
}

/** Null — not an exception — when Google Sign-In isn't configured for this deployment. */
export function googleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function isGoogleConfigured(): boolean {
  return googleConfig() !== null;
}

/**
 * The redirect URI must match Google's console entry byte for byte, so it is
 * derived from the incoming request rather than composed from a base-URL env
 * that would drift between local, preview and production.
 */
export function googleRedirectUri(req: Request): string {
  const url = new URL(req.url);
  // Behind a proxy the request's own protocol is http even when the browser
  // used https; the forwarded header is what the browser actually saw, and
  // therefore what Google will compare against.
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  return `${proto}://${host}/api/auth/google/callback`;
}

/**
 * Packs the CSRF nonce and the post-login destination into one opaque value.
 *
 * `next` rides inside `state` rather than in a second cookie because Google
 * echoes `state` back verbatim — so the destination survives the round trip
 * without any extra storage, and cannot be tampered with independently of the
 * nonce it is glued to.
 */
export function buildState(next: string | null): { state: string; cookieValue: string } {
  const nonce = randomBytes(24).toString("base64url");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "";
  const state = `${nonce}.${Buffer.from(safeNext).toString("base64url")}`;
  // Only the nonce is stored; the cookie never needs to hold the destination.
  return { state, cookieValue: createHash("sha256").update(nonce).digest("hex") };
}

export function verifyState(state: string, cookieValue: string): { ok: boolean; next: string } {
  const [nonce, encodedNext = ""] = state.split(".");
  if (!nonce || !cookieValue) return { ok: false, next: "" };

  const expected = Buffer.from(createHash("sha256").update(nonce).digest("hex"));
  const actual = Buffer.from(cookieValue);
  const ok = expected.length === actual.length && timingSafeEqual(expected, actual);

  let next = "";
  try {
    next = Buffer.from(encodedNext, "base64url").toString("utf8");
  } catch {
    next = "";
  }
  // Re-checked after decoding: `state` is attacker-influenced input, and an
  // absolute URL here would turn the login flow into an open redirect.
  if (!next.startsWith("/") || next.startsWith("//")) next = "";

  return { ok, next };
}

export function googleAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", params.state);
  // Nothing here is done on the user's behalf later, so no refresh token is
  // requested — an offline-access grant we would never use is a credential
  // sitting around for no reason.
  url.searchParams.set("access_type", "online");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export interface GoogleIdentity {
  googleId: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

const jwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));

/** Exchanges the one-time code for an ID token and verifies it end to end. */
export async function exchangeCodeForIdentity(params: {
  code: string;
  redirectUri: string;
  config: GoogleConfig;
}): Promise<GoogleIdentity | null> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: params.code,
      client_id: params.config.clientId,
      client_secret: params.config.clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    console.error(`[auth:google] token exchange failed: ${res.status}`);
    return null;
  }

  const token = (await res.json()) as { id_token?: string };
  if (!token.id_token) return null;

  try {
    const { payload } = await jwtVerify(token.id_token, jwks, {
      issuer: GOOGLE_ISSUERS,
      audience: params.config.clientId,
    });

    const email = typeof payload.email === "string" ? payload.email.toLowerCase() : null;
    const sub = typeof payload.sub === "string" ? payload.sub : null;
    if (!email || !sub) return null;

    return {
      googleId: sub,
      email,
      emailVerified: payload.email_verified === true,
      name: typeof payload.name === "string" ? payload.name : null,
      picture: typeof payload.picture === "string" ? payload.picture : null,
    };
  } catch (err) {
    console.error(
      "[auth:google] id_token verification failed:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}
