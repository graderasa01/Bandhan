import { API_BASE, CLIENT_HEADER_NAME, CLIENT_HEADER_VALUE } from "../config";
import { tokenStore } from "./tokenStore";

/**
 * The one door to the BandhanTak API.
 *
 * Every request carries the native-client header and, when signed in, the
 * session as `Authorization: Bearer` (never a cookie — `credentials: "omit"`
 * keeps the platform's shared cookie jar out of it). A response that carries
 * a fresh `sessionToken` (login, OTP, a new account, the monthly sliding
 * refresh) replaces the stored one here, in one place, so no screen can
 * forget to.
 *
 * Errors arrive as `ApiError` with the server's own `error`/`code` and its
 * Hinglish `message`, ready to show.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly body: unknown;

  constructor(status: number, code: string, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.body = body;
  }

  /** No response at all — offline, DNS, timeout. */
  get isNetwork(): boolean {
    return this.status === 0;
  }
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RequestOptions {
  method?: Method;
  /** JSON body. */
  body?: unknown;
  /** Multipart body (photo / audio uploads). */
  form?: FormData;
  /** false = send no token even if one is stored (public endpoints). */
  auth?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}

const unauthenticatedListeners = new Set<() => void>();

/** Called when a signed-in request comes back 401 — the session was revoked or expired. */
export function onUnauthenticated(listener: () => void): () => void {
  unauthenticatedListeners.add(listener);
  return () => unauthenticatedListeners.delete(listener);
}

function defaultMessage(status: number): string {
  if (status === 401) return "Session khatam ho gaya — dobara login karein.";
  if (status === 403) return "Ye abhi aapke liye available nahi hai.";
  if (status === 404) return "Ye cheez nahi mili.";
  if (status === 429) return "Thodi der baad try karein.";
  if (status >= 500) return "Server me dikkat aayi — thodi der baad try karein.";
  return "Kuch galat ho gaya — dobara try karein.";
}

function pick(data: unknown, key: string): unknown {
  return data && typeof data === "object" ? (data as Record<string, unknown>)[key] : undefined;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const token = opts.auth === false ? null : await tokenStore.get();

  const headers: Record<string, string> = {
    [CLIENT_HEADER_NAME]: CLIENT_HEADER_VALUE,
    Accept: "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let body: string | FormData | undefined;
  if (opts.form) {
    body = opts.form;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 25_000);
  const outer = opts.signal;
  const forwardAbort = () => controller.abort();
  outer?.addEventListener("abort", forwardAbort);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: opts.method ?? (body !== undefined ? "POST" : "GET"),
      headers,
      body,
      signal: controller.signal,
      credentials: "omit",
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Internet check karein — server tak nahi pahunch paaye.");
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", forwardAbort);
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  const fresh = pick(data, "sessionToken");
  if (typeof fresh === "string" && fresh.length > 0) await tokenStore.set(fresh);

  if (!res.ok) {
    const code = String(pick(data, "error") ?? pick(data, "code") ?? `HTTP_${res.status}`);
    const message = String(pick(data, "message") ?? defaultMessage(res.status));
    if (res.status === 401 && token) unauthenticatedListeners.forEach((fn) => fn());
    throw new ApiError(res.status, code, message, data);
  }

  return data as T;
}

/** Headers for things the app loads outside `api()` — gated images and audio. */
export function authHeaders(): Record<string, string> {
  const token = tokenStore.peek();
  return token
    ? { [CLIENT_HEADER_NAME]: CLIENT_HEADER_VALUE, Authorization: `Bearer ${token}` }
    : { [CLIENT_HEADER_NAME]: CLIENT_HEADER_VALUE };
}

/** Turns the server's relative media paths (`/uploads/…`, `/api/media/…`) into absolute URLs. */
export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^(https?:|data:|file:|blob:)/i.test(url)) return url;
  return `${API_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
}

/** A readable message out of anything a query or mutation threw. */
export function errorMessage(err: unknown, fallback = "Kuch galat ho gaya — dobara try karein."): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
