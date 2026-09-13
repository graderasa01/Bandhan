import "server-only";
import { connectorFetchJson } from "./http";
import { extractMetaError } from "@/lib/services/marketing/execution/executionErrors";

/**
 * Meta Graph API plumbing shared by the Ads, Page and Instagram adapters.
 *
 * Version explicit and env-overridable (`META_GRAPH_API_VERSION`) — Meta
 * ships a major every few months and expires each roughly two years on;
 * v26.0 (July 2026) is current at the time of writing. The token goes in the
 * Authorization header, never in the query string.
 *
 * MKT-2B adds `graphPost` for the write path. It is sent exactly once
 * (`retries: 0`): a resend after a timeout is how a second campaign gets
 * made (doc 14 §14). Error bodies are reduced to Graph's own
 * `{code, error_subcode, type, message, fbtrace_id}` via `extractMetaError`
 * — never the raw body, which can echo request content.
 */

export const META_API_VERSION = () => process.env.META_GRAPH_API_VERSION ?? "v26.0";
const BASE = () => `https://graph.facebook.com/${META_API_VERSION()}`;

export interface MetaAuth {
  accessToken: string;
}

const READ_TIMEOUT_MS = 20_000;
const WRITE_TIMEOUT_MS = 60_000;

function url(path: string, params: Record<string, string>): string {
  const u = new URL(`${BASE()}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

export async function graphGet<T>(auth: MetaAuth, path: string, params: Record<string, string>, provider: string): Promise<T> {
  return connectorFetchJson<T>(url(path, params), { headers: { Authorization: `Bearer ${auth.accessToken}` } }, { provider, timeoutMs: READ_TIMEOUT_MS, errorDetails: extractMetaError });
}

/**
 * One Graph mutation. JSON body, one attempt, sanitised error details. The
 * `requestId` is Graph's `x-fb-trace-id`/`x-fb-request-id` header, which
 * `connectorFetchJson` already reads.
 */
export async function graphPost<T>(auth: MetaAuth, path: string, body: Record<string, unknown>, provider: string): Promise<T> {
  return connectorFetchJson<T>(
    url(path, {}),
    { method: "POST", headers: { Authorization: `Bearer ${auth.accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(body) },
    { provider, timeoutMs: WRITE_TIMEOUT_MS, retries: 0, errorDetails: extractMetaError },
  );
}

/** Graph API `actions` arrays: [{action_type, value}] → {action_type: number}. */
export function actionsToMap(actions: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!Array.isArray(actions)) return out;
  for (const a of actions as Array<{ action_type?: string; value?: string | number }>) {
    if (a?.action_type) out[a.action_type] = Number(a.value ?? 0) || 0;
  }
  return out;
}
