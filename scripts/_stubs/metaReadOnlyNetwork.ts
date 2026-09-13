/**
 * A read-only network for `scripts/meta-connection-check.ts`. Import it right
 * after `../_env` and before anything from `lib/`.
 *
 * The readiness check only ever reads — token identity, granted permissions,
 * the ad account, the Page and its linked Instagram account. This guard makes
 * that a property of the process instead of a property of today's code path:
 * every request that is not GET/HEAD is refused before it leaves, so an edit
 * that reached a write by mistake throws here instead of creating, activating
 * or modifying anything on a real ad account.
 */

/** Every refused request, "METHOD host" — the script prints the count. */
export const refusedWrites: string[] = [];

const realFetch = globalThis.fetch;

function hostOf(input: RequestInfo | URL): string {
  try {
    return new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url).hostname;
  } catch {
    return "?";
  }
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const fromRequest = typeof input === "object" && !(input instanceof URL) ? input.method : undefined;
  const method = (init?.method ?? fromRequest ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    const host = hostOf(input);
    refusedWrites.push(`${method} ${host}`);
    throw new Error(`[read-only guard] ${method} ${host} refused — this script never writes`);
  }
  return realFetch(input, init);
}) as typeof fetch;
