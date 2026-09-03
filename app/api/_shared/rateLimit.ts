import "server-only";

/**
 * A fixed-window, in-memory limiter — enough for a single app instance.
 *
 * Lives here because the unauthenticated referral-lookup endpoints each need a
 * ceiling before they need a distributed one, and two copies of the same
 * fifteen lines is how one of them quietly ends up with a different window.
 *
 * What it is not: a defence against a distributed attacker, or anything that
 * survives a restart or a second instance. It exists so a single script cannot
 * walk the code space from one address, and it should be replaced by a shared
 * store the moment more than one instance runs.
 */
export interface RateLimiter {
  (key: string): boolean;
}

export function createRateLimiter(options: { windowMs: number; max: number }): RateLimiter {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return function limited(key: string): boolean {
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || now > entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + options.windowMs });
      return false;
    }
    entry.count += 1;
    return entry.count > options.max;
  };
}
