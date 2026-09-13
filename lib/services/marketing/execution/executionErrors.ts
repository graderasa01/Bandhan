import type { DeploymentStatusKey, ExecutionErrorCode, SafeExecutionError } from "@/lib/contracts/marketingExecution";

/**
 * Error normalisation (§16, doc 14 §9). Every failure the worker can hit
 * becomes one `ExecutionError` that says five things: the normalised code,
 * a short admin-facing message, the one fix to try, whether the fix starts
 * with a reconnect, and — the part that matters for money — whether sending
 * the same request again is safe.
 *
 * Pure: no logging, no I/O. The worker decides what to store and where.
 */

export class ExecutionError extends Error {
  readonly code: ExecutionErrorCode;
  readonly fix: string | null;
  readonly retrySafe: boolean;
  readonly requestId: string | null;
  /** The deployment status this failure lands the row in. */
  readonly status: DeploymentStatusKey;
  /** The admin must re-connect / re-issue the token before anything else (doc 14 §9). */
  readonly reconnect: boolean;

  constructor(code: ExecutionErrorCode, message: string, opts: { fix?: string | null; retrySafe?: boolean; requestId?: string | null; status?: DeploymentStatusKey; reconnect?: boolean } = {}) {
    super(message);
    this.name = "ExecutionError";
    this.code = code;
    this.fix = opts.fix ?? null;
    this.retrySafe = opts.retrySafe ?? false;
    this.requestId = opts.requestId ?? null;
    this.status = opts.status ?? defaultStatusFor(code, this.retrySafe);
    this.reconnect = opts.reconnect ?? defaultReconnectFor(code);
  }

  toSafe(): SafeExecutionError {
    return { code: this.code, message: this.message.slice(0, 300), fix: this.fix, retrySafe: this.retrySafe, requestId: this.requestId, reconnect: this.reconnect };
  }
}

export function isExecutionError(err: unknown): err is ExecutionError {
  return err instanceof ExecutionError;
}

function defaultReconnectFor(code: ExecutionErrorCode): boolean {
  return code === "AUTH_EXPIRED" || code === "META_TOKEN_INVALID" || code === "META_ADS_MANAGEMENT_MISSING";
}

function defaultStatusFor(code: ExecutionErrorCode, retrySafe: boolean): DeploymentStatusKey {
  switch (code) {
    case "AUTH_EXPIRED":
    case "PERMISSION_MISSING":
    case "ACCOUNT_NOT_READY":
    case "BILLING_NOT_READY":
    case "INVALID_CONVERSION_ACTION":
    case "INVALID_GEO_OR_LANGUAGE":
    case "INVALID_BUDGET":
    case "INVALID_BIDDING":
    case "INVALID_LANDING":
    case "NOT_EXECUTABLE_YET":
    case "META_TOKEN_INVALID":
    case "META_ADS_MANAGEMENT_MISSING":
    case "META_ACCESS_TIER_BLOCKED":
    case "META_AD_ACCOUNT_FORBIDDEN":
    case "META_AD_ACCOUNT_DISABLED":
    case "META_PAGE_NOT_ASSIGNED":
    case "META_INSTAGRAM_NOT_ASSIGNED":
    case "META_ACCOUNT_CURRENCY_MISMATCH":
      return "BLOCKED_CONFIG";
    case "CREATIVE_MISSING":
    case "CREATIVE_INVALID":
      return "BLOCKED_CREATIVE";
    case "NETWORK_UNKNOWN_OUTCOME":
      return "UNKNOWN_OUTCOME";
    case "PROVIDER_PARTIAL_FAILURE":
      return "PARTIAL";
    case "RATE_LIMITED":
      return "FAILED_RETRYABLE";
    case "SPEC_CHANGED":
    case "APPROVAL_INVALID":
    case "GUARDRAIL_FAILED":
    case "SPEC_INVALID":
    case "POLICY_REJECTED":
    case "PROVIDER_VALIDATION_FAILED":
    case "RECONCILIATION_AMBIGUOUS":
    case "READBACK_MISMATCH":
    case "EXTERNAL_DRIFT":
      return "FAILED_FINAL";
    case "INTERNAL_ERROR":
    default:
      return retrySafe ? "FAILED_RETRYABLE" : "FAILED_FINAL";
  }
}

// ============================================================
// Provider errors → execution errors
// ============================================================

/** The shape `connectors/http.ts` throws — matched structurally so this module stays pure. */
interface ConnectorLike {
  name: string;
  code: "AUTH" | "FORBIDDEN" | "NOT_FOUND" | "RATE_LIMIT" | "TIMEOUT" | "NETWORK" | "UPSTREAM" | "BAD_RESPONSE";
  status: number | null;
  requestId: string | null;
  message: string;
  details?: unknown;
}

function asConnector(err: unknown): ConnectorLike | null {
  if (!err || typeof err !== "object") return null;
  const e = err as Partial<ConnectorLike>;
  return e.name === "ConnectorError" && typeof e.code === "string" ? (e as ConnectorLike) : null;
}

export type ProviderCallKind = "read" | "validate" | "write";

/**
 * What a provider failure means for the deployment depends on what we were
 * doing (§9.2):
 *
 *   read / validate — nothing changed on the provider; the usual retry
 *                     rules apply (rate limit and timeouts are safe to retry,
 *                     auth needs a reconnect, 4xx needs a package fix).
 *   write           — a timeout, a dropped connection or a 5xx means the
 *                     request MAY have been applied. That is UNKNOWN_OUTCOME,
 *                     never "failed": the next step is reconciliation by
 *                     marker, never a resend.
 *
 * `provider` selects the fix wording and, for Meta, the Graph error code
 * table (`normaliseMetaError`).
 */
export function normaliseProviderError(err: unknown, kind: ProviderCallKind, provider = "Google Ads"): ExecutionError {
  if (isExecutionError(err)) return err;
  if (provider === "Meta") return normaliseMetaError(err, kind);
  const c = asConnector(err);
  if (!c) {
    const message = err instanceof Error ? err.message : String(err);
    if (kind === "write") {
      return new ExecutionError("NETWORK_UNKNOWN_OUTCOME", `${provider}: write ka jawab nahi mila (${message.slice(0, 120)}). Provider par kya bana, ye check hoga — dobara create nahi bhejenge.`, {
        fix: "1 minute baad 'Sync from provider' chalayein.",
        retrySafe: false,
      });
    }
    return new ExecutionError("INTERNAL_ERROR", message.slice(0, 200), { retrySafe: true });
  }

  const rid = c.requestId ?? null;
  switch (c.code) {
    case "AUTH":
      return new ExecutionError("AUTH_EXPIRED", `${provider}: authorisation expire/reject ho gayi.`, { fix: "Connections me Google Ads ko 'Re-connect with Google' karein, phir Retry.", requestId: rid, retrySafe: false, reconnect: true });
    case "FORBIDDEN":
      return new ExecutionError("PERMISSION_MISSING", `${provider}: is account par write permission nahi hai. ${c.message}`.trim(), {
        fix: "Google Cloud project ka Google Ads API access level (Test sirf test accounts par likhta hai; Basic/Standard chahiye), login-customer-id aur account par user ki Standard/Admin access check karein.",
        requestId: rid,
        retrySafe: false,
      });
    case "NOT_FOUND":
      return new ExecutionError("ACCOUNT_NOT_READY", `${provider}: account ya resource nahi mila. ${c.message}`.trim(), { fix: "Customer ID aur login-customer-id dobara check karein.", requestId: rid, retrySafe: false });
    case "RATE_LIMIT":
      return new ExecutionError("RATE_LIMITED", `${provider}: quota/rate limit.`, { fix: "Kuch minute baad Retry karein — koi object nahi bana.", requestId: rid, retrySafe: true });
    case "TIMEOUT":
    case "NETWORK":
      if (kind === "write") {
        return new ExecutionError("NETWORK_UNKNOWN_OUTCOME", `${provider}: write bheja par jawab nahi aaya — provider par campaign bana ho sakta hai.`, {
          fix: "1 minute baad 'Sync from provider' chalayein; marker se dhoondh kar attach hoga, duplicate nahi banega.",
          requestId: rid,
          retrySafe: false,
        });
      }
      return new ExecutionError("INTERNAL_ERROR", `${provider}: ${c.code === "TIMEOUT" ? "timeout" : "network error"} (read-only call).`, { fix: "Retry karein — kuch nahi bana tha.", requestId: rid, retrySafe: true });
    case "BAD_RESPONSE":
      if (kind === "write") {
        return new ExecutionError("NETWORK_UNKNOWN_OUTCOME", `${provider}: write ka jawab padha nahi ja saka.`, { fix: "'Sync from provider' chalayein.", requestId: rid, retrySafe: false });
      }
      return new ExecutionError("INTERNAL_ERROR", `${provider}: jawab JSON nahi tha.`, { requestId: rid, retrySafe: true });
    case "UPSTREAM":
    default: {
      const status = c.status ?? 0;
      if (status >= 500 && kind === "write") {
        return new ExecutionError("NETWORK_UNKNOWN_OUTCOME", `${provider}: ${status} on write — result uncertain.`, { fix: "'Sync from provider' chalayein.", requestId: rid, retrySafe: false });
      }
      if (status >= 500) return new ExecutionError("INTERNAL_ERROR", `${provider}: ${status}.`, { fix: "Retry karein.", requestId: rid, retrySafe: true });
      const summary = summariseGoogleErrors(c.details) ?? c.message;
      if (/policy/i.test(summary) && /(violat|disapprov|prohibit)/i.test(summary)) {
        return new ExecutionError("POLICY_REJECTED", `${provider}: policy ne reject kiya — ${summary}`.slice(0, 300), { fix: "Copy/targeting package me sudhaarein ('Revise Package'); bypass nahi hota.", requestId: rid, retrySafe: false });
      }
      return new ExecutionError("PROVIDER_VALIDATION_FAILED", `${provider}: ${summary}`.slice(0, 300), { fix: "Package me ye field sudhaar kar dobara approve karein ('Revise Package').", requestId: rid, retrySafe: false });
    }
  }
}

/**
 * Google Ads failures come as `GoogleAdsFailure.errors[]` with an error code
 * object, a message and a field path. This keeps exactly those three,
 * dropping the trigger value (which can echo request content).
 */
export function summariseGoogleErrors(details: unknown): string | null {
  const errors = extractGoogleErrors(details);
  if (!errors.length) return null;
  return errors
    .slice(0, 4)
    .map((e) => `${e.field ? `${e.field}: ` : ""}${e.code ? `[${e.code}] ` : ""}${e.message}`)
    .join(" · ")
    .slice(0, 280);
}

export interface GoogleFieldError {
  code: string | null;
  message: string;
  field: string | null;
}

export function extractGoogleErrors(details: unknown): GoogleFieldError[] {
  const out: GoogleFieldError[] = [];
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const rec = node as Record<string, unknown>;
    if (Array.isArray(rec.errors)) {
      for (const e of rec.errors as Array<Record<string, unknown>>) {
        // Already-extracted shape (a connector stored `{ errors: GoogleFieldError[] }`) passes through unchanged.
        if (typeof e.message === "string" && ("field" in e || typeof e.code === "string") && !("errorCode" in e)) {
          out.push({ code: typeof e.code === "string" ? e.code : null, message: e.message.slice(0, 160), field: typeof e.field === "string" ? e.field : null });
          continue;
        }
        const codeObj = e.errorCode && typeof e.errorCode === "object" ? (e.errorCode as Record<string, unknown>) : null;
        const codeKey = codeObj ? Object.keys(codeObj)[0] : null;
        const code = codeObj && codeKey ? `${codeKey}.${String(codeObj[codeKey])}` : null;
        const loc = e.location && typeof e.location === "object" ? (e.location as Record<string, unknown>) : null;
        const elements = loc && Array.isArray(loc.fieldPathElements) ? (loc.fieldPathElements as Array<Record<string, unknown>>) : [];
        const field = elements.length ? elements.map((el) => `${String(el.fieldName ?? "")}${el.index !== undefined ? `[${String(el.index)}]` : ""}`).join(".") : null;
        out.push({ code, message: String(e.message ?? "").slice(0, 160), field });
      }
    }
    for (const v of Object.values(rec)) if (v && typeof v === "object") visit(v);
  };
  visit(details);
  return out;
}

// ============================================================
// Meta Graph errors (doc 14 §9, §12)
// ============================================================

/**
 * A Graph API failure body is `{ error: { message, type, code, error_subcode,
 * fbtrace_id, error_user_title, error_user_msg } }`. Exactly those are kept
 * — the message can name a field but never echoes the request body or a
 * token; the trace id is what a Meta support ticket asks for.
 */
export interface MetaGraphError {
  code: number | null;
  subcode: number | null;
  type: string | null;
  message: string;
  userTitle: string | null;
  userMessage: string | null;
  fbtraceId: string | null;
}

export function extractMetaError(body: unknown): MetaGraphError | null {
  if (!body || typeof body !== "object") return null;
  const rec = body as Record<string, unknown>;
  // Already-extracted shape passes through.
  if ("fbtraceId" in rec && typeof rec.message === "string") return rec as unknown as MetaGraphError;
  const e = (rec.error && typeof rec.error === "object" ? rec.error : null) as Record<string, unknown> | null;
  if (!e) return null;
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null);
  const str = (v: unknown): string | null => (typeof v === "string" && v ? v.slice(0, 200) : null);
  return {
    code: num(e.code),
    subcode: num(e.error_subcode),
    type: str(e.type),
    message: (str(e.message) ?? "").replace(/access token[^\s]*/gi, "access token"),
    userTitle: str(e.error_user_title),
    userMessage: str(e.error_user_msg),
    fbtraceId: str(e.fbtrace_id),
  };
}

function metaDetails(c: ConnectorLike): MetaGraphError | null {
  const d = c.details;
  if (!d || typeof d !== "object") return null;
  const rec = d as Record<string, unknown>;
  if ("fbtraceId" in rec) return rec as unknown as MetaGraphError;
  return extractMetaError(d);
}

const META_RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80000, 80004]);

/** The Graph error a connector kept on a failed call, or null — for callers that want Meta's own words next to the classification. */
export function metaGraphErrorOf(err: unknown): MetaGraphError | null {
  const c = asConnector(err);
  return c ? metaDetails(c) : null;
}

/**
 * Graph's account-level refusal — "(#200) Ad account owner has NOT grant
 * ads_management or ads_read permission", or #272 "…requires the user to be
 * admin of the ad account". It names `ads_management`, but it is not about
 * the token: `/me/permissions` can list the scope as granted while the ad
 * account was simply never assigned to the token's system user or app
 * (doc 14 §28). Matched before the token-scope rule for exactly that reason.
 */
const META_ASSET_DENIAL_RE = /ad ?account owner has not grant|(not|isn't) (an )?admin (of|on) (the |this )?ad ?account|(does not|doesn't) have (access|permission) (to|on|for) (the |this )?ad ?account/;

export function isMetaAssetDenial(text: string, code: number | null): boolean {
  return code === 272 || META_ASSET_DENIAL_RE.test(text.toLowerCase());
}

/** The one fix for an ad account the token's scopes allow but its system user was never given (doc 14 §28, owner steps 1-2). No new token needed. */
export const META_AD_ACCOUNT_ASSET_FIX =
  "Business Settings → Users → System users → wahi system user → Assign assets → Ad accounts → ye ad account → 'Manage campaigns' (full control). Ad account usi Business Portfolio ka ho ya usse share ho, aur system user/app wahi ho jo token banata hai. Token dobara banane ki zaroorat nahi — phir 'Check ad creation readiness'.";

/**
 * Meta's error table, restricted to the codes that change what the admin
 * should do. Anything else on a write is either a validation failure (4xx,
 * final, fix the package) or an uncertain outcome (5xx/timeout, reconcile).
 *
 *   190          — token invalid/expired → META_TOKEN_INVALID (reconnect)
 *   200 "Ad account owner has NOT grant …", 272 — the token's scopes may be
 *                  fine; the ad account is not assigned to its system user
 *                  → META_AD_ACCOUNT_FORBIDDEN (asset fix, no reconnect)
 *   200 / 10 with "ads_management" → META_ADS_MANAGEMENT_MISSING (reconnect)
 *   10, 3        — app lacks the capability → META_ACCESS_TIER_BLOCKED
 *   100+33, 803  — object missing or not visible to this token → forbidden
 *   4/17/32/613  — throttled → RATE_LIMITED
 *   2, 1, 341    — temporary → read: retry; write: unknown outcome
 */
export function normaliseMetaError(err: unknown, kind: ProviderCallKind): ExecutionError {
  if (isExecutionError(err)) return err;
  const provider = "Meta";
  const c = asConnector(err);
  if (!c) {
    const message = err instanceof Error ? err.message : String(err);
    if (kind === "write") {
      return new ExecutionError("NETWORK_UNKNOWN_OUTCOME", `${provider}: write ka jawab nahi mila (${message.slice(0, 120)}). Marker se reconcile hoga — dobara create nahi bhejenge.`, { fix: "1 minute baad 'Sync from Meta' chalayein.", retrySafe: false });
    }
    return new ExecutionError("INTERNAL_ERROR", message.slice(0, 200), { retrySafe: true });
  }
  const rid = c.requestId ?? null;
  const g = metaDetails(c);
  const code = g?.code ?? null;
  const text = `${g?.message ?? ""} ${g?.userMessage ?? ""} ${c.message}`.toLowerCase();
  const trace = g?.fbtraceId ? ` (fbtrace ${g.fbtraceId})` : "";

  if (c.code === "TIMEOUT" || c.code === "NETWORK") {
    if (kind === "write") {
      return new ExecutionError("NETWORK_UNKNOWN_OUTCOME", `${provider}: write bheja par jawab nahi aaya — object bana ho sakta hai.`, { fix: "1 minute baad 'Sync from Meta' chalayein; marker se dhoondh kar attach hoga, duplicate nahi banega.", requestId: rid, retrySafe: false });
    }
    return new ExecutionError("INTERNAL_ERROR", `${provider}: ${c.code === "TIMEOUT" ? "timeout" : "network error"} (read-only call).`, { fix: "Retry karein — kuch nahi bana tha.", requestId: rid, retrySafe: true });
  }
  if (c.code === "BAD_RESPONSE") {
    if (kind === "write") return new ExecutionError("NETWORK_UNKNOWN_OUTCOME", `${provider}: write ka jawab padha nahi ja saka.`, { fix: "'Sync from Meta' chalayein.", requestId: rid, retrySafe: false });
    return new ExecutionError("INTERNAL_ERROR", `${provider}: jawab JSON nahi tha.`, { requestId: rid, retrySafe: true });
  }
  if (code === 190 || c.code === "AUTH") {
    return new ExecutionError("META_TOKEN_INVALID", `${provider}: access token invalid/expired hai${trace}.`, { fix: "Business Manager → System users → naya token (ads_read + ads_management) banayein aur Connections me paste karein.", requestId: rid, retrySafe: false, reconnect: true });
  }
  if (code !== null && META_RATE_LIMIT_CODES.has(code) || c.code === "RATE_LIMIT") {
    return new ExecutionError("RATE_LIMITED", `${provider}: rate limit${trace}.`, { fix: "Kuch minute baad Retry karein — koi object nahi bana.", requestId: rid, retrySafe: true });
  }
  if (isMetaAssetDenial(text, code)) {
    return new ExecutionError("META_AD_ACCOUNT_FORBIDDEN", `${provider}: ad account par is token ke system user/app ko account-level access (ads_management/ads_read) assign nahi hai${trace} — ye asset assignment hai, token ka scope nahi.`, { fix: META_AD_ACCOUNT_ASSET_FIX, requestId: rid, retrySafe: false, reconnect: false });
  }
  if (/ads_management/.test(text) || (code === 200 && /permission/.test(text))) {
    const named = /ads_management/.test(text);
    return new ExecutionError("META_ADS_MANAGEMENT_MISSING", named ? `${provider}: token par ads_management permission nahi hai${trace}.` : `${provider}: token par is call ki permission nahi hai${trace} — Meta: ${(g?.message ?? c.message).slice(0, 140)}`, { fix: "System user token ko ads_management ke saath dobara generate karein; phir 'Check ad creation readiness'.", requestId: rid, retrySafe: false, reconnect: true });
  }
  if (code === 10 || code === 3 || /access tier|limited access|app does not have (the )?(permission|capability)/.test(text)) {
    return new ExecutionError("META_ACCESS_TIER_BLOCKED", `${provider}: app ka Marketing API access tier is action ko allow nahi karta${trace}.`, { fix: "App Dashboard → Marketing API → Access tier dekhein (Limited/Full); zaroorat ho to tier upgrade/app review karein. Ye token permission se alag hai.", requestId: rid, retrySafe: false });
  }
  if (c.code === "FORBIDDEN" || (code === 100 && g?.subcode === 33) || code === 803 || c.code === "NOT_FOUND") {
    return new ExecutionError("META_AD_ACCOUNT_FORBIDDEN", `${provider}: object is token ko dikhta nahi ya access nahi hai${trace}. ${g?.message ?? c.message}`.slice(0, 300), { fix: "Business Manager me system user ko is ad account / Page par advertise access dein; phir 'Check ad creation readiness'.", requestId: rid, retrySafe: false });
  }
  const status = c.status ?? 0;
  if (status >= 500 || code === 2 || code === 1 || code === 341) {
    if (kind === "write") return new ExecutionError("NETWORK_UNKNOWN_OUTCOME", `${provider}: ${status || code} on write — result uncertain${trace}.`, { fix: "'Sync from Meta' chalayein.", requestId: rid, retrySafe: false });
    return new ExecutionError("INTERNAL_ERROR", `${provider}: temporary error ${status || code}${trace}.`, { fix: "Retry karein.", requestId: rid, retrySafe: true });
  }
  const summary = g ? `${g.userTitle ? `${g.userTitle}: ` : ""}${g.userMessage ?? g.message}${g.code !== null ? ` [code ${g.code}${g.subcode !== null ? `/${g.subcode}` : ""}]` : ""}` : c.message;
  if (/policy|disapprov|prohibit|not allowed|special ad categor/i.test(summary)) {
    return new ExecutionError("POLICY_REJECTED", `${provider}: policy ne reject kiya — ${summary}`.slice(0, 300), { fix: "Copy/targeting/special ad category package me sudhaarein ('Revise Package'); bypass nahi hota.", requestId: rid, retrySafe: false });
  }
  return new ExecutionError("PROVIDER_VALIDATION_FAILED", `${provider}: ${summary}${trace}`.slice(0, 300), { fix: "Package me ye field sudhaar kar dobara approve karein ('Revise Package').", requestId: rid, retrySafe: false });
}
