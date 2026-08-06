"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { AdminCountKey } from "@/components/layout/adminNavItems";

export type AdminCounts = Record<AdminCountKey, number>;

const EMPTY: AdminCounts = {
  verification: 0,
  moderation: 0,
  partners: 0,
  matchmaker: 0,
  voiceAccess: 0,
};

/**
 * Module-level, same shape as `useNavCounts` — the sidebar, the mobile rail and
 * the More sheet are all mounted at once and all want these numbers, so a
 * per-component fetch would be three identical requests per navigation.
 *
 * Refetches on route change rather than on a timer. An admin clearing a queue
 * navigates constantly, so navigation is already the signal; and unlike the
 * user side there is no push channel to piggyback on, so a poll would be the
 * only alternative — a request every N seconds for a tab that is usually just
 * sitting open.
 */
let cached: AdminCounts = EMPTY;
let inflight: Promise<void> | null = null;
const subscribers = new Set<(counts: AdminCounts) => void>();

export function refreshAdminCounts(): Promise<void> {
  if (inflight) return inflight;
  inflight = fetch("/api/admin/counts")
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (!data?.ok) return;
      cached = { ...EMPTY, ...data.counts };
      subscribers.forEach((notify) => notify(cached));
    })
    .catch(() => {})
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useAdminCounts(): AdminCounts {
  const pathname = usePathname();
  const [counts, setCounts] = useState<AdminCounts>(cached);

  useEffect(() => {
    subscribers.add(setCounts);
    void refreshAdminCounts();
    return () => {
      subscribers.delete(setCounts);
    };
  }, [pathname]);

  return counts;
}

export function totalAdminPending(counts: AdminCounts): number {
  return Object.values(counts).reduce((sum, n) => sum + n, 0);
}
