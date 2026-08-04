"use client";

import GrioChatCore from "@/components/grio/GrioChatCore";

/**
 * Standalone full-page entry (bookmarkable deep link). The everyday entry
 * point is the global bubble/overlay (components/grio/GrioOverlay) — both
 * share the same GrioChatCore engine, just different chrome around it.
 */
export default function ConciergeChat() {
  return (
    <div className="flex h-[calc(100dvh-56px)] flex-col sm:h-[70dvh] sm:rounded-lg sm:border sm:border-line">
      <GrioChatCore />
    </div>
  );
}
