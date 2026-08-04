"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import { ease, slideUpSheet } from "@/lib/motion";
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
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[70] bg-ink/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: ease.fast }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-x-0 bottom-0 z-[71] max-h-[70vh] overflow-y-auto rounded-t-xl border-t border-line bg-surface pb-[env(safe-area-inset-bottom,0px)] shadow-lg"
            variants={slideUpSheet}
            initial="hidden"
            animate="show"
            exit="exit"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="font-semibold text-ink">Kise bhejein?</p>
              <button
                type="button"
                onClick={onClose}
                aria-label="Band karein"
                className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-bg-subtle hover:text-ink"
              >
                <X className="size-4" />
              </button>
            </div>

            {matches === null ? (
              <p className="px-4 py-6 text-center text-[0.8125rem] text-muted">Load ho raha hai…</p>
            ) : matches.length === 0 ? (
              <p className="px-4 py-6 text-center text-[0.8125rem] text-muted">
                Koi chat-unlocked match nahi mila.
              </p>
            ) : (
              <div className="p-2">
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
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
