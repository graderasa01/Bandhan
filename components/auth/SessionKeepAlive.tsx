"use client";

import { useEffect } from "react";

/**
 * Fires the same `GET /api/auth/session` request `PublicHeader` already
 * makes on public pages — but mounted here, since `/user/*` never renders
 * `PublicHeader`. That request is also the only place `touchSession()` runs
 * (see lib/auth/session.ts), and `touchSession` can only be reached from a
 * route handler, not from this Server Component tree, because only a route
 * handler may set a cookie. Without this, a remembered session's 180-day
 * clock never slides forward for a member who only ever browses `/user/*` —
 * exactly the audience the sliding window exists for.
 *
 * Renders nothing; the response is discarded.
 */
export default function SessionKeepAlive() {
  useEffect(() => {
    fetch("/api/auth/session").catch(() => {
      /* best-effort — a missed touch just means the next visit retries */
    });
  }, []);

  return null;
}
