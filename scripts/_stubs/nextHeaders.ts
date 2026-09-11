/**
 * A stand-in for `next/headers` under plain Node.
 *
 * `createSession` writes the session cookie through `cookies()` from
 * `next/headers`, which only works inside a Next request. A check script that
 * exercises a service ending in `createSession` (bolo-check) resolves the
 * module here instead — the same `_resolveFilename` trick `_env.ts` uses for
 * `server-only` — and gets an in-memory jar it can also assert on.
 */

const jar = new Map<string, { name: string; value: string }>();

export async function cookies() {
  return {
    get(name: string) {
      return jar.get(name);
    },
    set(name: string, value: string) {
      jar.set(name, { name, value });
    },
    delete(name: string) {
      jar.delete(name);
    },
    getAll() {
      return Array.from(jar.values());
    },
  };
}

export async function headers() {
  return new Headers();
}

/** Test seam. */
export function resetCookieJar() {
  jar.clear();
}
