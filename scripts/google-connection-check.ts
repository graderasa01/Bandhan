import "./_env";
import { allowedPosts, refusedWrites } from "./_stubs/googleReadOnlyNetwork";
import type { MarketingConnection } from "@prisma/client";
import { MARKETING_PROVIDER_META } from "../lib/contracts/marketingAi";
import { googleConfig } from "../lib/auth/google";
import {
  GOOGLE_CALLBACK_PATH,
  buildConnectState,
  googleConnectUrl,
  verifyConnectState,
  type GoogleMarketingProvider,
} from "../lib/marketing/connectors/googleOAuth";
import { googleAdsApiVersion, googleAdsBase, normaliseCustomerId } from "../lib/marketing/connectors/googleAds";
import { isoDaysAgo } from "../lib/marketing/connectors/http";
import { isSecretBoxConfigured } from "../lib/security/secretBox";

/**
 * Growth Saathi's three Google connections from the terminal — the live,
 * read-only counterpart of the "Test connection" buttons (doc 14 §29, "Google
 * owner values"). Meant to run inside the production container, where the env
 * is Railway's and the database is the one the OAuth callback writes to:
 *
 *   railway ssh -- npx tsx scripts/google-connection-check.ts --preflight
 *   railway ssh -- npx tsx scripts/google-connection-check.ts                       (status)
 *   railway ssh -- npx tsx scripts/google-connection-check.ts --save-refs --ads=… --ga4=… --search-console=…
 *   railway ssh -- npx tsx scripts/google-connection-check.ts --test
 *
 * ## What each mode touches
 *
 * `--preflight` needs no database and no grant. It reads the env the OAuth
 * routes read, round-trips the state/cookie pair, checks that the deployed
 * callback answers with the admin-login redirect (not a 404), and asks
 * Google's authorization endpoint — without signing in — whether it accepts
 * this client + redirect URI + each provider's scope. An unregistered redirect
 * URI runs alongside as a control: if Google does not reject that one either,
 * the verdict is INCONCLUSIVE, never ACCEPTED. `--origin=` overrides the
 * configured origin for a run outside the container.
 *
 * The default mode reads the three `MarketingConnection` rows: whether a
 * sealed grant is there, whether it opens with this deployment's
 * SECRETS_ENCRYPTION_KEY, and which scopes and account reference it holds. A
 * missing grant is reported as missing — nothing is created to fill the gap.
 *
 * `--save-refs` stores account references through `saveConnectionSettings`
 * (the sheet's Save: same normalisation, same audit row), only on a row that
 * already holds a grant, with the admin who granted it as the actor.
 *
 * `--test` runs `testConnection()` — the Test button's code path, which records
 * its outcome on the row — then repeats the essential read raw, so a failure
 * is reported with Google's own status and message rather than the
 * connector's one-line summary.
 *
 * ## Read-only toward Google, by construction
 *
 * `_stubs/googleReadOnlyNetwork` lets through GET/HEAD and four read-only POSTs
 * (token refresh, GAQL search, GA4 runReport, Search Analytics query) and
 * refuses everything else before it leaves the process — no `googleAds:mutate`,
 * no code exchange, no revocation, even by mistake.
 *
 * ## Secrets
 *
 * Nothing secret is printed. Every line passes through `redact()`, which
 * removes each secret value this process has held (client secret, encryption
 * key, refresh/access/developer tokens) and anything shaped like a Google
 * access or refresh token.
 *
 * Exit codes: 0 — everything in the mode passed · 2 — reachable but blocked
 * (an answer, not a crash) · 1 — not configured, or the check crashed.
 */

const PROVIDERS: GoogleMarketingProvider[] = ["GOOGLE_ADS", "GOOGLE_ANALYTICS", "SEARCH_CONSOLE"];
/** `connectionService`'s marker for a sealed Google refresh token. */
const GOOGLE_SECRET_KIND = "GOOGLE_REFRESH_TOKEN";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

const argv = process.argv.slice(2);
const has = (name: string) => argv.includes(`--${name}`);
function option(name: string): string | null {
  const prefix = `--${name}=`;
  const value = argv.find((a) => a.startsWith(prefix))?.slice(prefix.length).trim();
  return value ? value : null;
}

// ---- output -----------------------------------------------------------------

const secrets = new Set<string>();
function remember(value: string | null | undefined): void {
  const v = value?.trim();
  if (v && v.length >= 8) secrets.add(v);
}
remember(process.env.GOOGLE_CLIENT_SECRET);
remember(process.env.SECRETS_ENCRYPTION_KEY);

function redact(text: string): string {
  let out = text;
  for (const s of secrets) out = out.split(s).join("[redacted]");
  return out.replace(/ya29\.[\w.-]+/g, "[redacted-access-token]").replace(/1\/\/[\w-]{16,}/g, "[redacted-refresh-token]");
}

function say(text = ""): void {
  console.log(redact(text));
}

/** 1 (not configured / crashed) outranks 2 (reachable but blocked), which outranks 0. */
function worst(...codes: number[]): number {
  return codes.includes(1) ? 1 : codes.includes(2) ? 2 : 0;
}

// ---- preflight -------------------------------------------------------------

const AUTH_ERRORS = [
  "redirect_uri_mismatch",
  "invalid_client",
  "deleted_client",
  "disabled_client",
  "unauthorized_client",
  "invalid_scope",
  "org_internal",
  "admin_policy_enforced",
  "invalid_request",
];
/** Specific enough to trust inside a 200 page's markup. */
const STRONG_AUTH_ERRORS = ["redirect_uri_mismatch", "invalid_client", "deleted_client", "disabled_client"];
const SIGN_IN_PATH = /\/(v3\/signin\/identifier|signin\/v2\/identifier|ServiceLogin|AccountChooser|v3\/signin\/accountchooser|oauthchooseaccount)/i;

interface AuthProbe {
  verdict: "ACCEPTED" | "REJECTED" | "UNCLEAR";
  detail: string;
  hops: string[];
}

/** Google's error redirect carries the reason in a base64 `authError` parameter. */
function authErrorText(location: URL): string {
  const raw = location.searchParams.get("authError");
  if (!raw) return "";
  try {
    return Buffer.from(raw, "base64").toString("latin1");
  } catch {
    return "";
  }
}

/** Follows Google's redirects up to the sign-in page (never past it) and says whether the request was refused before that. */
async function probeAuthorization(startUrl: string): Promise<AuthProbe> {
  const hops: string[] = [];
  let current = new URL(startUrl);
  for (let i = 0; i < 6; i++) {
    const res = await fetch(current, {
      redirect: "manual",
      headers: { "accept-language": "en-US,en;q=0.9", "user-agent": "Mozilla/5.0 (bandhantak google-connection-check)" },
    });
    hops.push(`${res.status} ${current.hostname}${current.pathname}`);
    const locationRaw = res.headers.get("location");
    if (locationRaw) {
      const next = new URL(locationRaw, current);
      const text = `${next.pathname} ${next.search} ${authErrorText(next)}`;
      const hit = AUTH_ERRORS.find((e) => text.includes(e));
      if (hit) return { verdict: "REJECTED", detail: hit, hops };
      if (/error/i.test(next.pathname)) return { verdict: "REJECTED", detail: `error page ${next.hostname}${next.pathname}`, hops };
      if (SIGN_IN_PATH.test(next.pathname)) return { verdict: "ACCEPTED", detail: `continues to sign-in ${next.hostname}${next.pathname}`, hops };
      current = next;
      continue;
    }
    const body = await res.text().catch(() => "");
    const hit = (res.status >= 400 ? AUTH_ERRORS : STRONG_AUTH_ERRORS).find((e) => body.includes(e));
    if (hit) return { verdict: "REJECTED", detail: `${hit} (HTTP ${res.status})`, hops };
    if (res.status >= 400) return { verdict: "REJECTED", detail: `HTTP ${res.status}`, hops };
    const title = body.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim();
    return { verdict: "UNCLEAR", detail: `HTTP ${res.status} page${title ? ` "${title}"` : ""}`, hops };
  }
  return { verdict: "UNCLEAR", detail: "more than 6 redirects", hops };
}

async function preflight(): Promise<number> {
  let code = 0;
  const idRaw = process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
  const secretSet = !!process.env.GOOGLE_CLIENT_SECRET?.trim();
  const keyReady = isSecretBoxConfigured();

  say("\n[1] Environment the OAuth routes read");
  say(`  GOOGLE_CLIENT_ID        ${idRaw ? `set (${idRaw.endsWith(".apps.googleusercontent.com") ? "web client id format" : "UNUSUAL format"})` : "MISSING"}`);
  say(`  GOOGLE_CLIENT_SECRET    ${secretSet ? "set (value never printed)" : "MISSING"}`);
  say(`  SECRETS_ENCRYPTION_KEY  ${keyReady ? "usable (32 bytes) — grants can be sealed" : "MISSING/INVALID — grants cannot be sealed"}`);
  say(`  NEXT_PUBLIC_APP_URL     ${JSON.stringify(process.env.NEXT_PUBLIC_APP_URL ?? null)}`);
  say(`  APP_URL                 ${JSON.stringify(process.env.APP_URL ?? null)}`);
  for (const name of ["NEXT_PUBLIC_APP_URL", "APP_URL"] as const) {
    const value = process.env[name];
    if (value !== undefined && value !== value.trim()) say(`  WARNING                 ${name} has leading/trailing whitespace`);
  }
  if (!idRaw || !secretSet || !keyReady) code = 1;

  // Same resolution as `marketingOAuthOrigin()` when an origin is configured.
  const override = option("origin");
  const configured = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL;
  const origin = (override ?? configured ?? "").replace(/\/$/, "");
  const source = override ? "--origin" : process.env.NEXT_PUBLIC_APP_URL ? "NEXT_PUBLIC_APP_URL" : process.env.APP_URL ? "APP_URL" : "none";
  if (!origin) {
    say("  origin                  NONE — the routes would fall back to the request host; set NEXT_PUBLIC_APP_URL");
    return 1;
  }
  const redirectUri = `${origin}${GOOGLE_CALLBACK_PATH}`;
  say(`  origin                  ${origin} (from ${source})`);
  say(`  redirect_uri            ${redirectUri}`);
  const expected = option("expect-callback");
  if (expected) {
    const match = expected === redirectUri;
    say(`  expected callback       ${match ? "MATCH" : `MISMATCH — expected ${expected}`}`);
    if (!match) code = worst(code, 1);
  }

  say("\n[2] State + cookie pair (pure, no network)");
  for (const provider of PROVIDERS) {
    const { state, cookieValue } = buildConnectState(provider);
    const other = PROVIDERS.find((p) => p !== provider)!;
    const good = verifyConnectState(state, cookieValue);
    const swapped = verifyConnectState(state.replace(`.${provider}`, `.${other}`), cookieValue);
    const noCookie = verifyConnectState(state, "");
    const ok = good.ok && good.provider === provider && !swapped.ok && !noCookie.ok;
    say(`  ${ok ? "READY  " : "BROKEN "} ${provider}: verifies as ${good.provider ?? "—"} · provider swap refused ${!swapped.ok} · missing cookie refused ${!noCookie.ok}`);
    if (!ok) code = worst(code, 1);
  }

  say("\n[3] Deployed routes, no cookies (expect the admin-login redirect, never a 404)");
  for (const path of [GOOGLE_CALLBACK_PATH, "/api/admin/marketing-ai/connections/google/start?provider=GOOGLE_ADS"]) {
    try {
      const res = await fetch(`${origin}${path}`, { redirect: "manual" });
      const location = res.headers.get("location");
      const gated = res.status >= 300 && res.status < 400 && !!location && location.startsWith(`${origin}/admin/login`);
      say(`  ${gated ? "READY  " : "BLOCKED"} GET ${path.split("?")[0]} → ${res.status}${location ? ` → ${location}` : ""}`);
      if (!gated) code = worst(code, res.status === 404 ? 1 : 2);
    } catch (err) {
      say(`  BLOCKED GET ${path.split("?")[0]} → ${err instanceof Error ? err.message : String(err)}`);
      code = worst(code, 2);
    }
  }

  say("\n[4] Google authorization endpoint (no sign-in; nothing is granted)");
  if (!googleConfig()) {
    say("  skipped — GOOGLE_CLIENT_ID/SECRET missing");
    return worst(code, 1);
  }
  const verbose = has("verbose");
  const controlUrl = googleConnectUrl({ provider: "GOOGLE_ANALYTICS", redirectUri: `${origin}/__bt_redirect_probe_not_registered`, state: buildConnectState("GOOGLE_ANALYTICS").state })!;
  const control = await probeAuthorization(controlUrl);
  const calibrated = control.verdict === "REJECTED";
  say(`  control: unregistered redirect → ${control.verdict} (${control.detail})${calibrated ? "" : " — probe cannot tell accepted from rejected"}`);
  if (verbose) say(`           hops: ${control.hops.join(" → ")}`);
  for (const provider of PROVIDERS) {
    const url = googleConnectUrl({ provider, redirectUri, state: buildConnectState(provider).state })!;
    const params = new URL(url).searchParams;
    const probe = await probeAuthorization(url);
    const verdict = probe.verdict === "ACCEPTED" && !calibrated ? "INCONCLUSIVE" : probe.verdict;
    say(`  ${verdict.padEnd(12)} ${provider} · scope ${params.get("scope")} · access_type=${params.get("access_type")} prompt=${params.get("prompt")} include_granted_scopes=${params.get("include_granted_scopes")} · ${probe.detail}`);
    if (verbose) say(`               hops: ${probe.hops.join(" → ")}`);
    if (verdict !== "ACCEPTED") code = worst(code, 2);
  }
  return code;
}

// ---- database modes ----------------------------------------------------------

interface Db {
  prisma: (typeof import("../lib/db/prisma"))["prisma"];
  svc: typeof import("../lib/services/marketing/connectionService");
  box: typeof import("../lib/security/secretBox");
  credentials: typeof import("../lib/ai/credentials");
}

/** Loaded only outside --preflight: `lib/db/prisma` builds its client at import and needs DATABASE_URL. */
async function loadDb(): Promise<Db> {
  const [{ prisma }, svc, box, credentials] = await Promise.all([
    import("../lib/db/prisma"),
    import("../lib/services/marketing/connectionService"),
    import("../lib/security/secretBox"),
    import("../lib/ai/credentials"),
  ]);
  return { prisma, svc, box, credentials };
}

function hasGrant(row: MarketingConnection | null | undefined): row is MarketingConnection {
  return !!row?.secretCipherText && !!row.secretIv && !!row.secretAuthTag && row.secretKind === GOOGLE_SECRET_KIND;
}

function openGrant(db: Db, row: MarketingConnection): string | null {
  const plain = db.box.open({ cipherText: row.secretCipherText!, iv: row.secretIv!, authTag: row.secretAuthTag! });
  remember(plain);
  return plain;
}

function stringSettings(row: MarketingConnection | null | undefined): Record<string, string> {
  const raw = row?.settings;
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === "string") out[k] = v;
  return out;
}

async function status(db: Db): Promise<number> {
  const [rows, view] = await Promise.all([
    db.prisma.marketingConnection.findMany({ where: { provider: { in: PROVIDERS } } }),
    db.svc.listConnectionStatus(),
  ]);
  say("\n[status] MarketingConnection rows");
  let code = 0;
  for (const provider of PROVIDERS) {
    const meta = MARKETING_PROVIDER_META[provider];
    const row = rows.find((r) => r.provider === provider) ?? null;
    const chip = view.find((v) => v.provider === provider);
    say(`\n  ${meta.label} (${provider}) — health ${chip?.health ?? "?"}${chip?.todo ? ` · todo: ${chip.todo}` : ""}`);
    if (!row) {
      say("    row             MISSING — no grant, no account ref stored");
      code = worst(code, 1);
      continue;
    }
    const granted = hasGrant(row);
    const opens = granted ? (openGrant(db, row) ? "yes" : "NO — sealed with a different SECRETS_ENCRYPTION_KEY") : "—";
    const granter = row.grantedBy ? await db.prisma.user.findUnique({ where: { id: row.grantedBy }, select: { role: true } }) : null;
    say(`    OAuth grant     ${granted ? `sealed refresh token present · opens with this key: ${opens}` : "MISSING — Connect with Google not completed"}`);
    say(`    scopes          ${row.scopes.length ? row.scopes.join(" ") : "—"}${granted && !row.scopes.includes(meta.scopes[0]) ? ` ← expected ${meta.scopes[0]}` : ""}`);
    say(`    granted         ${row.grantedAt ? `${row.grantedAt.toISOString()} by ${granter?.role ?? "unknown role"}` : "—"}`);
    say(`    account ref     ${row.accountRef ?? `MISSING — ${meta.accountRefLabel}`}${row.accountLabel ? ` (${row.accountLabel})` : ""}`);
    say(`    status          ${row.status}${row.lastSyncAt ? ` · last successful read ${row.lastSyncAt.toISOString()}` : ""}`);
    if (row.lastErrorCode) say(`    last error      ${row.lastErrorCode} at ${row.lastErrorAt?.toISOString() ?? "?"} — ${row.lastErrorMessage ?? ""}`);
    const settings = stringSettings(row);
    const facts = ["currency", "timeZone", "isManager", "isTestAccount", "apiVersion", "loginCustomerId"].filter((k) => settings[k]).map((k) => `${k}=${settings[k]}`);
    if (facts.length) say(`    settings        ${facts.join(" · ")}`);
    if (!granted || !row.accountRef || opens !== "yes") code = worst(code, 1);
    else if (chip?.health !== "CONNECTED") code = worst(code, 2);
  }
  return code;
}

async function saveRefs(db: Db): Promise<number> {
  const wanted: Array<[GoogleMarketingProvider, string | null]> = [
    ["GOOGLE_ADS", option("ads")],
    ["GOOGLE_ANALYTICS", option("ga4")],
    ["SEARCH_CONSOLE", option("search-console")],
  ];
  say("\n[save-refs] saveConnectionSettings — the sheet's Save (normalisation + audit row)");
  if (!wanted.some(([, ref]) => ref)) {
    say("  nothing to save — pass --ads=, --ga4= and/or --search-console=");
    return 1;
  }
  let code = 0;
  for (const [provider, ref] of wanted) {
    if (!ref) continue;
    const row = await db.prisma.marketingConnection.findUnique({ where: { provider } });
    if (!hasGrant(row)) {
      say(`  SKIPPED  ${provider} — no OAuth grant on the row yet; refs are saved only after Connect with Google`);
      code = worst(code, 1);
      continue;
    }
    const actor = row.grantedBy ? await db.prisma.user.findUnique({ where: { id: row.grantedBy }, select: { id: true, role: true } }) : null;
    if (!actor || actor.role !== "ADMIN") {
      say(`  REFUSED  ${provider} — the granting user is not an ADMIN; save it from the page instead`);
      code = worst(code, 1);
      continue;
    }
    const before = row.accountRef;
    const result = await db.svc.saveConnectionSettings({
      provider,
      accountRef: ref,
      accountLabel: row.accountLabel,
      settings: stringSettings(row),
      actorId: actor.id,
      actorRole: actor.role,
    });
    if (!result.ok) {
      say(`  FAILED   ${provider} — ${result.error}: ${result.message}`);
      code = worst(code, 1);
      continue;
    }
    const after = await db.prisma.marketingConnection.findUnique({ where: { provider }, select: { accountRef: true } });
    say(`  SAVED    ${provider} · input ${ref} · accountRef ${before ?? "—"} → ${after?.accountRef ?? "—"}`);
  }
  return code;
}

interface RawResult {
  ok: boolean;
  status: number;
  json: unknown;
  summary: string;
}

/** Google's error envelope reduced to status, message and the reason fields that name a fix — never the request. */
function summariseGoogleError(json: unknown, text: string): string {
  const error = (json as { error?: { status?: string; message?: string; details?: unknown[] } } | null)?.error;
  if (!error) return text.replace(/\s+/g, " ").trim().slice(0, 300);
  const parts: string[] = [];
  if (error.status) parts.push(error.status);
  if (error.message) parts.push(JSON.stringify(error.message.slice(0, 400)));
  for (const d of error.details ?? []) {
    const detail = d as { reason?: string; metadata?: Record<string, string>; errors?: Array<{ errorCode?: Record<string, string>; message?: string }> };
    if (detail.reason) parts.push(`reason=${detail.reason}`);
    if (detail.metadata?.consumer) parts.push(`consumer=${detail.metadata.consumer}`);
    if (detail.metadata?.activationUrl) parts.push(`activationUrl=${detail.metadata.activationUrl}`);
    for (const e of detail.errors ?? []) {
      const name = e.errorCode ? Object.entries(e.errorCode).map(([k, v]) => `${k}.${v}`).join(",") : "?";
      parts.push(`ads ${name}${e.message ? ` ${JSON.stringify(e.message.slice(0, 200))}` : ""}`);
    }
  }
  return parts.join(" · ");
}

async function rawCall(url: string, init: RequestInit): Promise<RawResult> {
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { ok: res.ok, status: res.status, json, summary: res.ok ? "" : summariseGoogleError(json, text) };
  } catch (err) {
    return { ok: false, status: 0, json: null, summary: err instanceof Error ? err.message : String(err) };
  }
}

/** Token + the provider's essential read, raw — so a failure carries Google's own words. Returns an exit code. */
async function diagnose(db: Db, provider: GoogleMarketingProvider, failed: boolean): Promise<number> {
  const row = await db.prisma.marketingConnection.findUnique({ where: { provider } });
  if (!hasGrant(row)) {
    say("    cause           no OAuth grant stored — Connect with Google first");
    return 1;
  }
  if (!row.accountRef) {
    say(`    cause           ${MARKETING_PROVIDER_META[provider].accountRefLabel} not saved`);
    return 1;
  }
  const refresh = openGrant(db, row);
  if (!refresh) {
    say("    cause           stored grant does not open with this SECRETS_ENCRYPTION_KEY — reconnect");
    return 1;
  }
  const config = googleConfig();
  if (!config) {
    say("    cause           GOOGLE_CLIENT_ID/SECRET missing");
    return 1;
  }

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refresh, client_id: config.clientId, client_secret: config.clientSecret, grant_type: "refresh_token" }),
  });
  const token = (await tokenRes.json().catch(() => ({}))) as { access_token?: string; scope?: string; error?: string; error_description?: string };
  remember(token.access_token);
  if (!tokenRes.ok || !token.access_token) {
    say(`    token refresh   HTTP ${tokenRes.status} ${token.error ?? ""}${token.error_description ? ` — ${token.error_description}` : ""}`);
    return 2;
  }
  say(`    token refresh   OK · scopes in token: ${token.scope ?? "(not returned)"}`);
  const bearer = { Authorization: `Bearer ${token.access_token}` };
  const settings = stringSettings(row);

  if (provider === "GOOGLE_ADS") {
    const devToken = (await db.credentials.getProviderKey("GOOGLE_ADS_DEVELOPER"))?.trim() || null;
    remember(devToken);
    const headers: Record<string, string> = { ...bearer };
    if (devToken) headers["developer-token"] = devToken;
    const login = normaliseCustomerId(settings.loginCustomerId ?? "");
    if (login) headers["login-customer-id"] = login;
    const cid = normaliseCustomerId(row.accountRef);
    say(`    request shape   API ${googleAdsApiVersion()} · developer-token ${devToken ? "sent (legacy)" : "not sent"} · login-customer-id ${login || "not sent"}`);
    const list = await rawCall(`${googleAdsBase()}/customers:listAccessibleCustomers`, { headers });
    if (list.ok) {
      const ids = ((list.json as { resourceNames?: string[] } | null)?.resourceNames ?? []).map((n) => n.replace("customers/", ""));
      say(`    accessible      ${ids.length ? ids.join(", ") : "none"} · ${cid} ${ids.includes(cid) ? "is directly accessible" : "is NOT directly accessible (a manager login-customer-id would be needed)"}`);
    } else {
      say(`    accessible      HTTP ${list.status} — ${list.summary}`);
    }
    if (failed) {
      // The connector's own body (the query alone), sent as configured and — when a legacy
      // developer token is stored — once more without it, so the report shows whether the
      // token changes Google's answer.
      const variants: Array<[string, Record<string, string>]> = [["raw search", headers]];
      if (devToken) {
        const withoutToken: Record<string, string> = { ...bearer };
        if (login) withoutToken["login-customer-id"] = login;
        variants.push(["raw (no token)", withoutToken]);
      }
      for (const [label, variantHeaders] of variants) {
        const search = await rawCall(`${googleAdsBase()}/customers/${cid}/googleAds:search`, {
          method: "POST",
          headers: { ...variantHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ query: "SELECT customer.id FROM customer LIMIT 1" }),
        });
        say(`    ${label.padEnd(15)} HTTP ${search.status}${search.ok ? " OK" : ` — ${search.summary}`}`);
      }
    }
  }

  if (provider === "GOOGLE_ANALYTICS" && failed) {
    const report = await rawCall(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(row.accountRef)}:runReport`, {
      method: "POST",
      headers: { ...bearer, "Content-Type": "application/json" },
      body: JSON.stringify({ dateRanges: [{ startDate: "7daysAgo", endDate: "yesterday" }], metrics: [{ name: "sessions" }], limit: 1 }),
    });
    say(`    raw runReport   HTTP ${report.status}${report.ok ? " OK" : ` — ${report.summary}`}`);
  }

  if (provider === "SEARCH_CONSOLE") {
    const sites = await rawCall("https://www.googleapis.com/webmasters/v3/sites", { headers: bearer });
    if (sites.ok) {
      const entries = ((sites.json as { siteEntry?: Array<{ siteUrl?: string; permissionLevel?: string }> } | null)?.siteEntry ?? []).map((s) => `${s.siteUrl} (${s.permissionLevel})`);
      say(`    properties      ${entries.length ? entries.join(", ") : "none visible to this Google account"}`);
    } else {
      say(`    properties      HTTP ${sites.status} — ${sites.summary}`);
    }
    const siteUrl = encodeURIComponent(row.accountRef);
    if (failed) {
      const site = await rawCall(`https://www.googleapis.com/webmasters/v3/sites/${siteUrl}`, { headers: bearer });
      say(`    raw site read   HTTP ${site.status}${site.ok ? " OK" : ` — ${site.summary}`}`);
    } else {
      const from = isoDaysAgo(30);
      const to = isoDaysAgo(3);
      const q = await rawCall(`https://www.googleapis.com/webmasters/v3/sites/${siteUrl}/searchAnalytics/query`, {
        method: "POST",
        headers: { ...bearer, "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: from, endDate: to, rowLimit: 1 }),
      });
      if (q.ok) {
        const r = (q.json as { rows?: Array<{ clicks?: number; impressions?: number }> } | null)?.rows?.[0];
        say(`    search data     ${from} → ${to}: ${r ? `${r.clicks ?? 0} clicks · ${r.impressions ?? 0} impressions` : "no rows in this window"}`);
      } else {
        say(`    search data     HTTP ${q.status} — ${q.summary}`);
      }
    }
  }

  return failed ? 2 : 0;
}

async function test(db: Db): Promise<number> {
  say("\n[test] testConnection() — the Test button's code path (records the outcome on the row)");
  let code = 0;
  for (const provider of PROVIDERS) {
    const started = Date.now();
    const result = await db.svc.testConnection(provider);
    say(`\n  ${result.ok ? "PASS" : "FAIL"}  ${MARKETING_PROVIDER_META[provider].label} — ${result.message} (${Date.now() - started} ms)`);
    const diag = await diagnose(db, provider, !result.ok);
    code = worst(code, result.ok ? 0 : diag === 1 ? 1 : 2);
  }
  return code;
}

// ---- main ----------------------------------------------------------------------

function footer(): void {
  say(`\n  network guard   ${allowedPosts.length} read-only POST(s) let through · ${refusedWrites.length} write(s) refused${refusedWrites.length ? ` (${refusedWrites.join(", ")})` : ""}`);
}

async function main(): Promise<number> {
  say("\nGrowth Saathi — Google connections (read-only toward Google; secrets never printed)");
  if (has("preflight")) {
    const code = await preflight();
    footer();
    return code;
  }
  const db = await loadDb();
  try {
    let code = 0;
    if (has("save-refs")) code = worst(code, await saveRefs(db));
    if (has("test")) code = worst(code, await test(db));
    return worst(code, await status(db));
  } finally {
    footer();
    await db.prisma.$disconnect().catch(() => undefined);
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(redact(`\ngoogle-connection-check crashed: ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  });
