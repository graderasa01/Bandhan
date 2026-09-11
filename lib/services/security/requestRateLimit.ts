import "server-only";

/**
 * A keyed, in-process brake for endpoints a *visitor* can hit — no account,
 * so no user id to count against. The key is whatever the caller has: an IP,
 * a contact, an IP+contact pair.
 *
 * Same honest shape as `lib/speech/speechRateLimit.ts`, for the same reason:
 * one Railway container, no Redis, and a limiter that needs infrastructure to
 * exist is a limiter that does not get shipped. Two instances would each
 * allow the window — a factor-of-two slip on a bound whose whole job is to
 * stop a factor-of-a-thousand one.
 */

const hits = new Map<string, number[]>();

export interface RateRule {
  /** Requests allowed inside one rolling window. */
  limit: number;
  windowMs: number;
}

export type RateResult = { ok: true } | { ok: false; retryAfterSeconds: number };

export function checkRate(key: string, rule: RateRule): RateResult {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < rule.windowMs);

  if (recent.length >= rule.limit) {
    hits.set(key, recent);
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((rule.windowMs - (now - recent[0])) / 1000)) };
  }

  recent.push(now);
  hits.set(key, recent);

  // Cheap sweep so an idle instance does not hold every visitor it ever saw.
  if (hits.size > 2000) {
    for (const [k, times] of hits) {
      if (times.every((t) => now - t >= rule.windowMs)) hits.delete(k);
    }
  }
  return { ok: true };
}

/**
 * The caller's address as the proxy in front of us reports it. Railway sets
 * `x-forwarded-for`; the first hop is the client. Falls back to a constant so
 * a missing header shares one bucket rather than an unbounded one per request.
 */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Test seam. */
export function resetRequestRateLimit() {
  hits.clear();
}
