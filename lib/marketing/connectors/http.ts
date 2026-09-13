import "server-only";

/**
 * The one HTTP path every marketing connector goes through (§13).
 *
 * What it standardises, so no adapter has to get it right on its own:
 *
 *   • **Timeouts.** A planning run reads six providers; one that hangs must
 *     not hold the others hostage.
 *   • **Backoff.** 429 and 5xx get one retry after a short wait — enough for
 *     a quota blip, not enough to hammer a provider that is actually down.
 *   • **Sanitised errors.** Provider bodies can echo the request (including
 *     headers on some gateways). `ConnectorError.message` is built from the
 *     status and a short, token-free excerpt, and `code` is what callers
 *     branch on. The provider's request id is logged for support tickets.
 *   • **No token in the URL.** Every connector passes credentials in
 *     headers; the query string is what ends up in access logs.
 */

export type ConnectorErrorCode = "AUTH" | "FORBIDDEN" | "NOT_FOUND" | "RATE_LIMIT" | "TIMEOUT" | "NETWORK" | "UPSTREAM" | "BAD_RESPONSE";

export class ConnectorError extends Error {
  readonly code: ConnectorErrorCode;
  readonly status: number | null;
  readonly requestId: string | null;
  /**
   * Structured, already-sanitised detail a connector chose to keep from the
   * error body via `errorDetails` (MKT-2: Google's field-level
   * `GoogleAdsFailure.errors[]`). Never the raw body.
   */
  readonly details: unknown;

  constructor(code: ConnectorErrorCode, message: string, status: number | null = null, requestId: string | null = null, details: unknown = null) {
    super(message);
    this.name = "ConnectorError";
    this.code = code;
    this.status = status;
    this.requestId = requestId;
    this.details = details;
  }
}

export function isConnectorError(err: unknown): err is ConnectorError {
  return err instanceof ConnectorError;
}

/** A short, header-free line safe to store on a connection row or show an admin. */
export function describeConnectorError(err: unknown): { code: ConnectorErrorCode; message: string } {
  if (isConnectorError(err)) return { code: err.code, message: err.message };
  const message = err instanceof Error ? err.message : String(err);
  return { code: "UPSTREAM", message: message.slice(0, 200) };
}

const REQUEST_ID_HEADERS = ["x-request-id", "request-id", "x-fb-trace-id", "x-fb-request-id", "x-goog-request-id"];

function requestIdOf(res: Response): string | null {
  for (const h of REQUEST_ID_HEADERS) {
    const v = res.headers.get(h);
    if (v) return v;
  }
  return null;
}

/** Strips anything that looks like a bearer token or key before an excerpt is kept. */
function scrub(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._\-/+=]+/gi, "Bearer ***")
    .replace(/(access_token|developer-token|key|token)=([^&\s"']+)/gi, "$1=***")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

export interface ConnectorFetchOptions {
  timeoutMs?: number;
  /**
   * Retries on 429/5xx/network only. Default 1 — for READS. A provider
   * *write* must pass 0: a resend after a timeout is exactly how a second
   * campaign gets made (doc 13 §9.2). The execution layer treats a write
   * timeout as UNKNOWN_OUTCOME and reconciles instead.
   */
  retries?: number;
  /** Provider name for log lines. */
  provider: string;
  /**
   * Pulls a sanitised structured summary out of a non-2xx JSON body for
   * `ConnectorError.details`. Must not return anything that echoes request
   * headers or tokens.
   */
  errorDetails?: (body: unknown) => unknown;
}

/**
 * `fetch` + JSON, with the rules above. Throws `ConnectorError`; never
 * returns a non-2xx body as if it were data.
 */
export async function connectorFetchJson<T = unknown>(url: string, init: RequestInit, opts: ConnectorFetchOptions): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const retries = opts.retries ?? 1;

  let attempt = 0;
  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
      clearTimeout(timer);
      const aborted = err instanceof Error && err.name === "AbortError";
      if (attempt < retries) {
        attempt += 1;
        await sleep(600 * attempt);
        continue;
      }
      throw new ConnectorError(
        aborted ? "TIMEOUT" : "NETWORK",
        aborted ? `${opts.provider}: ${timeoutMs / 1000}s me jawab nahi aaya.` : `${opts.provider}: network error.`,
      );
    }
    clearTimeout(timer);

    const requestId = requestIdOf(res);

    if (res.ok) {
      try {
        return (await res.json()) as T;
      } catch {
        throw new ConnectorError("BAD_RESPONSE", `${opts.provider}: jawab JSON nahi tha.`, res.status, requestId);
      }
    }

    const rawText = await res.text().catch(() => "");
    const excerpt = scrub(rawText);
    let details: unknown = null;
    if (opts.errorDetails && rawText) {
      try {
        details = opts.errorDetails(JSON.parse(rawText)) ?? null;
      } catch {
        details = null;
      }
    }
    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < retries) {
      attempt += 1;
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 10) * 1000 : 800 * attempt);
      continue;
    }

    if (requestId) console.warn(`[marketing:${opts.provider}] ${res.status} request-id=${requestId}`);

    if (res.status === 401) throw new ConnectorError("AUTH", `${opts.provider}: authorisation expire ya reject (401).`, 401, requestId, details);
    if (res.status === 403) throw new ConnectorError("FORBIDDEN", `${opts.provider}: permission nahi hai (403). ${excerpt}`.trim(), 403, requestId, details);
    if (res.status === 404) throw new ConnectorError("NOT_FOUND", `${opts.provider}: account/property nahi mila (404).`, 404, requestId, details);
    if (res.status === 429) throw new ConnectorError("RATE_LIMIT", `${opts.provider}: quota/rate limit (429).`, 429, requestId, details);
    throw new ConnectorError("UPSTREAM", `${opts.provider}: ${res.status}. ${excerpt}`.trim(), res.status, requestId, details);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** ISO date (YYYY-MM-DD) for `days` ago, UTC. */
export function isoDaysAgo(days: number, from: Date = new Date()): string {
  const d = new Date(from.getTime() - days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export function isoToday(from: Date = new Date()): string {
  return from.toISOString().slice(0, 10);
}

/** Human window label used in evidence: "last 30 days (2026-08-13 → 2026-09-12)". */
export function windowLabel(days: number, from: Date = new Date()): string {
  return `last ${days} days (${isoDaysAgo(days, from)} → ${isoToday(from)})`;
}

/** Micros → rupees, 2dp. Google Ads reports money in micros of the account currency. */
export function microsToRupees(micros: number | string | null | undefined): number {
  const n = typeof micros === "string" ? Number(micros) : (micros ?? 0);
  return Math.round((n / 1_000_000) * 100) / 100;
}

export function toNumber(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : 0;
  return Number.isFinite(n) ? n : 0;
}
