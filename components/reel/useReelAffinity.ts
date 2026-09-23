"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_EMPHASIS,
  REEL_AFFINITY_KEY,
  emphasisFor,
  emptyAffinity,
  parseAffinity,
  recordAffinitySeen,
  recordAffinityUse,
  type ReelAffinity,
  type ReelAffinityFeature,
  type ReelEmphasis,
} from "@/lib/reel/affinity";

function sameEmphasis(a: ReelEmphasis, b: ReelEmphasis) {
  return a.kundliBadge === b.kundliBadge && a.kundliFirst === b.kundliFirst && a.familyFirst === b.familyFirst && a.grioLit === b.grioLit;
}

/**
 * The reel's behavioural layer, wired to this browser — see
 * `lib/reel/affinity.ts` for what it may and may not change (emphasis only).
 *
 * The counts live in a ref and only the derived `emphasis` is state, so a tap
 * that does not flip any emphasis re-renders nothing: the feed must never pay
 * a whole-screen render for bookkeeping. Storage is read after mount (never
 * during render, so the server and the first client paint agree) and every
 * access is guarded — a private window simply gets the defaults.
 */
export function useReelAffinity() {
  const affinity = useRef<ReelAffinity | null>(null);
  const [emphasis, setEmphasis] = useState<ReelEmphasis>(DEFAULT_EMPHASIS);

  const publish = useCallback((next: ReelAffinity) => {
    affinity.current = next;
    try {
      window.localStorage.setItem(REEL_AFFINITY_KEY, JSON.stringify(next));
    } catch {
      /* storage blocked — the emphasis still holds for this visit */
    }
    const e = emphasisFor(next);
    setEmphasis((prev) => (sameEmphasis(prev, e) ? prev : e));
  }, []);

  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(REEL_AFFINITY_KEY);
    } catch {
      /* private window — defaults it is */
    }
    const parsed = parseAffinity(raw);
    affinity.current = parsed;
    const e = emphasisFor(parsed);
    setEmphasis((prev) => (sameEmphasis(prev, e) ? prev : e));
  }, []);

  const record = useCallback(
    (feature: ReelAffinityFeature) => publish(recordAffinityUse(affinity.current ?? emptyAffinity(), feature)),
    [publish],
  );
  const seen = useCallback(() => publish(recordAffinitySeen(affinity.current ?? emptyAffinity())), [publish]);

  return { emphasis, record, seen };
}
