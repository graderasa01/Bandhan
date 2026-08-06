"use client";

import { useEffect, useState } from "react";
import Avatar from "@/components/ui/Avatar";
import Sheet from "@/components/ui/Sheet";
import type { ConciergeMatchOption } from "@/lib/contracts/concierge";

/** Recipient picker for the unscoped send flow — only chat-unlocked matches, never raw shortlist. */
export default function GrioMatchPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (match: ConciergeMatchOption) => void;
}) {
  const [matches, setMatches] = useState<ConciergeMatchOption[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setMatches(null);
    fetch("/api/concierge/matches")
      .then((r) => r.json())
      .then((json) => setMatches(json.ok ? json.matches : []))
      .catch(() => setMatches([]));
  }, [open]);

  return (
    <Sheet open={open} onClose={onClose} variant="bottom" title="Kise bhejein?">
      {matches === null ? (
        <p className="py-6 text-center text-[0.8125rem] text-muted">Load ho raha hai…</p>
      ) : matches.length === 0 ? (
        <p className="py-6 text-center text-[0.8125rem] text-muted">Koi chat-unlocked match nahi mila.</p>
      ) : (
        <div className="-mx-2">
          {matches.map((m) => (
            <button
              key={m.matchId}
              type="button"
              onClick={() => onPick(m)}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-bg-subtle"
            >
              <Avatar name={m.name} photoUrl={m.photoUrl} size="sm" />
              <span className="font-medium text-ink">{m.name}</span>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}
