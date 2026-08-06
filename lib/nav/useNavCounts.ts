"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { NOTICE_COUNT_CHANGED } from "@/lib/notices/events";
import { NOTICE_ARRIVED_MESSAGE } from "@/lib/notices/pushClient";
import type { NavCountKey } from "@/components/layout/navItems";

export type NavCounts = Record<NavCountKey, number>;

const EMPTY: NavCounts = { matches: 0, interests: 0, messages: 0, inbox: 0 };

/**
 * Module-level rather than per-component, because three separate things want
 * these numbers on the same screen — the header bell, the nav hub, and the More
 * button's combined dot. Sharing one in-flight promise turns what would be
 * three identical requests per navigation back into one.
 */
let cached: NavCounts = EMPTY;
let inflight: Promise<void> | null = null;
const subscribers = new Set<(counts: NavCounts) => void>();

export function refreshNavCounts(): Promise<void> {
  if (inflight) return inflight;
  inflight = fetch("/api/nav/counts")
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

/**
 * Refetches on navigation, not on a timer — the moment a count matters is when
 * the user arrives somewhere, which is exactly when the route changes. The two
 * cases navigation misses are both covered without polling: acting on the page
 * you're already on fires `NOTICE_COUNT_CHANGED`, and something arriving while
 * the tab sits idle comes through the service worker's push message.
 */
export function useNavCounts(): NavCounts {
  const pathname = usePathname();
  const [counts, setCounts] = useState<NavCounts>(cached);

  useEffect(() => {
    function onWorkerMessage(event: MessageEvent) {
      if (event.data?.type === NOTICE_ARRIVED_MESSAGE) void refreshNavCounts();
    }
    function onCountChanged() {
      void refreshNavCounts();
    }

    subscribers.add(setCounts);
    void refreshNavCounts();
    window.addEventListener(NOTICE_COUNT_CHANGED, onCountChanged);
    navigator.serviceWorker?.addEventListener("message", onWorkerMessage);

    return () => {
      subscribers.delete(setCounts);
      window.removeEventListener(NOTICE_COUNT_CHANGED, onCountChanged);
      navigator.serviceWorker?.removeEventListener("message", onWorkerMessage);
    };
  }, [pathname]);

  return counts;
}
