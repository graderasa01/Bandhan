/**
 * Isolation for the marketing execution checks. Import it right after
 * `../_env` and before anything from `lib/` — imports run in order, and some
 * modules read the environment at import time (`objectStore.ts`).
 *
 * Three things a check must never do, made impossible rather than avoided:
 *
 *   1. Authenticate to a real Meta account. A developer's `.env` /
 *      `.env.local` may hold a live system-user token and real ad account,
 *      Page and Instagram ids — every Meta credential lookup falls back to
 *      those. They are replaced with an inert marker (the token, so "a token
 *      is configured" stays true for readiness) or removed (the ids).
 *   2. Upload a test image to a real bucket. Object storage is switched off,
 *      so creative media lands under `public/uploads/marketing-creatives/`
 *      and the check deletes it.
 *   3. Reach any provider over the network. `fetch` to a non-local host
 *      throws. Every provider call in a check goes to an injected fake; one
 *      that does not fails loudly here instead of touching a real account.
 */

const INERT_TOKEN = "check-script-inert-value";

process.env.META_MARKETING_ACCESS_TOKEN = INERT_TOKEN;
for (const key of ["META_AD_ACCOUNT_ID", "META_FACEBOOK_PAGE_ID", "META_INSTAGRAM_USER_ID"]) delete process.env[key];
for (const key of ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_PUBLIC_URL"]) delete process.env[key];

/** Every refused request, "METHOD host" — a check can assert this stayed empty. */
export const blockedNetworkCalls: string[] = [];

const realFetch = globalThis.fetch;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  let host = "";
  try {
    host = new URL(href).hostname;
  } catch {
    host = "";
  }
  if (host !== "" && host !== "localhost" && host !== "127.0.0.1") {
    blockedNetworkCalls.push(`${(init?.method ?? "GET").toUpperCase()} ${host}`);
    throw new Error(`[check isolation] network call to ${host} blocked — checks never reach a real provider`);
  }
  return realFetch(input, init);
}) as typeof fetch;

export const CHECK_INERT_META_TOKEN = INERT_TOKEN;
