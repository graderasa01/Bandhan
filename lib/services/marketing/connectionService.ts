import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getProviderKey, listCredentialStatus } from "@/lib/ai/credentials";
import { isGoogleConfigured } from "@/lib/auth/google";
import { isSecretBoxConfigured, open, seal } from "@/lib/security/secretBox";
import {
  MARKETING_PROVIDERS,
  MARKETING_PROVIDER_META,
  type ConnectionHealth,
  type ConnectionStatusRow,
  type MarketingProviderKey,
  type MetaReadinessCheck,
  type MetaReadinessReport,
} from "@/lib/contracts/marketingAi";
import { ConnectorError, describeConnectorError, isConnectorError } from "@/lib/marketing/connectors/http";
import { refreshAccessToken, revokeRefreshToken, type GoogleTokenGrant } from "@/lib/marketing/connectors/googleOAuth";
import { googleAdsApiVersion, normaliseCustomerId, testGoogleAds, type GoogleAdsAuth } from "@/lib/marketing/connectors/googleAds";
import { testSearchConsole } from "@/lib/marketing/connectors/searchConsole";
import { testGoogleAnalytics } from "@/lib/marketing/connectors/googleAnalytics";
import { normaliseAdAccountId, testMetaAds } from "@/lib/marketing/connectors/metaAds";
import { createMetaAdsWriteProvider } from "@/lib/marketing/connectors/metaAdsWrite";
import { META_API_VERSION } from "@/lib/marketing/connectors/metaGraph";
import { testFacebookPage } from "@/lib/marketing/connectors/facebookPage";
import { testInstagram } from "@/lib/marketing/connectors/instagram";
import type { MetaAdsReadinessReader, MetaAdsWriteProvider } from "@/lib/marketing/providers/metaAdsProvider";
import { META_READ_PERMISSION, META_WRITE_PERMISSION, evaluateMetaAdReadiness } from "./metaReadinessEvaluator";
import type { MarketingConnection, Prisma, Role } from "@prisma/client";

/**
 * BandhanTak's own platform accounts — Zone C of the Growth Saathi screen.
 *
 * ## Two kinds of secret, one rule
 *
 * Google providers hold a sealed refresh token on their own row (it arrives
 * through a consent redirect, per provider, with only that provider's
 * scope). Meta providers share the system-user token in `ProviderCredential`
 * (`META_MARKETING`) — it is pasted, not granted. Either way the plaintext
 * exists only inside this module for the length of one upstream call. It is
 * never returned, never logged, never put in a prompt.
 *
 * ## Health is derived, status is recorded
 *
 * `MarketingConnection.status` is what the last upstream call said. The
 * `health` on a strip chip also checks what is *present* — a grant without
 * an account id is not "connected", and a token that failed yesterday is not
 * "connected" until a test says so again. `todo` names the one missing
 * thing so the sheet can ask for exactly that.
 */

const GOOGLE_SECRET_KIND = "GOOGLE_REFRESH_TOKEN";

export type ConnectionSettings = Record<string, string>;

/**
 * Settings the system writes from a successful test (account facts the
 * MKT-2 preflight reads without a network call). A Save from the sheet
 * replaces the admin-edited keys and keeps these.
 */
const DERIVED_SETTING_KEYS = [
  "currency",
  "timeZone",
  "isManager",
  "isTestAccount",
  "apiVersion",
  // MKT-2B — written by `checkMetaAdReadiness`, read by the no-network Meta readiness (doc 14 §9, §10).
  "accountStatus",
  "readReady",
  "writeReady",
  "accountAccess",
  "pageAssigned",
  "igAssigned",
  "pageId",
  "pageName",
  "igId",
  "igUsername",
  "accessTier",
  "readinessAt",
  "identityName",
  "pageRole",
  "readinessCode",
  "readinessMessage",
] as const;

function settingsOf(row: MarketingConnection | null | undefined): ConnectionSettings {
  const raw = row?.settings;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: ConnectionSettings = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === "string") out[k] = v;
  return out;
}

function hasGoogleGrant(row: MarketingConnection | null | undefined): boolean {
  return !!row?.secretCipherText && !!row.secretIv && !!row.secretAuthTag && row.secretKind === GOOGLE_SECRET_KIND;
}

/**
 * Env fallbacks for the three Meta identities (`.env.example` → Meta). A
 * value saved on the Growth Saathi page wins; the env value is used only when
 * the row has none — so deployment secrets can configure a fresh install and
 * an admin can still override it from the page. The token has its own
 * fallback (`META_MARKETING_ACCESS_TOKEN`) in `lib/ai/credentials.ts`.
 */
const META_ENV_ACCOUNT_REF: Partial<Record<MarketingProviderKey, string>> = {
  META_ADS: "META_AD_ACCOUNT_ID",
  FACEBOOK_PAGE: "META_FACEBOOK_PAGE_ID",
  INSTAGRAM: "META_INSTAGRAM_USER_ID",
};

/** A syntactically valid env account reference, normalised — or null. A malformed value is never sent to Meta. */
export function envAccountRef(provider: MarketingProviderKey): string | null {
  const name = META_ENV_ACCOUNT_REF[provider];
  const raw = name ? (process.env[name] ?? "").trim() : "";
  if (!raw) return null;
  if (provider === "META_ADS") {
    const act = normaliseAdAccountId(raw);
    return /^act_\d+$/.test(act) ? act : null;
  }
  return /^\d+$/.test(raw) ? raw : null;
}

function effectiveAccountRef(provider: MarketingProviderKey, row: MarketingConnection | null | undefined): { ref: string | null; source: "DB" | "ENV" | null } {
  if (row?.accountRef) return { ref: row.accountRef, source: "DB" };
  const env = envAccountRef(provider);
  return env ? { ref: env, source: "ENV" } : { ref: null, source: null };
}

// ============================================================
// Listing
// ============================================================

export async function listConnectionStatus(): Promise<ConnectionStatusRow[]> {
  const [rows, credentials] = await Promise.all([prisma.marketingConnection.findMany(), listCredentialStatus()]);
  const byProvider = new Map(rows.map((r) => [r.provider as MarketingProviderKey, r]));
  const credByName = new Map(credentials.map((c) => [c.provider, c]));
  const googleReady = isGoogleConfigured();
  const encryptionReady = isSecretBoxConfigured();

  const out: ConnectionStatusRow[] = [
    {
      provider: "BANDHANTAK",
      label: "BandhanTak product data",
      health: "CONNECTED",
      accountRef: null,
      accountRefSource: null,
      accountLabel: "Growth Console, plans, lifecycle — apna database",
      settings: {},
      credentialSet: null,
      credentialHint: null,
      grantedAt: null,
      lastSyncAt: null,
      lastError: null,
      todo: null,
    },
  ];

  for (const provider of MARKETING_PROVIDERS) {
    const meta = MARKETING_PROVIDER_META[provider];
    const row = byProvider.get(provider) ?? null;
    const cred = meta.credential ? credByName.get(meta.credential) : undefined;
    const credentialSet = meta.credential ? (cred?.source ?? "NONE") !== "NONE" : null;
    const effective = meta.auth === "meta-token" ? effectiveAccountRef(provider, row) : { ref: row?.accountRef ?? null, source: row?.accountRef ? ("DB" as const) : null };

    let health: ConnectionHealth = "NOT_CONNECTED";
    let todo: string | null = null;

    if (meta.auth === "not-available") {
      todo = "Phase MKT-3 me aayega — abhi Reel concepts script ke roop me bante hain.";
    } else if (meta.auth === "google-oauth") {
      if (!googleReady) todo = "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET env me set karein (Google Sign-In wale hi).";
      else if (!encryptionReady) todo = "SECRETS_ENCRYPTION_KEY set nahi hai — grant store nahi ho sakta.";
      else if (!hasGoogleGrant(row)) todo = "'Connect with Google' se authorise karein.";
      else if (!row?.accountRef) todo = `${meta.accountRefLabel} daalein.`;
      else if (meta.credential && !meta.credentialOptional && !credentialSet) todo = "Token paste karein.";
      else if (row.status === "NEEDS_ATTENTION") {
        health = "NEEDS_ATTENTION";
        todo = row.lastErrorMessage ?? "Aakhri call fail hui — Test chalayein ya dobara Connect karein.";
      } else health = "CONNECTED";
    } else {
      const envName = META_ENV_ACCOUNT_REF[provider];
      const envRaw = envName ? (process.env[envName] ?? "").trim() : "";
      if (!credentialSet) todo = "Meta access token paste karein (ya META_MARKETING_ACCESS_TOKEN env).";
      else if (!effective.ref) todo = envRaw && envName ? `${envName} env value valid nahi hai — sirf digits${provider === "META_ADS" ? " (act_ ke saath ya bina)" : ""}.` : `${meta.accountRefLabel} daalein.`;
      else if (row?.status === "NEEDS_ATTENTION") {
        health = "NEEDS_ATTENTION";
        todo = row.lastErrorMessage ?? "Aakhri call fail hui — Test chalayein.";
      } else health = "CONNECTED";
    }

    out.push({
      provider,
      label: meta.label,
      health,
      accountRef: effective.ref,
      accountRefSource: effective.source,
      accountLabel: row?.accountLabel ?? null,
      settings: settingsOf(row),
      credentialSet,
      credentialHint: cred?.maskedHint ?? null,
      grantedAt: row?.grantedAt?.toISOString() ?? null,
      lastSyncAt: row?.lastSyncAt?.toISOString() ?? null,
      lastError: row?.status === "NEEDS_ATTENTION" ? (row.lastErrorMessage ?? null) : null,
      todo,
    });
  }

  return out;
}

/** Health without a DB read for a specific provider — for the tool runner's "is this source usable" decision. */
export function healthOf(rows: ConnectionStatusRow[], provider: MarketingProviderKey): ConnectionHealth {
  return rows.find((r) => r.provider === provider)?.health ?? "NOT_CONNECTED";
}

// ============================================================
// Writes — settings, grants, disconnect
// ============================================================

export type ConnectionWriteResult = { ok: true } | { ok: false; error: string; message: string; status: number };

export async function saveConnectionSettings(params: {
  provider: MarketingProviderKey;
  accountRef: string | null;
  accountLabel?: string | null;
  settings?: ConnectionSettings;
  actorId: string;
  actorRole: Role;
}): Promise<ConnectionWriteResult> {
  const meta = MARKETING_PROVIDER_META[params.provider];
  if (meta.auth === "not-available") {
    return { ok: false, error: "NOT_AVAILABLE", message: "Ye provider is release me connect nahi hota.", status: 422 };
  }

  let accountRef = params.accountRef?.trim() || null;
  if (accountRef) {
    if (params.provider === "GOOGLE_ADS") accountRef = normaliseCustomerId(accountRef);
    if (params.provider === "META_ADS") accountRef = normaliseAdAccountId(accountRef);
    if (params.provider === "GOOGLE_ANALYTICS") accountRef = accountRef.replace(/^properties\//, "");
    if (!accountRef) return { ok: false, error: "VALIDATION_FAILED", message: `${meta.accountRefLabel} valid nahi hai.`, status: 422 };
  }

  const existing = await prisma.marketingConnection.findUnique({ where: { provider: params.provider } });

  const settings: ConnectionSettings = {};
  const previousSettings = settingsOf(existing);
  for (const key of DERIVED_SETTING_KEYS) if (previousSettings[key]) settings[key] = previousSettings[key];
  for (const [k, v] of Object.entries(params.settings ?? {})) {
    const key = k.trim();
    const value = v.trim();
    if (/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(key) && value.length <= 200) settings[key] = value;
  }
  const previous = existing ? `${existing.accountRef ?? "—"} ${JSON.stringify(settingsOf(existing))}` : null;

  await prisma.$transaction(async (tx) => {
    await tx.marketingConnection.upsert({
      where: { provider: params.provider },
      create: {
        provider: params.provider,
        accountRef,
        accountLabel: params.accountLabel?.trim() || null,
        settings: settings as Prisma.InputJsonValue,
        scopes: [],
        updatedBy: params.actorId,
      },
      update: {
        accountRef,
        accountLabel: params.accountLabel?.trim() || existing?.accountLabel || null,
        settings: settings as Prisma.InputJsonValue,
        // An account change invalidates the last test's verdict either way.
        status: existing?.status === "NEEDS_ATTENTION" && existing.accountRef === accountRef ? "NEEDS_ATTENTION" : existing?.status ?? "DISCONNECTED",
        updatedBy: params.actorId,
      },
    });
    await tx.adminAuditLog.create({
      data: {
        actorId: params.actorId,
        actorRole: params.actorRole,
        actionType: "MARKETING_CONNECTION_SETTINGS",
        targetType: "marketing_connection",
        targetId: params.provider,
        previousValue: previous,
        newValue: `${accountRef ?? "—"} ${JSON.stringify(settings)}`,
      },
    });
  });

  return { ok: true };
}

/** Stores a Google grant. The refresh token is sealed before it touches the row. */
export async function storeGoogleGrant(params: {
  provider: "GOOGLE_ADS" | "GOOGLE_ANALYTICS" | "SEARCH_CONSOLE";
  grant: GoogleTokenGrant;
  actorId: string;
  actorRole: Role;
}): Promise<ConnectionWriteResult> {
  if (!isSecretBoxConfigured()) {
    return { ok: false, error: "NOT_CONFIGURED", message: "SECRETS_ENCRYPTION_KEY set nahi hai — grant store nahi ho sakta.", status: 503 };
  }
  const sealed = seal(params.grant.refreshToken);
  const existing = await prisma.marketingConnection.findUnique({ where: { provider: params.provider } });

  await prisma.$transaction(async (tx) => {
    await tx.marketingConnection.upsert({
      where: { provider: params.provider },
      create: {
        provider: params.provider,
        scopes: params.grant.scopes,
        secretCipherText: sealed.cipherText,
        secretIv: sealed.iv,
        secretAuthTag: sealed.authTag,
        secretKind: GOOGLE_SECRET_KIND,
        grantedAt: new Date(),
        grantedBy: params.actorId,
        status: "DISCONNECTED",
        updatedBy: params.actorId,
      },
      update: {
        scopes: params.grant.scopes,
        secretCipherText: sealed.cipherText,
        secretIv: sealed.iv,
        secretAuthTag: sealed.authTag,
        secretKind: GOOGLE_SECRET_KIND,
        grantedAt: new Date(),
        grantedBy: params.actorId,
        // A fresh grant clears a stale "needs attention"; the next test decides.
        status: existing?.accountRef ? "CONNECTED" : "DISCONNECTED",
        lastErrorCode: null,
        lastErrorMessage: null,
        lastErrorAt: null,
        updatedBy: params.actorId,
      },
    });
    await tx.adminAuditLog.create({
      data: {
        actorId: params.actorId,
        actorRole: params.actorRole,
        actionType: "MARKETING_CONNECTION_GRANTED",
        targetType: "marketing_connection",
        targetId: params.provider,
        newValue: `scopes=${params.grant.scopes.join(" ")}`,
      },
    });
  });

  return { ok: true };
}

export async function disconnectProvider(params: { provider: MarketingProviderKey; actorId: string; actorRole: Role }): Promise<ConnectionWriteResult> {
  const existing = await prisma.marketingConnection.findUnique({ where: { provider: params.provider } });
  if (!existing) return { ok: true };

  if (hasGoogleGrant(existing)) {
    const refreshToken = open({ cipherText: existing.secretCipherText!, iv: existing.secretIv!, authTag: existing.secretAuthTag! });
    if (refreshToken) await revokeRefreshToken(refreshToken);
  }

  await prisma.$transaction(async (tx) => {
    await tx.marketingConnection.update({
      where: { provider: params.provider },
      data: {
        secretCipherText: null,
        secretIv: null,
        secretAuthTag: null,
        secretKind: null,
        scopes: [],
        grantedAt: null,
        grantedBy: null,
        status: "DISCONNECTED",
        lastErrorCode: null,
        lastErrorMessage: null,
        lastErrorAt: null,
        updatedBy: params.actorId,
      },
    });
    await tx.adminAuditLog.create({
      data: {
        actorId: params.actorId,
        actorRole: params.actorRole,
        actionType: "MARKETING_CONNECTION_DISCONNECTED",
        targetType: "marketing_connection",
        targetId: params.provider,
        previousValue: existing.accountRef ?? null,
      },
    });
  });

  return { ok: true };
}

// ============================================================
// Auth resolution — the only place plaintext exists
// ============================================================

export interface ResolvedGoogleAuth {
  accessToken: string;
  accountRef: string;
  settings: ConnectionSettings;
}

/**
 * Throws `ConnectorError` with a code the tool runner maps to a source
 * status: AUTH → needs attention, NOT_FOUND → not connected.
 */
export async function resolveGoogleAuth(provider: "GOOGLE_ADS" | "GOOGLE_ANALYTICS" | "SEARCH_CONSOLE"): Promise<ResolvedGoogleAuth> {
  const row = await prisma.marketingConnection.findUnique({ where: { provider } });
  if (!row || !hasGoogleGrant(row)) throw new ConnectorError("NOT_FOUND", `${MARKETING_PROVIDER_META[provider].label} connect nahi hai.`);
  if (!row.accountRef) throw new ConnectorError("NOT_FOUND", `${MARKETING_PROVIDER_META[provider].accountRefLabel} set nahi hai.`);
  const refreshToken = open({ cipherText: row.secretCipherText!, iv: row.secretIv!, authTag: row.secretAuthTag! });
  if (!refreshToken) throw new ConnectorError("AUTH", "Stored grant decrypt nahi hua (SECRETS_ENCRYPTION_KEY badli?) — dobara Connect karein.");
  const accessToken = await refreshAccessToken(refreshToken);
  return { accessToken, accountRef: row.accountRef, settings: settingsOf(row) };
}

/**
 * The developer token is legacy and optional since Google's 9 Sept 2026
 * sunset (doc 14 Gap B): access level lives on the Cloud project now. A
 * pasted token still rides along for an older setup; its absence is not a
 * connection failure.
 */
export async function resolveGoogleAdsAuth(): Promise<GoogleAdsAuth> {
  const [base, developerToken] = await Promise.all([resolveGoogleAuth("GOOGLE_ADS"), getProviderKey("GOOGLE_ADS_DEVELOPER")]);
  return {
    accessToken: base.accessToken,
    developerToken: developerToken || null,
    customerId: base.accountRef,
    loginCustomerId: base.settings.loginCustomerId ?? null,
  };
}

export interface ResolvedMetaAuth {
  accessToken: string;
  accountRef: string;
}

export async function resolveMetaAuth(provider: "META_ADS" | "FACEBOOK_PAGE" | "INSTAGRAM"): Promise<ResolvedMetaAuth> {
  const [row, token] = await Promise.all([prisma.marketingConnection.findUnique({ where: { provider } }), getProviderKey("META_MARKETING")]);
  if (!token) throw new ConnectorError("NOT_FOUND", "Meta access token set nahi hai.");
  const accountRef = effectiveAccountRef(provider, row).ref;
  if (!accountRef) throw new ConnectorError("NOT_FOUND", `${MARKETING_PROVIDER_META[provider].accountRefLabel} set nahi hai.`);
  return { accessToken: token, accountRef };
}

// ============================================================
// Outcome bookkeeping
// ============================================================

/** Records what an upstream call said about a connection. Cheap; called after every read. */
export async function recordConnectionOutcome(provider: MarketingProviderKey, err: unknown | null): Promise<void> {
  try {
    if (!err) {
      await prisma.marketingConnection.updateMany({
        where: { provider },
        data: { status: "CONNECTED", lastSyncAt: new Date(), lastErrorCode: null, lastErrorMessage: null, lastErrorAt: null },
      });
      return;
    }
    const { code, message } = describeConnectorError(err);
    // Only an auth/permission failure — or the provider itself saying the
    // account id does not exist (a real 404) — means the *connection* is
    // wrong. "Not configured yet" (NOT_FOUND raised before any call, no
    // status) is the strip's NOT_CONNECTED, not a fault; a rate limit or a
    // 500 is the provider's bad day, not ours to flag.
    const upstream404 = code === "NOT_FOUND" && isConnectorError(err) && err.status === 404;
    const needsAttention = code === "AUTH" || code === "FORBIDDEN" || upstream404;
    await prisma.marketingConnection.updateMany({
      where: { provider },
      data: needsAttention
        ? { status: "NEEDS_ATTENTION", lastErrorCode: code, lastErrorMessage: message, lastErrorAt: new Date() }
        : { lastErrorCode: code, lastErrorMessage: message, lastErrorAt: new Date() },
    });
  } catch (e) {
    console.error("[marketing:connection] outcome write failed:", e instanceof Error ? e.message : String(e));
  }
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
}

/**
 * MKT-2 reads currency/timezone/manager-ness at readiness time without a
 * network call; a successful test is where those facts come from. The
 * label is filled from the account name only when the admin left it empty.
 */
async function rememberGoogleAdsFacts(acc: Awaited<ReturnType<typeof testGoogleAds>>): Promise<void> {
  try {
    const row = await prisma.marketingConnection.findUnique({ where: { provider: "GOOGLE_ADS" } });
    if (!row) return;
    const settings: ConnectionSettings = { ...settingsOf(row) };
    if (acc.currency) settings.currency = acc.currency;
    if (acc.timeZone) settings.timeZone = acc.timeZone;
    settings.isManager = acc.isManager ? "true" : "false";
    settings.isTestAccount = acc.isTestAccount ? "true" : "false";
    settings.apiVersion = googleAdsApiVersion();
    await prisma.marketingConnection.update({
      where: { provider: "GOOGLE_ADS" },
      data: { settings: settings as Prisma.InputJsonValue, accountLabel: row.accountLabel || acc.name || null },
    });
  } catch (e) {
    console.error("[marketing:connection] google ads facts write failed:", e instanceof Error ? e.message : String(e));
  }
}

/** A real, read-only upstream call — the answer to "is it actually connected". */
export async function testConnection(provider: MarketingProviderKey): Promise<ConnectionTestResult> {
  const meta = MARKETING_PROVIDER_META[provider];
  if (meta.auth === "not-available") return { ok: false, message: "Video provider MKT-3 me aayega." };
  try {
    let message: string;
    switch (provider) {
      case "GOOGLE_ADS": {
        const acc = await testGoogleAds(await resolveGoogleAdsAuth());
        message = `Google Ads account ${acc.name ?? acc.customerId} (${acc.currency ?? "—"}, ${acc.timeZone ?? "—"}${acc.isManager ? ", manager" : ""}${acc.isTestAccount ? ", TEST account" : ""}) padh paa rahe hain.`;
        await rememberGoogleAdsFacts(acc);
        break;
      }
      case "GOOGLE_ANALYTICS": {
        const auth = await resolveGoogleAuth("GOOGLE_ANALYTICS");
        const r = await testGoogleAnalytics({ accessToken: auth.accessToken, propertyId: auth.accountRef });
        message = `GA4 property ${r.propertyId}: pichhle 30 din me ${r.sessions30d} sessions.`;
        break;
      }
      case "SEARCH_CONSOLE": {
        const auth = await resolveGoogleAuth("SEARCH_CONSOLE");
        const r = await testSearchConsole({ accessToken: auth.accessToken, siteUrl: auth.accountRef });
        message = `Search Console ${r.siteUrl} (${r.permissionLevel}) padh paa rahe hain.`;
        break;
      }
      case "META_ADS": {
        const auth = await resolveMetaAuth("META_ADS");
        const r = await testMetaAds({ accessToken: auth.accessToken }, auth.accountRef);
        message = `Meta ad account ${r.name ?? r.id} (${r.currency ?? "—"}) padh paa rahe hain.`;
        break;
      }
      case "FACEBOOK_PAGE": {
        const auth = await resolveMetaAuth("FACEBOOK_PAGE");
        const r = await testFacebookPage({ accessToken: auth.accessToken }, auth.accountRef);
        message = `Page "${r.name ?? r.id}"${r.followers !== null ? ` — ${r.followers} followers` : ""}.`;
        break;
      }
      case "INSTAGRAM": {
        const auth = await resolveMetaAuth("INSTAGRAM");
        const r = await testInstagram({ accessToken: auth.accessToken }, auth.accountRef);
        message = `Instagram @${r.username ?? r.id}${r.followers !== null ? ` — ${r.followers} followers` : ""}.`;
        break;
      }
      default:
        return { ok: false, message: "Ye provider test nahi hota." };
    }
    await recordConnectionOutcome(provider, null);
    return { ok: true, message };
  } catch (err) {
    await recordConnectionOutcome(provider, err);
    return { ok: false, message: describeConnectorError(err).message };
  }
}

// ============================================================
// MKT-2B — Meta ad-creation readiness (doc 14 §9)
// ============================================================

export { META_ACCOUNT_STATUS_NAME, META_ACCOUNT_WRITE_TASKS, META_PAGE_ADVERTISE_TASK, META_READ_PERMISSION, META_WRITE_PERMISSION } from "./metaReadinessEvaluator";

/** The production provider from the Meta token + the Meta Ads ad account (saved on the page, or `META_AD_ACCOUNT_ID`). Throws `ConnectorError(NOT_FOUND)` when either is missing. */
export async function resolveMetaAdsWriteProvider(): Promise<MetaAdsWriteProvider> {
  const auth = await resolveMetaAuth("META_ADS");
  return createMetaAdsWriteProvider({ accessToken: auth.accessToken }, auth.accountRef);
}

/** The Page and Instagram identities the ads use — the Facebook Page / Instagram connection rows, or their env fallbacks (doc 14 §9). */
export async function metaIdentityRefs(): Promise<{ pageId: string | null; instagramId: string | null }> {
  const rows = await prisma.marketingConnection.findMany({ where: { provider: { in: ["FACEBOOK_PAGE", "INSTAGRAM"] } } });
  return {
    pageId: effectiveAccountRef("FACEBOOK_PAGE", rows.find((r) => r.provider === "FACEBOOK_PAGE")).ref,
    instagramId: effectiveAccountRef("INSTAGRAM", rows.find((r) => r.provider === "INSTAGRAM")).ref,
  };
}

/**
 * "Check ad creation readiness" — a real, read-only pass (the rules live in
 * `metaReadinessEvaluator.ts`, shared with `scripts/meta-connection-check.ts`).
 * Nothing here writes to Meta. The verdict is stored as derived settings on
 * the Meta Ads connection so the no-network readiness (`metaReadiness()`) can
 * refuse a create card without a call — and so the card says which of these
 * it is relying on.
 *
 * `provider` is injectable for the checks; production builds it from the
 * token and the ad account id.
 */
export async function checkMetaAdReadiness(opts: { provider?: MetaAdsReadinessReader; now?: Date } = {}): Promise<MetaReadinessReport> {
  const now = opts.now ?? new Date();
  const apiVersion = META_API_VERSION();
  const [token, adsRow, identity] = await Promise.all([getProviderKey("META_MARKETING"), prisma.marketingConnection.findUnique({ where: { provider: "META_ADS" } }), metaIdentityRefs()]);
  const accountRef = effectiveAccountRef("META_ADS", adsRow).ref;
  const bare = (errorCode: string, message: string, check: MetaReadinessCheck): MetaReadinessReport => ({ checkedAt: now.toISOString(), apiVersion, ok: false, checks: [check], account: null, page: null, instagram: null, errorCode, message });
  if (!token) {
    return bare("META_TOKEN_INVALID", "Meta access token set nahi hai — NOT_CONNECTED.", { key: "TOKEN", label: "Access token", state: "MISSING", detail: "Meta access token set nahi hai.", fix: "Connections → Meta Ads → token paste karein (ads_read + ads_management), ya META_MARKETING_ACCESS_TOKEN env.", reconnect: true });
  }
  if (!accountRef) {
    return bare("ACCOUNT_NOT_READY", "Meta ad account ID set nahi hai — NOT_CONNECTED.", { key: "AD_ACCOUNT", label: "Ad account", state: "MISSING", detail: "Ad account ID set nahi hai.", fix: "Connections → Meta Ads → Ad account ID, ya META_AD_ACCOUNT_ID env.", reconnect: false });
  }

  const reader: MetaAdsReadinessReader = opts.provider ?? createMetaAdsWriteProvider({ accessToken: token }, accountRef);
  const ev = await evaluateMetaAdReadiness({ reader, accountRef, pageId: identity.pageId, instagramId: identity.instagramId, apiVersion, now });
  if (ev.tokenError !== null) {
    // Only a dead token is a *connection* fault; a missing role or a disabled account is a readiness block on a working connection.
    await recordConnectionOutcome("META_ADS", ev.tokenError);
    return ev.report;
  }

  // ---- persist derived facts on the Meta Ads row ----------------------------
  const { account, page, instagram, checks } = ev.report;
  try {
    const settings: ConnectionSettings = { ...settingsOf(adsRow) };
    // Account facts are this check's or nothing — a failed account read must not leave an older currency/timezone behind.
    if (account?.currency) settings.currency = account.currency;
    else delete settings.currency;
    if (account?.timeZone) settings.timeZone = account.timeZone;
    else delete settings.timeZone;
    settings.readinessCode = ev.report.errorCode ?? "";
    settings.readinessMessage = ev.report.message.slice(0, 300);
    settings.accountStatus = account?.accountStatus === null || account?.accountStatus === undefined ? "" : String(account.accountStatus);
    settings.readReady = ev.granted.includes(META_READ_PERMISSION) ? "true" : "false";
    settings.writeReady = ev.granted.includes(META_WRITE_PERMISSION) ? "true" : "false";
    settings.accountAccess = checks.find((c) => c.key === "AD_ACCOUNT")?.state ?? "MISSING";
    settings.pageAssigned = page ? "true" : "false";
    settings.pageRole = page ? (ev.pageRoleUnverified ? "UNVERIFIED" : "READY") : "MISSING";
    settings.igAssigned = instagram ? "true" : identity.instagramId ? "false" : "none";
    settings.pageId = page?.id ?? "";
    settings.pageName = page?.name ?? "";
    settings.igId = instagram?.id ?? "";
    settings.igUsername = instagram?.username ?? "";
    settings.accessTier = "UNVERIFIED";
    settings.readinessAt = now.toISOString();
    settings.apiVersion = apiVersion;
    settings.identityName = ev.identityName ?? "";
    // Upsert: with env-only ids there may be no row yet. `accountRef` is left alone so the env stays the source.
    await prisma.marketingConnection.upsert({
      where: { provider: "META_ADS" },
      create: { provider: "META_ADS", settings: settings as Prisma.InputJsonValue, scopes: [], accountLabel: account?.name ?? null },
      update: { settings: settings as Prisma.InputJsonValue, accountLabel: adsRow?.accountLabel || account?.name || null },
    });
    await recordConnectionOutcome("META_ADS", null);
  } catch (e) {
    console.error("[marketing:connection] meta readiness write failed:", e instanceof Error ? e.message : String(e));
  }
  return ev.report;
}
